import { ref, watch } from 'vue';
import api from '../api.js';

// 已读回执数据源是单调水位(message_reads.last_read_message_id)，
// 前端只对自己发出的可见消息批量拉取“谁已读”。
// 实时更新靠 WS 的 message_read 事件推送触发刷新；
// 这里的轮询只是兜底(事件丢失、经 GET /messages 副作用推进的水位)，频率放慢。
const POLL_INTERVAL_MS = 30000;
const TRACK_LIMIT = 30;
export function useReadReceipts({
  activeRoom,
  messages,
  isOwnMessage,
  roomApi = api
}) {
  const readersByMessage = ref(new Map());
  let refreshTimer = null;
  let pollTimer = null;

  function visibleOwnMessageIds() {
    const ids = [];
    for (const message of messages.value) {
      if (isOwnMessage(message)) {
        ids.push(Number(message.id));
        if (ids.length >= TRACK_LIMIT) break;
      }
    }
    return ids;
  }

  function readersFor(messageId) {
    return readersByMessage.value.get(Number(messageId)) || [];
  }

  async function refreshReadReceipts() {
    const room = activeRoom.value;
    const messageIds = visibleOwnMessageIds();
    if (!room || messageIds.length === 0) return;
    if (globalThis.document?.hidden) return;
    try {
      const payload = await roomApi.messageReaders(room.kind, room.id, messageIds);
      const next = new Map();
      for (const [messageId, readers] of Object.entries(payload.reads || {})) {
        next.set(Number(messageId), readers);
      }
      readersByMessage.value = next;
    } catch {
      // 保留旧回执，下一轮轮询重试
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) globalThis.clearTimeout(refreshTimer);
    refreshTimer = globalThis.setTimeout(() => void refreshReadReceipts(), 250);
  }

  watch(messages, scheduleRefresh);

  if (typeof globalThis.window !== 'undefined') {
    pollTimer = globalThis.setInterval(() => void refreshReadReceipts(), POLL_INTERVAL_MS);
  }

  function disposeReadReceipts() {
    if (refreshTimer) globalThis.clearTimeout(refreshTimer);
    if (pollTimer) globalThis.clearInterval(pollTimer);
    refreshTimer = null;
    pollTimer = null;
  }

  return {
    readersByMessage,
    readersFor,
    refreshReadReceipts,
    scheduleRefresh,
    disposeReadReceipts
  };
}