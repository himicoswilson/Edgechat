import { cloneDemo, createDemoMessage, demoState, roomKey } from './state.js';

const roomSockets = new Map();
const inboxSockets = new Set();

function emit(socket, payload) {
  socket.onMessage?.(JSON.stringify(payload), socket);
}

function publishRoom(kind, roomId, payload) {
  const sockets = roomSockets.get(roomKey(kind, roomId)) || [];
  for (const socket of sockets) emit(socket, payload);
}

function publishInbox(kind, roomId, message, { incrementUnread = false } = {}) {
  const room = kind === 'dm'
    ? demoState.dms.find((dm) => Number(dm.id) === Number(roomId))
    : demoState.channels.find((channel) => Number(channel.id) === Number(roomId));
  if (room && incrementUnread) {
    room.unreadCount = Number(room.unreadCount || 0) + 1;
  }
  const payload = {
    type: 'room_message',
    room: {
      kind,
      id: Number(roomId),
      name: kind === 'dm' ? room?.otherUser?.displayName : room?.name
    },
    messageId: message.id,
    createdAt: message.createdAt,
    unreadCount: Number(room?.unreadCount || 0)
  };
  for (const socket of inboxSockets) emit(socket, payload);
}

function currentSender() {
  return {
    id: demoState.session.userId,
    username: demoState.session.username,
    displayName: demoState.session.displayName,
    avatarUrl: demoState.session.avatarUrl,
    kind: 'user',
    source: 'edgechat'
  };
}

function telegramSender() {
  return {
    id: 'telegram:-1002345678901:demo',
    username: '',
    displayName: 'Telegram · 演示群成员',
    avatarUrl: '',
    kind: 'external',
    source: 'telegram'
  };
}

function hasEnabledTelegramMapping(kind, roomId) {
  return kind === 'public' && demoState.telegram.mappings.some(
    (mapping) => Number(mapping.channelId) === Number(roomId) && mapping.enabled
  );
}

function roomWatermarkReads(kind, roomId) {
  const roomMemberIds = kind === 'dm'
    ? demoState.dms.find((dm) => Number(dm.id) === Number(roomId))?.participantIds || []
    : demoState.channels.find((channel) => Number(channel.id) === Number(roomId))?.memberIds || [];
  const messageIds = demoState.messages[roomKey(kind, roomId)] || [];
  if (!roomMemberIds.length || messageIds.length === 0) return null;
  const otherIds = roomMemberIds.filter((userId) => Number(userId) !== demoState.session.userId);
  if (!otherIds.length) return null;
  const latestId = Number(messageIds.at(-1).id);
  return { key: roomKey(kind, roomId), otherIds, latestId };
}

function handleRoomFrame(socket, frame) {
  const payload = JSON.parse(frame);
  if (payload.type === 'send') {
    const message = createDemoMessage({
      kind: socket.kind,
      roomId: socket.roomId,
      content: payload.content,
      attachment: payload.attachment,
      sender: currentSender()
    });
    publishRoom(socket.kind, socket.roomId, { type: 'message', message: cloneDemo(message) });

    const seed = roomWatermarkReads(socket.kind, socket.roomId);
    if (seed) {
      // 模拟群内其他成员稍后阅读新消息，触发已读回执刷新
      globalThis.setTimeout(() => {
        demoState.reads[seed.key] ||= {};
        for (const userId of seed.otherIds) {
          demoState.reads[seed.key][userId] = Math.max(
            demoState.reads[seed.key][userId] || 0,
            seed.latestId
          );
        }
        publishRoom(socket.kind, socket.roomId, { type: 'message_read', messageId: seed.latestId });
      }, 1200);
    }

    if (hasEnabledTelegramMapping(socket.kind, socket.roomId)) {
      globalThis.setTimeout(() => {
        const reply = createDemoMessage({
          kind: socket.kind,
          roomId: socket.roomId,
          content: 'Telegram 已收到这条消息，并把群内回复同步回 EdgeChat。',
          attachment: null,
          sender: telegramSender()
        });
        publishRoom(socket.kind, socket.roomId, { type: 'message', message: cloneDemo(reply) });
        publishInbox(socket.kind, socket.roomId, reply, { incrementUnread: true });
      }, 650);
    }
    return;
  }

  if (payload.type === 'delete_message') {
    const key = roomKey(socket.kind, socket.roomId);
    demoState.messages[key] = (demoState.messages[key] || []).filter(
      (message) => Number(message.id) !== Number(payload.messageId)
    );
    publishRoom(socket.kind, socket.roomId, {
      type: 'message_deleted',
      messageId: Number(payload.messageId)
    });
  }
}

class DemoSocket {
  constructor({ kind = '', roomId = 0, onMessage, onStatus, onSend, onClose }) {
    this.kind = kind;
    this.roomId = Number(roomId);
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.onSend = onSend;
    this.onClose = onClose;
    this.readyState = 0;

    globalThis.setTimeout(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.onStatus?.({ status: 'open', socket: this });
    }, 30);
  }

  send(frame) {
    this.onSend?.(this, frame);
  }

  close() {
    if (this.readyState >= 2) return;
    this.readyState = 3;
    this.onClose?.(this);
    this.onStatus?.({
      status: 'closed',
      socket: this,
      code: 1000,
      reason: 'demo_navigation',
      wasClean: true
    });
  }
}

export function connectDemoRoomSocket({ kind, roomId, onMessage, onStatus }) {
  const key = roomKey(kind, roomId);
  const socket = new DemoSocket({
    kind,
    roomId,
    onMessage,
    onStatus,
    onSend: handleRoomFrame,
    onClose(currentSocket) {
      roomSockets.get(key)?.delete(currentSocket);
    }
  });
  if (!roomSockets.has(key)) roomSockets.set(key, new Set());
  roomSockets.get(key).add(socket);
  return socket;
}

export function connectDemoInboxSocket({ onMessage, onStatus }) {
  const socket = new DemoSocket({
    onMessage,
    onStatus,
    onClose(currentSocket) {
      inboxSockets.delete(currentSocket);
    }
  });
  inboxSockets.add(socket);
  return socket;
}
