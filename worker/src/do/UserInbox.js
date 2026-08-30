import { isVerifiedInternalRequest, parseVerifiedUserId } from '../verified-identity.js';
import { reportUserPresence } from '../do-bridge.js';
import { PRESENCE_HEARTBEAT_MS } from './Presence.js';

export class UserInbox {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = new Set();
    this.userId = 0;
    this.heartbeatTimer = null;

    for (const socket of this.state.getWebSockets()) {
      this.connections.add(socket);
      const meta = socket.deserializeAttachment();
      if (meta?.userId) {
        this.userId = Number(meta.userId);
      }
    }
    // DO 重启后由既有 socket 退场前可能丢失 close 事件,靠心跳保持在线状态新鲜。
    if (this.connections.size > 0) {
      this.startHeartbeat();
    }
  }

  startHeartbeat() {
    if (this.heartbeatTimer) {
      return;
    }
    this.heartbeatTimer = setInterval(() => {
      this.sendPresence({ heartbeat: true });
    }, PRESENCE_HEARTBEAT_MS);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  sendPresence(payload) {
    if (!this.userId) {
      return;
    }
    this.state.waitUntil(
      reportUserPresence(this.env, {
        userId: this.userId,
        ...payload,
        at: Date.now()
      })
    );
  }

  broadcast(packet) {
    for (const socket of this.connections) {
      try {
        socket.send(packet);
      } catch {
        this.connections.delete(socket);
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/connect') {
      const userId = parseVerifiedUserId(request);
      if (!userId) {
        return new Response('Unauthorized', { status: 401 });
      }

      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected websocket', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ userId });
      this.connections.add(server);
      if (this.connections.size === 1) {
        // 首条连接建立时上报在线,后续连接只共享在线状态。
        this.userId = userId;
        this.sendPresence({ online: true });
        this.startHeartbeat();
      }
      server.send(JSON.stringify({ type: 'ready' }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/notify' && request.method === 'POST') {
      if (!isVerifiedInternalRequest(request)) {
        return new Response('Unauthorized', { status: 401 });
      }

      const payload = await request.json();
      this.broadcast(JSON.stringify(payload));
      return Response.json({ ok: true });
    }

    return new Response('Not Found', { status: 404 });
  }

  disconnectPresence() {
    if (this.connections.size === 0) {
      this.stopHeartbeat();
      this.sendPresence({ online: false });
    }
  }

  webSocketClose(ws) {
    this.connections.delete(ws);
    this.disconnectPresence();
  }

  webSocketError(ws) {
    this.connections.delete(ws);
    this.disconnectPresence();
  }
}