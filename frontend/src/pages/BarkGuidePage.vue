<script setup>
import { useI18n } from '../i18n.js';

const { t, isEnglish } = useI18n();

const example = {
  title: isEnglish.value ? 'Alice' : '王五',
  body: isEnglish.value ? 'Ping me when you are online, need to sync on…' : '明天开会，记得带方案…'
};
</script>

<template>
  <div class="bark-page">
    <div class="bark-container">
      <header class="bark-header">
        <router-link class="back-link" to="/settings">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          {{ t('bark.backToSettings') }}
        </router-link>
        <div class="bark-header__title">
          <h1>{{ t('bark.title') }}</h1>
          <span class="bark-kicker">{{ t('bark.subtitle') }}</span>
        </div>
      </header>

      <section class="bark-section">
        <h2>{{ t('bark.whatIsTitle') }}</h2>
        <p class="bark-body">{{ t('bark.whatIsBody') }}</p>
      </section>

      <section class="bark-section">
        <h2>{{ t('bark.stepsTitle') }}</h2>
        <ol class="bark-steps">
          <li class="bark-step">
            <div class="bark-step__num">1</div>
            <div class="bark-step__content">
              <h3>{{ t('bark.step1Title') }}</h3>
              <p>{{ t('bark.step1Body') }}</p>
            </div>
          </li>
          <li class="bark-step">
            <div class="bark-step__num">2</div>
            <div class="bark-step__content">
              <h3>{{ t('bark.step2Title') }}</h3>
              <p>{{ t('bark.step2Body') }}</p>
              <code class="bark-key-demo">ynJ5Ft4atkMkWeo2PAvFhF</code>
            </div>
          </li>
          <li class="bark-step">
            <div class="bark-step__num">3</div>
            <div class="bark-step__content">
              <h3>{{ t('bark.step3Title') }}</h3>
              <p>{{ t('bark.step3Body') }}</p>
            </div>
          </li>
          <li class="bark-step">
            <div class="bark-step__num">4</div>
            <div class="bark-step__content">
              <h3>{{ t('bark.step4Title') }}</h3>
              <p>{{ t('bark.step4Body') }}</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="bark-section">
        <h2>{{ t('bark.templateTitle') }}</h2>
        <p class="bark-body">{{ t('bark.templateMeta') }}</p>
        <div class="bark-template">
          <pre class="bark-template__json"><code>{
  "title": "{{ example.title }}",
  "body": "{{ example.body }}",
  "device_key": "ynJ5Ft4atkMkWeo2PAvFhF",
  "group": "edgechat:7",
  "isArchive": "1"
}</code></pre>
          <ul class="bark-template__notes">
            <li><strong>title</strong> — {{ t('bark.templateTitleNote') }}</li>
            <li><strong>body</strong> — {{ t('bark.templateBodyNote') }}</li>
            <li><strong>group</strong> — {{ t('bark.templateGroupNote') }}</li>
            <li><strong>isArchive</strong> — {{ t('bark.templateArchiveNote') }}</li>
          </ul>
        </div>
        <div class="bark-mock">
          <div class="bark-mock__statusbar">9:41</div>
          <div class="bark-mock__card">
            <div class="bark-mock__app">Bark</div>
            <div class="bark-mock__row">
              <span class="bark-mock__title">{{ example.title }}</span>
              <span class="bark-mock__time">now</span>
            </div>
            <div class="bark-mock__body">{{ example.body }}</div>
            <div class="bark-mock__meta">Edgechat · 私信</div>
          </div>
        </div>
      </section>

      <section class="bark-section">
        <h2>{{ t('bark.faqTitle') }}</h2>
        <ul class="bark-faq">
          <li>
            <h3>{{ t('bark.faq1Title') }}</h3>
            <p>{{ t('bark.faq1Body') }}</p>
          </li>
          <li>
            <h3>{{ t('bark.faq2Title') }}</h3>
            <p>{{ t('bark.faq2Body') }}</p>
          </li>
          <li>
            <h3>{{ t('bark.faq3Title') }}</h3>
            <p>{{ t('bark.faq3Body') }}</p>
          </li>
          <li>
            <h3>{{ t('bark.faq4Title') }}</h3>
            <p>{{ t('bark.faq4Body') }}</p>
          </li>
        </ul>
      </section>

      <router-link class="back-link back-link--bottom" to="/settings">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        {{ t('bark.backToSettings') }}
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.bark-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: var(--bg);
}

.bark-container {
  width: min(760px, 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 28px;
  border-radius: var(--radius-panel);
  background: var(--surface-solid);
  border: 1px solid var(--line-soft);
  box-shadow: var(--shadow-md);
}

.bark-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line-soft);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 7px 14px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line-soft);
  background: var(--surface-solid);
  color: var(--text-soft);
  font-size: 0.8rem;
  font-weight: 500;
  text-decoration: none;
  transition: background var(--transition-soft), color var(--transition-soft);
}

.back-link:hover {
  background: var(--surface-1);
  color: var(--text);
}

.back-link--bottom {
  margin: 4px auto 0;
}

.bark-header__title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bark-header__title h1 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}

.bark-kicker {
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-1);
  border: 1px solid var(--line-soft);
  color: var(--text-soft);
  font-size: 0.72rem;
  font-weight: 600;
}

.bark-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-radius: var(--radius-panel);
  background: var(--surface-1);
  border: 1px solid var(--line-soft);
}

.bark-section h2 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line-soft);
}

.bark-body {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.7;
  color: var(--text-soft);
}

.bark-steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 18px;
}

.bark-step {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.bark-step__num {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
}

.bark-step__content h3 {
  margin: 0 0 4px;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text);
}

.bark-step__content p {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--text-soft);
}

.bark-key-demo {
  display: inline-block;
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--surface-solid);
  border: 1px dashed var(--line-strong);
  color: var(--accent);
  font-size: 0.78rem;
  word-break: break-all;
}

.bark-template {
  display: grid;
  gap: 12px;
}

.bark-template__json {
  margin: 0;
  padding: 14px 16px;
  border-radius: var(--radius-control);
  background: var(--surface-solid);
  border: 1px solid var(--line-soft);
  overflow-x: auto;
  font-size: 0.78rem;
  line-height: 1.7;
  color: var(--text);
}

.bark-template__notes {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.bark-template__notes li {
  font-size: 0.83rem;
  line-height: 1.6;
  color: var(--text-soft);
}

.bark-template__notes strong {
  color: var(--text);
}

/* 模拟 iPhone 锁屏通知效果 */
.bark-mock {
  margin-top: 4px;
  padding: 18px;
  border-radius: var(--radius-panel);
  background: linear-gradient(160deg, #1a2332, #101826);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: grid;
  gap: 12px;
  max-width: 340px;
}

.bark-mock__statusbar {
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.72rem;
  font-weight: 600;
  text-align: center;
}

.bark-mock__card {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 12px 14px;
  backdrop-filter: blur(10px);
}

.bark-mock__app {
  font-size: 0.66rem;
  font-weight: 700;
  opacity: 0.7;
  color: #fff;
  margin-bottom: 6px;
}

.bark-mock__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.bark-mock__title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #fff;
}

.bark-mock__time {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.55);
}

.bark-mock__body {
  margin-top: 4px;
  font-size: 0.8rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.85);
}

.bark-mock__meta {
  margin-top: 6px;
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.45);
}

.bark-faq {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 16px;
}

.bark-faq li {
  padding-left: 14px;
  border-left: 3px solid var(--line-strong);
}

.bark-faq h3 {
  margin: 0 0 4px;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text);
}

.bark-faq p {
  margin: 0;
  font-size: 0.83rem;
  line-height: 1.7;
  color: var(--text-soft);
}

@media (max-width: 640px) {
  .bark-page {
    padding: 16px;
  }

  .bark-container {
    padding: 20px;
  }

  .bark-header__title {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
}
</style>