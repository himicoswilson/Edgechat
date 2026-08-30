import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// chat-page-wiring.test.js
// ChatPage 从 useChatRoom 解构出的名字若漏写,引用处(模板 / 滚动处理器)
// 不会产生编译错误,只在运行时炸或静默失效。这里做一次静态握手检查。
const chatPage = readFileSync(
	new URL("../frontend/src/pages/ChatPage.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");

const destructureMatch = chatPage.match(/const \{(.*?)\} = useChatRoom\(\{/s);
assert.ok(destructureMatch, "useChatRoom destructure block not found");
const destructured = new Set(destructureMatch[1].split(",").map((name) => name.trim()));

// 页面直接消费 useChatRoom 的引用点:滚动自动加载、模板加载更早按钮
for (const [label, needle] of [
	["handleMessagesScroll", /\bhasMoreMessages\b.*\.value/],
	["template load-more button", /v-if="messages\.length && hasMoreMessages"/],
]) {
	assert.ok(
		needle.test(chatPage),
		`ChatPage ${label} reference not found, update this test`,
	);
}

assert.ok(
	destructured.has("hasMoreMessages"),
	"hasMoreMessages must be destructured from useChatRoom in ChatPage.vue",
);