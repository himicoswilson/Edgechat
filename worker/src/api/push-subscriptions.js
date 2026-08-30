import { upsertPushSubscription, deletePushSubscription, listSubscriptionsForUsers } from "../data/push-subscriptions.js";

function parseSubscriptionBody(session, payload) {
	const endpoint = String(payload?.endpoint || "").trim();
	const keys = payload?.keys || {};
	const p256dh = String(keys.p256dh || "").trim();
	const auth = String(keys.auth || "").trim();
	if (!endpoint || !p256dh || !auth) {
		return null;
	}
	return { userId: session.userId, endpoint, p256dh, auth };
}

export function registerPushSubscriptionRoutes(app) {
	// 读回当前账号已登记的订阅,用于排查"已保存但查不到"的落库问题
	app.get("/api/push-subscriptions", async (c) => {
		const session = c.get("session");
		const rows = await listSubscriptionsForUsers(c.env.DB, [session.userId]);
		return c.json({
			subscriptions: rows.map((row) => ({ endpoint: row.endpoint })),
		});
	});

	// 浏览器保存或刷新 PushSubscription 后上报
	app.post("/api/push-subscriptions", async (c) => {
		const session = c.get("session");
		const subscription = parseSubscriptionBody(session, await c.req.json().catch(() => null));
		if (!subscription) {
			return c.json({ error: "推送订阅信息不完整" }, 400);
		}
		await upsertPushSubscription(c.env.DB, subscription);
		console.log(JSON.stringify({ message: "push subscription saved", userId: subscription.userId, endpoint: subscription.endpoint }));
		return c.json({ ok: true });
	});

	// 推送失效/用户关闭通知时移除
	app.delete("/api/push-subscriptions", async (c) => {
		const payload = await c.req.json().catch(() => null);
		const endpoint = String(payload?.endpoint || "").trim();
		if (!endpoint) {
			return c.json({ error: "推送订阅信息不完整" }, 400);
		}
		await deletePushSubscription(c.env.DB, endpoint);
		console.log(JSON.stringify({ message: "push subscription deleted", endpoint }));
		return c.json({ ok: true });
	});
}