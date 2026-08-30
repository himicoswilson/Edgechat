import { reactive } from 'vue';
import api from '../api.js';
import { formatDate, formatTime, t } from '../i18n.js';

const EMPTY_PRESENCE = { online: false, lastSeenAt: null };

function isSameCalendarDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/**
 * 用户在线状态:批量查询 + inbox 实时事件增量更新。
 * entries 为 userId -> { online, lastSeenAt },直接用于模板渲染。
 */
export function usePresence({ roomApi = api } = {}) {
  const entries = reactive({});
  const requestedIds = new Set();

  function store(items) {
    for (const item of items || []) {
      const userId = Number(item?.userId);
      if (!Number.isInteger(userId) || userId <= 0) {
        continue;
      }
      entries[String(userId)] = {
        online: Boolean(item.online),
        lastSeenAt: item.lastSeenAt || null
      };
    }
  }

  /** 查询尚未拉取过的用户;失败静默,下次调用或实时事件补齐。 */
  async function touch(ids) {
    const candidates = [...new Set((ids || []).map((id) => String(id)))].filter(
      (id) => !requestedIds.has(id)
    );
    if (!candidates.length) {
      return;
    }
    for (const id of candidates) {
      requestedIds.add(id);
    }
    try {
      const payload = await roomApi.presence(candidates);
      store(payload.presence);
    } catch {
      // 静默降级,不影响聊天页面
    }
  }

  /** 消费 inbox 推送的 presence 帧。 */
  function applyEvent(payload) {
    if (payload?.type !== 'presence') {
      return;
    }
    store([payload]);
  }

  function presenceOf(userId) {
    return entries[String(userId)] || EMPTY_PRESENCE;
  }

  function isOnline(userId) {
    return presenceOf(userId).online === true;
  }

  /** 离线用户的"上次在线"文案;无数据时返回空串。 */
  function lastSeenLabel(userId, now = Date.now()) {
    const item = entries[String(userId)];
    if (!item?.lastSeenAt) {
      return '';
    }
    const seen = new Date(item.lastSeenAt);
    if (Number.isNaN(seen.getTime())) {
      return '';
    }
    return t('presence.lastSeenAt', {
      time: isSameCalendarDay(seen, new Date(now)) ? formatTime(seen) : formatDate(seen)
    });
  }

  return { entries, touch, applyEvent, presenceOf, isOnline, lastSeenLabel };
}