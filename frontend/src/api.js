import { dispatchAuthInvalid, getStoredToken } from './auth-storage.js';
import { localizedError, localizeErrorMessage } from './localized-error.js';
import { getRuntimeFileUrl, isDemoMode, requestRuntime } from './runtime.js';

const API_PREFIX = '/api';

// iOS Safari 的 PushSubscription 可能不暴露 keys 属性(web-push-libs/web-push#939 同类问题),
// 退化为标准 getKey() 读取 p256dh/auth,两种来源统一编码为 base64url。
export function normalizePushSubscription(subscription) {
  const keys = subscription?.keys || {};
  function keyValue(type) {
    const buffer = subscription?.getKey?.(type);
    if (!buffer) {
      return '';
    }
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  return {
    endpoint: String(subscription?.endpoint || ''),
    keys: {
      p256dh: String(keys.p256dh || '') || keyValue('p256dh'),
      auth: String(keys.auth || '') || keyValue('auth')
    }
  };
}

function buildHeaders(extra = {}) {
  const headers = { ...extra };
  const token = getStoredToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function request(path, options = {}) {
  if (isDemoMode) {
    try {
      return await requestRuntime(path, options);
    } catch (error) {
      throw localizedError(error);
    }
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...options,
    headers: buildHeaders(options.headers),
    body:
      options.body instanceof FormData || typeof options.body === 'string'
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const rawMessage = payload?.error || payload || 'Request failed';
    const error = new Error(localizeErrorMessage(rawMessage));
    error.status = response.status;
    error.payload = payload;
    error.rawMessage = rawMessage;

    if (response.status === 401 && typeof window !== 'undefined') {
      dispatchAuthInvalid(error.message);
    }

    throw error;
  }

  return payload;
}

export default {
  login(credentials) {
    return request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: credentials
    });
  },
  logout() {
    return request('/auth/logout', { method: 'POST' });
  },
  session() {
    return request('/auth/session');
  },
  getSite() {
    return request('/site');
  },
  savePushSubscription(subscription) {
    return request('/push-subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        ...normalizePushSubscription(subscription),
        origin: typeof window !== 'undefined' ? window.location.origin : ''
      }
    });
  },
  deletePushSubscription(endpoint) {
    return request('/push-subscriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: { endpoint }
    });
  },
  changePassword(payload) {
    return request('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  updateProfile(payload) {
    return request('/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  testBark() {
    return request('/bark/test', { method: 'POST' });
  },
  getUsers() {
    return request('/users');
  },
  bootstrap() {
    return request('/bootstrap');
  },
  presence(ids) {
    const query = new URLSearchParams({ ids: ids.map(String).join(',') });
    return request(`/presence?${query.toString()}`);
  },
  getChannels() {
    return request('/channels');
  },
  createGroup(payload) {
    return request('/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  joinChannel(channelId) {
    return request(`/channels/${channelId}/join`, { method: 'POST' });
  },
  getChannelMembers(channelId) {
    return request(`/channels/${channelId}/members`);
  },
  inviteChannelMembers(channelId, userIds) {
    return request(`/channels/${channelId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userIds }
    });
  },
  removeChannelMember(channelId, userId) {
    return request(`/channels/${channelId}/members/${userId}`, {
      method: 'DELETE'
    });
  },
  deleteOwnedChannel(channelId) {
    return request(`/channels/${channelId}`, {
      method: 'DELETE'
    });
  },
  updateChannel(channelId, payload) {
    return request(`/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  getMessages(kind, roomId, before) {
    const query = new URLSearchParams({ kind, roomId: String(roomId) });
    if (before) {
      query.set('before', String(before));
    }
    return request(`/messages?${query.toString()}`);
  },
  markRoomRead(kind, roomId, messageId) {
    return request('/messages/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        kind,
        roomId,
        ...(messageId ? { messageId } : {})
      }
    });
  },
  messageReaders(kind, roomId, messageIds) {
    const query = new URLSearchParams({
      kind,
      roomId: String(roomId),
      messageIds: messageIds.map(String).join(',')
    });
    return request(`/messages/read-by?${query.toString()}`);
  },
  openDm(userId) {
    return request('/dm/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userId }
    });
  },
  listDms() {
    return request('/dm');
  },
  uploadFile(file) {
    const form = new FormData();
    form.append('file', file);
    return request('/upload', {
      method: 'POST',
      body: form
    });
  },
  getRoomWebSocketUrl(kind, roomId) {
    const token = getStoredToken();
    const url = new URL(`/api/ws/${kind}/${roomId}`, window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', token || '');
    return url.toString();
  },
  getInboxWebSocketUrl() {
    const token = getStoredToken();
    const url = new URL('/api/inbox/ws', window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', token || '');
    return url.toString();
  },
  getFileUrl(keyOrUrl) {
    const raw = String(keyOrUrl || '');
    if (!raw) {
      return '';
    }
    if (isDemoMode) {
      return getRuntimeFileUrl(raw);
    }

    const url = raw.startsWith('/files/')
      ? new URL(raw, window.location.origin)
      : new URL(`/files/${encodeURIComponent(raw)}`, window.location.origin);
    const token = getStoredToken();
    if (token) {
      url.searchParams.set('token', token);
    }
    return url.pathname + url.search;
  },
  adminUsers() {
    return request('/admin/users');
  },
  adminOverview() {
    return request('/admin/overview');
  },
  adminStorageScan(cursor = '') {
    const query = new URLSearchParams();
    if (cursor) {
      query.set('cursor', cursor);
    }
    const suffix = query.size ? `?${query.toString()}` : '';
    return request(`/admin/storage/scan${suffix}`);
  },
  adminSiteSettings() {
    return request('/admin/site-settings');
  },
  adminTelegram() {
    return request('/admin/telegram');
  },
  saveAdminTelegramConfig(payload) {
    return request('/admin/telegram/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  createAdminTelegramMapping(payload) {
    return request('/admin/telegram/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  updateAdminTelegramMapping(mappingId, payload) {
    return request(`/admin/telegram/mappings/${mappingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  deleteAdminTelegramMapping(mappingId) {
    return request(`/admin/telegram/mappings/${mappingId}`, { method: 'DELETE' });
  },
  listAdminRegisterLinks() {
    return request('/admin/register-links');
  },
  createAdminRegisterLink(payload) {
    return request('/admin/register-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  revokeAdminRegisterLink(inviteId) {
    return request(`/admin/register-links/${inviteId}`, {
      method: 'DELETE'
    });
  },
  renameAdminRegisterLink(inviteId, token) {
    return request(`/admin/register-links/${inviteId}/token`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: { token }
    });
  },
  updateAdminSiteSettings(payload) {
    return request('/admin/site-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  createUser(payload) {
    return request('/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  updateUser(userId, payload) {
    return request(`/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  },
  adminUserIps(userId) {
    return request(`/admin/users/${userId}/ips`);
  },
  resetPassword(userId, password) {
    return request(`/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { password }
    });
  },
  deleteUser(userId) {
    return request(`/admin/users/${userId}`, {
      method: 'DELETE'
    });
  },
  adminChannels() {
    return request('/admin/channels');
  },
  deleteChannel(channelId) {
    return request(`/admin/channels/${channelId}`, {
      method: 'DELETE'
    });
  },
  adminDms() {
    return request('/admin/dms');
  },
  getRegisterInvite(token) {
    return request(`/register-links/${encodeURIComponent(token)}`);
  },
  registerWithInvite(token, payload) {
    return request(`/register-links/${encodeURIComponent(token)}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  }
};

