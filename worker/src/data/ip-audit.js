export async function recordIpEvent(db, { userId, event, ip, userAgent = '' }) {
  await db
    .prepare(
      `INSERT INTO user_ip_events (user_id, event, ip, user_agent)
       VALUES (?, ?, ?, ?)`
    )
    .bind(Number(userId), event, ip, userAgent)
    .run();
}

export async function listUserIpEvents(db, userId, limit = 20) {
  const { results } = await db
    .prepare(
      `SELECT event, ip, user_agent, created_at
       FROM user_ip_events
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .bind(Number(userId), limit)
    .all();
  return results.map((row) => ({
    event: row.event,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  }));
}
