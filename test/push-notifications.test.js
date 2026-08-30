import assert from "node:assert/strict";
import test from "node:test";

import { createPushProjection } from "../worker/src/push-notifications.js";
import { PushSubscriptionGoneError } from "../worker/src/push-crypto.js";

// biome-ignore lint/correctness/noUnusedFunctionParameters: logFailure 仅部分用例注入
function createProjection({ overlays = {}, logFailure = () => {} } = {}) {
	const calls = { sends: [], removed: [], failures: [], bark: [] };
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
		listBarkKeys: overlays.listBarkKeys || (async () => []),
		loadSiteName: overlays.loadSiteName || (async () => ""),
		sendPush: overlays.sendPush || (async (_env, sub) => calls.sends.push(sub.endpoint)),
		sendBark: overlays.sendBark || (async (_env, target) => calls.bark.push(target)),
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
				origin: "https://im.himicos.com",
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
	assert.equal(captured[0].notification.navigate, "https://im.himicos.com/");
	assert.equal(captured[0].notification.tag, undefined);
	assert.equal(captured[0].notification.renotify, undefined);
});

test("私信标题取发送者昵称,navigate 用订阅携带的 origin 拼绝对地址", async () => {
	const captured = [];
	const projection = createPushProjection({
		listMemberIds: async () => [3],
		listSubscriptions: async () => [
			{
				userId: 3,
				endpoint: "https://push.example.com/3",
				origin: "https://im.himicos.com",
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
	assert.equal(captured[0].notification.navigate, "https://im.himicos.com/");
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

test("有 Bark 密钥的用户收到 Bark 推送,标题/正文/会话分组按房间生成", async () => {
	const barkCalls = [];
	const projection = createPushProjection({
		listMemberIds: async () => [1, 2, 3],
		listSubscriptions: async () => [],
		listBarkKeys: async () => [
			{ userId: 1, deviceKey: "key-for-1" },
			{ userId: 3, deviceKey: "key-for-3" },
		],
		sendBark: async (_env, target) => barkCalls.push(target),
	});
	await projection(
		{
			DB: {},
			VAPID_PRIVATE_KEY: "pk",
			VAPID_PUBLIC_KEY: "pub",
			VAPID_SUBJECT: "mailto:admin@example.com",
		},
		{
			room: { id: 7, kind: "public", name: "产品协作" },
			senderId: 2,
			message: { content: "发布新版本" },
		},
	);
	assert.deepEqual(barkCalls, [
		{
			deviceKey: "key-for-1",
			title: "产品协作",
			body: "发布新版本",
			group: "edgechat:7",
			icon: "",
		},
		{
			deviceKey: "key-for-3",
			title: "产品协作",
			body: "发布新版本",
			group: "edgechat:7",
			icon: "",
		},
	]);
});

test("未配置 VAPID 时仅发 Bark,不发 Web Push", async () => {
	const barkCalls = [];
	const sends = [];
	const projection = createPushProjection({
		listMemberIds: async () => [1, 2],
		listSubscriptions: async () => [{ userId: 1, endpoint: "e" }],
		listBarkKeys: async () => [{ userId: 1, deviceKey: "key-for-1" }],
		sendBark: async (_env, target) => barkCalls.push(target),
		sendPush: async (_env, sub) => sends.push(sub.endpoint),
	});
	await projection(
		{ DB: {} },
		{
			room: { id: 3, kind: "dm", name: "1:2" },
			senderId: 2,
			message: { content: "明天开会", sender: { displayName: "王五" } },
		},
	);
	assert.deepEqual(barkCalls, [
		{
			deviceKey: "key-for-1",
			title: "王五",
			body: "明天开会",
			group: "edgechat:3",
			icon: "",
		},
	]);
	assert.deepEqual(sends, []);
});

test("Bark 推送失败只记录日志,不影响其他推送", async () => {
	const failures = [];
	const projection = createPushProjection({
		listMemberIds: async () => [1, 2],
		listBarkKeys: async () => [{ userId: 1, deviceKey: "key-for-1" }],
		loadSiteName: async () => "",
		sendBark: async () => {
			throw new Error("bark server down");
		},
		logFailure: (message, data) => failures.push({ message, data }),
	});
	await projection(
		{ DB: {} },
		{
			room: { id: 3, kind: "public", name: "运维" },
			senderId: 2,
			message: { content: "hi" },
		},
	);
	assert.equal(failures.length, 1);
	assert.equal(failures[0].message, "bark push failed");
	assert.equal(failures[0].data.userId, 1);
});

test("Bark 推送带站点名称 subtitle,标明消息来自哪个站点", async () => {
	const barkCalls = [];
	const { projection } = createProjection({
		overlays: {
			listBarkKeys: async () => [{ userId: 1, deviceKey: "key-for-1" }],
			loadSiteName: async () => "公司内部沟通",
			sendBark: async (_env, target) => barkCalls.push(target),
		},
	});
	await projection(
		{
			DB: {},
			VAPID_PRIVATE_KEY: "pk",
			VAPID_PUBLIC_KEY: "pub",
			VAPID_SUBJECT: "mailto:admin@example.com",
		},
		{
			room: { id: 9, kind: "public", name: "运维" },
			senderId: 2,
			message: { content: "hi" },
		},
	);
	assert.equal(barkCalls.length, 1);
	assert.equal(barkCalls[0].subtitle, "公司内部沟通");
});

test("Bark 图标:私聊带发送者头像,群聊带群头像,没有则回退站点 logo", async () => {
	const icons = [];
	async function runProjection(input) {
		const projection = createPushProjection({
			listMemberIds: async () => [2],
			listSubscriptions: async () => [],
			listBarkKeys: async () => [{ userId: 2, deviceKey: "key-for-2" }],
			sendBark: async (_env, target) => icons.push(target.icon),
		});
		await projection(
			{ DB: {}, VAPID_PRIVATE_KEY: "pk", VAPID_PUBLIC_KEY: "pub", VAPID_SUBJECT: "mailto:a@b.c" },
			input,
		);
	}

	await runProjection({
		room: { id: 1, kind: "dm", name: "1:2" },
		senderId: 1,
		message: { content: "hi", sender: { avatarUrl: "/files/avatar-1" } },
		siteOrigin: "https://im.example.com",
	});
	await runProjection({
		room: { id: 2, kind: "public", name: "群", avatar_key: "avatar/grp" },
		senderId: 1,
		message: { content: "hi" },
		siteOrigin: "https://im.example.com/",
	});
	await runProjection({
		room: { id: 3, kind: "public", name: "群", avatar_key: "" },
		senderId: 1,
		message: { content: "hi" },
		siteOrigin: "https://im.example.com",
	});
	// 拿不到站点源时不带 icon(交回 Bark 默认样式)
	await runProjection({
		room: { id: 4, kind: "dm", name: "1:2" },
		senderId: 1,
		message: { content: "hi", sender: { avatarUrl: "/files/avatar-1" } },
	});

	assert.deepEqual(icons, [
		"https://im.example.com/files/avatar-1",
		"https://im.example.com/files/avatar%2Fgrp",
		"https://im.example.com/logo.svg",
		"",
	]);
});