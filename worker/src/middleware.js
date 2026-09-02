import { errorResponse, clientIp } from './utils.js';
import { putSession } from './auth.js';
import { validateSession } from './session.js';
import { recordIpEvent } from './data/ip-audit.js';

function extractToken(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const url = new URL(request.url);
  return url.searchParams.get('token') || '';
}

export async function authMiddleware(c, next) {
  const token = extractToken(c.req.raw);
  const result = await validateSession(c.env, token);
  if (!result.ok) {
    return errorResponse(result.message, result.status);
  }

  const session = result.session;
  const ip = clientIp(c);
  if (ip && session.lastIp !== ip) {
    // 每个会话只在 IP 变化时写一条审计，避免每请求动表。
    await recordIpEvent(c.env.DB, {
      userId: session.userId,
      event: 'access',
      ip,
      userAgent: c.req.header('user-agent') || ''
    }).catch(() => {});
    session.lastIp = ip;
    await putSession(c.env, session).catch(() => {});
  }

  c.set('session', session);
  await next();
}

export async function adminMiddleware(c, next) {
  const session = c.get('session');
  if (!session?.isAdmin) {
    return errorResponse('需要管理员权限', 403);
  }

  await next();
}
