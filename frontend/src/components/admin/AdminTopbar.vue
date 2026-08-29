<script setup>
import { Gauge } from '@lucide/vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { adminRouteIcons } from '../../admin/navigation.js';
import { t } from '../../i18n.js';

const route = useRoute();

const currentIcon = computed(() => adminRouteIcons[route.meta.adminIcon] || Gauge);
const currentTitle = computed(() => t(route.meta.adminTitleKey || 'admin.topbar.defaultTitle'));
</script>

<template>
  <header class="admin-topbar">
    <div class="admin-topbar__title">
      <component :is="currentIcon" :size="23" aria-hidden="true" />
      <h1>{{ currentTitle }}</h1>
    </div>
  </header>
</template>

<style scoped src="../../styles/admin/topbar.css"></style>