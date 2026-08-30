import assert from 'node:assert/strict';
import test from 'node:test';
import { requestDemo } from '../frontend/src/demo/api.js';
import {
  connectDemoInboxSocket,
  connectDemoRoomSocket
} from '../frontend/src/demo/realtime.js';
import { resetDemoState } from '../frontend/src/demo/state.js';

test.beforeEach(() => {
  resetDemoState();
});

test('demo backend exposes chat, admin, storage and Telegram fixture data', async () => {
  const [site, session, bootstrap, overview, storage, telegram] = await Promise.all([
    requestDemo('/site'),
    requestDemo('/auth/session'),
    requestDemo('/bootstrap'),
    requestDemo('/admin/overview'),
    requestDemo('/admin/storage/scan'),
    requestDemo('/admin/telegram')
  ]);

  assert.equal(site.site.siteName, 'EdgeChat Demo');
  assert.equal(session.session.isAdmin, true);
  assert.equal(bootstrap.channels.some((channel) => channel.isGeneral), true);
  assert.equal(bootstrap.dms.length, 1);
  assert.equal(overview.channels.length, 4);
  assert.equal(storage.scannedObjects, 4);
  assert.equal(storage.items.some((item) => item.ownerType === 'telegram'), true);
  assert.equal(telegram.config.configured, true);
  assert.equal(telegram.mappings[0].enabled, true);
});

test('demo backend keeps group and admin mutations in browser memory', async () => {
  const created = await requestDemo('/channels', {
    method: 'POST',
    body: { name: '演示项目组', kind: 'private', memberUserIds: [2] }
  });
  const invited = await requestDemo(`/channels/${created.channel.id}/invite`, {
    method: 'POST',
    body: { userIds: [3] }
  });
  const user = await requestDemo('/admin/users', {
    method: 'POST',
    body: { username: 'preview', displayName: 'Preview', password: 'demo' }
  });
  const invite = await requestDemo('/admin/register-links', {
    method: 'POST',
    body: { note: '自动化测试', maxUses: 2 }
  });

  assert.equal(created.channel.kind, 'private');
  assert.deepEqual(invited.members.map((member) => member.id), [1, 2, 3]);
  assert.equal(user.user.username, 'preview');
  assert.equal(invite.invite.remainingUses, 2);
});

test('demo admin supports temporary bans, permanent bans and unbanning', async () => {
  const temporary = await requestDemo('/admin/users/2', {
    method: 'PATCH',
    body: { isDisabled: true, banDurationMinutes: 90 }
  });
  assert.equal(temporary.user.isDisabled, true);
  assert.equal(temporary.user.isPermanentlyDisabled, false);
  assert.ok(Date.parse(temporary.user.disabledUntil) > Date.now());

  const permanent = await requestDemo('/admin/users/3', {
    method: 'PATCH',
    body: { isDisabled: true, banDurationMinutes: null }
  });
  assert.equal(permanent.user.isPermanentlyDisabled, true);
  assert.equal(permanent.user.disabledUntil, null);

  const enabled = await requestDemo('/admin/users/2', {
    method: 'PATCH',
    body: { isDisabled: false }
  });
  assert.equal(enabled.user.isDisabled, false);
  assert.equal(enabled.user.disabledUntil, null);
});

test('demo groups use the signed-in user as their owner', async () => {
  await requestDemo('/auth/login', {
    method: 'POST',
    body: { username: 'alice', password: 'demo' }
  });
  const created = await requestDemo('/channels', {
    method: 'POST',
    body: { name: 'Alice 的项目组', kind: 'private', memberUserIds: [3] }
  });
  const members = await requestDemo(`/channels/${created.channel.id}/members`);

  assert.deepEqual(members.members.map((member) => member.id), [2, 3]);
  assert.equal(members.members[0].role, 'owner');
  assert.equal(created.channel.ownerDisplayName, 'Alice');
});

test('demo public groups can be created, discovered and joined', async () => {
  const created = await requestDemo('/channels', {
    method: 'POST',
    body: { name: '公开演示群', kind: 'public', memberUserIds: [] }
  });
  const beforeJoin = await requestDemo('/bootstrap');
  const discoverable = beforeJoin.channels.find((channel) => channel.id === 4);
  const joined = await requestDemo('/channels/4/join', { method: 'POST' });

  assert.equal(created.channel.kind, 'public');
  assert.equal(discoverable.isMember, false);
  assert.equal(joined.channel.isMember, true);
  assert.equal(joined.channel.memberCount, 3);

  await assert.rejects(
    requestDemo('/channels/2/join', { method: 'POST' }),
    /公开群组不存在/
  );
});

test('demo room socket echoes sent messages through the real-time contract', async () => {
  const frames = [];
  const inboxFrames = [];
  const inboxSocket = connectDemoInboxSocket({
    onMessage(frame) {
      inboxFrames.push(JSON.parse(frame));
    },
    onStatus() {}
  });
  let socket;
  await new Promise((resolve) => {
    socket = connectDemoRoomSocket({
      kind: 'public',
      roomId: 1,
      onMessage(frame) {
        frames.push(JSON.parse(frame));
      },
      onStatus(event) {
        if (event.status === 'open') resolve();
      }
    });
  });

  socket.send(JSON.stringify({ type: 'send', content: '浏览器本地消息', attachment: null }));

  assert.equal(frames.length, 1);
  assert.equal(frames[0].type, 'message');
  assert.equal(frames[0].message.content, '浏览器本地消息');
  assert.equal(frames[0].message.sender.id, 1);

  const history = await requestDemo('/messages?kind=public&roomId=1');
  assert.equal(history.messages.at(-1).content, '浏览器本地消息');
  assert.deepEqual(inboxFrames, []);
  socket.close();
  inboxSocket.close();
});

test('demo read receipts derive from per-user watermarks and exclude the requester', async () => {
  const reads = await requestDemo(
    '/messages/read-by?kind=public&roomId=1&messageIds=101,102,103,104,999'
  );
  assert.deepEqual(reads.reads['102'].map((reader) => reader.id), [3, 4]);
  assert.deepEqual(reads.reads['103'].map((reader) => reader.id), [3, 4]);
  assert.deepEqual(reads.reads['999'], []);

  // 私信：对方已读后在自己的消息上显示
  const dm = await requestDemo('/messages/read-by?kind=dm&roomId=10&messageIds=142');
  assert.deepEqual(dm.reads['142'].map((reader) => reader.id), [2]);
});

test('demo room simulates other members reading a freshly sent message', async () => {
  const frames = [];
  let socket;
  await new Promise((resolve) => {
    socket = connectDemoRoomSocket({
      kind: 'private',
      roomId: 2,
      onMessage(frame) {
        frames.push(JSON.parse(frame));
      },
      onStatus(event) {
        if (event.status === 'open') resolve();
      }
    });
  });

  socket.send(JSON.stringify({ type: 'send', content: '回执演示', attachment: null }));
  await new Promise((resolve) => setTimeout(resolve, 1350));

  assert.equal(frames.some((frame) => frame.type === 'message_read'), true);
  const history = await requestDemo('/messages?kind=private&roomId=2');
  const sent = history.messages.at(-1);
  const reads = await requestDemo(
    `/messages/read-by?kind=private&roomId=2&messageIds=${sent.id}`
  );
  assert.deepEqual(reads.reads[String(sent.id)].map((reader) => reader.id), [2, 3]);
  socket.close();
});

test('Telegram replies increment the inbox unread projection', async () => {
  const inboxFrames = [];
  await requestDemo('/messages/read', {
    method: 'POST',
    body: { kind: 'public', roomId: 3 }
  });
  const inboxSocket = connectDemoInboxSocket({
    onMessage(frame) {
      inboxFrames.push(JSON.parse(frame));
    },
    onStatus() {}
  });
  let roomSocket;
  await new Promise((resolve) => {
    roomSocket = connectDemoRoomSocket({
      kind: 'public',
      roomId: 3,
      onMessage() {},
      onStatus(event) {
        if (event.status === 'open') resolve();
      }
    });
  });

  roomSocket.send(JSON.stringify({ type: 'send', content: 'Telegram 未读测试' }));
  await new Promise((resolve) => setTimeout(resolve, 720));

  assert.equal(inboxFrames.at(-1).unreadCount, 1);
  assert.equal(inboxFrames.at(-1).room.name, 'Telegram 联动');
  roomSocket.close();
  inboxSocket.close();
});
