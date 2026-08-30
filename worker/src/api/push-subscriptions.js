import { upsertPushSubscription, deletePushSubscription } from "../data/push-subscriptions.js";

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
	// 浏览器保存或刷新 PushSubscription 后上报
	app.post("/api/push-subscriptions", async (c) => {
		const session = c.get("session");
		const payload = await c.req.json().catch(() => null);
		const subscription = parseSubscriptionBody(session, payload);
		if (!subscription) {
			const keys = payload?.keys || {};
			const missing = [
				!String(payload?.endpoint || "").trim() ? "endpoint" : "",
				!String(keys.p256dh || "").trim() ? "p256dh" : "",
				!String(keys.auth || "").trim() ? "auth" : "",
			].filter(Boolean);
			return c.json({ error: `推送订阅信息不完整:缺失 ${missing.join("/")}` }, 400);
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