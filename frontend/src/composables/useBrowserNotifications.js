import { computed, ref } from "vue";
import { t } from "../i18n.js";
import store from "../store.js";
import api from "../api.js";

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

	function urlBase64ToBytes(value) {
		const base64 = String(value)
			.replace(/-/g, "+")
			.replace(/_/g, "/");
		const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}

	// Web Push 订阅是尽力而为的增强:无 Service Worker / 未配置 VAPID 时静默跳过,
	// 桌面端本地通知仍照常工作(iOS 需以主屏幕图标启动的 PWA 才具备 pushManager)。
	async function enableWebPushSubscription() {
		try {
			if (!browserWindow?.navigator?.serviceWorker) {
				return;
			}
			const { site } = await api.getSite();
			const applicationServerKey = site?.vapidPublicKey || "";
			if (!applicationServerKey) {
				return;
			}
			const registration = await browserWindow.navigator.serviceWorker.ready;
			const existing = await registration.pushManager.getSubscription();
			const subscription =
				existing ||
				(await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToBytes(applicationServerKey),
				}));
			await api.savePushSubscription(subscription);
		} catch {
			// 推送服务不可用时保持本地通知可用,不打扰用户
		}
	}

	async function disableWebPushSubscription() {
		try {
			if (!browserWindow?.navigator?.serviceWorker) {
				return;
			}
			const registration = await browserWindow.navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();
			if (subscription) {
				await subscription.unsubscribe();
				await api.deletePushSubscription(subscription.endpoint);
			}
		} catch {
			// 尽最大努力清理,失败不影响本地状态
		}
	}

	// iOS Safari 仅在安装到主屏幕(PWA)后暴露 Notification API,非安装态给出引导文案
	const iosInstallHint = computed(() => {
		const navigator = browserWindow?.navigator;
		const userAgent = navigator?.userAgent || "";
		if (
			supported.value ||
			!/iphone|ipad|ipod/i.test(userAgent) ||
			!/safari/i.test(userAgent) ||
			/crios|fxios|edgios/i.test(userAgent)
		) {
			return "";
		}
		const standalone =
			navigator?.standalone === true ||
			browserWindow?.matchMedia?.("(display-mode: standalone)").matches;
		return standalone ? "" : t("notifications.iosInstallHint");
	});

	async function toggleNotifications() {
		syncPermission();
		if (notificationToggleDisabled.value) {
			return notificationActionLabel.value;
		}

		if (enabled.value) {
			enabled.value = false;
			persistPreferences();
			await disableWebPushSubscription();
			return notificationActionLabel.value;
		}

		if (permission.value === "default") {
			permission.value = await notificationApi.requestPermission();
		}
		enabled.value = permission.value === "granted";
		persistPreferences();
		if (enabled.value) {
			await enableWebPushSubscription();
		}
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
		notificationInstallHint: iosInstallHint,
		syncNotificationPermission: syncPermission,
		toggleNotifications,
		isRoomMuted,
		toggleRoomMuted,
		notifyRoom,
	};
}
