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
		// 键盘可见判定:Android(interactive-widget)键盘弹出会缩小视觉高度;
		// iOS Safari 键盘弹出时高度不变,只把 visualViewport.offsetTop 顶上去,
		// 两个特征都认,否则 iOS 上布局不缩高,输入框被压到键盘下面。
		const keyboardVisible = Boolean(
			visualViewport &&
				(visualViewport.height < layoutHeight * 0.75 ||
					(visualViewport.offsetTop > 0 && visualViewport.height <= layoutHeight)),
		);
		// iOS 平移型:可见高度 = 布局高 - 键盘偏移;Android 缩小型:视觉高度即可见高。
		const viewportHeight = keyboardVisible
			? Math.min(visualViewport.height, layoutHeight - visualViewport.offsetTop)
			: layoutHeight;
		document.documentElement.style.setProperty(
			"--chat-viewport-height",
			`${Math.round(viewportHeight)}px`,
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
