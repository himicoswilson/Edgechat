import { activeUserSql } from "../user-status.js";
import { publicFileUrl } from "../utils.js";

async function resolveReadableMessageId(db, channelId, messageId = null) {
	const filters = ["channel_id = ?", "deleted_at IS NULL"];
	const binds = [Number(channelId)];
	if (messageId !== null && messageId !== undefined) {
		filters.push("id <= ?");
		binds.push(Number(messageId));
	}
	const { results } = await db
		.prepare(`SELECT COALESCE(MAX(id), 0) AS message_id FROM messages WHERE ${filters.join(" AND ")}`)
		.bind(...binds)
		.all();
	return Number(results[0]?.message_id || 0);
}

export async function markRoomRead(db, { channelId, userId, messageId = null }) {
	const lastReadMessageId = await resolveReadableMessageId(db, channelId, messageId);
	await db
		.prepare(
			`INSERT INTO message_reads (channel_id, user_id, last_read_message_id, updated_at)
			 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
			 ON CONFLICT(channel_id, user_id) DO UPDATE
			 SET last_read_message_id = MAX(message_reads.last_read_message_id, excluded.last_read_message_id),
			     updated_at = CURRENT_TIMESTAMP`,
		)
		.bind(Number(channelId), Number(userId), lastReadMessageId)
		.run();
	return lastReadMessageId;
}

export async function countUnreadMessages(db, { channelId, userId }) {
	const { results } = await db
		.prepare(
				`SELECT COUNT(*) AS unread_count FROM messages m
				 WHERE m.channel_id = ? AND m.deleted_at IS NULL
				   AND (m.sender_id IS NULL OR m.sender_id != ?)
			   AND m.id > COALESCE((SELECT mr.last_read_message_id FROM message_reads mr
			                            WHERE mr.channel_id = ? AND mr.user_id = ?), 0)`,
		)
		.bind(Number(channelId), Number(userId), Number(channelId), Number(userId))
		.all();
	return Number(results[0]?.unread_count || 0);
}

export async function listMessageReaders(db, { channelId, excludeUserId = null }) {
	const filters = ["mr.channel_id = ?", "u.deleted_at IS NULL"];
	const binds = [Number(channelId)];
	const exclude = Number(excludeUserId);
	if (Number.isInteger(exclude) && exclude > 0) {
		filters.push("mr.user_id != ?");
		binds.push(exclude);
	}
	const { results } = await db
		.prepare(
			`SELECT u.id, u.username, u.display_name, u.avatar_key,
			        mr.last_read_message_id AS watermark
			 FROM message_reads mr
			 JOIN users u ON u.id = mr.user_id
			 JOIN channel_members cm ON cm.channel_id = mr.channel_id AND cm.user_id = mr.user_id
			 WHERE ${filters.join(" AND ")}
			 ORDER BY mr.updated_at ASC`,
		)
		.bind(...binds)
		.all();
	return results.map((row) => ({
		id: Number(row.id),
		username: row.username,
		displayName: row.display_name,
		avatarUrl: row.avatar_key ? publicFileUrl(row.avatar_key) : "",
		watermark: Number(row.watermark),
	}));
}

// 已读是单调水位:last_read_message_id >= 目标消息即视为已读该消息。
export function readersByMessage(readers, messageIds) {
	const reads = {};
	for (const messageId of messageIds) {
		const matched = [];
		for (const reader of readers) {
			if (reader.watermark >= Number(messageId)) {
				const { watermark: _watermark, ...user } = reader;
				matched.push(user);
			}
		}
		reads[messageId] = matched;
	}
	return reads;
}

export async function listRoomMemberIds(db, channelId) {
	const { results } = await db
		.prepare(
			`SELECT cm.user_id
			 FROM channel_members cm
			 JOIN users u ON u.id = cm.user_id
			 WHERE cm.channel_id = ?
			   AND u.deleted_at IS NULL
			   AND ${activeUserSql("u")}`,
		)
		.bind(Number(channelId))
		.all();
	return results
		.map((row) => Number(row.user_id))
		.filter((userId) => Number.isFinite(userId));
}
