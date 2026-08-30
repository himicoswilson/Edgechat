import { countUnreadMessages, listRoomMemberIds } from "./data/unread.js";
import { notifyUserInbox } from "./do-bridge.js";

function logProjectionFailure(message, data) {
	console.warn(JSON.stringify({ message, ...data }));
}

function summarizeContent(message) {
	const content = String(message?.content || "").trim();
	if (content) {
		return content.length > 120 ? `${content.slice(0, 120)}…` : content;
	}
	return "";
}

export function createUnreadProjection({
	countUnread = countUnreadMessages,
	listMemberIds = listRoomMemberIds,
	notifyInbox = notifyUserInbox,
	logFailure = logProjectionFailure,
} = {}) {
	async function notifyRecipient(env, room, message, userId) {
		try {
			const unreadCount = await countUnread(env.DB, {
				channelId: room.id,
				userId,
			});
			await notifyInbox(env, userId, {
				type: "room_message",
				room: {
					id: Number(room.id),
					kind: room.kind,
					name: room.name,
				},
				messageId: Number(message.id),
				content: summarizeContent(message),
				senderName: message.sender?.displayName || "",
				createdAt: message.createdAt,
				unreadCount,
			});
		} catch (error) {
			logFailure("unread recipient projection failed", {
				roomId: Number(room.id),
				userId: Number(userId),
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return async function projectUnreadMessage(env, { room, senderId, message }) {
		try {
			const memberIds = await listMemberIds(env.DB, room.id);
			const recipientIds = memberIds.filter(
				(userId) => Number(userId) !== Number(senderId),
			);
			await Promise.all(
				recipientIds.map((userId) => notifyRecipient(env, room, message, userId)),
			);
		} catch (error) {
			logFailure("unread projection failed", {
				roomId: Number(room.id),
				error: error instanceof Error ? error.message : String(error),
			});
		}
	};
}

export const projectUnreadMessage = createUnreadProjection();
