import { computed } from "vue";
import { t } from "../i18n.js";

export function useActiveRoom({ activeRoom }) {
	const activeRoomKey = computed(() =>
		activeRoom.value?.kind && activeRoom.value?.id
			? `${activeRoom.value.kind}:${activeRoom.value.id}`
			: "",
	);

	const canManageActiveRoom = computed(
		() =>
			activeRoom.value &&
			activeRoom.value.kind !== "dm" &&
			activeRoom.value.canManage,
	);

	const hasManageLayer = computed(() =>
		Boolean(activeRoom.value && activeRoom.value.kind !== "dm"),
	);

	const activeRoomSubtitle = computed(() => {
		if (!activeRoom.value) {
				return t('chat.selectConversation');
		}

			if (activeRoom.value.kind === "dm") {
					return t('chat.directMessageWith', {
						username: activeRoom.value.otherUser?.username || activeRoom.value.name,
					});
			}

			if (activeRoom.value.isGeneral) {
				const memberCount = activeRoom.value.memberCount
						? ` · ${t('chat.memberCount', { count: activeRoom.value.memberCount })}`
					: "";
					return `${t('chat.generalGroup')}${memberCount}`;
			}

		const visibility =
				activeRoom.value.kind === "private" ? t('chat.privateGroup') : t('chat.publicGroup');
		const owner = activeRoom.value.ownerDisplayName
				? ` · ${t('chat.owner', { name: activeRoom.value.ownerDisplayName })}`
			: "";
		const memberCount = activeRoom.value.memberCount
				? ` · ${t('chat.memberCount', { count: activeRoom.value.memberCount })}`
			: "";
		return `${visibility}${owner}${memberCount}`;
	});

	function applyActiveChannel(channel) {
			activeRoom.value = {
				id: channel.id,
				kind: channel.kind,
				name: channel.name,
				isGeneral: Boolean(channel.isGeneral),
			description: channel.description,
			avatarUrl: channel.avatarUrl || "",
			avatarKey: channel.avatarKey || "",
			ownerDisplayName: channel.ownerDisplayName || "",
			muteEveryone: Boolean(channel.muteEveryone),
			canManage: Boolean(channel.canManage),
			myRole: channel.myRole || "",
			memberCount: Number(channel.memberCount || 0),
		};

	}

	function selectChannel(channel) {
		applyActiveChannel(channel);
	}

	function selectDm(dm) {
		activeRoom.value = {
			id: dm.id,
			kind: "dm",
			name: dm.name,
			otherUser: dm.otherUser,
		};
	}

	function roomLabel(room) {
		if (!room) {
				return t('chat.noConversationSelected');
		}

		if (room.kind === "dm") {
			return room.otherUser?.displayName || room.name;
		}

		return room.name;
	}

	return {
		activeRoomKey,
		canManageActiveRoom,
		hasManageLayer,
		activeRoomSubtitle,
		applyActiveChannel,
		selectChannel,
		selectDm,
			roomLabel,
	};
}
