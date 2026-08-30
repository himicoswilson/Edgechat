import assert from "node:assert/strict";
import test from "node:test";

import {
	listMessageReaders,
	readersByMessage,
} from "../worker/src/data/unread.js";

function createReaderDb(results, { record = () => {} } = {}) {
	return {
		prepare(sql) {
			const call = { sql, binds: [] };
			return {
				bind(...binds) {
					call.binds = binds;
					return this;
				},
				async all() {
					record(call);
					return { results };
				},
			};
		},
	};
}

test("listMessageReaders 返回已读水位并按成员过滤、排除自己", async () => {
	const rows = [
		{ id: 2, username: "alice", display_name: "Alice", avatar_key: "a.png", watermark: 42 },
		{ id: 3, username: "bob", display_name: "Bob", avatar_key: null, watermark: 12 },
	];
	const calls = [];
	const db = createReaderDb(rows, { record: (call) => calls.push(call) });

	const readers = await listMessageReaders(db, { channelId: 7, excludeUserId: 1 });

	assert.equal(calls.length, 1);
	assert.equal(calls[0].binds.length, 2);
	assert.equal(calls[0].binds[0], 7);
	assert.equal(calls[0].binds[1], 1);
	assert.match(calls[0].sql, /JOIN channel_members cm/);
	assert.match(calls[0].sql, /mr\.user_id != \?/);
	assert.deepEqual(readers, [
		{
			id: 2,
			username: "alice",
			displayName: "Alice",
			avatarUrl: "/files/a.png",
			watermark: 42,
		},
		{
			id: 3,
			username: "bob",
			displayName: "Bob",
			avatarUrl: "",
			watermark: 12,
		},
	]);
});

test("listMessageReaders 不传 excludeUserId 时不附加排除条件", async () => {
	const calls = [];
	const db = createReaderDb([], { record: (call) => calls.push(call) });

	await listMessageReaders(db, { channelId: 7 });

	assert.equal(calls[0].binds.length, 1);
	assert.equal(calls[0].binds[0], 7);
	assert.doesNotMatch(calls[0].sql, /user_id !=/);
});

test("readersByMessage 按单调水位给多条消息分组，并剥离水位字段", () => {
	const readers = [
		{ id: 2, username: "alice", displayName: "Alice", avatarUrl: "", watermark: 30 },
		{ id: 3, username: "bob", displayName: "Bob", avatarUrl: "", watermark: 20 },
		{ id: 4, username: "carol", displayName: "Carol", avatarUrl: "", watermark: 10 },
	];

	assert.deepEqual(readersByMessage(readers, [10, 20, 25, 30]), {
		10: [
			{ id: 2, username: "alice", displayName: "Alice", avatarUrl: "" },
			{ id: 3, username: "bob", displayName: "Bob", avatarUrl: "" },
			{ id: 4, username: "carol", displayName: "Carol", avatarUrl: "" },
		],
		20: [
			{ id: 2, username: "alice", displayName: "Alice", avatarUrl: "" },
			{ id: 3, username: "bob", displayName: "Bob", avatarUrl: "" },
		],
		25: [{ id: 2, username: "alice", displayName: "Alice", avatarUrl: "" }],
		30: [{ id: 2, username: "alice", displayName: "Alice", avatarUrl: "" }],
	});
});

test("readersByMessage 无人已读时返回空数组", () => {
	assert.deepEqual(readersByMessage([], [5, 6]), { 5: [], 6: [] });
});