import { insertMessage } from "./data/messages.js";

export class MessageSubmissionError extends Error {
	constructor(message) {
		super(message);
		this.name = "MessageSubmissionError";
	}
}

export function createMessageSubmission({ persistMessage = insertMessage } = {}) {
	return async function submitRoomMessage(env, meta, payload) {
		// 全员禁言：仅群主和管理员可发言，其余成员直接拒绝
		// （general 群无群主，禁言后只有管理员还能发言）
		const room = meta.room;
		if (
			room &&
			Number(room.mute_everyone || 0) === 1 &&
			Number(room.created_by) !== Number(meta.principal.userId) &&
			!meta.principal.isAdmin
		) {
			throw new MessageSubmissionError("已开启全员禁言");
		}
		try {
			const message = await persistMessage(env, {
				channelId: meta.room.id,
				senderId: meta.principal.userId,
				content: payload.content,
				attachment: payload.attachment,
			});
			return {
				message,
				packet: JSON.stringify({ type: "message", message }),
			};
		} catch (error) {
			if (error?.message === "Message content cannot be empty") {
				throw new MessageSubmissionError("消息内容不能为空");
			}
			throw error;
		}
	};
}

export const submitRoomMessage = createMessageSubmission();
