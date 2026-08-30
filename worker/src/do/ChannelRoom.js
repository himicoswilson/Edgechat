import { MessageSubmissionError, submitRoomMessage } from '../message-submission.js';
import { deleteRoomMessage, MessageDeletionError } from '../message-deletion.js';
import { submitExternalMessage } from '../external-message-submission.js';
import { forwardEdgeChatMessageToTelegram } from '../integrations/telegram/bridge.js';
import { authorizeRoom } from '../room-access.js';
import { validateSession } from '../session.js';
import { projectUnreadMessage } from '../unread-projection.js';
import { projectPushNotifications } from '../push-notifications.js';
import { isVerifiedInternalRequest, parseVerifiedPrincipal } from '../verified-identity.js';

const MESSAGE_SIZE_LIMIT = 10 * 1024;

function socketMeta(token, principal, room) {
  return {
    token,
    principal,
    room
  };
}

function sendSocketError(ws, message) {
  try {
    ws.send(JSON.stringify({ type: 'error', error: message }));
  } catch {
    // Ignore broken sockets.
  }
}

function getMessageByteLength(message) {
  if (typeof message === 'string') {
    return new TextEncoder().encode(message).length;
  }
  if (message instanceof ArrayBuffer) {
    return message.byteLength;
  }
  if (ArrayBuffer.isView(message)) {
    return message.byteLength;
  }

  // 未知 WebSocket 消息类型无法可靠解析，按超大处理，避免绕过大小限制。
  return Number.MAX_SAFE_INTEGER;
}

function normalizeWebSocketMessage(message) {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof ArrayBuffer) {
    return new TextDecoder().decode(message);
  }
  if (ArrayBuffer.isView(message)) {
    return new TextDecoder().decode(message);
  }
  return '';
}

export class ChannelRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = new Map();

    for (const socket of this.state.getWebSockets()) {
      const meta = socket.deserializeAttachment();
      if (meta) {
        this.connections.set(socket, meta);
      }
    }
  }

  parsePayload(ws, message) {
    try {
      return JSON.parse(message);
    } catch {
      sendSocketError(ws, 'Invalid message payload');
      return null;
    }
  }

  async revalidateConnection(ws, meta) {
    if (!meta?.token) {
      return null;
    }

    const auth = await validateSession(this.env, meta.token);
    if (!auth.ok) {
      this.closeUnauthorizedSocket(ws);
      return null;
    }

    const access = await authorizeRoom(
      this.env.DB,
      auth.session,
      meta.room.kind,
      meta.room.id
    );
    if (!access.ok) {
      this.closeUnauthorizedSocket(ws);
      return null;
    }

    const { room } = access;

    const nextMeta = socketMeta(
      meta.token,
      {
        userId: auth.session.userId,
        isAdmin: auth.session.isAdmin
      },
      room
    );
    this.connections.set(ws, nextMeta);
    ws.serializeAttachment(nextMeta);
    return nextMeta;
  }

  closeUnauthorizedSocket(ws) {
    this.connections.delete(ws);
    try {
      ws.close(1008, 'Unauthorized');
    } catch {
      // Ignore broken sockets.
    }
  }

  async broadcast(packet) {
    const connections = [...this.connections.entries()];
    const validated = await Promise.all(
      connections.map(async ([socket, meta]) => ({
        socket,
        meta: await this.revalidateConnection(socket, meta)
      }))
    );

    for (const { socket, meta } of validated) {
      if (!meta) continue;
      try {
        socket.send(packet);
      } catch {
        this.connections.delete(socket);
      }
    }
  }

  runMessageProjections(room, message) {
    this.state.waitUntil(
      Promise.all([
        projectUnreadMessage(this.env, {
          room,
          senderId: message.sender.kind === 'local' ? message.sender.id : null,
          message
        }),
        forwardEdgeChatMessageToTelegram(this.env, { room, message }),
        projectPushNotifications(this.env, {
          room,
          senderId: message.sender.kind === 'local' ? message.sender.id : null,
          message,
          // 用于把相对头像路径拼成 Bark 可访问的绝对 URL;
          // 来自浏览器连接的站点源,首次请求时记录后复用。
          siteOrigin: this.siteOrigin
        })
      ])
    );
  }

  async receiveReadBroadcast(request) {
    if (!isVerifiedInternalRequest(request)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const payload = await request.json();
    const messageId = Number(payload.messageId);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return new Response('Invalid payload', { status: 400 });
    }

    // 让同一会话内其他客户端刷新已读回执;messageId 已由
    // markRoomRead 在本房间内解析,这里的校验只防非法内部调用。
    await this.broadcast(JSON.stringify({ type: 'message_read', messageId }));
    return Response.json({ ok: true });
  }

  async receiveExternalMessage(request) {
    if (!isVerifiedInternalRequest(request)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const payload = await request.json();
    const room = payload.room;
    if (room?.kind !== 'public' || !Number.isInteger(Number(room.id))) {
      return new Response('Invalid room', { status: 400 });
    }

    const result = await submitExternalMessage(this.env, { room, payload });
    if (result.created) {
      await this.broadcast(result.packet);
      this.runMessageProjections(room, result.message);
    }
    return Response.json({ ok: true, created: result.created, message: result.message });
  }

  async fetch(request) {
    const url = new URL(request.url);
    // 站点源只记录一次:浏览器 WebSocket 连接的 host 即站点公网地址,
    // 后续消息投影用它把相对头像路径拼成 Bark 图标可访问的绝对 URL。
    this.siteOrigin = this.siteOrigin || url.origin;

    if (url.pathname === '/external-message' && request.method === 'POST') {
      return this.receiveExternalMessage(request);
    }

    if (url.pathname === '/read-broadcast' && request.method === 'POST') {
      return this.receiveReadBroadcast(request);
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const token = url.searchParams.get('token') || '';
    const kind = url.searchParams.get('kind') || '';
    const roomId = Number(url.searchParams.get('id') || '');

    let principal = parseVerifiedPrincipal(request);
    if (!principal) {
      const auth = await validateSession(this.env, token);
      if (!auth.ok) {
        return new Response('Unauthorized', { status: 401 });
      }

      principal = {
        userId: auth.session.userId,
        isAdmin: auth.session.isAdmin
      };
    }

    const access = await authorizeRoom(this.env.DB, principal, kind, roomId);

    if (!access.ok) {
      return new Response('Forbidden', { status: 403 });
    }
    const { room } = access;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    const meta = socketMeta(token, principal, room);
    server.serializeAttachment(meta);
    this.connections.set(server, meta);
    server.send(
      JSON.stringify({
        type: 'ready',
        room: {
          id: Number(room.id),
          kind: room.kind,
          name: room.name
        }
      })
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const meta = this.connections.get(ws);
    if (!meta) {
      return;
    }

    if (getMessageByteLength(message) > MESSAGE_SIZE_LIMIT) {
      sendSocketError(ws, `消息过大，最大 ${Math.round(MESSAGE_SIZE_LIMIT / 1024)}KB`);
      return;
    }

    const payload = this.parsePayload(ws, normalizeWebSocketMessage(message));
    if (!payload) {
      return;
    }

    if (!['send', 'delete_message'].includes(payload.type)) {
      sendSocketError(ws, 'Unsupported message type');
      return;
    }

    try {
      const currentMeta = await this.revalidateConnection(ws, meta);
      if (!currentMeta) {
        return;
      }

      if (payload.type === 'delete_message') {
        const { packet } = await deleteRoomMessage(this.env, currentMeta, payload);
        await this.broadcast(packet);
        return;
      }

      const { message: saved, packet } = await submitRoomMessage(
        this.env,
        currentMeta,
        payload
      );
      await this.broadcast(packet);
      // 未读与外部桥接都属于提交后投影，异步执行以缩短 WebSocket 发送链路。
      this.runMessageProjections(currentMeta.room, saved);
    } catch (error) {
      if (error instanceof MessageSubmissionError || error instanceof MessageDeletionError) {
        sendSocketError(ws, error.message);
        return;
      }
      console.error(JSON.stringify({
        message: 'room message action failed',
        roomId: Number(meta.room?.id || 0),
        error: error instanceof Error ? error.message : String(error)
      }));
      sendSocketError(ws, '消息操作失败');
    }
  }

  webSocketClose(ws) {
    this.connections.delete(ws);
  }

  webSocketError(ws) {
    this.connections.delete(ws);
  }
}
