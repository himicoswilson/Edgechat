import { nextTick, ref, watch } from "vue";
import api from "../api.js";
import { dispatchAuthInvalid } from "../auth-storage.js";
import { createRealtimeSession } from "../realtime-session.js";
import { connectRoomSocket } from "../ws.js";
import { t } from "../i18n.js";
import { localizeErrorMessage } from "../localized-error.js";

const WS_CLOSE_UNAUTHORIZED = 4401;
const WS_CLOSE_FORBIDDEN = 4403;
const WS_REASON_UNAUTHORIZED = "session_invalid";
const WS_REASON_FORBIDDEN = "room_forbidden";

export function useChatRoom({
	activeRoom,
	session,
	error,
	onRoomActivity = () => {},
	onRoomAccessRevoked = () => {},
	roomApi = api,
	openRoomConnection = connectRoomSocket,
}) {
	const messages = ref([]);
	const loading = ref(false);
	const wsStatus = ref("closed");
	const composerText = ref("");
	const pendingAttachment = ref(null);
	const sending = ref(false);
	const hasMoreMessages = ref(true);
	const messagesEl = ref(null);
	const fileInputEl = ref(null);
	let messageLoadGeneration = 0;

	// 距底多远以内视为"正在跟看最新消息",新消息到达时跟随滚底
	const STICKY_SCROLL_THRESHOLD = 120;

	function isNearBottom() {
		const element = messagesEl.value;
		if (!element) {
			return true;
		}
		return element.scrollHeight - element.scrollTop - element.clientHeight < STICKY_SCROLL_THRESHOLD;
	}

	function scrollToBottomIfSticky(force = false) {
		const element = messagesEl.value;
		if (!element) {
			return;
		}
		if (!force && !isNearBottom()) {
			return;
		}
		requestAnimationFrame(() => {
			element.scrollTop = element.scrollHeight;
		});
	}

	function roomKey(room = activeRoom.value) {
		return room?.kind && room?.id ? `${room.kind}:${room.id}` : "";
	}

		function isOwnMessage(message) {
			return (
				message.sender.kind !== "external" &&
				Number(message.sender.id) === Number(session.value?.userId)
			);
		}

	function scrollToBottom() {
		const element = messagesEl.value;
		if (element) {
			requestAnimationFrame(() => {
				element.scrollTop = element.scrollHeight;
			});
		}
	}

	function applyActiveRoomActivity(message) {
		if (!activeRoom.value || !message) {
			return;
		}

		onRoomActivity({ room: activeRoom.value, message });

		if (!isOwnMessage(message)) {
				void roomApi
				.markRoomRead(activeRoom.value.kind, activeRoom.value.id, message.id)
				.catch(() => {});
		}
	}

	function handleRoomAccessRevoked() {
		const room = activeRoom.value;
		if (!room) {
			return;
		}

		disconnectSocket();
		messages.value = [];
		onRoomAccessRevoked(room);
	}

	function handleSocketClose(event) {
		const code = Number(event?.code || 0);
		const reason = String(event?.reason || "");
		if (code === WS_CLOSE_UNAUTHORIZED || reason === WS_REASON_UNAUTHORIZED) {
				dispatchAuthInvalid(t('chat.sessionInvalid'));
			return;
		}
		if (code === WS_CLOSE_FORBIDDEN || reason === WS_REASON_FORBIDDEN) {
			handleRoomAccessRevoked();
		}
	}

	const roomSession = createRealtimeSession({
		openConnection(params, handlers) {
			return openRoomConnection({
				kind: params.kind,
				roomId: params.roomId,
				...handlers,
			});
		},
		onStatus(event) {
			wsStatus.value = event.status === "reconnecting" ? "connecting" : event.status;
		},
		onClose: handleSocketClose,
		onMessage(payload, connection) {
			if (connection?.key !== roomKey()) {
				return;
			}
			if (payload.type === "message" && payload.message) {
				if (messages.value.some((item) => item.id === payload.message.id)) {
					return;
				}
				messages.value = [...messages.value, payload.message];
				// 自己发送的消息强制跟随;他人的消息仅在贴近底部时跟随,读历史不被拽走
				scrollToBottomIfSticky(isOwnMessage(payload.message));
				applyActiveRoomActivity(payload.message);
			}
			if (payload.type === "message_deleted") {
				const messageId = Number(payload.messageId);
				messages.value = messages.value.filter(
					(message) => Number(message.id) !== messageId,
				);
			}
			if (payload.type === "error") {
					error.value = localizeErrorMessage(payload.error);
			}
		},
	});

	async function loadMessages(before = null, append = false) {
		const room = activeRoom.value;
		const key = roomKey(room);
		if (!key) {
			return false;
		}

		const scrollElement = messagesEl.value;
		const previousScrollTop = scrollElement?.scrollTop ?? 0;
		const previousHeight = scrollElement?.scrollHeight ?? 0;
		const generation = ++messageLoadGeneration;
		loading.value = true;
		error.value = "";
		try {
			const payload = await roomApi.getMessages(room.kind, room.id, before);
			if (generation !== messageLoadGeneration || roomKey() !== key) {
				return false;
			}
			if (append && payload.messages.length === 0) {
				hasMoreMessages.value = false;
			}
			messages.value = append
				? [...payload.messages, ...messages.value]
				: payload.messages;
			await nextTick();
			if (append) {
				// 前插后保持滚动锚点:滚动位置随新增高度下移,阅读位置不跳变
				const element = messagesEl.value;
				if (element) {
					element.scrollTop =
						previousScrollTop + (element.scrollHeight - previousHeight);
				}
			} else {
				scrollToBottom();
			}
			return true;
		} catch (currentError) {
			if (generation === messageLoadGeneration && roomKey() === key) {
				error.value = currentError.message;
			}
			return false;
		} finally {
			if (generation === messageLoadGeneration) {
				loading.value = false;
			}
		}
	}

	async function activateRoom() {
		messageLoadGeneration += 1;
		messages.value = [];
		loading.value = false;
		hasMoreMessages.value = true;
		connectSocket();
		return loadMessages();
	}

	function deactivateRoom() {
		messageLoadGeneration += 1;
		messages.value = [];
		loading.value = false;
		disconnectSocket();
	}

	function connectSocket() {
		if (!activeRoom.value) {
			return;
		}
		const key = roomKey();
		roomSession.connect(key, {
			kind: activeRoom.value.kind,
			roomId: activeRoom.value.id,
		});
	}

	function disconnectSocket() {
		roomSession.disconnect();
	}

	async function sendMessage() {
		const key = activeRoom.value
			? `${activeRoom.value.kind}:${activeRoom.value.id}`
			: "";
		if (!roomSession.isOpenFor(key)) {
				error.value = t('chat.realtimeNotReady');
			return;
		}
		if (!composerText.value.trim() && !pendingAttachment.value) {
			return;
		}

		sending.value = true;
		error.value = "";
		try {
			roomSession.send(
				JSON.stringify({
					type: "send",
					content: composerText.value,
					attachment: pendingAttachment.value,
				}),
				key,
			);
			composerText.value = "";
			pendingAttachment.value = null;
		} catch (currentError) {
			error.value = currentError.message;
		} finally {
			sending.value = false;
		}
	}

	function deleteMessage(messageId) {
		const key = activeRoom.value
			? `${activeRoom.value.kind}:${activeRoom.value.id}`
			: "";
		if (!roomSession.isOpenFor(key)) {
				error.value = t('chat.realtimeNotReady');
			return false;
		}

		error.value = "";
		return roomSession.send(
			JSON.stringify({ type: "delete_message", messageId: Number(messageId) }),
			key,
		);
	}

	function handleComposerKeydown(event) {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function openFilePicker() {
		fileInputEl.value?.click();
	}

	async function uploadAttachment(event) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		try {
			const payload = await roomApi.uploadFile(file);
			pendingAttachment.value = payload.file;
		} catch (currentError) {
			error.value = currentError.message;
		} finally {
			event.target.value = "";
		}
	}

	function clearAttachment() {
		pendingAttachment.value = null;
	}

	async function loadOlder() {
		if (loading.value || !hasMoreMessages.value) {
			return;
		}
		const firstMessage = messages.value[0];
		if (firstMessage) {
			await loadMessages(firstMessage.id, true);
		}
	}

	watch(
		messages,
		(current, previous) => {
			const receivedNewLastMessage =
				current.length > previous.length &&
				current.at(-1)?.id !== previous.at(-1)?.id;
			if (receivedNewLastMessage) {
				scrollToBottomIfSticky();
			}
		},
		{ flush: "post" },
	);

	return {
		messages,
		loading,
		wsStatus,
		composerText,
		pendingAttachment,
		sending,
		hasMoreMessages,
		messagesEl,
		fileInputEl,
		isOwnMessage,
		loadMessages,
		activateRoom,
		deactivateRoom,
		connectSocket,
		disconnectSocket,
		sendMessage,
		deleteMessage,
		handleComposerKeydown,
		openFilePicker,
		uploadAttachment,
		clearAttachment,
		loadOlder,
	};
}
