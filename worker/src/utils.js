export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {})
    }
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, { status });
}

export const MAX_JSON_BODY_SIZE = 10 * 1024 * 1024;

export function requestBodyTooLarge(request, maxBytes = MAX_JSON_BODY_SIZE) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

export function parseJsonRequest(request) {
  return request.json().catch(() => ({}));
}

export function sanitizeLimit(value, fallback = 30, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function keyBelongsToOwner(key, ownerUserId) {
  if (ownerUserId === undefined || ownerUserId === null) {
    return true;
  }

  const ownerPrefix = `${Number(ownerUserId)}/`;
  return Number.isFinite(Number(ownerUserId)) && String(key || '').startsWith(ownerPrefix);
}

export function pickAttachment(payload, options = {}) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (!payload.key || !payload.name || !payload.type) {
    return null;
  }

  const key = String(payload.key);
  if (!keyBelongsToOwner(key, options.ownerUserId)) {
    return null;
  }

  return {
    key,
    name: String(payload.name),
    type: String(payload.type),
    size: Number(payload.size) || 0,
    url: `/files/${encodeURIComponent(key)}`
  };
}

export function publicFileUrl(key) {
  return `/files/${encodeURIComponent(key)}`;
}

export function nextDailyUtcHour(hour) {
  const target = new Date();
  target.setUTCMinutes(0, 0, 0);
  target.setUTCHours(hour);
  if (target <= new Date()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target;
}

// Cloudflare 注入的真实客户端 IP；回退到 X-Forwarded-For 首段（仅限非 CF 部署）。
export function clientIp(c) {
  const request = c.req.raw;
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) {
    return cfIp;
  }
  const forwarded = request.headers.get('X-Forwarded-For');
  return forwarded ? String(forwarded).split(',')[0].trim() : '';
}

export function randomToken(byteLength = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
