export async function listSubscriptionsForUsers(db, userIds) {
	if (!userIds.length) {
		return [];
	}
	const placeholders = userIds.map(() => "?").join(",");
	const { results } = await db
		.prepare(
			`SELECT user_id, endpoint, p256dh, auth
			 FROM push_subscriptions
			 WHERE user_id IN (${placeholders})`,
		)
		.bind(...userIds)
		.all();
	return results.map((row) => ({
		userId: Number(row.user_id),
		endpoint: String(row.endpoint),
		keys: { p256dh: String(row.p256dh), auth: String(row.auth) },
	}));
}

export async function upsertPushSubscription(db, { userId, endpoint, p256dh, auth }) {
	await db
		.prepare(
			`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(endpoint) DO UPDATE
			 SET user_id = excluded.user_id,
			     p256dh = excluded.p256dh,
			     auth = excluded.auth`,
		)
		.bind(Number(userId), String(endpoint), String(p256dh), String(auth))
		.run();
}

export async function deletePushSubscription(db, endpoint) {
	await db
		.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
		.bind(String(endpoint))
		.run();
}