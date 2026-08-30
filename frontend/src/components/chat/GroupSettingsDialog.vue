<script setup>
import { ref, toRef } from 'vue';
import { useOverlayLifecycle } from '../../composables/useOverlayLifecycle.js';
import { t } from '../../i18n.js';
import UiAvatar from '../ui/Avatar.vue';

const props = defineProps({
  show: { type: Boolean, default: false },
  room: { type: Object, default: null },
  form: { type: Object, required: true },
  saving: { type: Boolean, default: false },
  avatarUploading: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'upload-avatar', 'save']);
const avatarInput = ref(null);
const nameInputEl = ref(null);

useOverlayLifecycle({
  open: toRef(props, 'show'),
  onClose: () => emit('close'),
  focusTarget: nameInputEl
});

function openAvatarPicker() {
  avatarInput.value?.click();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="show" class="room-dialog-overlay" @click.self="emit('close')">
      <section class="room-dialog" role="dialog" aria-modal="true" aria-labelledby="group-settings-title">
        <h2 id="group-settings-title">{{ t('group.settings') }}</h2>

        <div class="room-dialog__avatar-row">
          <UiAvatar :src="form.avatarUrl" :fallback="room?.name?.[0] || '?'" />
          <input ref="avatarInput" type="file" class="room-dialog__file" accept="image/*" @change="emit('upload-avatar', $event)" />
          <button type="button" class="room-dialog__secondary" :disabled="avatarUploading" @click="openAvatarPicker">
            {{ avatarUploading ? t('common.uploading') : t('group.changeAvatar') }}
          </button>
        </div>

        <label class="room-dialog__field">
          <span>{{ t('group.nameGeneric') }}</span>
          <input ref="nameInputEl" v-model="form.name" type="text" class="room-dialog__input" :disabled="room?.isGeneral" />
        </label>

        <label class="room-dialog__toggle">
          <span class="room-dialog__toggle-copy">
            <strong>{{ t('group.muteEveryone') }}</strong>
            <small>{{ room?.isGeneral ? t('group.muteEveryoneHintAdmin') : t('group.muteEveryoneHint') }}</small>
          </span>
          <span class="room-dialog__switch" :class="{ 'room-dialog__switch--on': form.muteEveryone }">
            <input v-model="form.muteEveryone" type="checkbox" class="room-dialog__switch-input" />
            <span aria-hidden="true"></span>
          </span>
        </label>

        <div class="room-dialog__actions">
          <button type="button" class="room-dialog__secondary" @click="emit('close')">{{ t('common.cancel') }}</button>
          <button type="button" class="room-dialog__primary" :disabled="!form.name.trim() || saving" @click="emit('save')">
            {{ saving ? t('common.saving') : t('common.save') }}
          </button>
        </div>
      </section>
    </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.room-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    max(16px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
  background: rgba(0, 0, 0, 0.4);
}
.room-dialog { width: min(420px, 100%); max-height: calc(100vh - 32px); /* biome-ignore lint/suspicious/noDuplicateProperties: 100dvh 降级兜底,老浏览器不识别则回退上一行 100vh */ max-height: calc(100dvh - 32px); overflow-y: auto; padding: 24px; border-radius: 10px; background: #fff; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15); }
.room-dialog h2 { margin: 0 0 20px; font-size: 18px; color: #111b21; }
.room-dialog__avatar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.room-dialog__file { display: none; }
.room-dialog__field { display: grid; gap: 8px; color: #6b7c93; font-size: 13px; }
.room-dialog__input { width: 100%; min-height: 44px; padding: 10px 14px; border: 1px solid #e8ecf0; border-radius: 8px; background: #f9fafb; font-size: 16px; }
.room-dialog__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
}

.room-dialog__toggle-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.room-dialog__toggle-copy strong {
  font-size: 13px;
  color: #111b21;
}

.room-dialog__toggle-copy small {
  font-size: 12px;
  color: #667781;
}

.room-dialog__switch {
  position: relative;
  flex: 0 0 auto;
}

.room-dialog__switch-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.room-dialog__switch > span[aria-hidden="true"] {
  display: block;
  width: 38px;
  height: 22px;
  border: 1px solid #d0d5dd;
  border-radius: 999px;
  background: #eef1f4;
  transition: background-color 150ms, border-color 150ms;
}

.room-dialog__switch > span[aria-hidden="true"]::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
  transition: transform 150ms;
}

.room-dialog__switch--on > span[aria-hidden="true"] {
  border-color: #111827;
  background: #111827;
}

.room-dialog__switch--on > span[aria-hidden="true"]::after {
  transform: translateX(16px);
}

.room-dialog__switch-input:focus-visible + span {
  outline: 2px solid #111827;
  outline-offset: 2px;
}

.room-dialog__actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.room-dialog__secondary, .room-dialog__primary { min-height: 44px; padding: 10px 20px; border-radius: 8px; cursor: pointer; touch-action: manipulation; }
.room-dialog__secondary { border: 1px solid #e8ecf0; background: #fff; color: var(--text); }
.room-dialog__primary { border: 0; background: var(--btn); color: #fff; }
.room-dialog__primary:hover:not(:disabled) { background: var(--btn-hover); }
.room-dialog__primary:disabled, .room-dialog__secondary:disabled { cursor: not-allowed; opacity: 0.55; }
.modal-fade-enter-active { transition: opacity 200ms; }
.modal-fade-leave-active { transition: opacity 150ms; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }

@media (max-width: 480px) {
  .room-dialog-overlay {
    top: 0;
    height: var(--chat-viewport-height, 100dvh);
    align-items: flex-end;
    padding: env(safe-area-inset-top) 0 0;
  }

  .room-dialog {
    width: 100%;
    max-height: calc(100vh - env(safe-area-inset-top));
    /* biome-ignore lint/suspicious/noDuplicateProperties: 视觉视口高度降级,旧浏览器回退上一行 100vh */
    max-height: calc(var(--chat-viewport-height, 100dvh) - env(safe-area-inset-top));
    padding: 20px 16px max(16px, env(safe-area-inset-bottom));
    border-radius: 10px 10px 0 0;
  }

  .room-dialog__avatar-row {
    flex-wrap: wrap;
  }

  .room-dialog__actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
</style>
