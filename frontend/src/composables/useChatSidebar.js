import { computed, ref } from "vue";
import api from "../api.js";
import { compareLocalized, formatDate, parseUtcTime, t } from "../i18n.js";

function mapChannelItem(channel, subtitle) {
	return {
		key: `${channel.kind}:${channel.id}`,
		id: channel.id,
		kind: channel.kind,
		isGeneral: Boolean(channel.isGeneral),
		title: channel.name,
		subtitle,
		avatarUrl: channel.avatarUrl || "",
		fallback: channel.name ? channel.name.slice(0, 1) : t('publicGroups.fallback'),
		lastMessageAt: channel.lastMessageAt || "",
		unreadCount: Number(channel.unreadCount || 0),
		source: channel,
	};
}

export function useChatSidebar({ applyActiveChannel, selectDm, sidebarApi = api }) {
	const channels = ref([]);
	const dms = ref([]);
	const users = ref([]);
	const sidebarLoading = ref(false);

	const conversationItems = computed(() => {
		const dmItems = dms.value.map((dm) => ({
			key: `dm:${dm.id}`,
			id: dm.id,
			kind: "dm",
			title: dm.otherUser.displayName,
				subtitle: t('chat.contact', { username: dm.otherUser.username }),
			avatarUrl: dm.otherUser.avatarUrl,
			fallback: dm.otherUser.displayName,
			lastMessageAt: dm.lastMessageAt || "",
			unreadCount: Number(dm.unreadCount || 0),
			source: dm,
		}));

		const channelItems = channels.value
			.filter((channel) => channel.isMember)
			.map((channel) =>
				mapChannelItem(
					channel,
					channel.isGeneral
							? t('chat.generalGroup')
							: t('chat.owner', {
								name: channel.ownerDisplayName || t('common.unknown'),
							}),
				),
			);

		return [...dmItems, ...channelItems].sort((left, right) => {
				if (left.isGeneral !== right.isGeneral) {
					return left.isGeneral ? -1 : 1;
				}

				const leftTime = left.lastMessageAt
				? parseUtcTime(left.lastMessageAt).getTime()
				: 0;
			const rightTime = right.lastMessageAt
				? parseUtcTime(right.lastMessageAt).getTime()
				: 0;
			if (leftTime !== rightTime) {
				return rightTime - leftTime;
			}
				return compareLocalized(left.title, right.title);
		});
	});

	const publicGroupItems = computed(() =>
		channels.value
			.filter((channel) => channel.kind === "public" && !channel.isMember)
			.map((channel) =>
					mapChannelItem(channel, t('chat.memberCount', { count: Number(channel.memberCount || 0) })),
			)
				.sort((left, right) => compareLocalized(left.title, right.title)),
	);

	function formatListTime(value) {
		if (!value) {
			return "";
		}
			return formatDate(value, { month: 'short', day: 'numeric' });
	}

	function findConversationSource(kind, roomId) {
		const list = kind === "dm" ? dms.value : channels.value;
		return list.find(
			(item) => item.kind === kind && Number(item.id) === Number(roomId),
		);
	}

	function markConversationRead(kind, roomId) {
		const source = findConversationSource(kind, roomId);
		if (source) {
			source.unreadCount = 0;
		}
	}

	function applyConversationActivity({
		kind,
		roomId,
		lastMessageAt,
		unreadCount,
	}) {
		const source = findConversationSource(kind, roomId);
		if (!source) {
			return;
		}

		if (lastMessageAt) {
			const currentTime = source.lastMessageAt
				? parseUtcTime(source.lastMessageAt).getTime()
				: 0;
			const nextTime = parseUtcTime(lastMessageAt).getTime();
			if (!currentTime || nextTime >= currentTime) {
				source.lastMessageAt = lastMessageAt;
			}
		}

		if (unreadCount !== undefined) {
			source.unreadCount = Math.max(0, Number(unreadCount || 0));
		}
	}

	async function refreshSidebar() {
		sidebarLoading.value = true;
		try {
			const payload = await sidebarApi.bootstrap();
			channels.value = payload.channels || [];
			dms.value = payload.dms || [];
			users.value = payload.users || [];
		} finally {
			sidebarLoading.value = false;
		}
	}

	function selectChannel(channel) {
		applyActiveChannel(channel);
	}

	async function joinPublicChannel(channel) {
		await sidebarApi.joinChannel(channel.id);
		const joinedChannel = channels.value.find(
			(item) => item.kind === channel.kind && Number(item.id) === Number(channel.id),
		);
		joinedChannel.isMember = true;
		joinedChannel.myRole = "member";
		joinedChannel.memberCount = Number(joinedChannel.memberCount || 0) + 1;
		return joinedChannel;
	}

	async function openConversation(item) {
		if (item.kind === "dm") {
			selectDm(item.source);
			markConversationRead(item.kind, item.id);
			void sidebarApi.markRoomRead(item.kind, item.id).catch(() => {});
			return;
		}

		await selectChannel(item.source);
		markConversationRead(item.kind, item.id);
		void sidebarApi.markRoomRead(item.kind, item.id).catch(() => {});
	}

	return {
		channels,
		dms,
		users,
		sidebarLoading,
		conversationItems,
		publicGroupItems,
		formatListTime,
		markConversationRead,
		applyConversationActivity,
		refreshSidebar,
		openConversation,
		joinPublicChannel,
	};
}
