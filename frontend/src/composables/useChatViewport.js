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
		// 不做 offsetTop 平移:固定定位布局始终贴视口顶(键盘弹出时底部自然贴键盘上方),
		// 跟随 offsetTop 会把整个布局顶到键盘下方,输入框出现"弹飞"。
		const keyboardVisible = Boolean(
			visualViewport && visualViewport.height < layoutHeight * 0.75,
		);
		document.documentElement.style.setProperty(
			"--chat-viewport-height",
			`${Math.round(keyboardVisible ? visualViewport.height : layoutHeight)}px`,
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
