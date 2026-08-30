import { listRoomMemberIds } from "./data/unread.js";
import {
	listSubscriptionsForUsers,
	deletePushSubscription,
} from "./data/push-subscriptions.js";
import { listBarkKeysForUsers } from "./data/users.js";
import { getSiteSettings } from "./data/site-settings.js";
import { sendBarkPush } from "./integrations/bark.js";
import {
	PushSubscriptionGoneError,
	sendPushNotification,
} from "./push-crypto.js";

export function createPushProjection({
	listMemberIds = listRoomMemberIds,
	listSubscriptions = listSubscriptionsForUsers,
	listBarkKeys = listBarkKeysForUsers,
	loadSiteName = async (db) => String((await getSiteSettings(db)).siteName || "").trim(),
	sendPush = sendPushNotification,
	sendBark = sendBarkPush,
	removeSubscription = deletePushSubscription,
	logFailure = (message, data) => console.warn(JSON.stringify({ message, ...data })),
} = {}) {
	function summarizeMessage(message) {
		const content = String(message?.content || "").trim();
		if (content) {
			return content.length > 120 ? `${content.slice(0, 120)}…` : content;
		}
		return message?.attachment ? "收到一条新消息" : "";
	}

	// Bark 的 icon 字段需要绝对 URL(仅 iOS 15+ 生效):
	// 私聊带发送者头像,群聊带群头像,都没有则降级为站点 logo;
	// 拿不到站点源(未记录 origin)时干脆不带 icon,交回 Bark 默认样式。
	function barkIconUrl(room, message, siteOrigin) {
		const origin = String(siteOrigin || "").trim().replace(/\/+$/, "");
		if (!origin) {
			return "";
		}
		const relative =
			room.kind === "dm"
				? String(message?.sender?.avatarUrl || "").trim()
				: room.avatar_key
					? `/files/${encodeURIComponent(String(room.avatar_key))}`
					: "";
		return relative ? `${origin}${relative}` : `${origin}/logo.svg`;
	}

	return async function projectPushNotifications(
		env,
		{ room, senderId, message, siteOrigin },
	) {
		try {
			const memberIds = await listMemberIds(env.DB, room.id);
			const recipientIds = memberIds.filter(
				(userId) => Number(userId) !== Number(senderId),
			);

			const body = summarizeMessage(message);
			const title =
				room.kind === "dm"
					? message?.sender?.displayName || "私信"
					: room.name || "群聊";

			const webPushConfigured = Boolean(
				env.VAPID_PRIVATE_KEY && env.VAPID_PUBLIC_KEY && env.VAPID_SUBJECT,
			);
			// Web Push 与 Bark 是两条独立通道:Bark 不依赖 VAPID 配置,
			// 任一通道的查询/发送失败都不影响另一通道。
			let subscriptions = [];
			if (webPushConfigured) {
				try {
					subscriptions = await listSubscriptions(env.DB, recipientIds);
				} catch (error) {
					logFailure("push projection failed", {
						roomId: Number(room.id),
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			let barkTargets = [];
			try {
				barkTargets = await listBarkKeys(env.DB, recipientIds);
			} catch (error) {
				logFailure("bark projection failed", {
					roomId: Number(room.id),
					error: error instanceof Error ? error.message : String(error),
				});
			}

			if (webPushConfigured && subscriptions.length) {
				// Declarative Web Push (WebKit 落地版):web_push: 8030 魔法值声明信封,
				// iOS 26+/Safari 26+ 直接在平台层展示 immutable 通知,不唤醒 SW;
				// 老客户端把该 payload 当作普通推送交给 SW 的 push 事件,sw.js 已兼容解析。
				// navigate 用订阅保存时捎带的站点 origin,拼绝对地址便于点击跳转。
				// iOS 对 declarative 信封里的 tag/renotify 组合存在解析问题(与 WebKit 旧 tag 分组
				// 缺陷同族),信封保持最小化:仅 title/body/navigate。
				const payloadFor = (subscription) => {
					const origin = String(subscription.origin || "").replace(/\/+$/, "");
					return JSON.stringify({
						web_push: 8030,
						notification: {
							title,
							body: body || "收到一条新消息",
							navigate: origin ? `${origin}/` : "/",
						},
					});
				};

				await Promise.allSettled(
					subscriptions.map((subscription) =>
						sendPush(env, subscription, payloadFor(subscription))
							.then((result) => {
								console.log(JSON.stringify({
									message: "push sent",
									roomId: Number(room.id),
									endpoint: subscription.endpoint,
									status: result?.status ?? 0,
									responseBody: result?.body || "",
									responseHeaders: result?.headers || {},
									requestContentType: result?.requestContentType || "",
									requestPayload: result?.requestPayload || "",
								}));
							})
							.catch(async (error) => {
								if (error instanceof PushSubscriptionGoneError) {
									// 订阅已被推送服务丢弃(410/404),同步清理
									await removeSubscription(env.DB, subscription.endpoint).catch(
										() => {},
									);
									return;
								}
								logFailure("push projection failed", {
									roomId: Number(room.id),
									endpoint: subscription.endpoint,
									error: error instanceof Error ? error.message : String(error),
								});
							}),
					),
				);
			}

		if (barkTargets.length) {
			const icon = barkIconUrl(room, message, siteOrigin);
			// 站点名称同时用作 subtitle 与 group 前缀,标明消息来自哪个站点,
			// 也让不同站点的通知分组互不干扰;读不到站点名时回退 edgechat 前缀。
			let siteName = "";
			try {
				siteName = await loadSiteName(env.DB);
			} catch (error) {
				logFailure("bark site name failed", {
					roomId: Number(room.id),
					error: error instanceof Error ? error.message : String(error),
				});
			}
			const groupPrefix = siteName || "edgechat";
			await Promise.allSettled(
				barkTargets.map((target) =>
					sendBark(env, {
						deviceKey: target.deviceKey,
						title,
						...(siteName ? { subtitle: siteName } : {}),
						body: body || "收到一条新消息",
						group: `${groupPrefix}:${room.id}`,
						icon,
					})
						.then((result) => {
							console.log(JSON.stringify({
								message: "bark push sent",
								roomId: Number(room.id),
								userId: target.userId,
								status: result?.status ?? 0,
								responseBody: result?.body || "",
								requestPayload: result?.requestPayload || "",
							}));
						})
						.catch((error) => {
							logFailure("bark push failed", {
								roomId: Number(room.id),
								userId: target.userId,
								error: error instanceof Error ? error.message : String(error),
							});
						}),
				),
			);
		}
	} catch (error) {
		logFailure("push projection failed", {
			roomId: Number(room.id),
			error: error instanceof Error ? error.message : String(error),
		});
	}
};
}

export const projectPushNotifications = createPushProjection();