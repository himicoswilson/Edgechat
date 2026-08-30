<script setup>
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import store from '../store.js';
import { useI18n } from '../i18n.js';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const error = ref('');
const form = reactive({
  username: '',
  password: ''
});
const registered = computed(() => route.query.registered === '1');

async function submit() {
  loading.value = true;
  error.value = '';
  try {
    await store.login(form);
    router.push('/');
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">{{ store.site.siteName }}</h1>
      <p class="login-subtitle">{{ t('auth.welcomeBack') }}</p>

      <p v-if="registered" class="success-hint">{{ t('auth.registerSuccess') }}</p>

      <form class="login-form" @submit.prevent="submit">
        <label class="login-field">
          <span>{{ t('auth.account') }}</span>
          <input
            v-model.trim="form.username"
            class="login-input"
            :placeholder="t('auth.account')"
            autocomplete="username"
            type="text"
          />
        </label>
        <label class="login-field">
          <span>{{ t('auth.password') }}</span>
          <input
            v-model="form.password"
            class="login-input"
            :placeholder="t('auth.password')"
            autocomplete="current-password"
            type="password"
          />
        </label>

        <button class="login-btn" :disabled="loading" type="submit">
          {{ loading ? t('auth.signingIn') : t('auth.signIn') }}
        </button>

        <p v-if="error" class="error-text">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  /* biome-ignore lint/suspicious/noDuplicateProperties: 100dvh 降级兜底,老浏览器不识别则回退上一行 100vh */
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

.success-hint {
  margin: 0 0 16px;
  font-size: 0.85rem;
  color: var(--success);
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