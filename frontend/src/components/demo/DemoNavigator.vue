<script setup>
import { RotateCcw } from '@lucide/vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { resetRuntime } from '../../runtime.js';
import { t } from '../../i18n.js';

const route = useRoute();
const router = useRouter();

const pages = [
  { labelKey: 'demo.chat', value: '/' },
  { labelKey: 'demo.settings', value: '/settings' },
  { labelKey: 'demo.dashboard', value: '/admin/dashboard' },
  { labelKey: 'demo.users', value: '/admin/users' },
  { labelKey: 'demo.invites', value: '/admin/invites' },
  { labelKey: 'demo.telegram', value: '/admin/telegram' },
  { labelKey: 'demo.site', value: '/admin/site' },
  { labelKey: 'demo.login', value: '/login' },
  { labelKey: 'demo.register', value: '/register/demo-invite' }
];

const currentPage = computed(() => {
  const match = pages.find((page) => page.value === route.path);
  return match?.value || '/';
});

function navigate(event) {
  void router.push(event.target.value);
}

function resetDemo() {
  resetRuntime();
  localStorage.removeItem('customBackground');
  window.location.assign('/');
}
</script>

<template>
  <aside
    class="demo-navigator"
    :class="{ 'demo-navigator--admin': route.path.startsWith('/admin') }"
    :aria-label="t('demo.navigation')"
  >
    <span class="demo-navigator__badge">{{ t('demo.local') }}</span>
    <select :value="currentPage" :aria-label="t('demo.selectPage')" @change="navigate">
      <option v-for="page in pages" :key="page.value" :value="page.value">
        {{ t(page.labelKey) }}
      </option>
    </select>
    <button type="button" :title="t('demo.reset')" :aria-label="t('demo.reset')" @click="resetDemo">
      <RotateCcw :size="16" aria-hidden="true" />
    </button>
  </aside>
</template>

<style scoped>
.demo-navigator {
  position: fixed;
  top: 68px;
  right: 12px;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  padding: 5px 6px 5px 10px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-control);
  background: var(--surface-solid);
  box-shadow: var(--shadow-md);
  color: var(--text);
}

.demo-navigator__badge {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.demo-navigator select {
  width: 138px;
  height: 28px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--surface-solid);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  padding: 0 24px 0 8px;
}

.demo-navigator button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-soft);
  cursor: pointer;
}

.demo-navigator button:hover,
.demo-navigator button:focus-visible {
  background: var(--accent-soft);
  outline: none;
}

@media (max-width: 640px) {
  .demo-navigator {
    top: 68px;
    right: 8px;
  }

  .demo-navigator__badge {
    display: none;
  }

  .demo-navigator select {
    width: 124px;
  }

  .demo-navigator--admin {
    top: auto;
    bottom: 8px;
  }
}
</style>
