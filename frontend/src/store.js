import { reactive } from 'vue';
import { isDemoMode, runtimeSessionToken } from './runtime.js';
import api from './api.js';
import {
  addAuthInvalidListener,
  clearStoredToken,
  getStoredToken,
  setStoredToken
} from './auth-storage.js';

const DEFAULT_SITE_ICON_URL = '/logo.svg';
const SITE_CACHE_KEY = 'edgechat.site';
const SESSION_CACHE_KEY = 'edgechat.session';

function readCache(key) {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // 存储不可用时静默降级，不影响功能
  }
}

function removeCache(key) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
  } catch {
    // 忽略
  }
}

function normalizeSessionCached(cached) {
  if (!cached || typeof cached !== 'object') {
    return null;
  }
  return {
    userId: Number(cached.userId) || 0,
    username: String(cached.username || ''),
    displayName: String(cached.displayName || ''),
    avatarUrl: String(cached.avatarUrl || ''),
    isAdmin: Boolean(cached.isAdmin)
  };
}

const cachedSession = normalizeSessionCached(readCache(SESSION_CACHE_KEY));

const state = reactive({
  ready: false,
  token: isDemoMode ? runtimeSessionToken : getStoredToken(),
  // 先用本地缓存填充展示字段，避免每次进入都从数据库拉取导致闪现/抖动
  session: cachedSession,
  site: {
    siteName: 'Edgechat',
    siteIconUrl: ''
  }
});

// 站点元数据（站名/图标）也在模块加载时同步恢复，登录页等公共页面无闪现
const cachedSite = readCache(SITE_CACHE_KEY);
if (cachedSite && typeof cachedSite === 'object') {
  state.site = {
    siteName: String(cachedSite.siteName || 'Edgechat').trim() || 'Edgechat',
    siteIconUrl: String(cachedSite.siteIconUrl || '').trim()
  };
  applySiteMetadata(state.site);
}

function clearAuthState() {
  clearStoredToken();
  removeCache(SESSION_CACHE_KEY);
  state.token = '';
  state.session = null;
}

function applySiteMetadata(site) {
  const siteName = String(site?.siteName || 'Edgechat').trim() || 'Edgechat';
  const siteIconUrl = String(site?.siteIconUrl || '').trim();
  document.title = siteName;

  let favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.setAttribute('rel', 'icon');
    document.head.appendChild(favicon);
  }

  if (siteIconUrl) {
    favicon.setAttribute('href', siteIconUrl);
  } else {
    favicon.setAttribute('href', DEFAULT_SITE_ICON_URL);
  }

  // iOS 安装图标读 apple-touch-icon,跟随后台配置;未配置时保留默认图标
  let appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (!appleTouchIcon) {
    appleTouchIcon = document.createElement('link');
    appleTouchIcon.setAttribute('rel', 'apple-touch-icon');
    document.head.appendChild(appleTouchIcon);
  }
  appleTouchIcon.setAttribute('href', siteIconUrl || '/apple-touch-icon.png');
}

async function loadSite() {
  try {
    const payload = await api.getSite();
    setSite(payload.site);
  } catch {
    applySiteMetadata(state.site);
  }
}

async function initialize() {
  if (state.ready) {
    return;
  }

  await loadSite();

  if (!state.token) {
    state.ready = true;
    return;
  }

  try {
    const payload = await api.session();
    state.session = payload.session;
    writeCache(SESSION_CACHE_KEY, payload.session);
  } catch {
    clearAuthState();
  } finally {
    state.ready = true;
  }
}

async function login(credentials) {
  const payload = await api.login(credentials);
  state.token = payload.token;
  state.session = payload.session;
  state.ready = true;
  setStoredToken(payload.token);
  writeCache(SESSION_CACHE_KEY, payload.session);
}

async function logout() {
  try {
    if (state.token) {
      await api.logout();
    }
  } finally {
    clearAuthState();
  }
}

function setSession(session) {
  state.session = session;
  writeCache(SESSION_CACHE_KEY, session);
}

function setSite(site) {
  state.site = {
    siteName: String(site?.siteName || 'Edgechat').trim() || 'Edgechat',
    siteIconUrl: String(site?.siteIconUrl || '').trim()
  };
  applySiteMetadata(state.site);
  writeCache(SITE_CACHE_KEY, state.site);
}

if (typeof window !== 'undefined') {
  addAuthInvalidListener(() => {
    clearAuthState();
  });
}

export default {
  get ready() {
    return state.ready;
  },
  get token() {
    return state.token;
  },
  get session() {
    return state.session;
  },
  get site() {
    return state.site;
  },
  initialize,
  login,
  logout,
  setSession,
  setSite,
  loadSite
};