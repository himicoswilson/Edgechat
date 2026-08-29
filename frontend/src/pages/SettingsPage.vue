<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api.js';
import store from '../store.js';
import UiAvatar from '../components/ui/Avatar.vue';
import LanguageSwitch from '../components/ui/LanguageSwitch.vue';
import { useI18n } from '../i18n.js';

const router = useRouter();
const { t } = useI18n();
const session = computed(() => store.session);
const showAdminEntry = computed(() => Boolean(session.value?.isAdmin));

const profileForm = reactive({
  displayName: session.value?.displayName || '',
  customBackground: localStorage.getItem('customBackground') || ''
});
const passwordForm = reactive({
  currentPassword: '',
  newPassword: ''
});

const info = ref('');
const error = ref('');
const savingProfile = ref(false);
const savingPassword = ref(false);
const uploadingAvatar = ref(false);
const avatarInputEl = ref(null);

const showCropper = ref(false);
const cropperCanvas = ref(null);
const cropZoom = ref(1);
const cropFile = ref(null);
const cropImageUrl = ref('');
const cropImage = ref(null);
const cropOffset = reactive({ x: 0, y: 0 });
const cropDragging = ref(false);
const cropDragStart = reactive({ x: 0, y: 0 });
const cropOffsetStart = reactive({ x: 0, y: 0 });

const CANVAS_SIZE = 280;
const CROP_SIZE = 240;

function clearMessage() {
  info.value = '';
  error.value = '';
}

async function saveProfile() {
  clearMessage();
  savingProfile.value = true;
  try {
    const payload = await api.updateProfile(profileForm);
    store.setSession(payload.session);
    if (profileForm.customBackground) {
      localStorage.setItem('customBackground', profileForm.customBackground);
      document.body.style.background = profileForm.customBackground;
    } else {
      localStorage.removeItem('customBackground');
      document.body.style.background = '';
    }
    info.value = t('settings.profileUpdated');
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    savingProfile.value = false;
  }
}

function openAvatarPicker() {
  avatarInputEl.value?.click();
}

function onAvatarFileSelected(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  cropFile.value = file;
  const url = URL.createObjectURL(file);
  cropImageUrl.value = url;
  cropZoom.value = 1;
  cropOffset.x = 0;
  cropOffset.y = 0;
  showCropper.value = true;
}

watch(showCropper, async (visible) => {
  if (!visible) return;
  await nextTick();
  const img = new Image();
  img.onload = () => {
    cropImage.value = img;
    drawCropCanvas();
  };
  img.src = cropImageUrl.value;
});

function drawCropCanvas() {
  const canvas = cropperCanvas.value;
  if (!canvas || !cropImage.value) return;
  const ctx = canvas.getContext('2d');
  const img = cropImage.value;

  const baseScale = Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight);
  const totalScale = baseScale * cropZoom.value;

  const drawW = img.naturalWidth * totalScale;
  const drawH = img.naturalHeight * totalScale;
  const drawX = (CANVAS_SIZE - drawW) / 2 + cropOffset.x;
  const drawY = (CANVAS_SIZE - drawH) / 2 + cropOffset.y;

  const cropLeft = (CANVAS_SIZE - CROP_SIZE) / 2;
  const cropTop = (CANVAS_SIZE - CROP_SIZE) / 2;

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.save();
  ctx.beginPath();
  ctx.rect(cropLeft, cropTop, CROP_SIZE, CROP_SIZE);
  ctx.clip();
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#1a2332';
  ctx.fillRect(0, 0, CANVAS_SIZE, cropTop);
  ctx.fillRect(0, cropTop + CROP_SIZE, CANVAS_SIZE, CANVAS_SIZE - cropTop - CROP_SIZE);
  ctx.fillRect(0, cropTop, cropLeft, CROP_SIZE);
  ctx.fillRect(cropLeft + CROP_SIZE, cropTop, CANVAS_SIZE - cropLeft - CROP_SIZE, CROP_SIZE);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(cropLeft, cropTop, CROP_SIZE, CROP_SIZE);
  ctx.restore();
}

watch(() => cropZoom.value, () => { if (showCropper.value) drawCropCanvas(); });
watch(() => cropOffset.x, () => { if (showCropper.value) drawCropCanvas(); });
watch(() => cropOffset.y, () => { if (showCropper.value) drawCropCanvas(); });

function onCropPointerDown(event) {
  event.preventDefault();
  cropDragging.value = true;
  cropDragStart.x = event.clientX;
  cropDragStart.y = event.clientY;
  cropOffsetStart.x = cropOffset.x;
  cropOffsetStart.y = cropOffset.y;
}

function onCropPointerMove(event) {
  if (!cropDragging.value) return;
  event.preventDefault();
  cropOffset.x = cropOffsetStart.x + (event.clientX - cropDragStart.x);
  cropOffset.y = cropOffsetStart.y + (event.clientY - cropDragStart.y);
}

function onCropPointerUp() {
  cropDragging.value = false;
}

onBeforeUnmount(() => {
  cropDragging.value = false;
});

function getCroppedBlob() {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = CROP_SIZE;
  exportCanvas.height = CROP_SIZE;
  const ctx = exportCanvas.getContext('2d');
  const img = cropImage.value;

  const baseScale = Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight);
  const totalScale = baseScale * cropZoom.value;

  const drawW = img.naturalWidth * totalScale;
  const drawH = img.naturalHeight * totalScale;
  const drawX = (CANVAS_SIZE - drawW) / 2 + cropOffset.x;
  const drawY = (CANVAS_SIZE - drawH) / 2 + cropOffset.y;

  const cropLeft = (CANVAS_SIZE - CROP_SIZE) / 2;
  const cropTop = (CANVAS_SIZE - CROP_SIZE) / 2;

  const sourceX = Math.max(0, (cropLeft - drawX) / totalScale);
  const sourceY = Math.max(0, (cropTop - drawY) / totalScale);
  const sourceW = Math.min(img.naturalWidth - sourceX, CROP_SIZE / totalScale);
  const sourceH = Math.min(img.naturalHeight - sourceY, CROP_SIZE / totalScale);

  ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, CROP_SIZE, CROP_SIZE);

  return new Promise((resolve) => {
    exportCanvas.toBlob((blob) => resolve(blob), 'image/png', 0.92);
  });
}

async function confirmCrop() {
  clearMessage();
  uploadingAvatar.value = true;
  showCropper.value = false;
  try {
    const blob = await getCroppedBlob();
    const file = new File([blob], 'avatar.png', { type: 'image/png' });
    const upload = await api.uploadFile(file);
    const payload = await api.updateProfile({
      displayName: profileForm.displayName,
      avatarKey: upload.file.key
    });
    store.setSession(payload.session);
    info.value = t('settings.avatarUpdated');
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    uploadingAvatar.value = false;
    cleanupCrop();
  }
}

async function removeAvatar() {
  clearMessage();
  uploadingAvatar.value = true;
  try {
    const payload = await api.updateProfile({
      displayName: profileForm.displayName,
      avatarKey: null
    });
    store.setSession(payload.session);
    info.value = t('settings.avatarRemoved');
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    uploadingAvatar.value = false;
  }
}

function cancelCrop() {
  showCropper.value = false;
  cleanupCrop();
}

function cleanupCrop() {
  if (cropImageUrl.value) {
    URL.revokeObjectURL(cropImageUrl.value);
  }
  cropImageUrl.value = '';
  cropImage.value = null;
  cropFile.value = null;
  cropZoom.value = 1;
  cropOffset.x = 0;
  cropOffset.y = 0;
}

async function changePassword() {
  clearMessage();
  savingPassword.value = true;
  try {
    await api.changePassword(passwordForm);
    passwordForm.currentPassword = '';
    passwordForm.newPassword = '';
    info.value = t('settings.passwordUpdated');
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    savingPassword.value = false;
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-container">
      <header class="settings-header">
        <div class="settings-header__left">
          <h1>{{ t('settings.title') }}</h1>
          <span class="settings-kicker">{{ t('settings.profileKicker') }}</span>
        </div>
        <div class="settings-header__right">
          <LanguageSwitch />
          <div class="avatar-block">
            <button type="button" class="avatar-trigger" @click="openAvatarPicker" :title="t('settings.changeAvatarTitle')">
              <UiAvatar
                :src="session?.avatarUrl"
                :alt="t('settings.avatarAlt')"
                :fallback="session?.displayName || session?.username || 'U'"
                size="md"
              />
              <span class="avatar-overlay">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><title>{{ t('settings.changeAvatar') }}</title><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              </span>
            </button>
            <input
              ref="avatarInputEl"
              type="file"
              class="avatar-input"
              accept="image/*"
              @change="onAvatarFileSelected"
            />
            <div class="avatar-actions">
              <span class="avatar-hint">{{ uploadingAvatar ? t('common.processing') : t('settings.changeAvatarHint') }}</span>
              <button
                v-if="session?.avatarUrl"
                type="button"
                class="avatar-remove"
                :disabled="uploadingAvatar"
                @click="removeAvatar"
              >
                {{ t('settings.removeAvatar') }}
              </button>
            </div>
          </div>
        </div>
      </header>

      <Transition name="banner">
        <div v-if="info" class="info-banner" role="status">{{ info }}</div>
      </Transition>
      <Transition name="banner">
        <div v-if="error" class="error-banner" role="alert">{{ error }}</div>
      </Transition>

      <div class="settings-grid">
        <section class="settings-section">
          <h2>{{ t('settings.profileSection') }}</h2>
          <label class="field-compact">
            <span>{{ t('auth.displayName') }}</span>
            <input
              v-model.trim="profileForm.displayName"
              :placeholder="t('settings.displayNameHint')"
              autocomplete="nickname"
            />
          </label>
          <label class="field-compact">
            <span>{{ t('settings.customBackground') }}</span>
            <input
              v-model.trim="profileForm.customBackground"
              :placeholder="t('settings.customBackgroundHint')"
            />
          </label>
          <button type="button" class="save-btn" :disabled="savingProfile" @click="saveProfile">
            {{ savingProfile ? t('settings.savingProfile') : t('settings.saveProfile') }}
          </button>
        </section>

        <section class="settings-section">
          <h2>{{ t('settings.securitySection') }}</h2>
          <label class="field-compact">
            <span>{{ t('settings.currentPassword') }}</span>
            <input
              v-model="passwordForm.currentPassword"
              type="password"
              autocomplete="current-password"
            />
          </label>
          <label class="field-compact">
            <span>{{ t('settings.newPassword') }}</span>
            <input
              v-model="passwordForm.newPassword"
              type="password"
              autocomplete="new-password"
            />
          </label>
          <button type="button" class="save-btn" :disabled="savingPassword" @click="changePassword">
            {{ savingPassword ? t('settings.updatingPassword') : t('settings.updatePassword') }}
          </button>
        </section>
      </div>

      <nav class="settings-nav">
        <button type="button" class="nav-link" @click="router.push('/')">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {{ t('settings.backToChat') }}
        </button>
        <button
          v-if="showAdminEntry"
          type="button"
          class="nav-link"
          @click="router.push('/admin')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          {{ t('settings.adminConsole') }}
        </button>
      </nav>
    </div>

    <Transition name="modal">
      <div v-if="showCropper" class="crop-modal" @click.self="cancelCrop">
        <div class="crop-panel">
          <h3>{{ t('settings.cropAvatar') }}</h3>
          <div class="crop-stage">
            <canvas
              ref="cropperCanvas"
              :width="CANVAS_SIZE"
              :height="CANVAS_SIZE"
              class="crop-canvas"
              @pointerdown="onCropPointerDown"
              @pointermove="onCropPointerMove"
              @pointerup="onCropPointerUp"
              @pointerleave="onCropPointerUp"
            />
          </div>
          <div class="crop-controls">
            <span>{{ t('settings.zoom') }}</span>
            <input
              v-model.number="cropZoom"
              type="range"
              min="0.5"
              max="5"
              step="0.05"
              class="crop-zoom"
            />
          </div>
          <p class="crop-hint">{{ t('settings.cropHint') }}</p>
          <div class="crop-actions">
            <button type="button" class="crop-cancel" @click="cancelCrop">{{ t('common.cancel') }}</button>
            <button type="button" class="crop-confirm" @click="confirmCrop">{{ t('settings.confirmCrop') }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.settings-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: var(--bg);
}

.settings-container {
  width: min(900px, 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 28px;
  border-radius: var(--radius-panel);
  background: var(--surface-solid);
  border: 1px solid var(--line-soft);
  box-shadow: var(--shadow-md);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.settings-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-header__left h1 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}

.settings-kicker {
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-1);
  border: 1px solid var(--line-soft);
  color: var(--text-soft);
  font-size: 0.72rem;
  font-weight: 600;
}

.avatar-block {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-trigger {
  position: relative;
  display: inline-flex;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
  border-radius: var(--radius-control);
  overflow: hidden;
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.55);
  color: #fff;
  opacity: 0;
  transition: opacity var(--transition-soft);
  border-radius: inherit;
  pointer-events: none;
}

.settings-header__right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.avatar-trigger:hover .avatar-overlay {
  opacity: 1;
}

.avatar-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.avatar-hint {
  font-size: 0.74rem;
  color: var(--text-faint);
  white-space: nowrap;
}

.avatar-actions {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 2px;
}

.avatar-remove {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--danger);
  font-size: 0.74rem;
  cursor: pointer;
}

.avatar-remove:disabled {
  cursor: default;
  opacity: 0.5;
}

.info-banner,
.error-banner {
  padding: 10px 14px;
  border-radius: var(--radius-control);
  font-size: 0.85rem;
}

.info-banner {
  background: var(--accent-soft);
  border: 1px solid rgba(15, 23, 42, 0.12);
  color: var(--accent);
}

.error-banner {
  background: var(--danger-soft);
  border: 1px solid rgba(220, 38, 38, 0.2);
  color: var(--danger);
}

.banner-enter-active,
.banner-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}

.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-radius: var(--radius-panel);
  background: var(--surface-1);
  border: 1px solid var(--line-soft);
}

.settings-section h2 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line-soft);
}

.field-compact {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-compact span {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--text-soft);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.field-compact input {
  width: 100%;
  padding: 9px 12px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line-strong);
  background: var(--surface-solid);
  color: var(--text);
  font-size: 0.9rem;
  outline: none;
  transition: border-color var(--transition-soft), box-shadow var(--transition-soft);
  box-sizing: border-box;
}

.field-compact input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.field-compact input::placeholder {
  color: var(--text-faint);
  font-size: 0.85rem;
}

.save-btn {
  width: fit-content;
  margin-top: 6px;
  padding: 9px 18px;
  border: none;
  border-radius: var(--radius-control);
  background: var(--btn);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-soft);
}

.save-btn:hover:not(:disabled) {
  background: var(--btn-hover);
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line-soft);
  background: var(--surface-solid);
  color: var(--text-soft);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-soft), color var(--transition-soft);
}

.nav-link:hover {
  background: var(--surface-1);
  color: var(--text);
}

.nav-link svg {
  width: 13px;
  height: 13px;
}

.crop-modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.5);
  z-index: 100;
  padding: 24px;
}

.crop-panel {
  width: min(480px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 28px;
  border-radius: var(--radius-panel);
  background: var(--surface-solid);
  border: 1px solid var(--line-soft);
  box-shadow: var(--shadow-lg);
}

.crop-panel h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
}

.crop-stage {
  width: 280px;
  height: 280px;
  border-radius: var(--radius-control);
  overflow: hidden;
  border: 1px solid var(--line-strong);
}

.crop-canvas {
  display: block;
  cursor: grab;
  touch-action: none;
}

.crop-canvas:active {
  cursor: grabbing;
}

.crop-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 0 8px;
}

.crop-controls span {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-soft);
  flex-shrink: 0;
}

.crop-zoom {
  flex: 1;
  height: 6px;
  appearance: none;
  border-radius: 3px;
  background: var(--line-soft);
  outline: none;
}

.crop-zoom::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
}

.crop-zoom::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.crop-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-soft);
  text-align: center;
}

.crop-actions {
  display: flex;
  gap: 12px;
  width: 100%;
}

.crop-cancel {
  flex: 1;
  padding: 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-control);
  background: var(--surface-solid);
  color: var(--text-soft);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-soft);
}

.crop-cancel:hover {
  background: var(--surface-1);
  color: var(--text);
}

.crop-confirm {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: var(--radius-control);
  background: var(--btn);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-soft);
}

.crop-confirm:hover {
  background: var(--btn-hover);
}

.modal-enter-active {
  transition: opacity 200ms ease;
}

.modal-enter-active .crop-panel {
  transition: transform 200ms ease, opacity 200ms ease;
}

.modal-leave-active {
  transition: opacity 150ms ease;
}

.modal-leave-active .crop-panel {
  transition: transform 150ms ease, opacity 150ms ease;
}

.modal-enter-from {
  opacity: 0;
}

.modal-enter-from .crop-panel {
  transform: scale(0.96);
  opacity: 0;
}

.modal-leave-to {
  opacity: 0;
}

.modal-leave-to .crop-panel {
  transform: scale(0.97);
  opacity: 0;
}

@media (max-width: 640px) {
  .settings-page {
    padding: 16px;
  }

  .settings-container {
    padding: 20px;
    gap: 16px;
  }

  .settings-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .settings-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .settings-header__right {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
