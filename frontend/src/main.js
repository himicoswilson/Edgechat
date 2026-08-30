import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import store from './store.js';
import { isDemoMode } from './runtime.js';
import './styles/base.css';
import './styles.css';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/ui.css';
import './styles/admin.css';
import './styles/chat.css';
import './styles/chat-attachments.css';

// 应用自定义背景
const customBg = localStorage.getItem('customBackground');
if (customBg) {
  document.body.style.background = customBg;
}

store.initialize().finally(() => {
  if (!isDemoMode && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  const app = createApp(App);
  app.use(router);
  app.mount('#app');
});
