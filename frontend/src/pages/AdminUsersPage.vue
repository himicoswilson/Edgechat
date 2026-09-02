<script setup>
import { onMounted, ref } from 'vue';
import api from '../api.js';
import UiButton from '../components/ui/Button.vue';
import UiSurface from '../components/ui/Surface.vue';
import UserIpRecords from '../components/admin/UserIpRecords.vue';
import { formatDateTime, t } from '../i18n.js';

const loading = ref(false);
const error = ref('');
const users = ref([]);
const banEditorUserId = ref(null);
const banDuration = ref(1);
const banUnit = ref('days');

const ipUserId = ref(null);

const BAN_UNIT_MINUTES = {
  minutes: 1,
  hours: 60,
  days: 24 * 60
};

async function loadUsers() {
  loading.value = true;
  error.value = '';
  try {
    const usersPayload = await api.adminUsers();
    users.value = usersPayload.users;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

function openBanEditor(user) {
  banEditorUserId.value = user.id;
  banDuration.value = 1;
  banUnit.value = 'days';
}

function closeBanEditor() {
  banEditorUserId.value = null;
}

async function disableUser(user) {
  const durationMinutes = banUnit.value === 'permanent'
    ? null
    : Number(banDuration.value) * BAN_UNIT_MINUTES[banUnit.value];
  if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 1)) {
    error.value = t('users.invalidDuration');
    return;
  }

  await api.updateUser(user.id, {
    isDisabled: true,
    banDurationMinutes: durationMinutes
  });
  closeBanEditor();
  await loadUsers();
}

async function enableUser(user) {
  await api.updateUser(user.id, { isDisabled: false });
  await loadUsers();
}

function userStatus(user) {
  if (user.isPermanentlyDisabled) return t('users.status.permanent');
  if (user.disabledUntil) {
    return t('users.status.until', { time: formatDateTime(user.disabledUntil) });
  }
  return t('common.active');
}

async function resetPassword(user) {
  const password = window.prompt(t('users.promptNewPassword', { name: user.displayName }));
  if (!password) {
    return;
  }
  await api.resetPassword(user.id, password);
}

async function removeUser(user) {
  if (!window.confirm(t('users.confirmDelete', { name: user.displayName }))) {
    return;
  }
  await api.deleteUser(user.id);
  await loadUsers();
}

async function toggleIpRecords(user) {
  ipUserId.value = ipUserId.value === user.id ? null : user.id;
}

onMounted(loadUsers);
</script>

<template>
  <div class="admin-section">
    <header class="admin-section__header">
      <div class="admin-section__heading">
        <h2>{{ t('users.title') }}</h2>
        <p>{{ t('users.description') }}</p>
      </div>
      <UiButton variant="secondary" :disabled="loading" @click="loadUsers">
        {{ loading ? t('common.refreshing') : t('users.refresh') }}
      </UiButton>
    </header>

    <div class="admin-section__body">
      <p v-if="error" class="error-text">{{ error }}</p>

      <UiSurface class="panel panel--table">
        <h3 class="panel-title">{{ t('users.list') }}</h3>
        <div class="admin-table-wrap">
          <table class="list-table">
            <thead>
              <tr>
                <th>{{ t('users.columns.user') }}</th>
                <th>{{ t('users.columns.status') }}</th>
                <th>{{ t('users.columns.createdAt') }}</th>
                <th>{{ t('users.columns.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading && !users.length">
                <td colspan="4" class="muted">{{ t('users.loading') }}</td>
              </tr>
              <tr v-else-if="!users.length">
                <td colspan="4" class="muted">{{ t('users.empty') }}</td>
              </tr>
              <tr v-for="user in users" :key="user.id">
                <td>
                  <strong>{{ user.displayName }}</strong>
                  <div class="muted">@{{ user.username }}</div>
                </td>
                <td>{{ userStatus(user) }}</td>
                <td>{{ formatDateTime(user.createdAt) }}</td>
                <td>
                  <div class="inline-actions">
                    <UiButton v-if="user.isDisabled" variant="secondary" size="sm" @click="enableUser(user)">
                      {{ t('users.enable') }}
                    </UiButton>
                    <UiButton v-else-if="banEditorUserId !== user.id" variant="secondary" size="sm" @click="openBanEditor(user)">
                      {{ t('users.disable') }}
                    </UiButton>
                    <div v-else class="user-ban-editor">
                      <label v-if="banUnit !== 'permanent'" class="field user-ban-editor__duration">
                        <span class="sr-only">{{ t('users.durationValue') }}</span>
                        <input v-model.number="banDuration" type="number" min="1" step="1">
                      </label>
                      <label class="field user-ban-editor__unit">
                        <span class="sr-only">{{ t('users.durationUnit') }}</span>
                        <select v-model="banUnit">
                          <option value="days">{{ t('users.units.days') }}</option>
                          <option value="hours">{{ t('users.units.hours') }}</option>
                          <option value="minutes">{{ t('users.units.minutes') }}</option>
                          <option value="permanent">{{ t('users.units.permanent') }}</option>
                        </select>
                      </label>
                      <UiButton size="sm" @click="disableUser(user)">{{ t('users.confirmDisable') }}</UiButton>
                      <UiButton variant="secondary" size="sm" @click="closeBanEditor">{{ t('common.cancel') }}</UiButton>
                    </div>
                    <UiButton variant="secondary" size="sm" @click="toggleIpRecords(user)">
                      {{ t('users.ipRecords') }}
                    </UiButton>
                    <UiButton variant="secondary" size="sm" @click="resetPassword(user)">{{ t('users.resetPassword') }}</UiButton>
                    <UiButton variant="destructive" size="sm" @click="removeUser(user)">{{ t('common.delete') }}</UiButton>
                  </div>
                </td>
              </tr>
              <tr v-if="ipUserId === user.id" class="user-ip-row">
                <td colspan="4">
                  <UserIpRecords :user-id="user.id" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiSurface>
    </div>
  </div>
</template>

<style scoped>
.user-ban-editor {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--admin-space-2xs);
}

.user-ban-editor__duration {
  width: 5rem;
}

.user-ban-editor__unit {
  width: 6.5rem;
}

.user-ban-editor input,
.user-ban-editor select {
  min-height: 34px;
}

.user-ip-row td {
  background: var(--admin-color-surface-muted, var(--admin-surface-2));
  padding: var(--admin-space-sm);
}
</style>
