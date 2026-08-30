import assert from "node:assert/strict";
import test from "node:test";

import { createPushProjection } from "../worker/src/push-notifications.js";
import { PushSubscriptionGoneError } from "../worker/src/push-crypto.js";

// biome-ignore lint/correctness/noUnusedFunctionParameters: logFailure 仅部分用例注入
function createProjection({ overlays = {}, logFailure = () => {} } = {}) {
	const calls = { sends: [], removed: [], failures: [] };
	const projection = createPushProjection({
		listMemberIds: overlays.listMemberIds || (async () => [1, 2, 3]),
		listSubscriptions:
			overlays.listSubscriptions ||
			(async (_, userIds) =>
				userIds.map((userId) => ({
					userId: Number(userId),
					endpoint: `https://push.example.com/${userId}`,
					keys: { p256dh: "k", auth: "a" },
				}))),
		sendPush: overlays.sendPush || (async (_env, sub) => calls.sends.push(sub.endpoint)),
		removeSubscription: overlays.removeSubscription || (async (_db, endpoint) => calls.removed.push(endpoint)),
		logFailure: (message, data) => calls.failures.push({ message, data }),
	});
	return { projection, calls };
}

test("未配置 VAPID 时不发送任何推送", async () => {
	const { projection, calls } = createProjection();
	await projection(
		{ DB: {} },
		{ room: { id: 1, kind: "public", name: "News" }, senderId: 1, message: { content: "hi" } },
	);
	assert.deepEqual(calls.sends, []);
});

test("只推送给非发送者,标题/正文按房间与消息生成", async () => {
	const env = {
		DB: {},
		VAPID_PRIVATE_KEY: "pk",
		VAPID_PUBLIC_KEY: "pub",
		VAPID_SUBJECT: "mailto:admin@example.com",
	};
	const { projection, calls } = createProjection();
	await projection(env, {
		room: { id: 7, kind: "public", name: "产品协作" },
		senderId: 2,
		message: { id: 5, content: "发布新版本", sender: { displayName: "Alice" } },
	});
	assert.deepEqual(calls.sends, [
		"https://push.example.com/1",
		"https://push.example.com/3",
	]);
});

test("发送 Declarative Web Push 落地信封(web_push:8030 + notification)", async () => {
	const captured = [];
	const projection = createPushProjection({
		listMemberIds: async () => [2, 3],
		listSubscriptions: async () => [
			{
				userId: 2,
				endpoint: "https://push.example.com/2",
				keys: { p256dh: "k", auth: "a" },
			},
		],
		sendPush: async (_env, _sub, payload) => {
			captured.push(JSON.parse(payload));
		},
	});
	await projection(
		{
			DB: {},
			VAPID_PRIVATE_KEY: "pk",
			VAPID_PUBLIC_KEY: "pub",
			VAPID_SUBJECT: "mailto:admin@himicos.com",
			SITE_URL: "https://im.himicos.com/",
		},
		{
			room: { id: 7, kind: "public", name: "产品协作" },
			senderId: 2,
			message: { content: "发布新版本", sender: { displayName: "Alice" } },
		},
	);
	assert.equal(captured.length, 1);
	assert.equal(captured[0].web_push, 8030);
	assert.equal(captured[0].notification.title, "产品协作");
	assert.equal(captured[0].notification.body, "发布新版本");
	assert.equal(captured[0].notification.tag, "public:7");
	assert.equal(captured[0].notification.navigate, "https://im.himicos.com/");
});

test("私信标题取发送者昵称,未配 SITE_URL 时 navigate 回落相对路径", async () => {
	const captured = [];
	const projection = createPushProjection({
		listMemberIds: async () => [3],
		listSubscriptions: async () => [
			{
				userId: 3,
				endpoint: "https://push.example.com/3",
				keys: { p256dh: "k", auth: "a" },
			},
		],
		sendPush: async (_env, _sub, payload) => {
			captured.push(JSON.parse(payload));
		},
	});
	await projection(
		{
			DB: {},
			VAPID_PRIVATE_KEY: "pk",
			VAPID_PUBLIC_KEY: "pub",
			VAPID_SUBJECT: "mailto:admin@himicos.com",
		},
		{
			room: { id: 7, kind: "dm", name: "1:2" },
			senderId: 2,
			message: { content: "明天开会", sender: { displayName: "王五" } },
		},
	);
	assert.equal(captured[0].notification.title, "王五");
	assert.equal(captured[0].notification.navigate, "/");
});

test("推送服务返回 410 时清理失效订阅,其他错误只记录不中断", async () => {
	const env = {
		DB: {},
		VAPID_PRIVATE_KEY: "pk",
		VAPID_PUBLIC_KEY: "pub",
		VAPID_SUBJECT: "mailto:admin@example.com",
	};
	const { projection, calls } = createProjection({
		overlays: {
			async sendPush(_env, subscription) {
				if (subscription.endpoint.endsWith("/1")) {
					throw new PushSubscriptionGoneError(subscription.endpoint);
				}
				throw new Error("network glitch");
			},
		},
	});
	await projection(env, {
		room: { id: 7, kind: "public", name: "产品协作" },
		senderId: 2,
		message: { content: "hi" },
	});
	assert.deepEqual(calls.removed, ["https://push.example.com/1"]);
	assert.equal(calls.failures.length, 1);
	assert.equal(calls.failures[0].message, "push projection failed");
});