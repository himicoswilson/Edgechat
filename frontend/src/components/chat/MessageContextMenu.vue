<script setup>
import { Trash2 } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { t } from '../../i18n.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 }
});
const emit = defineEmits(['close', 'delete']);

const menuEl = ref(null);
const deleteButtonEl = ref(null);
const menuStyle = computed(() => ({
  left: `${Math.max(8, Math.min(props.x, window.innerWidth - 184))}px`,
  top: `${Math.max(8, Math.min(props.y, window.innerHeight - 60))}px`
}));

function handleWindowPointerDown(event) {
  if (props.open && !menuEl.value?.contains(event.target)) {
    emit('close');
  }
}

function handleWindowKeydown(event) {
  if (props.open && event.key === 'Escape') {
    emit('close');
  }
}

function closeOpenMenu() {
  if (props.open) {
    emit('close');
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await nextTick();
      deleteButtonEl.value?.focus();
    }
  }
);

onMounted(() => {
  window.addEventListener('pointerdown', handleWindowPointerDown);
  window.addEventListener('keydown', handleWindowKeydown);
  window.addEventListener('resize', closeOpenMenu);
  window.addEventListener('scroll', closeOpenMenu, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleWindowPointerDown);
  window.removeEventListener('keydown', handleWindowKeydown);
  window.removeEventListener('resize', closeOpenMenu);
  window.removeEventListener('scroll', closeOpenMenu, true);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="message-menu">
      <div
        v-if="open"
        ref="menuEl"
        class="message-context-menu"
        :style="menuStyle"
        role="menu"
        :aria-label="t('messages.actions')"
        @contextmenu.prevent
      >
        <button ref="deleteButtonEl" type="button" role="menuitem" @click="emit('delete')">
          <Trash2 :size="18" :stroke-width="1.8" aria-hidden="true" />
          {{ t('messages.delete') }}
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.message-context-menu {
  position: fixed;
  z-index: 1000;
  width: 176px;
  padding: 8px;
  border: 1px solid rgba(11, 20, 26, 0.08);
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 2px 5px rgba(11, 20, 26, 0.16), 0 6px 18px rgba(11, 20, 26, 0.12);
}

.message-context-menu button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 40px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #dc2626;
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.message-context-menu button:hover,
.message-context-menu button:active {
  background: #f5f6f6;
}

.message-context-menu button:focus-visible {
  outline: 2px solid #111b21;
  outline-offset: -2px;
}

.message-menu-enter-active,
.message-menu-leave-active {
  transition: opacity 100ms ease, transform 100ms ease;
  transform-origin: top left;
}

.message-menu-enter-from,
.message-menu-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .message-menu-enter-active,
  .message-menu-leave-active {
    transition: none;
  }
}
</style>
