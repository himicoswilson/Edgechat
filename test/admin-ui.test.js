import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const routerSource = read('../frontend/src/router.js');
const apiSource = read('../frontend/src/api.js');
const adminApiSource = read('../worker/src/api/admin.js');
const mainSource = read('../frontend/src/main.js');
const navigationSource = read('../frontend/src/admin/navigation.js');
const sidebarSource = read('../frontend/src/components/admin/AdminSidebar.vue');
const dashboardSource = read('../frontend/src/pages/AdminDashboardPage.vue');
const usersSource = read('../frontend/src/pages/AdminUsersPage.vue');
const storageSource = read('../frontend/src/pages/AdminStoragePage.vue');
const invitesSource = read('../frontend/src/pages/AdminInvitesPage.vue');
const userCreatorSource = read('../frontend/src/components/admin/AdminUserCreator.vue');
const inviteManagerSource = read('../frontend/src/components/admin/RegistrationInviteManager.vue');
const siteSource = read('../frontend/src/pages/AdminSitePage.vue');
const siteAppearanceSource = read('../frontend/src/components/admin/AdminSiteAppearance.vue');
const telegramSource = read('../frontend/src/pages/AdminTelegramPage.vue');
const adminStyles = read('../frontend/src/styles/admin.css');
const adminTokens = read('../frontend/src/styles/admin/tokens.css');
const adminLayout = read('../frontend/src/styles/admin/layout.css');
const adminSidebarStyles = read('../frontend/src/styles/admin/sidebar.css');
const legacyTokens = read('../frontend/src/styles/tokens.css');
const dashboardStyles = read('../frontend/src/styles/admin/dashboard.css');
const invitesPageStyles = read('../frontend/src/styles/admin/invites-page.css');
const userCreatorStyles = read('../frontend/src/styles/admin/user-creator.css');
const inviteManagerStyles = read('../frontend/src/styles/admin/invite-manager.css');

test('后台默认进入仪表盘并新增受保护的注册邀请页', () => {
  assert.match(routerSource, /import AdminDashboardPage/);
  assert.match(routerSource, /import AdminInvitesPage/);
  assert.match(routerSource, /redirect: \{ name: 'admin-dashboard' \}/);
  assert.match(routerSource, /path: 'dashboard'/);
  assert.match(routerSource, /path: 'invites'/);
  assert.match(routerSource, /adminTitleKey: 'admin\.nav\.invites'/);
  assert.match(routerSource, /meta: \{ admin: true/);
});

test('侧栏包含存储统计并移除消息查看入口', () => {
  assert.match(sidebarSource, /t\('admin\.sidebar\.brand'\)/);
  for (const id of ['dashboard', 'users', 'storage', 'invites', 'telegram', 'site']) {
    assert.match(navigationSource, new RegExp(`id: '${id}'`));
  }
  assert.match(navigationSource, /labelKey: 'admin\.nav\.createUser'/);
  assert.match(navigationSource, /labelKey: 'admin\.nav\.registrationLinks'/);
  assert.match(navigationSource, /labelKey: 'admin\.nav\.siteAppearance'/);
  assert.match(navigationSource, /labelKey: 'admin\.nav\.versionUpdate'/);
  assert.doesNotMatch(navigationSource, /信息查看|\/admin\/messages/);
  assert.match(sidebarSource, /v-if="!item\.children"/);
  assert.match(sidebarSource, /:aria-expanded="isGroupOpen\(item\)"/);
  assert.match(sidebarSource, /v-show="isGroupOpen\(item\)"/);
});

test('存储统计由按钮手动刷新且四个统计列均可排序', () => {
  assert.match(routerSource, /import AdminStoragePage/);
  assert.match(routerSource, /path: 'storage'/);
  assert.match(apiSource, /adminStorageScan/);
  assert.match(adminApiSource, /\/api\/admin\/storage\/scan/);
  assert.match(adminApiSource, /FILES\.list/);
  assert.match(adminApiSource, /没有绑定 R2，无法统计存储空间/);
  assert.match(storageSource, /@click="refreshStorage"/);
  assert.doesNotMatch(storageSource, /onMounted\(refreshStorage\)/);
  assert.doesNotMatch(storageSource, /尚未统计|10 GB|免费存储/);
  for (const key of ['objectCount', 'bytes', 'share', 'latestUploadedAt']) {
    assert.match(storageSource, new RegExp(`key: '${key}'`));
  }
  assert.match(storageSource, /@click="changeSort\(column\.key\)"/);
});

test('用户管理只维护用户列表，创建用户和注册链接集中在注册邀请页', () => {
  assert.match(usersSource, /t\('users\.list'\)/);
  assert.doesNotMatch(usersSource, /AdminUserCreator|RegistrationInviteManager|创建用户|注册链接/);
  assert.match(invitesSource, /import AdminUserCreator/);
  assert.match(invitesSource, /import RegistrationInviteManager/);
  assert.match(invitesSource, /id="create-user"/);
  assert.match(invitesSource, /id="registration-links"/);
});

test('用户管理支持按天、小时、分钟或永久封禁并显示截止时间', () => {
  assert.match(usersSource, /BAN_UNIT_MINUTES/);
  assert.match(usersSource, /banDurationMinutes/);
  assert.match(usersSource, /value="days"/);
  assert.match(usersSource, /value="hours"/);
  assert.match(usersSource, /value="minutes"/);
  assert.match(usersSource, /value="permanent"/);
  assert.match(usersSource, /user\.disabledUntil/);
  assert.match(adminApiSource, /disabled_until = \?/);
  assert.match(adminApiSource, /session_version = session_version \+ 1/);
});

test('注册邀请页限制内容宽度并用独立卡片组织创建工具与链接列表', () => {
  assert.match(invitesSource, /admin-invites-page/);
  assert.match(invitesPageStyles, /max-width: 1120px/);
  assert.match(userCreatorSource, /admin-user-creator__identity-grid/);
  assert.match(userCreatorStyles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(inviteManagerSource, /invite-create-panel/);
  assert.match(inviteManagerSource, /t\('invites\.createdCount', \{ count: invites\.length \}\)/);
  assert.match(inviteManagerSource, /admin-invite-card__status/);
  assert.match(inviteManagerStyles, /border: 1px solid var\(--admin-border-strong\)/);
  assert.doesNotMatch(inviteManagerStyles, /max-height: 320px|border-block-start: 1px solid var\(--admin-border\);\s*border-radius: 0/);
});

test('网站设置只读取站点配置且不重复展示统计信息', () => {
  assert.match(siteAppearanceSource, /api\.adminSiteSettings\(\)/);
  assert.doesNotMatch(siteSource, /adminOverview|admin-metric|站内用户|公开群组|私信会话/);
  assert.match(siteSource, /id="site-appearance"/);
  assert.match(siteSource, /id="version-update"/);
});

test('仪表盘复用现有概况接口并只展示可验证统计', () => {
  assert.match(dashboardSource, /api\.adminOverview\(\)/);
  assert.match(dashboardSource, /channel\.messageCount/);
  assert.match(dashboardSource, /dm\.messageCount/);
  assert.match(dashboardSource, /overview\.value\.users\.filter/);
  assert.match(dashboardSource, /t\('dashboard\.quickAccess'\)/);
  assert.match(dashboardSource, /t\('dashboard\.systemOverview'\)/);
});

test('Telegram 互通页由管理员路由保护并分别管理 Bot 与公开群组映射', () => {
  assert.match(routerSource, /import AdminTelegramPage/);
  assert.match(routerSource, /path: 'telegram'/);
  assert.match(routerSource, /adminTitleKey: 'admin\.nav\.telegram'/);
  assert.match(telegramSource, /api\.saveAdminTelegramConfig/);
  assert.match(telegramSource, /api\.createAdminTelegramMapping/);
  assert.match(telegramSource, /type="checkbox"/);
  assert.match(telegramSource, /t\('telegram\.chatId'\)/);
});

test('仪表盘在中等桌面宽度提前重排且快捷入口文字保持完整', () => {
  assert.match(
    dashboardStyles,
    /@media \(max-width: 96rem\)[\s\S]*\.admin-dashboard__body\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/
  );
  assert.match(
    dashboardStyles,
    /@media \(max-width: 75rem\)[\s\S]*\.admin-dashboard__metrics,\s*\.admin-quick-grid\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
  );
  assert.match(dashboardStyles, /\.admin-quick-link__copy strong\s*\{[\s\S]*overflow-wrap: anywhere;/);
  assert.doesNotMatch(
    dashboardStyles,
    /\.admin-quick-link__copy strong\s*\{[\s\S]*?text-overflow: ellipsis;[\s\S]*?\}/
  );
});

test('管理员消息正文查看的页面、客户端调用与服务端接口均已下线', () => {
  assert.doesNotMatch(routerSource, /AdminMessagesPage|AdminRoomPage|admin-messages|admin-room/);
  assert.doesNotMatch(apiSource, /adminRoomMessages|searchMessages|\/admin\/messages\/search/);
  assert.doesNotMatch(adminApiSource, /\/api\/admin\/messages|\/api\/admin\/rooms.*messages/);
  assert.doesNotMatch(dashboardSource, /消息查看|\/admin\/messages/);
});

test('后台视觉令牌匹配参考图并按职责拆分样式文件', () => {
  assert.match(mainSource, /import '\.\/styles\/admin\.css';/);
  assert.match(adminStyles, /@import '\.\/admin\/tokens\.css';/);
  assert.match(adminStyles, /@import '\.\/admin\/layout\.css';/);
  assert.match(adminStyles, /@import '\.\/admin\/controls\.css';/);
  assert.match(adminTokens, /--admin-workspace: #f0f3f8;/);
  assert.match(adminTokens, /--admin-panel: #ffffff;/);
  assert.match(adminTokens, /--admin-ink: #0d1731;/);
  assert.match(adminTokens, /--admin-green-bg: #f3f4f6;/);
  assert.match(adminTokens, /--admin-green: #111827;/);
  assert.doesNotMatch(adminTokens, /backdrop-filter|linear-gradient/);
  assert.doesNotMatch(legacyTokens, /admin-shell|admin-grid--two|admin-metric-grid--wide/);
});

test('后台核心 Vue 文件保持在单一职责的可维护规模', () => {
  for (const [name, source] of [
    ['AdminSidebar', sidebarSource],
    ['AdminDashboardPage', dashboardSource],
    ['AdminUsersPage', usersSource],
    ['AdminStoragePage', storageSource],
    ['AdminTelegramPage', telegramSource],
    ['AdminSitePage', siteSource]
  ]) {
    assert.ok(source.split('\n').length < 260, `${name} 不应重新膨胀为超大文件`);
  }
});

test('移动端后台始终保留独立的纵向滚动区域', () => {
  assert.match(adminLayout, /\.admin-page\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/);
  assert.match(adminLayout, /\.admin-workspace\s*\{[\s\S]*?min-height:\s*0;/);
  assert.match(adminLayout, /\.admin-content\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;[\s\S]*?touch-action:\s*pan-y;/);
  assert.match(adminSidebarStyles, /\.admin-sidebar__body\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?touch-action:\s*pan-y;/);
});
