<script setup>
import { Gauge, Settings } from '@lucide/vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminRouteIcons } from '../../admin/navigation.js';
import store from '../../store.js';
import UiAvatar from '../ui/Avatar.vue';
import { t } from '../../i18n.js';

const route = useRoute();
const router = useRouter();

const currentIcon = computed(() => adminRouteIcons[route.meta.adminIcon] || Gauge);
const currentTitle = computed(() => t(route.meta.adminTitleKey || 'admin.topbar.defaultTitle'));
</script>

<template>
  <header class="admin-topbar">
    <div class="admin-topbar__title">
      <component :is="currentIcon" :size="23" aria-hidden="true" />
      <h1>{{ currentTitle }}</h1>
    </div>
    <div class="admin-topbar__actions">
      <button
        type="button"
        class="admin-topbar__avatar"
        :title="t('nav.personalSettings')"
        :aria-label="t('nav.personalSettings')"
        @click="router.push('/settings')"
      >
        <UiAvatar
          :src="store.session?.avatarUrl"
          :fallback="store.session?.displayName?.[0] || store.session?.username?.[0] || 'U'"
          size="sm"
        />
      </button>
      <button type="button" class="admin-topbar__settings" @click="router.push('/admin/site')">
        <Settings :size="19" aria-hidden="true" />
        <span>{{ t('admin.topbar.settings') }}</span>
      </button>
    </div>
  </header>
</template>

<style scoped src="../../styles/admin/topbar.css"></style>