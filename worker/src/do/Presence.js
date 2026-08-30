import { notifyUserInbox } from '../do-bridge.js';
import { isVerifiedInternalRequest } from '../verified-identity.js';

// 心跳间隔必须小于 STALE,留出至少两轮容错;静默断连(崩溃/断网)由
// 心跳过期 + 周期清扫翻转状态,而不是依赖必然触发的 close 事件。
export const PRESENCE_HEARTBEAT_MS = 30 * 1000;
export const PRESENCE_STALE_MS = 90 * 1000;
export const PRESENCE_SWEEP_MS = 30 * 1000;
// 离线记录保留 7 天用于"上次在线"展示,之后清理以限制内存与存储。
export const PRESENCE_OFFLINE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const QUERY_ID_LIMIT = 500;
const STORAGE_PREFIX = 'u:';

/**
 * 应用一条在线/离线/心跳上报,返回状态是否翻转。
 * 纯函数,便于单元测试;data 为 Map<userId, { online, lastSeenAt }>。
 */
export function applyPresenceReport(entries, report, now = Date.now()) {
  const userId = Number(report?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return { changed: false, userId: 0, online: false };
  }

  const requestedOnline = report.online === true || report.heartbeat === true;
  const previous = entries.get(userId);
  const changed = !previous || previous.online !== requestedOnline;
  entries.set(userId, {
    online: requestedOnline,
    lastSeenAt: Number(report.at) || now
  });
  return { changed, userId, online: requestedOnline };
}

/** 在线 = 上报过在线 且 心跳未过期;sweep 的间隙也即时自愈。 */
export function derivePresenceOnline(entry, now = Date.now()) {
  return Boolean(entry?.online) && now - Number(entry?.lastSeenAt || 0) < PRESENCE_STALE_MS;
}

/**
 * 清扫过期在线记录(翻转离线并保留 lastSeenAt)与超龄离线记录(删除)。
 * 返回 { changes, removed } 供调用方持久化并广播。
 */
export function sweepPresence(
  entries,
  now = Date.now(),
  { staleMs = PRESENCE_STALE_MS, retentionMs = PRESENCE_OFFLINE_RETENTION_MS } = {}
) {
  const changes = [];
  const removed = [];
  for (const [userId, entry] of entries) {
    const lastSeenAt = Number(entry?.lastSeenAt || 0);
    if (!entry?.online && now - lastSeenAt >= retentionMs) {
      entries.delete(userId);
      removed.push(userId);
      continue;
    }
    if (entry?.online && now - lastSeenAt >= staleMs) {
      entry.online = false;
      changes.push({ userId, online: false, lastSeenAt });
    }
  }
  return { changes, removed };
}

export class Presence {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.entries = new Map();
    this.restored = null;
  }

  ensureRestored() {
    if (!this.restored) {
      this.restored = (async () => {
        const rows = await this.state.storage.list({ prefix: STORAGE_PREFIX });
        for (const [key, value] of rows) {
          const userId = Number(String(key).slice(STORAGE_PREFIX.length));
          if (Number.isInteger(userId) && userId > 0) {
            this.entries.set(userId, value);
          }
        }
        const alarm = await this.state.storage.getAlarm();
        if (!alarm) {
          await this.state.storage.setAlarm(Date.now() + PRESENCE_SWEEP_MS);
        }
      })();
    }
    return this.restored;
  }

  // ponytail: 状态变化广播给所有在线用户(经各自 inbox),O(在线人数) 每次;
  // 自托管小团队规模够用,用户量大时再按会话订阅裁剪。
  broadcastChange({ userId, online, lastSeenAt }) {
    const event = {
      type: 'presence',
      userId,
      online,
      lastSeenAt: new Date(lastSeenAt).toISOString()
    };
    for (const [otherId, entry] of this.entries) {
      if (Number(otherId) === userId || !derivePresenceOnline(entry)) continue;
      this.state.waitUntil(notifyUserInbox(this.env, otherId, event));
    }
  }

  async report(request) {
    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response('Invalid payload', { status: 400 });
    }

    const now = Date.now();
    const { changed, userId, online } = applyPresenceReport(this.entries, payload, now);
    if (!userId) {
      return new Response('Invalid userId', { status: 400 });
    }

    const entry = this.entries.get(userId);
    await this.state.storage.put(`${STORAGE_PREFIX}${userId}`, entry);
    if (changed) {
      this.broadcastChange({ userId, online, lastSeenAt: entry.lastSeenAt });
    }
    return Response.json({ ok: true });
  }

  async query(url) {
    const rawIds = (url.searchParams.get('ids') || '')
      .split(',')
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    const ids = [...new Set(rawIds)].slice(0, QUERY_ID_LIMIT);
    if (!ids.length) {
      return Response.json({ presence: [] });
    }

    const now = Date.now();
    const presence = ids.map((userId) => {
      const entry = this.entries.get(userId);
      return {
        userId,
        online: derivePresenceOnline(entry, now),
        lastSeenAt: entry ? new Date(entry.lastSeenAt).toISOString() : null
      };
    });
    return Response.json({ presence });
  }

  async fetch(request) {
    await this.ensureRestored();
    if (!isVerifiedInternalRequest(request)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    if (url.pathname === '/report' && request.method === 'POST') {
      return this.report(request);
    }
    if (url.pathname === '/query' && request.method === 'GET') {
      return this.query(url);
    }
    return new Response('Not Found', { status: 404 });
  }

  async alarm() {
    await this.ensureRestored();
    const now = Date.now();
    const { changes, removed } = sweepPresence(this.entries, now);
    for (const change of changes) {
      await this.state.storage.put(`${STORAGE_PREFIX}${change.userId}`, this.entries.get(change.userId));
      this.broadcastChange(change);
    }
    for (const userId of removed) {
      await this.state.storage.delete(`${STORAGE_PREFIX}${userId}`);
    }
    await this.state.storage.setAlarm(now + PRESENCE_SWEEP_MS);
  }
}