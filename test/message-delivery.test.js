import assert from "node:assert/strict";
import test from "node:test";

import {
	MessageSubmissionError,
	createMessageSubmission,
} from "../worker/src/message-submission.js";
import { createUnreadProjection } from "../worker/src/unread-projection.js";

test("消息提交 module 统一持久化参数与广播 packet", async () => {
	const calls = [];
	const message = { id: 11, content: "hello" };
	const submit = createMessageSubmission({
		async persistMessage(env, args) {
			calls.push({ env, args });
			return message;
		},
	});
	const env = {};
	const result = await submit(
		env,
		{ room: { id: 3 }, principal: { userId: 7 } },
		{ content: "hello", attachment: { key: "a" } },
	);

	assert.deepEqual(calls, [{
		env,
		args: { channelId: 3, senderId: 7, content: "hello", attachment: { key: "a" } },
	}]);
	assert.equal(result.message, message);
	assert.deepEqual(JSON.parse(result.packet), { type: "message", message });
});

test("全员禁言时仅群主可发言，其余成员被拒绝", async () => {
	let persisted = 0;
	const submit = createMessageSubmission({
		async persistMessage() {
			persisted += 1;
			return { id: 1, content: "hello" };
		},
	});
	const room = { id: 3, mute_everyone: 1, created_by: 9 };

	// 非群主：拒绝且不落库
	await assert.rejects(
		submit(
			{},
			{ room, principal: { userId: 7 } },
			{ content: "hello" },
		),
		(error) => error instanceof MessageSubmissionError && error.message === "已开启全员禁言",
	);
	assert.equal(persisted, 0);

	// 群主：正常发言
	const result = await submit(
		{},
		{ room, principal: { userId: 9 } },
		{ content: "hello" },
	);
	assert.equal(persisted, 1);
	assert.equal(result.message.id, 1);

	// 管理员（非群主）：同样可发言
	const adminResult = await submit(
		{},
		{ room, principal: { userId: 7, isAdmin: true } },
		{ content: "hello" },
	);
	assert.equal(persisted, 2);
	assert.equal(adminResult.message.id, 1);

	// 未开启禁言时普通成员照常发言
	const result2 = await submit(
		{},
		{ room: { id: 3, mute_everyone: 0, created_by: 9 }, principal: { userId: 7 } },
		{ content: "hello" },
	);
	assert.equal(persisted, 3);
	assert.equal(result2.message.id, 1);
});

test("消息提交只转换可预期的空消息错误", async () => {
	const submitEmpty = createMessageSubmission({
		async persistMessage() {
			throw new Error("Message content cannot be empty");
		},
	});
	await assert.rejects(
		submitEmpty({}, { room: {}, principal: {} }, {}),
		(error) => error instanceof MessageSubmissionError && error.message === "消息内容不能为空",
	);

	const original = new Error("database unavailable");
	const submitFailure = createMessageSubmission({
		async persistMessage() {
			throw original;
		},
	});
	await assert.rejects(submitFailure({}, { room: {}, principal: {} }, {}), original);
});

test("未读投影排除发送者，并行投影所有收件人", async () => {
	const countCalls = [];
	const notifications = [];
	const resolvers = new Map();
	const project = createUnreadProjection({
		async listMemberIds() {
			return [1, 2, 3];
		},
		countUnread(_db, { userId }) {
			countCalls.push(userId);
			return new Promise((resolve) => resolvers.set(userId, resolve));
		},
		async notifyInbox(_env, userId, payload) {
			notifications.push({ userId, payload });
		},
	});
	const pending = project(
		{ DB: {} },
		{
			room: { id: "4", kind: "private", name: "Team" },
			senderId: 1,
			message: { id: "8", createdAt: "now" },
		},
	);
	await Promise.resolve();
	assert.deepEqual(countCalls, [2, 3]);
	resolvers.get(2)(5);
	resolvers.get(3)(6);
	await pending;
	assert.deepEqual(notifications, [
		{
			userId: 2,
			payload: {
				type: "room_message",
				room: { id: 4, kind: "private", name: "Team" },
				messageId: 8,
				createdAt: "now",
				unreadCount: 5,
			},
		},
		{
			userId: 3,
			payload: {
				type: "room_message",
				room: { id: 4, kind: "private", name: "Team" },
				messageId: 8,
				createdAt: "now",
				unreadCount: 6,
			},
		},
	]);
});

test("单个未读收件人失败被隔离，成员查询失败也不阻塞提交链路", async () => {
	const notifications = [];
	const failures = [];
	const project = createUnreadProjection({
		async listMemberIds() {
			return [2, 3];
		},
		async countUnread(_db, { userId }) {
			if (userId === 2) throw new Error("count failed");
			return 1;
		},
		async notifyInbox(_env, userId) {
			notifications.push(userId);
		},
		logFailure(message, data) {
			failures.push({ message, data });
		},
	});
	await project(
		{ DB: {} },
		{ room: { id: 4 }, senderId: 1, message: { id: 8 } },
	);
	assert.deepEqual(notifications, [3]);
	assert.equal(failures[0].message, "unread recipient projection failed");

	const outerFailures = [];
	const projectWithListFailure = createUnreadProjection({
		async listMemberIds() {
			throw new Error("list failed");
		},
		logFailure(message, data) {
			outerFailures.push({ message, data });
		},
	});
	await projectWithListFailure(
		{ DB: {} },
		{ room: { id: 4 }, senderId: 1, message: { id: 8 } },
	);
	assert.equal(outerFailures[0].message, "unread projection failed");
});
