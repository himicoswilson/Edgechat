import api from "../api.js";
import { createRealtimeSession } from "../realtime-session.js";
import { connectInboxSocket } from "../ws.js";

export function useUnreadInbox({
  activeRoom,
  applyConversationActivity,
  markConversationRead,
	roomApi = api,
	openInboxConnection = connectInboxSocket,
	notifyRoom = () => {},
	onPresence = () => {},
	isPageActive = () =>
		globalThis.document?.visibilityState === "visible" &&
		globalThis.document.hasFocus()
}) {
  function isActiveRoom(room) {
    return (
      activeRoom.value &&
      activeRoom.value.kind === room.kind &&
      Number(activeRoom.value.id) === Number(room.id)
    );
  }

		const inboxSession = createRealtimeSession({
			openConnection(_params, handlers) {
				return openInboxConnection(handlers);
			},
			onMessage(payload) {
        if (payload.type === 'presence') {
          onPresence(payload);
          return;
        }

        if (payload.type !== 'room_message' || !payload.room) {
          return;
        }

			if (isActiveRoom(payload.room) && isPageActive()) {
				markConversationRead(payload.room.kind, payload.room.id);
				void roomApi
					.markRoomRead(payload.room.kind, payload.room.id, payload.messageId)
					.catch(() => {});
			return;
		}

        applyConversationActivity({
          kind: payload.room.kind,
          roomId: payload.room.id,
          lastMessageAt: payload.createdAt,
          unreadCount: payload.unreadCount
        });
		notifyRoom(payload.room, payload);
			},
		});

	function connectUnreadInbox() {
		inboxSession.connect("inbox");
	}

  return {
    connectUnreadInbox,
		disconnectUnreadInbox: inboxSession.disconnect,
  };
}
