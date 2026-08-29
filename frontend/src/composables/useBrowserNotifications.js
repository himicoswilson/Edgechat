import { computed, ref } from "vue";
import { t } from "../i18n.js";
import store from "../store.js";

const STORAGE_KEY_PREFIX = "edgechat:browser-notifications";

export function browserNotificationRoomKey(room) {
	return room ? `${room.kind}:${Number(room.id)}` : "";
}

function loadPreferences(storage, storageKey) {
	const raw = storage?.getItem(storageKey);
	if (!raw) {
		return { enabled: false, mutedRooms: [] };
	}

	try {
		const value = JSON.parse(raw);
		return {
			enabled: value.enabled === true,
			mutedRooms: Array.isArray(value.mutedRooms) ? value.mutedRooms : [],
		};
	} catch {
		return { enabled: false, mutedRooms: [] };
	}
}

export function useBrowserNotifications(options = {}) {
	const browserWindow =
		options.browserWindow === undefined ? globalThis.window : options.browserWindow;
	const notificationApi =
		options.notificationApi === undefined
			? browserWindow?.Notification
			: options.notificationApi;
	const storage =
		options.storage === undefined ? browserWindow?.localStorage : options.storage;
	const storageKey = `${STORAGE_KEY_PREFIX}:${options.userId || "guest"}`;
	const savedPreferences = loadPreferences(storage, storageKey);
	const supported = computed(() => typeof notificationApi === "function");
	const permission = ref(
		supported.value ? notificationApi.permission : "unsupported",
	);
	const enabled = ref(
		savedPreferences.enabled && permission.value === "granted",
	);
	const mutedRoomKeys = ref(new Set(savedPreferences.mutedRooms));

	function persistPreferences() {
		storage?.setItem(
			storageKey,
			JSON.stringify({
				enabled: enabled.value,
				mutedRooms: [...mutedRoomKeys.value],
			}),
		);
	}

	function syncPermission() {
		permission.value = supported.value
			? notificationApi.permission
			: "unsupported";
		if (permission.value !== "granted" && enabled.value) {
			enabled.value = false;
			persistPreferences();
		}
	}

		const notificationStateLabel = computed(() => {
			if (!supported.value) return t('notifications.unavailable');
			if (permission.value === "denied") return t('notifications.permissionDenied');
			return enabled.value ? t('notifications.on') : t('notifications.off');
		});

	const notificationActionLabel = computed(() => {
			if (!supported.value) return t('notifications.unsupported');
			if (permission.value === "denied") return t('notifications.blocked');
			return enabled.value ? t('notifications.disable') : t('notifications.enable');
	});

	const notificationToggleDisabled = computed(
		() => !supported.value || permission.value === "denied",
	);

	async function toggleNotifications() {
		syncPermission();
		if (notificationToggleDisabled.value) {
			return notificationActionLabel.value;
		}

		if (enabled.value) {
			enabled.value = false;
			persistPreferences();
			return notificationActionLabel.value;
		}

		if (permission.value === "default") {
			permission.value = await notificationApi.requestPermission();
		}
		enabled.value = permission.value === "granted";
		persistPreferences();
		return notificationActionLabel.value;
	}

	function isRoomMuted(room) {
		return mutedRoomKeys.value.has(browserNotificationRoomKey(room));
	}

	function toggleRoomMuted(room) {
		const key = browserNotificationRoomKey(room);
		if (!key) return false;

		const nextMutedRooms = new Set(mutedRoomKeys.value);
		if (nextMutedRooms.has(key)) {
			nextMutedRooms.delete(key);
		} else {
			nextMutedRooms.add(key);
		}
		mutedRoomKeys.value = nextMutedRooms;
		persistPreferences();
		return nextMutedRooms.has(key);
	}

	function notifyRoom(room) {
		syncPermission();
		if (!enabled.value || isRoomMuted(room)) {
			return false;
		}

		const notification = new notificationApi(room.name || store.site.siteName, {
				body: room.kind === "dm" ? t('notifications.directMessage') : t('notifications.groupMessage'),
			tag: `edgechat:${browserNotificationRoomKey(room)}`,
			renotify: true,
		});
		notification.onclick = () => {
			browserWindow?.focus();
			options.onOpenRoom?.(room);
			notification.close();
		};
		return true;
	}

	return {
		notificationsEnabled: enabled,
		notificationPermission: permission,
		notificationStateLabel,
		notificationActionLabel,
		notificationToggleDisabled,
		syncNotificationPermission: syncPermission,
		toggleNotifications,
		isRoomMuted,
		toggleRoomMuted,
		notifyRoom,
	};
}
