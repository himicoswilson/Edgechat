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
			const payload = JSON.stringify({
				title,
				body: body || "收到一条新消息",
				tag: `${room.kind}:${room.id}`,
				url: "/",
			});

			await Promise.allSettled(
				subscriptions.map((subscription) =>
					sendPush(env, subscription, payload)
						.then(() => {
							console.log(JSON.stringify({
								message: "push sent",
								roomId: Number(room.id),
								endpoint: subscription.endpoint,
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