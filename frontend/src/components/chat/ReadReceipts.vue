<script setup>
import { CheckCheck } from '@lucide/vue';
import { computed } from 'vue';
import { t } from '../../i18n.js';

const PREVIEW_NAMES = 3;

const props = defineProps({
  readers: { type: Array, default: () => [] },
  isDm: { type: Boolean, default: false }
});

const emit = defineEmits(['open']);

const fullNames = computed(() =>
  props.readers.map((reader) => reader.displayName || reader.username).join(t('chat.nameJoiner'))
);
const label = computed(() => {
  if (props.readers.length === 0) return '';
  if (props.isDm) return t('chat.read');
  const names = props.readers
    .slice(0, PREVIEW_NAMES)
    .map((reader) => reader.displayName || reader.username)
    .join(t('chat.nameJoiner'));
  const more = props.readers.length - PREVIEW_NAMES;
  const shown = more > 0 ? `${names}${t('chat.nameJoiner')}+${more}` : names;
  return t('chat.readByCount', { count: props.readers.length, names: shown });
});
</script>

<template>
  <span v-if="label" class="message-read-receipts">
    <button
      v-if="!isDm && readers.length > 0"
      type="button"
      class="message-read-receipts__toggle"
      :title="fullNames"
      @click="emit('open')"
    >
      <CheckCheck :size="12" aria-hidden="true" />
      <span class="message-read-receipts__label">{{ label }}</span>
    </button>
    <span v-else class="message-read-receipts__plain">
      <CheckCheck :size="12" aria-hidden="true" />
      {{ label }}
    </span>
  </span>
</template>

<style scoped>
.message-read-receipts {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
}

.message-read-receipts__toggle,
.message-read-receipts__plain {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #667781;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.message-read-receipts__toggle {
  cursor: pointer;
  border-radius: 4px;
  padding: 2px 3px;
  margin: -2px -3px;
}

.message-read-receipts__toggle:hover {
  color: #5373a5;
  background: rgba(11, 20, 26, 0.06);
}

.message-read-receipts__toggle:focus-visible {
  outline: 2px solid rgba(15, 23, 42, 0.18);
  outline-offset: 1px;
}

.message-read-receipts__label {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>