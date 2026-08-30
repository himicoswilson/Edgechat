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
	const apiClient = options.api === undefined ? api : options.api;
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

	// Web Push 订阅是否已在服务端登记;issue: unconfigured(服务器未配 VAPID)/failed(订阅失败)
	const webPushReady = ref(false);
	const webPushIssue = ref("");
	const webPushFailureDetail = ref("");

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

	// Web Push 订阅尽力而为:无 Service Worker 或未配置 VAPID 时本地通知仍可用,
	// 但如实上报结果,避免 iOS 关闭应用后"已开启却收不到提醒"的假象。
	async function enableWebPushSubscription() {
		webPushIssue.value = "";
		if (!browserWindow?.navigator?.serviceWorker) {
			return { ready: false, issue: "" };
		}
		try {
			const { site } = await apiClient.getSite();
			const applicationServerKey = site?.vapidPublicKey || "";
			if (!applicationServerKey) {
				webPushIssue.value = "unconfigured";
				return { ready: false, issue: "unconfigured" };
			}
			const registration = await browserWindow.navigator.serviceWorker.ready;
			const existing = await registration.pushManager.getSubscription();
			const subscription =
				existing ||
				(await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToBytes(applicationServerKey),
				}));
			// 已存在订阅也重复上报一次(幂等 upsert),兜底服务端记录丢失
			await apiClient.savePushSubscription(subscription);
			webPushReady.value = true;
			return { ready: true, issue: "" };
		} catch (error) {
			// 订阅不可用时保持本地通知可用,但如实标记推送未就绪,下次启动自愈
			console.warn("[edgechat] web push subscribe failed:", error);
			webPushFailureDetail.value =
				error instanceof Error ? error.message : String(error);
			webPushIssue.value = "failed";
			return { ready: false, issue: "failed" };
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
				await apiClient.deletePushSubscription(subscription.endpoint);
			}
		} catch {
			// 尽最大努力清理,失败不影响本地状态
		}
	}

	// 启动自愈:上次已开启但订阅缺失/失败(如 iOS 首次授权后 subscribe 抛错)时,
	// 下次启动补齐订阅;推送服务轮换订阅后也由页面重新上报。
	async function restoreWebPushSubscription() {
		syncPermission();
		if (!enabled.value || permission.value !== "granted") {
			return;
		}
		await enableWebPushSubscription();
	}

	// iOS Safari 仅在安装到主屏幕(PWA)后暴露 Notification API,非安装态给出引导文案;
	// 推送未就绪(unconfigured/failed)时如实提示,避免"已开启却收不到"的假象。
	const notificationInstallHint = computed(() => {
		const navigator = browserWindow?.navigator;
		const userAgent = navigator?.userAgent || "";
		if (
			!supported.value &&
			/iphone|ipad|ipod/i.test(userAgent) &&
			/safari/i.test(userAgent) &&
			!/crios|fxios|edgios/i.test(userAgent)
		) {
			const standalone =
				navigator?.standalone === true ||
				browserWindow?.matchMedia?.("(display-mode: standalone)").matches;
			if (!standalone) {
				return t("notifications.iosInstallHint");
			}
		}
		if (!supported.value || !enabled.value || webPushReady.value) {
			return "";
		}
		if (webPushIssue.value === "unconfigured") {
			return t("notifications.pushUnavailable");
		}
		if (webPushIssue.value === "failed") {
			return t("notifications.pushSubscribeFailed", {
				detail: webPushFailureDetail.value,
			});
		}
		return "";
	});

	async function toggleNotifications() {
		syncPermission();
		if (notificationToggleDisabled.value) {
			return notificationActionLabel.value;
		}

		if (enabled.value) {
			enabled.value = false;
			// 关闭时一并复位推送状态,避免下次开启读到陈旧标志
			webPushReady.value = false;
			webPushIssue.value = "";
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
			webPushReady.value = false;
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

	function notifyRoom(room, details = {}) {
		syncPermission();
		if (!enabled.value || isRoomMuted(room)) {
			return false;
		}

		// 私信标题用对方昵称,群聊标题用群名;正文展示真实消息内容,内容为空时回落通用文案
		const isDm = room.kind === "dm";
		const title = isDm
			? details.senderName || room.name || store.site.siteName
			: room.name || store.site.siteName;
		const content = String(details.content || "").trim();
		const body = content
			? content
			: isDm
				? t("notifications.directMessage")
				: t("notifications.groupMessage");

		const notification = new notificationApi(title, {
			body,
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

	// 页面加载时自愈上次失败的订阅(见 restoreWebPushSubscription)
	if (enabled.value && browserWindow?.navigator?.serviceWorker) {
		void restoreWebPushSubscription();
	}

	return {
		notificationsEnabled: enabled,
		notificationPermission: permission,
		notificationStateLabel,
		notificationActionLabel,
		notificationToggleDisabled,
		notificationInstallHint,
		syncNotificationPermission: syncPermission,
		toggleNotifications,
		restoreWebPushSubscription,
		isRoomMuted,
		toggleRoomMuted,
		notifyRoom,
	};
}

// 推送服务轮换订阅(pushsubscriptionchange)时 SW 无鉴权令牌,由页面代为保存到服务器
const SW_SUBSCRIPTION_EVENT = "push-subscription-changed";
if (typeof navigator !== "undefined" && navigator.serviceWorker) {
	navigator.serviceWorker.addEventListener?.("message", (event) => {
		if (event.data?.type !== SW_SUBSCRIPTION_EVENT || !event.data?.subscription) {
			return;
		}
		api.savePushSubscription(event.data.subscription).catch(() => {});
	});
}
