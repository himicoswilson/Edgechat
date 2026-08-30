import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

import { canAccessFile } from "../worker/src/data/uploaded-files.js";

const repositoryRoot = new URL("../", import.meta.url);
const schemaSql = readFileSync(
	new URL("worker/schema.sql", repositoryRoot),
	"utf8",
);
const SQL = await initSqlJs({
	locateFile(file) {
		return fileURLToPath(new URL(`../node_modules/sql.js/dist/${file}`, import.meta.url));
	},
});

const SITE_ICON_KEY = "1/1788049485832-icon.jpg";
const UNRELATED_KEY = "2/private-file.jpg";

function createDb(sqlite, provisions = []) {
	for (const sql of provisions) {
		sqlite.run(sql);
	}
	const adapter = {
		prepare(s) {
			const statement = { sql: s, binds: [] };
			statement.bind = (...values) => {
				statement.binds = values;
				return statement;
			};
			statement.all = async () => {
				const prepared = sqlite.prepare(s);
				const rows = [];
				try {
					prepared.bind(statement.binds);
					while (prepared.step()) {
						rows.push(prepared.getAsObject());
					}
				} finally {
					prepared.free();
				}
				return { results: rows };
			};
			return statement;
		},
	};
	return adapter;
}

test("site_settings 存路径形式图标(/files/xxx)时公开可读", async () => {
	const db = new SQL.Database();
	db.exec(schemaSql);
	db.exec(`INSERT INTO site_settings (setting_key, setting_value)
	         VALUES ('site_icon_url', '/files/${encodeURIComponent(SITE_ICON_KEY)}')
	         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`);
	const adapter = createDb(db);

	assert.equal(
		await canAccessFile(adapter, SITE_ICON_KEY, null),
		true,
	);
});

test("site_settings 存裸 key / 未登录访问无关文件均正确判定", async () => {
	const db = new SQL.Database();
	db.exec(schemaSql);
	db.exec(`INSERT INTO site_settings (setting_key, setting_value)
	         VALUES ('site_icon_url', '${UNRELATED_KEY}')
	         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`);
	const adapter = createDb(db);

	assert.equal(await canAccessFile(adapter, UNRELATED_KEY, null), true);
	assert.equal(await canAccessFile(adapter, "missing-key.jpg", null), false);
});

test("用户头像引用仍保持公开可读(回归)", async () => {
	const db = new SQL.Database();
	db.exec(schemaSql);
	db.exec(`INSERT INTO users (id, username, display_name, password_hash, password_salt, avatar_key)
	         VALUES (1, 'alice', 'Alice', 'hash', 'salt', '9/avatar.jpg')`);
	const adapter = createDb(db);

	assert.equal(await canAccessFile(adapter, "9/avatar.jpg", null), true);
});