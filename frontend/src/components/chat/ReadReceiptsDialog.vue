<script setup>
import { X } from '@lucide/vue';
import { ref, toRef } from 'vue';
import { useOverlayLifecycle } from '../../composables/useOverlayLifecycle.js';
import { t } from '../../i18n.js';
import UiAvatar from '../ui/Avatar.vue';

const props = defineProps({
  show: { type: Boolean, default: false },
  readers: { type: Array, default: () => [] }
});

const emit = defineEmits(['close']);
const closeButtonEl = ref(null);

useOverlayLifecycle({
  open: toRef(props, 'show'),
  onClose: () => emit('close'),
  focusTarget: closeButtonEl
});
</script>

<template>
  <Transition name="read-receipts-fade">
    <div v-if="show" class="read-receipts-overlay" @click.self="emit('close')">
      <section class="read-receipts-dialog" role="dialog" aria-modal="true" aria-labelledby="read-receipts-title">
        <header class="read-receipts-dialog__header">
          <h2 id="read-receipts-title">{{ t('chat.readReceiptsTitle', { count: readers.length }) }}</h2>
          <button
            ref="closeButtonEl"
            type="button"
            class="read-receipts-dialog__close"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <X :size="20" aria-hidden="true" />
          </button>
        </header>

        <ul v-if="readers.length" class="read-receipts-list">
          <li v-for="reader in readers" :key="reader.id" class="read-receipts-list__item">
            <UiAvatar :src="reader.avatarUrl" :fallback="reader.displayName" size="sm" />
            <div class="read-receipts-list__identity">
              <strong>{{ reader.displayName }}</strong>
              <span v-if="reader.username">@{{ reader.username }}</span>
            </div>
          </li>
        </ul>
        <p v-else class="read-receipts-empty">{{ t('chat.readReceiptsEmpty') }}</p>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.read-receipts-overlay {
  position: fixed;
  inset: 0;
  z-index: 115;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: rgba(11, 20, 26, 0.42);
}

.read-receipts-dialog {
  width: min(380px, 100%);
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 20px 60px rgba(11, 20, 26, 0.18);
}

.read-receipts-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px 12px;
}

.read-receipts-dialog h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #111b21;
}

.read-receipts-dialog__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #667781;
  cursor: pointer;
}

.read-receipts-dialog__close:hover {
  background: #f0f2f5;
  color: #111b21;
}

.read-receipts-list {
  list-style: none;
  margin: 0;
  padding: 0 8px 8px;
  overflow-y: auto;
}

.read-receipts-list__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
}

.read-receipts-list__item:hover {
  background: #f5f6f6;
}

.read-receipts-list__identity {
  display: grid;
  min-width: 0;
}

.read-receipts-list__identity strong {
  font-size: 14px;
  font-weight: 500;
  color: #111b21;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.read-receipts-list__identity span {
  font-size: 12px;
  color: #8696a0;
}

.read-receipts-empty {
  margin: 0;
  padding: 24px 16px;
  color: #8696a0;
  font-size: 13px;
  text-align: center;
}

.read-receipts-fade-enter-active {
  transition: opacity 200ms ease-out;
}

.read-receipts-fade-leave-active {
  transition: opacity 150ms ease-in;
}

.read-receipts-fade-enter-from,
.read-receipts-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .read-receipts-fade-enter-active,
  .read-receipts-fade-leave-active {
    transition: none;
  }
}
</style>