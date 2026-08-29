<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api.js';
import store from '../store.js';
import { useI18n } from '../i18n.js';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const validating = ref(false);
const error = ref('');
const invite = ref(null);

const form = reactive({
  username: '',
  displayName: '',
  password: '',
  confirmPassword: ''
});

const token = computed(() => String(route.params.token || '').trim());

async function loadInvite() {
  validating.value = true;
  error.value = '';
  try {
    const payload = await api.getRegisterInvite(token.value);
    invite.value = payload.invite;
    if (payload.site) {
      store.setSite(payload.site);
    }
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    validating.value = false;
  }
}

async function submit() {
  if (form.password !== form.confirmPassword) {
    error.value = t('auth.passwordMismatch');
    return;
  }

  loading.value = true;
  error.value = '';
  try {
    await api.registerWithInvite(token.value, form);
    router.push({ name: 'login', query: { registered: '1' } });
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadInvite();
});
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">{{ store.site.siteName }}</h1>
      <p class="login-subtitle">{{ t('auth.welcomeBack') }}</p>

      <p v-if="validating" class="info-text">{{ t('auth.validatingInvite') }}</p>
      <p v-else-if="invite?.note" class="info-text">{{ t('auth.invitationNote', { note: invite.note }) }}</p>
      <p v-if="error" class="error-text">{{ error }}</p>

      <form v-if="invite && !error" class="login-form" @submit.prevent="submit">
        <label class="login-field">
          <span>{{ t('auth.username') }}</span>
          <input
            v-model.trim="form.username"
            class="login-input"
            :placeholder="t('auth.username')"
            autocomplete="username"
            type="text"
          />
        </label>
        <label class="login-field">
          <span>{{ t('auth.displayName') }}</span>
          <input
            v-model.trim="form.displayName"
            class="login-input"
            :placeholder="t('auth.displayName')"
            autocomplete="nickname"
            type="text"
          />
        </label>
        <label class="login-field">
          <span>{{ t('auth.password') }}</span>
          <input
            v-model="form.password"
            class="login-input"
            :placeholder="t('auth.password')"
            autocomplete="new-password"
            type="password"
          />
        </label>
        <label class="login-field">
          <span>{{ t('auth.confirmPassword') }}</span>
          <input
            v-model="form.confirmPassword"
            class="login-input"
            :placeholder="t('auth.confirmPassword')"
            autocomplete="new-password"
            type="password"
          />
        </label>

        <button class="login-btn" :disabled="loading" type="submit">
          {{ loading ? t('auth.registering') : t('auth.completeRegistration') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg);
  overflow-y: auto;
}

.login-card {
  width: min(400px, 100%);
  display: flex;
  flex-direction: column;
  padding: 32px;
  border-radius: var(--radius-panel);
  background: var(--surface-solid);
  border: 1px solid var(--line-soft);
  box-shadow: var(--shadow-md);
}

.login-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}

.login-subtitle {
  margin: 4px 0 24px;
  font-size: 0.88rem;
  color: var(--text-soft);
}

.info-text {
  margin: 0 0 16px;
  font-size: 0.85rem;
  color: var(--text-soft);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-field {
  display: grid;
  gap: 6px;
}

.login-field span {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-soft);
}

.login-input {
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-control);
  background: var(--surface-solid);
  font-size: 1rem;
  color: var(--text);
  outline: none;
  transition: border-color var(--transition-soft), box-shadow var(--transition-soft);
}

.login-input::placeholder {
  color: var(--text-faint);
}

.login-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.login-btn {
  height: 44px;
  margin-top: 4px;
  border: none;
  border-radius: var(--radius-control);
  background: var(--btn);
  color: #ffffff;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-soft);
}

.login-btn:hover:not(:disabled) {
  background: var(--btn-hover);
}

.login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--danger);
  text-align: center;
}
</style>