import assert from "node:assert/strict";
import test from "node:test";
import { parseUtcTime } from "../frontend/src/i18n.js";

test("SQLite CURRENT_TIMESTAMP 的无时区 UTC 字符串按 UTC 解析", () => {
	assert.equal(
		parseUtcTime("2026-08-30 07:17:51").toISOString(),
		"2026-08-30T07:17:51.000Z",
	);
	assert.equal(
		parseUtcTime("2026-08-30T07:17:51").toISOString(),
		"2026-08-30T07:17:51.000Z",
	);
	assert.equal(
		parseUtcTime("2026-08-30 07:17:51.123").toISOString(),
		"2026-08-30T07:17:51.123Z",
	);
});

test("带时区后缀的 ISO 字符串原样解析", () => {
	assert.equal(
		parseUtcTime("2026-08-30T07:17:51.000Z").toISOString(),
		"2026-08-30T07:17:51.000Z",
	);
	assert.equal(
		parseUtcTime("2026-08-30T15:17:51+08:00").toISOString(),
		"2026-08-30T07:17:51.000Z",
	);
});

test("Date 实例与非法值透传", () => {
	const date = new Date("2026-08-30T07:17:51.000Z");
	assert.equal(parseUtcTime(date), date);
	assert.equal(Number.isNaN(parseUtcTime("not a date").getTime()), true);
});