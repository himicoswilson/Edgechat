import assert from "node:assert/strict";
import test from "node:test";
import { nextTick, ref } from "vue";

import { useChatRoom } from "../frontend/src/composables/useChatRoom.js";

const originalRaf = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = (callback) => callback();

test.after(() => {
	globalThis.requestAnimationFrame = originalRaf;
});

function createSocket(params, handlers) {
	return {
		params,
		handlers,
		readyState: 1,
		close() {
			this.readyState = 3;
		},
		send() {},
		emitMessage(message) {
			handlers.onMessage(JSON.stringify(message), this);
		},
	};
}

function sender(id) {
	return { id, kind: "user" };
}

function createRoom({ element, getMessages }) {
	const activeRoom = ref({ id: 1, kind: "public" });
	const sockets = [];
	const room = useChatRoom({
		activeRoom,
		session: ref({ userId: 7 }),
		error: ref(""),
		roomApi: {
			getMessages,
			async markRoomRead() {},
		},
		openRoomConnection(params) {
			const handlers = {
				onStatus: params.onStatus,
				onMessage: params.onMessage,
			};
			const socket = createSocket(params, handlers);
			sockets.push(socket);
			handlers.onStatus({ status: "open", socket });
			return socket;
		},
	});
	if (element) {
		room.messagesEl.value = element;
	}
	return { room, sockets };
}

test("接近底部时他人的新消息跟随滚底", async () => {
	const element = { scrollHeight: 500, scrollTop: 480, clientHeight: 400 };
	const { room, sockets } = createRoom({
		element,
		getMessages: async () => ({ messages: [{ id: 1, sender: sender(1) }] }),
	});
	await room.activateRoom();
	element.scrollTop = 480;

	sockets[0].emitMessage({
		type: "message",
		message: { id: 2, content: "hi", sender: sender(5) },
	});
	await nextTick();

	assert.equal(element.scrollTop, element.scrollHeight);
});

test("阅读历史时他人的新消息不拽走当前阅读位置", async () => {
	const element = { scrollHeight: 1000, scrollTop: 300, clientHeight: 400 };
	const { room, sockets } = createRoom({
		element,
		getMessages: async () => ({ messages: [{ id: 1, sender: sender(1) }] }),
	});
	await room.activateRoom();
	element.scrollTop = 300;

	sockets[0].emitMessage({
		type: "message",
		message: { id: 2, content: "hi", sender: sender(5) },
	});
	await nextTick();

	assert.equal(element.scrollTop, 300);
});

test("自己发送的消息无论滚动位置都强制滚底", async () => {
	const element = { scrollHeight: 1000, scrollTop: 300, clientHeight: 400 };
	const { room, sockets } = createRoom({
		element,
		getMessages: async () => ({ messages: [{ id: 1, sender: sender(1) }] }),
	});
	await room.activateRoom();
	element.scrollTop = 300;

	sockets[0].emitMessage({
		type: "message",
		message: { id: 2, content: "mine", sender: sender(7) },
	});
	await nextTick();

	assert.equal(element.scrollTop, element.scrollHeight);
});

test("加载更早消息保持滚动锚点,空页后停止请求", async () => {
	let olderCalls = 0;
	const element = { scrollHeight: 500, scrollTop: 300, clientHeight: 400 };
	const { room } = createRoom({
		element,
		getMessages: async (_kind, _roomId, before) => {
			if (before == null) {
				return { messages: [{ id: 10, sender: sender(1) }] };
			}
			olderCalls += 1;
			return olderCalls === 1
				? { messages: [{ id: 9, sender: sender(1) }] }
				: { messages: [] };
		},
	});
	await room.activateRoom();
	element.scrollTop = 300;

	await room.loadOlder();
	assert.equal(room.messages.value[0].id, 9);
	// 前插后阅读位置不跳变:滚动位置不变(高度未变化),也不回滚到底/顶
	assert.equal(element.scrollTop, 300);
	assert.equal(room.hasMoreMessages.value, true);

	await room.loadOlder();
	assert.equal(room.hasMoreMessages.value, false);

	const callsBefore = olderCalls;
	await room.loadOlder();
	assert.equal(olderCalls, callsBefore);
});