import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatPage = readFileSync(
	new URL("../frontend/src/pages/ChatPage.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const avatarComponent = readFileSync(
	new URL("../frontend/src/components/ui/Avatar.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");

function getStyleRule(selector) {
	const marker = `${selector} {`;
	const start = chatPage.indexOf(marker);
	assert.notEqual(start, -1, `聊天页缺少样式规则：${selector}`);
	const end = chatPage.indexOf("}", start + marker.length);
	assert.notEqual(end, -1, `聊天页样式规则未闭合：${selector}`);
	return chatPage.slice(start, end + 1);
}

test("短消息时间戳与已读回执位于气泡底部元信息行，不与正文重叠", () => {
	assert.match(
		chatPage,
		/:class="\{ 'message-bubble--with-attachment': msg\.attachment \}"/,
	);

	const bubble = getStyleRule(".message-bubble");
	assert.match(bubble, /padding:\s*6px 10px 7px;/);

	const attachmentBubble = getStyleRule(".message-bubble--with-attachment");
	assert.match(attachmentBubble, /padding-bottom:\s*4px;/);

	const meta = getStyleRule(".message-meta");
	assert.match(meta, /justify-content:\s*flex-end;/);
	assert.match(meta, /gap:\s*6px;/);

	const time = getStyleRule(".message-time");
	assert.doesNotMatch(time, /position:\s*absolute;/);
	assert.match(time, /white-space:\s*nowrap;/);
});

test("非本人消息在气泡前显示圆角方形发送者头像", () => {
	assert.match(chatPage, /<UiAvatar\s+v-if="!isOwnMessage\(msg\)"/);
	assert.match(chatPage, /:src="msg\.sender\.avatarUrl"/);
	assert.match(chatPage, /:fallback="msg\.sender\.displayName"/);

	const row = getStyleRule(".message-row");
	assert.match(row, /align-items:\s*flex-end;/);
	assert.match(row, /gap:\s*8px;/);

	const avatar = getStyleRule(".message-avatar");
	assert.match(avatar, /width:\s*34px;/);
	assert.match(avatar, /height:\s*34px;/);
	assert.match(avatar, /border-radius:\s*8px;/);
});

test("远程头像加载失败时显示姓名缩写", () => {
	assert.match(avatarComponent, /const showImage = computed/);
	assert.match(avatarComponent, /failedSrc\.value !== props\.src/);
	assert.match(avatarComponent, /@error="handleImageError"/);
});
