import { listRoomMemberIds } from "./data/unread.js";
import {
	listSubscriptionsForUsers,
	deletePushSubscription,
} from "./data/push-subscriptions.js";
import {
	PushSubscriptionGoneError,
	sendPushNotification,
} from "./push-crypto.js";

export function createPushProjection({
	listMemberIds = listRoomMemberIds,
	listSubscriptions = listSubscriptionsForUsers,
	sendPush = sendPushNotification,
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

	return async function projectPushNotifications(env, { room, senderId, message }) {
		if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) {
			return;
		}
		try {
			const memberIds = await listMemberIds(env.DB, room.id);
			const recipientIds = memberIds.filter(
				(userId) => Number(userId) !== Number(senderId),
			);
			const subscriptions = await listSubscriptions(env.DB, recipientIds);
			if (!subscriptions.length) {
				return;
			}

			const body = summarizeMessage(message);
			const title =
				room.kind === "dm"
					? message?.sender?.displayName || "私信"
					: room.name || "群聊";
			// Declarative Web Push (WebKit 落地版):web_push: 8030 魔法值声明信封,
			// iOS 26+/Safari 26+ 直接在平台层展示 immutable 通知,不唤醒 SW;
			// 老客户端把该 payload 当作普通推送交给 SW 的 push 事件,sw.js 已兼容解析。
			// navigate 用订阅保存时捎带的站点 origin,拼绝对地址便于点击跳转。
			const payloadFor = (subscription) => {
				const origin = String(subscription.origin || "").replace(/\/+$/, "");
				return JSON.stringify({
					web_push: 8030,
					notification: {
						title,
						body: body || "收到一条新消息",
						tag: `${room.kind}:${room.id}`,
						renotify: true,
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
		} catch (error) {
			logFailure("push projection failed", {
				roomId: Number(room.id),
				error: error instanceof Error ? error.message : String(error),
			});
		}
	};
}

export const projectPushNotifications = createPushProjection();