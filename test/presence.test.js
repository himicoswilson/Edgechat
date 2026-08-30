import assert from 'node:assert/strict';
import test from 'node:test';
import { ref } from 'vue';

import {
  PRESENCE_OFFLINE_RETENTION_MS,
  PRESENCE_STALE_MS,
  applyPresenceReport,
  derivePresenceOnline,
  sweepPresence
} from '../worker/src/do/Presence.js';
import { usePresence } from '../frontend/src/composables/usePresence.js';
import { useUnreadInbox } from '../frontend/src/composables/useUnreadInbox.js';

test('presence 上报:在线/心跳/离线状态机与变更标记', () => {
  const entries = new Map();
  const first = applyPresenceReport(entries, { userId: 7, online: true, at: 1000 });
  assert.equal(first.changed, true);
  assert.deepEqual(entries.get(7), { online: true, lastSeenAt: 1000 });

  // 重复在线 / 心跳不视为状态翻转
  assert.equal(
    applyPresenceReport(entries, { userId: 7, heartbeat: true, at: 2000 }).changed,
    false
  );
  assert.equal(entries.get(7).lastSeenAt, 2000);

  assert.equal(
    applyPresenceReport(entries, { userId: 7, online: false, at: 3000 }).changed,
    true
  );
  assert.deepEqual(entries.get(7), { online: false, lastSeenAt: 3000 });
});

test('presence 上报:非法 userId 不写入状态', () => {
  const entries = new Map();
  const result = applyPresenceReport(entries, { userId: 0, online: true, at: 1 });
  assert.equal(result.changed, false);
  assert.equal(result.userId, 0);
  assert.equal(entries.size, 0);
});

test('心跳过期后在查询与清扫两条路径都判定离线,并保留 lastSeenAt', () => {
  const entry = { online: true, lastSeenAt: 1000 };
  assert.equal(derivePresenceOnline(entry, 1000 + PRESENCE_STALE_MS - 1), true);
  assert.equal(derivePresenceOnline(entry, 1000 + PRESENCE_STALE_MS), false);
  assert.equal(derivePresenceOnline(undefined), false);

  const entries = new Map([[7, { online: true, lastSeenAt: 1000 }]]);
  const { changes, removed } = sweepPresence(entries, 1000 + PRESENCE_STALE_MS + 1);
  assert.deepEqual(changes, [{ userId: 7, online: false, lastSeenAt: 1000 }]);
  assert.deepEqual(removed, []);
  assert.equal(entries.get(7).online, false);
  assert.equal(entries.get(7).lastSeenAt, 1000);
});

test('清扫移除超龄离线记录(限制内存与存储)', () => {
  const entries = new Map([[7, { online: false, lastSeenAt: 1000 }]]);
  const { changes, removed } = sweepPresence(
    entries,
    1000 + PRESENCE_OFFLINE_RETENTION_MS + 1
  );
  assert.deepEqual(changes, []);
  assert.deepEqual(removed, [7]);
  assert.equal(entries.has(7), false);
});

function createPresenceHarness() {
  const calls = [];
  const presence = usePresence({
    roomApi: {
      async presence(ids) {
        calls.push([...ids]);
        return {
          presence: ids.map((id) => ({
            userId: Number(id),
            online: Number(id) !== 5,
            lastSeenAt: '2026-08-16T10:00:00.000Z'
          }))
        };
      }
    }
  });
  return { presence, calls };
}

test('presence composable:只查询未见过的用户,事件增量更新', async () => {
  const { presence, calls } = createPresenceHarness();
  await presence.touch([1, 2, 5]);
  await presence.touch([1, 2]); // 去重,不再发请求
  assert.equal(calls.length, 1);

  assert.equal(presence.isOnline(1), true);
  assert.equal(presence.isOnline(5), false);
  assert.ok(presence.lastSeenLabel(5).length > 0);
  assert.equal(presence.lastSeenLabel(999), '');

  presence.applyEvent({
    type: 'presence',
    userId: 7,
    online: true,
    lastSeenAt: '2026-08-16T11:00:00.000Z'
  });
  assert.equal(presence.isOnline(7), true);
  assert.ok(presence.lastSeenLabel(7));
});

test('inbox 实时事件:presence 帧路由到 onPresence,不影响消息帧', () => {
  const received = [];
  let handlers;
  const socket = { readyState: 1, close() {} };
  const inboxEvents = [];
  const inbox = useUnreadInbox({
    activeRoom: ref(null),
    applyConversationActivity(payload) {
      inboxEvents.push(payload);
    },
    markConversationRead() {},
    onPresence(payload) {
      received.push(payload);
    },
    openInboxConnection(connectionHandlers) {
      handlers = connectionHandlers;
      connectionHandlers.onStatus({ status: 'open', socket });
      return socket;
    }
  });
  inbox.connectUnreadInbox();

  handlers.onMessage(
    JSON.stringify({ type: 'presence', userId: 9, online: true, lastSeenAt: '2026-08-16T10:00:00.000Z' }),
    socket
  );
  handlers.onMessage(
    JSON.stringify({ type: 'room_message', room: { kind: 'dm', id: 2 }, messageId: 3, createdAt: '2026-08-16T10:00:00.000Z', unreadCount: 1 }),
    socket
  );

  assert.deepEqual(received.map((item) => item.userId), [9]);
  assert.equal(inboxEvents.length, 1);
});