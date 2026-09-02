<script setup>
import { onMounted, ref } from 'vue';
import api from '../../api.js';
import UiBadge from '../ui/Badge.vue';
import { formatDateTime, t } from '../../i18n.js';

const props = defineProps({
  userId: { type: Number, required: true }
});

const events = ref([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    const payload = await api.adminUserIps(props.userId);
    events.value = payload.events;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <p v-if="loading" class="muted">{{ t('users.loading') }}</p>
  <p v-else-if="error" class="error-text">{{ error }}</p>
  <p v-else-if="!events.length" class="muted">{{ t('users.ipEmpty') }}</p>
  <table v-else class="ip-table">
    <thead>
      <tr>
        <th>{{ t('users.ipColumns.event') }}</th>
        <th>{{ t('users.ipColumns.ip') }}</th>
        <th>{{ t('users.ipColumns.time') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(event, index) in events" :key="index">
        <td>
          <UiBadge :variant="event.event === 'register' ? 'success' : 'secondary'">
            {{ event.event === 'register' ? t('users.ipEvent.register') : t('users.ipEvent.access') }}
          </UiBadge>
        </td>
        <td>{{ event.ip }}</td>
        <td>{{ formatDateTime(event.createdAt) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.ip-table {
  width: 100%;
  border-collapse: collapse;
}

.ip-table th,
.ip-table td {
  text-align: left;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid var(--admin-border-weak);
}

.ip-table th {
  font-weight: 600;
  font-size: 0.85em;
  opacity: 0.7;
}
</style>