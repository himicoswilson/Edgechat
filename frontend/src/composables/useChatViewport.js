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
		// 键盘可见判定:Android 键盘缩小视觉高度;iOS 键盘把 offsetTop 顶起来,
		// 两个特征都认,否则 iOS 上不缩高,输入框被键盘盖住。
		const keyboardVisible = Boolean(
			visualViewport &&
				(visualViewport.height < layoutHeight * 0.75 ||
					(visualViewport.offsetTop > 0 && visualViewport.height <= layoutHeight)),
		);
		// 键盘高度双通道:iOS 缩小型 = 布局高 - 视觉高;平移型 = offsetTop。
		// 布局用 bottom 锚定(而不是算 height),消除公式残差,
		// 输入栏永远紧贴键盘上沿。
		const keyboardHeight = keyboardVisible
			? Math.max(0, Math.max(layoutHeight - visualViewport.height, visualViewport.offsetTop))
			: 0;
		document.documentElement.style.setProperty(
			"--chat-viewport-height",
			`${Math.round(layoutHeight - keyboardHeight)}px`,
		);
		document.documentElement.style.setProperty(
			"--chat-keyboard-height",
			`${Math.round(keyboardHeight)}px`,
		);
		document.documentElement.classList.toggle("chat-keyboard-open", keyboardVisible);
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
