<script setup>
import { computed } from 'vue';
import { useOverlayLifecycle } from '../../composables/useOverlayLifecycle.js';
import { t } from '../../i18n.js';
import UiAvatar from '../ui/Avatar.vue';
import SenderSourceBadge from './SenderSourceBadge.vue';

const props = defineProps({
  // 目标用户:{ id, username, displayName, avatarUrl, kind, source }
  user: {
    type: Object,
    default: null
  },
  // 当前会话上下文,用于展示"来自哪个群"
  room: {
    type: Object,
    default: null
  },
  myUserId: {
    type: Number,
    default: 0
  },
  // 群内角色(群主/成员),查不到就省略
  role: {
    type: String,
    default: ''
  },
  isOnline: {
    type: Function,
    default: null
  },
  lastSeenLabel: {
    type: Function,
    default: null
  }
});

const emit = defineEmits(['close', 'start-dm']);

const show = computed(() => Boolean(props.user));
const isExternal = computed(() => props.user?.kind === 'external');
const isSelf = computed(
  () => !isExternal.value && Number(props.user?.id) === Number(props.myUserId)
);
const canStartDm = computed(() => Boolean(props.user) && !isExternal.value && !isSelf.value);

const statusText = computed(() => {
  if (!props.user) {
    return '';
  }
  if (props.isOnline?.(props.user.id)) {
    return t('presence.online');
  }
  return props.lastSeenLabel?.(props.user.id) || t('userPanel.offline');
});
const statusOnline = computed(() => props.isOnline?.(props.user?.id) === true);

const roleLabel = computed(() => {
  if (props.role === 'owner') {
    return t('members.owner');
  }
  if (props.role) {
    return t('members.member');
  }
  return '';
});

useOverlayLifecycle({
  open: show,
  onClose: () => emit('close'),
  focusTarget: () => document.querySelector('.user-detail-panel__action')
});
</script>

<template>
  <Teleport to="body">
    <Transition name="user-panel-fade">
      <div v-if="user" class="user-panel-overlay" @click.self="emit('close')">
        <section class="user-panel-card" role="dialog" aria-modal="true" aria-labelledby="user-panel-title">
          <header class="user-panel-card__header">
            <div class="user-panel-identity">
              <UiAvatar
                class="user-panel-avatar"
                :src="user.avatarUrl"
                :alt="user.displayName"
                :fallback="user.displayName"
                size="lg"
              />
              <div class="user-panel-identity__text">
                <h2 id="user-panel-title">
                  {{ user.displayName }}
                  <SenderSourceBadge :source="user.source" />
                </h2>
                <p v-if="user.username">@{{ user.username }}</p>
                <p v-else-if="isExternal" class="user-panel-identity__external">{{ t('userPanel.externalSender') }}</p>
              </div>
            </div>
            <button
              type="button"
              class="user-panel-card__close"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <title>{{ t('common.close') }}</title>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div class="user-panel-detail">
            <p v-if="room?.name" class="user-panel-detail__room">{{ t('userPanel.fromRoom', { room: room.name }) }}</p>
            <div class="user-panel-detail__row">
              <span v-if="roleLabel" class="user-panel-badge">{{ roleLabel }}</span>
              <span class="user-panel-status" :class="{ 'user-panel-status--online': statusOnline }">
                <span class="user-panel-status__dot" aria-hidden="true"></span>
                {{ statusText }}
              </span>
            </div>
            <p v-if="isSelf" class="user-panel-detail__self">{{ t('userPanel.thisIsYou') }}</p>
          </div>

          <footer class="user-panel-card__footer">
            <button
              v-if="canStartDm"
              type="button"
              class="user-panel-card__action"
              @click="emit('start-dm', user)"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              {{ t('quickActions.startDm') }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.user-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    max(16px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
  background: rgba(15, 23, 42, 0.5);
}

.user-panel-card {
  width: min(360px, 100%);
  border-radius: var(--radius-panel);
  background: var(--surface-solid);
  border: 1px solid var(--line-soft);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.user-panel-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 24px 0;
}

.user-panel-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}

.user-panel-identity__text {
  min-width: 0;
}

.user-panel-identity__text h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 17px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.user-panel-identity__text p {
  margin: 4px 0 0;
  color: var(--text-soft);
  font-size: 13px;
}

.user-panel-identity__text .user-panel-identity__external {
  color: var(--text-faint);
  font-size: 12px;
}

.user-panel-card__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: -6px -6px 0 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-soft);
  cursor: pointer;
  flex-shrink: 0;
}

.user-panel-card__close:hover,
.user-panel-card__close:active {
  background: var(--surface-1);
}

.user-panel-detail {
  display: grid;
  gap: 12px;
  padding: 20px 24px;
}

.user-panel-detail__room {
  margin: 0;
  color: var(--text-faint);
  font-size: 13px;
}

.user-panel-detail__row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.user-panel-badge {
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-1);
  border: 1px solid var(--line-strong);
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 600;
}

.user-panel-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-soft);
  font-size: 13px;
}

.user-panel-status__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--line-strong);
}

/* 在线绿点与全站 presence 点一致(success 语义色,非装饰色) */
.user-panel-status--online {
  color: var(--success);
}

.user-panel-status--online .user-panel-status__dot {
  background: var(--success);
}

.user-panel-detail__self {
  margin: 0;
  color: var(--text-faint);
  font-size: 12px;
}

.user-panel-card__footer {
  padding: 0 24px 24px;
}

.user-panel-card__action {
  width: 100%;
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: var(--radius-control);
  background: var(--btn);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-soft);
}

.user-panel-card__action:hover,
.user-panel-card__action:active {
  background: var(--btn-hover);
}

.user-panel-fade-enter-active,
.user-panel-fade-leave-active {
  transition: opacity 0.2s ease;
}

.user-panel-fade-enter-active .user-panel-card,
.user-panel-fade-leave-active .user-panel-card {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.user-panel-fade-enter-from,
.user-panel-fade-leave-to {
  opacity: 0;
}

.user-panel-fade-enter-from .user-panel-card,
.user-panel-fade-leave-to .user-panel-card {
  transform: scale(0.96);
  opacity: 0;
}
</style>