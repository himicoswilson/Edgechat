import { ref } from "vue";

export function useChatViewport({ activeRoom }) {
	const isMobileViewport = ref(false);
	const mobileView = ref("list");
	let viewportInitialized = false;

	function syncViewportState() {
		const nextIsMobile = window.innerWidth <= 960;
		if (viewportInitialized && nextIsMobile === isMobileViewport.value) {
			return;
		}

		viewportInitialized = true;
		isMobileViewport.value = nextIsMobile;
		mobileView.value = nextIsMobile && !activeRoom.value ? "list" : "chat";
	}

	function syncViewportHeight() {
		const visualViewport = window.visualViewport;
		const layoutHeight = window.innerHeight;
		// 键盘可见判定:Android 键盘缩小视觉高度;iOS 键盘把 offsetTop 顶起来。
		// visualViewport.height > 0 排除键盘动画中间态(某些 iOS 版本动画开始时短暂报 0)。
		const keyboardVisible = Boolean(
			visualViewport &&
				visualViewport.height > 0 &&
				visualViewport.height <= layoutHeight &&
				(visualViewport.height < layoutHeight * 0.75 ||
					visualViewport.offsetTop > 0),
		);
		// 键盘高度双通道:iOS 缩小型 = 布局高 - 视觉高;平移型 = offsetTop。
		// 上限 60% 屏幕高:键盘动画中间态可能短暂报出全高/巨大偏移,
		// 若超出则丢弃本次事件(下一帧会给正确值),避免布局底部抬满屏、页面消失。
		const keyboardHeight = keyboardVisible
			? Math.max(0, Math.max(layoutHeight - visualViewport.height, visualViewport.offsetTop))
			: 0;
		const boundedKeyboardHeight =
			keyboardHeight <= layoutHeight * 0.6 ? keyboardHeight : 0;
		document.documentElement.style.setProperty(
			"--chat-viewport-height",
			`${Math.round(layoutHeight - boundedKeyboardHeight)}px`,
		);
		document.documentElement.style.setProperty(
			"--chat-keyboard-height",
			`${Math.round(boundedKeyboardHeight)}px`,
		);
		document.documentElement.classList.toggle(
			"chat-keyboard-open",
			keyboardVisible && boundedKeyboardHeight > 0,
		);
	}

	function startViewportSync() {
		syncViewportState();
		syncViewportHeight();
		window.addEventListener("resize", syncViewportState);
		window.addEventListener("resize", syncViewportHeight);
		window.visualViewport?.addEventListener("resize", syncViewportHeight);
		window.visualViewport?.addEventListener("scroll", syncViewportHeight);
	}

	function stopViewportSync() {
		window.removeEventListener("resize", syncViewportState);
		window.removeEventListener("resize", syncViewportHeight);
		window.visualViewport?.removeEventListener("resize", syncViewportHeight);
		window.visualViewport?.removeEventListener("scroll", syncViewportHeight);
		document.documentElement.style.removeProperty("--chat-viewport-height");
		document.documentElement.style.removeProperty("--chat-keyboard-height");
		document.documentElement.classList.remove("chat-keyboard-open");
	}

	function openConversationView() {
		if (isMobileViewport.value) {
			mobileView.value = "chat";
		}
	}

	function returnToConversationList() {
		if (isMobileViewport.value) {
			mobileView.value = "list";
		}
	}

	return {
		isMobileViewport,
		mobileView,
		startViewportSync,
		stopViewportSync,
		openConversationView,
		returnToConversationList,
	};
}
