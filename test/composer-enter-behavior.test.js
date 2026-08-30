import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import { useChatRoom } from "../frontend/src/composables/useChatRoom.js";

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

function createRoom({ isMobileViewport }) {
	const activeRoom = ref({ id: 1, kind: "public" });
	const room = useChatRoom({
		activeRoom,
		session: ref({ userId: 7 }),
		error: ref(""),
		isMobileViewport,
		roomApi: {
			async getMessages() {
				return { messages: [{ id: 1, sender: sender(1) }] };
			},
			async markRoomRead() {},
		},
		openRoomConnection(params) {
			const handlers = {
				onStatus: params.onStatus,
				onMessage: params.onMessage,
			};
			const socket = createSocket(params, handlers);
			handlers.onStatus({ status: "open", socket });
			return socket;
		},
	});
	return room;
}

function enterEvent(extra = {}) {
	return {
		key: "Enter",
		shiftKey: false,
		prevented: false,
		preventDefault() {
			this.prevented = true;
		},
		...extra,
	};
}

test("桌面端回车发送消息", async () => {
	const room = createRoom({ isMobileViewport: ref(false) });
	await room.activateRoom();
	room.composerText.value = "hello";

	const event = enterEvent();
	room.handleComposerKeydown(event);

	assert.equal(event.prevented, true);
	assert.equal(room.composerText.value, "");
});

test("移动端回车只换行,不发送", async () => {
	const room = createRoom({ isMobileViewport: ref(true) });
	await room.activateRoom();
	room.composerText.value = "hello";

	const event = enterEvent();
	room.handleComposerKeydown(event);

	assert.equal(event.prevented, false);
	assert.equal(room.composerText.value, "hello");
});

test("桌面端 Shift+Enter 不发送,保留换行", async () => {
	const room = createRoom({ isMobileViewport: ref(false) });
	await room.activateRoom();
	room.composerText.value = "hello";

	const event = enterEvent({ shiftKey: true });
	room.handleComposerKeydown(event);

	assert.equal(event.prevented, false);
	assert.equal(room.composerText.value, "hello");
});