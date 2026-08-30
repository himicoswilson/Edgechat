import { listMessages } from '../data/messages.js';
import { listMessageReaders, markRoomRead, readersByMessage } from '../data/unread.js';
import { broadcastRoomRead } from '../do-bridge.js';
import { authorizeRoom, isRoomKind } from '../room-access.js';
import { errorResponse, parseJsonRequest, sanitizeLimit } from '../utils.js';

export function registerMessageRoutes(app) {
  app.get('/api/messages', async (c) => {
    const session = c.get('session');
    const kind = c.req.query('kind');
    const roomId = Number(c.req.query('roomId'));
    const before = c.req.query('before');
    const limit = sanitizeLimit(c.req.query('limit'));

    if (!isRoomKind(kind) || !Number.isInteger(roomId) || roomId <= 0) {
      return errorResponse('参数无效');
    }

    const access = await authorizeRoom(c.env.DB, session, kind, roomId);

    if (!access.ok) {
      return errorResponse('无权访问该会话', 403);
    }

    const messages = await listMessages(c.env, roomId, before, limit);
    await markRoomRead(c.env.DB, {
      channelId: roomId,
      userId: session.userId
    });

    return c.json({
      room: {
        id: Number(access.room.id),
        kind: access.room.kind,
        name: access.room.name,
        description: access.room.description
      },
      messages
    });
  });

  app.get('/api/messages/read-by', async (c) => {
    const session = c.get('session');
    const kind = c.req.query('kind');
    const roomId = Number(c.req.query('roomId'));
    const messageIds = String(c.req.query('messageIds') || '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (
      !isRoomKind(kind) ||
      !Number.isInteger(roomId) ||
      roomId <= 0 ||
      messageIds.length === 0 ||
      messageIds.length > 50
    ) {
      return errorResponse('参数无效');
    }

    const access = await authorizeRoom(c.env.DB, session, kind, roomId);

    if (!access.ok) {
      return errorResponse('无权访问该会话', 403);
    }

    const readers = await listMessageReaders(c.env.DB, {
      channelId: Number(access.room.id),
      excludeUserId: session.userId
    });
    return c.json({ reads: readersByMessage(readers, messageIds) });
  });

  app.post('/api/messages/read', async (c) => {
    const session = c.get('session');
    const payload = await parseJsonRequest(c.req.raw);
    const kind = String(payload.kind || '');
    const roomId = Number(payload.roomId);
    const messageId = payload.messageId === undefined ? null : Number(payload.messageId);

    if (
      !isRoomKind(kind) ||
      !Number.isInteger(roomId) ||
      roomId <= 0 ||
      (messageId !== null && (!Number.isInteger(messageId) || messageId <= 0))
    ) {
      return errorResponse('参数无效');
    }

    const access = await authorizeRoom(c.env.DB, session, kind, roomId);

    if (!access.ok) {
      return errorResponse('无权访问该会话', 403);
    }

    const lastReadMessageId = await markRoomRead(c.env.DB, {
      channelId: roomId,
      userId: session.userId,
      messageId
    });

    // 已读推进是高频小操作:异步广播给同房间其他客户端刷新回执,不阻塞响应。
    // 兜底仍由前端低频轮询保证(读水位也可能经 GET /messages 副作用推进,
    // 那些场景不广播,靠轮询收敛)。
    c.executionCtx.waitUntil(
      broadcastRoomRead(c.env, {
        kind,
        roomId,
        messageId: lastReadMessageId
      }).catch(() => {})
    );

    return c.json({ ok: true, lastReadMessageId });
  });
}
