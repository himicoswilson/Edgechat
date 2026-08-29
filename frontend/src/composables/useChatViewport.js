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
		// 仅当键盘明显可见(视觉视口远矮于布局视口)时跟随视觉视口高度;
		// 地址栏收展等场景不再改动布局高度,避免整页反向位移。
		const keyboardVisible = Boolean(
			visualViewport && visualViewport.height < layoutHeight * 0.75,
		);
		const viewportHeight = keyboardVisible
			? visualViewport.height
			: layoutHeight;
		document.documentElement.style.setProperty(
			"--chat-viewport-height",
			`${Math.round(viewportHeight)}px`,
		);
		document.documentElement.style.setProperty(
			"--chat-viewport-offset-top",
			`${Math.round(keyboardVisible ? visualViewport.offsetTop : 0)}px`,
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
		document.documentElement.style.removeProperty("--chat-viewport-offset-top");
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
