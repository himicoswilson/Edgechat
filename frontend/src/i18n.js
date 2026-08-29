import { computed, readonly, ref } from 'vue';
import enUS from './locales/en-US.js';
import zhCN from './locales/zh-CN.js';

export const CHINESE_LOCALE = 'zh-CN';
export const ENGLISH_LOCALE = 'en-US';
const STORAGE_KEY = 'edgechat.locale';
const messages = {
  [CHINESE_LOCALE]: zhCN,
  [ENGLISH_LOCALE]: enUS
};

function normalizeLocale(value) {
  return value === CHINESE_LOCALE ? CHINESE_LOCALE : ENGLISH_LOCALE;
}

export function detectBrowserLocale(value) {
  return /^zh(?:[-_]|$)/i.test(String(value || '')) ? CHINESE_LOCALE : ENGLISH_LOCALE;
}

function initialLocale() {
  const storedLocale = typeof localStorage === 'undefined' ? '' : localStorage.getItem(STORAGE_KEY);
  if (storedLocale === CHINESE_LOCALE || storedLocale === ENGLISH_LOCALE) return storedLocale;
  const browserLanguage = globalThis.navigator?.languages?.[0] || globalThis.navigator?.language;
  return detectBrowserLocale(browserLanguage);
}

const locale = ref(initialLocale());

function interpolate(template, params) {
  return template.replace(/\{([a-zA-Z][\w]*)\}/g, (match, key) =>
    Object.hasOwn(params, key) ? String(params[key]) : match
  );
}

function applyDocumentLocale() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale.value;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', t('app.description'));
}

export function t(key, params = {}) {
  const template = messages[locale.value]?.[key] ?? messages[ENGLISH_LOCALE]?.[key] ?? key;
  return interpolate(template, params);
}

export function setLocale(value) {
  locale.value = normalizeLocale(value);
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, locale.value);
  applyDocumentLocale();
}

export function toggleLocale() {
  setLocale(locale.value === CHINESE_LOCALE ? ENGLISH_LOCALE : CHINESE_LOCALE);
}

export function formatDateTime(value, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  const date = parseUtcTime(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale.value, options).format(date);
}

export function formatDate(value, options = { dateStyle: 'medium' }) {
  const date = parseUtcTime(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale.value, options).format(date);
}

export function formatTime(value, options = { hour: '2-digit', minute: '2-digit' }) {
  const date = parseUtcTime(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale.value, options).format(date);
}

// SQLite CURRENT_TIMESTAMP 输出无时区的 UTC 时间串(如 "2026-08-30 07:17:51"),
// new Date() 会按本地时区解析导致显示偏移(东八区显示少 8 小时),统一补 Z 按 UTC 解析。
// 带时区后缀(Z / ±HH:MM)的 ISO 字符串不受影响。
const SQLITE_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/;

export function parseUtcTime(value) {
  if (typeof value === "string" && SQLITE_UTC_PATTERN.test(value)) {
    return new Date(`${value.replace(" ", "T")}Z`);
  }
  return value instanceof Date ? value : new Date(value);
}

export function compareLocalized(left, right) {
  return String(left).localeCompare(String(right), locale.value);
}

export function getLocale() {
  return locale.value;
}

export function useI18n() {
  return {
    locale: readonly(locale),
    isEnglish: computed(() => locale.value === ENGLISH_LOCALE),
    t,
    setLocale,
    toggleLocale,
    formatDate,
    parseUtcTime,
    formatDateTime,
    formatTime,
    compareLocalized
  };
}

applyDocumentLocale();
