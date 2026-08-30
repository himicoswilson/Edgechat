import { createRouter, createWebHistory } from 'vue-router';
import { isDemoMode } from './runtime.js';
import store from './store.js';
import LoginPage from './pages/LoginPage.vue';
import RegisterPage from './pages/RegisterPage.vue';
import ChatPage from './pages/ChatPage.vue';
import AdminPage from './pages/AdminPage.vue';
import AdminDashboardPage from './pages/AdminDashboardPage.vue';
import AdminUsersPage from './pages/AdminUsersPage.vue';
import AdminStoragePage from './pages/AdminStoragePage.vue';
import AdminInvitesPage from './pages/AdminInvitesPage.vue';
import AdminSitePage from './pages/AdminSitePage.vue';
import AdminTelegramPage from './pages/AdminTelegramPage.vue';
import SettingsPage from './pages/SettingsPage.vue';
import BarkGuidePage from './pages/BarkGuidePage.vue';
import { addAuthInvalidListener } from './auth-storage.js';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
      meta: { public: true, transition: 'page' }
    },
    {
      path: '/register/:token',
      name: 'register',
      component: RegisterPage,
      meta: { public: true, transition: 'page' }
    },
    {
      path: '/',
      name: 'chat',
      component: ChatPage,
      meta: { transition: 'page' }
    },
    {
      path: '/admin',
      component: AdminPage,
      meta: { admin: true, transition: 'page' },
      children: [
        {
          path: '',
          redirect: { name: 'admin-dashboard' }
        },
        {
          path: 'dashboard',
          name: 'admin-dashboard',
          component: AdminDashboardPage,
          meta: { admin: true, adminTitleKey: 'admin.nav.dashboard', adminIcon: 'dashboard', transition: 'page' }
        },
        {
          path: 'users',
          name: 'admin-users',
          component: AdminUsersPage,
          meta: { admin: true, adminTitleKey: 'admin.nav.users', adminIcon: 'users', transition: 'page' }
        },
        {
          path: 'storage',
          name: 'admin-storage',
          component: AdminStoragePage,
          meta: { admin: true, adminTitleKey: 'admin.nav.storage', adminIcon: 'storage', transition: 'page' }
        },
        {
          path: 'invites',
          name: 'admin-invites',
          component: AdminInvitesPage,
          meta: { admin: true, adminTitleKey: 'admin.nav.invites', adminIcon: 'invites', transition: 'page' }
        },
        {
          path: 'telegram',
          name: 'admin-telegram',
          component: AdminTelegramPage,
          meta: { admin: true, adminTitleKey: 'admin.nav.telegram', adminIcon: 'telegram', transition: 'page' }
        },
        {
          path: 'site',
          name: 'admin-site',
          component: AdminSitePage,
          meta: { admin: true, adminTitleKey: 'admin.nav.site', adminIcon: 'site', transition: 'page' }
        }
      ]
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsPage,
      meta: { transition: 'page' }
    },
    {
      path: '/settings/bark',
      name: 'bark-guide',
      component: BarkGuidePage,
      meta: { transition: 'page' }
    }
  ]
});

if (typeof window !== 'undefined') {
  addAuthInvalidListener(() => {
    if (router.currentRoute.value.path !== '/login') {
      void router.push('/login');
    }
  });
}

router.beforeEach(async (to) => {
  if (!store.ready) {
    await store.initialize();
  }

  if (to.meta.public) {
    if (!isDemoMode && store.session && to.path === '/login') {
      return '/';
    }
    return true;
  }

  if (!store.session) {
    return '/login';
  }

  if (to.meta.admin && !store.session.isAdmin) {
    return '/';
  }

  return true;
});

export default router;
