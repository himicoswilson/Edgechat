<script setup>
import { ArrowLeft, Bell, BellOff, Menu, Settings, UsersRound } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { isDemoMode } from '../runtime.js';
import AddConversationDialog from '../components/chat/AddConversationDialog.vue';
import CreateGroupDialog from '../components/chat/CreateGroupDialog.vue';
import GroupSettingsDialog from '../components/chat/GroupSettingsDialog.vue';
import MemberPanel from '../components/chat/MemberPanel.vue';
import MessageAttachment from '../components/chat/MessageAttachment.vue';
import MessageContextMenu from '../components/chat/MessageContextMenu.vue';
import MobileNavigationDrawer from '../components/chat/MobileNavigationDrawer.vue';
import SenderSourceBadge from '../components/chat/SenderSourceBadge.vue';
import PendingAttachmentPreview from '../components/chat/PendingAttachmentPreview.vue';
import PublicGroupDiscovery from '../components/chat/PublicGroupDiscovery.vue';
import PublicGroupJoinDialog from '../components/chat/PublicGroupJoinDialog.vue';
import UiAvatar from '../components/ui/Avatar.vue';
import UiTextarea from '../components/ui/Textarea.vue';
import { useActiveRoom } from '../composables/useActiveRoom.js';
import { useBrowserNotifications } from '../composables/useBrowserNotifications.js';
import { useChatRoom } from '../composables/useChatRoom.js';
import { useChatSidebar } from '../composables/useChatSidebar.js';
import { useChatViewport } from '../composables/useChatViewport.js';
import { useConversationCreation } from '../composables/useConversationCreation.js';
import { useRoomManagement } from '../composables/useRoomManagement.js';
import { useUnreadInbox } from '../composables/useUnreadInbox.js';
import store from '../store.js';
import { useI18n } from '../i18n.js';

const router = useRouter();
const { formatTime: formatLocaleTime, t } = useI18n();
const error = ref('');
const activeRoom = ref(null);
const showMobileNavigation = ref(false);
const publicGroupPreview = ref(null);
const joiningPublicGroup = ref(false);
const session = computed(() => store.session);
const showAdminEntry = computed(() => Boolean(session.value?.isAdmin));

const { activeRoomKey, canManageActiveRoom, applyActiveChannel, selectDm, roomLabel } =
  useActiveRoom({ activeRoom });
const {
  isMobileViewport,
  mobileView,
  startViewportSync,
  stopViewportSync,
  openConversationView,
  returnToConversationList
} = useChatViewport({ activeRoom });
const activeRoomAvatar = computed(() => {
  if (!activeRoom.value) return '';
  return activeRoom.value.kind === 'dm'
    ? activeRoom.value.otherUser?.avatarUrl || ''
    : activeRoom.value.avatarUrl || '';
});

const {
  channels, dms, users, sidebarLoading, conversationItems, publicGroupItems, formatListTime,
  refreshSidebar, openConversation, joinPublicChannel, markConversationRead, applyConversationActivity
} = useChatSidebar({ applyActiveChannel, selectDm });

const {
  notificationsEnabled,
  notificationStateLabel,
  notificationActionLabel,
  notificationToggleDisabled,
  syncNotificationPermission,
  toggleNotifications,
  isRoomMuted,
  toggleRoomMuted,
  notifyRoom
} = useBrowserNotifications({
  userId: session.value?.userId,
  onOpenRoom: openRoomFromNotification
});
const activeRoomMuted = computed(() => isRoomMuted(activeRoom.value));
const roomEveryoneMuted = computed(
  () =>
    Boolean(activeRoom.value?.muteEveryone) &&
    activeRoom.value?.myRole !== 'owner' &&
    !session.value?.isAdmin
);

function handleRoomActivity({ room, message }) {
  applyConversationActivity({
    kind: room.kind,
    roomId: room.id,
    lastMessageAt: message.createdAt,
    unreadCount: 0
  });
  markConversationRead(room.kind, room.id);
}

function handleRoomAccessRevoked(room) {
  const roomName = room.name || t('chat.privateGroup');
  error.value = room.kind === 'private'
    ? t('chat.roomAccessRevokedNamed', { name: roomName })
    : t('chat.roomAccessRevoked');
  activeRoom.value = null;
  returnToConversationList();
  void refreshSidebar();
}

const {
  messages, loading, wsStatus, composerText, pendingAttachment, sending,
  messagesEl, fileInputEl, isOwnMessage,
  loadMessages, activateRoom, deactivateRoom, disconnectSocket, sendMessage, deleteMessage, handleComposerKeydown,
  openFilePicker, uploadAttachment, clearAttachment, loadOlder
} = useChatRoom({
  activeRoom,
  session,
  error,
  onRoomActivity: handleRoomActivity,
  onRoomAccessRevoked: handleRoomAccessRevoked
});

const { connectUnreadInbox, disconnectUnreadInbox } = useUnreadInbox({
  activeRoom,
  markConversationRead,
  applyConversationActivity,
  notifyRoom
});

const wsConnected = computed(() => wsStatus.value === 'open');
const activeRoomSubtitle = computed(() => {
  if (!activeRoom.value) return '';
  if (activeRoom.value.kind === 'dm') {
    return activeRoom.value.otherUser?.username
      ? `@${activeRoom.value.otherUser.username}`
      : wsConnected.value ? t('chat.online') : t('chat.connecting');
  }
  if (activeRoom.value.memberCount) {
    return t('chat.memberCount', { count: activeRoom.value.memberCount });
  }
  return activeRoom.value.isGeneral ? t('chat.generalGroup') : t('chat.groupConversation');
});
const canModerateMessages = computed(
  () => Boolean(session.value?.isAdmin || canManageActiveRoom.value)
);
const messageMenu = ref({ message: null, x: 0, y: 0 });
let longPressTimer = null;
let longPressOrigin = null;

function closeMessageMenu() {
  messageMenu.value = { message: null, x: 0, y: 0 };
}

function openMessageMenuAt(message, x, y) {
  if (!canModerateMessages.value) return;
  messageMenu.value = { message, x, y };
}

function cancelMessageLongPress() {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressOrigin = null;
}

function openMessageContextMenu(event, message) {
  if (!canModerateMessages.value) return;
  event.preventDefault();
  cancelMessageLongPress();
  openMessageMenuAt(message, event.clientX, event.clientY);
}

function startMessageLongPress(event, message) {
  cancelMessageLongPress();
  if (!canModerateMessages.value || event.pointerType === 'mouse') return;

  const origin = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY
  };
  longPressOrigin = origin;
  longPressTimer = window.setTimeout(() => {
    openMessageMenuAt(message, origin.x, origin.y);
    longPressTimer = null;
  }, 500);
}

function trackMessageLongPress(event) {
  if (!longPressOrigin || event.pointerId !== longPressOrigin.pointerId) return;
  if (
    Math.abs(event.clientX - longPressOrigin.x) > 10 ||
    Math.abs(event.clientY - longPressOrigin.y) > 10
  ) {
    cancelMessageLongPress();
  }
}

const roomManagement = useRoomManagement({
  activeRoom, channels, users, error, refreshSidebar, conversationItems,
  openConversation, canManageActiveRoom,
  returnToConversationList,
  onRoomDeleted: () => {
    disconnectSocket();
    messages.value = [];
  }
});
const { creation, members: memberManagement, settings: groupSettings, deleteGroup } = roomManagement;
const {
  show: showCreateGroup,
  form: createGroupForm,
  submitting: creatingGroup,
  open: openCreateGroup,
  close: closeCreateGroup,
  toggleMember: toggleCreateGroupMember,
  submit: createGroup
} = creation;
const {
  show: showAddConversation,
  usersWithoutDm,
  openingDmUserId,
  open: openAddConversation,
  close: closeAddConversation,
  startGroupCreation,
  openDm
} = useConversationCreation({
  users,
  dms,
  error,
  refreshSidebar,
  conversationItems,
  openConversation,
  openGroupDialog: openCreateGroup
});
const {
  show: showMemberPanel,
  items: groupMembers,
  loading: memberLoading,
  inviteUserId,
  availableUsers: availableInviteUsers,
  inviteSubmitting,
  toggle: toggleMemberPanel,
  close: closeMemberPanel,
  invite: inviteMember,
  remove: removeMember
} = memberManagement;
const {
  show: showGroupEditor,
  form: groupSettingsForm,
  saving: groupSettingsSaving,
  avatarUploading: groupAvatarUploading,
  open: openGroupEditor,
  close: closeGroupEditor,
  uploadAvatar: uploadGroupAvatar,
  save: saveGroupSettings
} = groupSettings;

async function selectConversation(item) {
  try {
    await openConversation(item);
    openConversationView();
  } catch (currentError) {
    error.value = currentError.message;
  }
}

function openPublicGroupPreview(item) {
  publicGroupPreview.value = item.source;
}

function closePublicGroupPreview() {
  if (!joiningPublicGroup.value) publicGroupPreview.value = null;
}

async function confirmPublicGroupJoin() {
  const channel = publicGroupPreview.value;
  if (!channel) return;

  joiningPublicGroup.value = true;
  error.value = '';
  try {
    await joinPublicChannel(channel);
    const item = conversationItems.value.find(
      (conversation) => conversation.kind === channel.kind && Number(conversation.id) === Number(channel.id)
    );
    publicGroupPreview.value = null;
    if (item) await selectConversation(item);
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    joiningPublicGroup.value = false;
  }
}

function openRoomFromNotification(room) {
  const item = conversationItems.value.find(
    (conversation) => conversation.kind === room.kind && Number(conversation.id) === Number(room.id)
  );
  if (item) void selectConversation(item);
}

function toggleActiveRoomMute() {
  if (activeRoom.value) toggleRoomMuted(activeRoom.value);
}

function logout() { store.logout(); router.push('/login'); }
function openAdmin() { router.push('/admin'); }
function openSettings() { router.push('/settings'); }
function closeMobileNavigation() { showMobileNavigation.value = false; }
function navigateFromMobileDrawer(callback) {
  closeMobileNavigation();
  callback();
}
function returnToMobileConversationList() {
  closeMemberPanel();
  closeMessageMenu();
  returnToConversationList();
}

async function bootstrap() {
  error.value = '';
  try {
    await refreshSidebar();
    if (isDemoMode && !activeRoom.value) {
      const general = conversationItems.value.find((item) => item.isGeneral);
      if (general) await selectConversation(general);
    }
  }
  catch (e) { error.value = e.message; }
}

watch(activeRoomKey, async (k) => {
  closeMessageMenu();
  cancelMessageLongPress();
  if (!k) {
    deactivateRoom();
    return;
  }
  openConversationView();
  const loaded = await activateRoom();
  if (!loaded || activeRoomKey.value !== k) return;
  for (const delay of [0, 50, 150, 300]) {
    await new Promise(r => setTimeout(r, delay));
    if (activeRoomKey.value !== k) return;
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
    }
  }
});

function confirmDeleteMessage() {
  const message = messageMenu.value.message;
  closeMessageMenu();
  if (!message || !window.confirm(t('chat.deleteMessageConfirm'))) {
    return;
  }
  deleteMessage(message.id);
}

onMounted(() => {
  startViewportSync();
  window.addEventListener('focus', syncNotificationPermission);
  void bootstrap().then(connectUnreadInbox);
});
function formatBubbleTime(value) {
  return value ? formatLocaleTime(value) : '';
}

onBeforeUnmount(() => {
  cancelMessageLongPress();
  window.removeEventListener('focus', syncNotificationPermission);
  disconnectUnreadInbox();
  disconnectSocket();
  stopViewportSync();
});
</script>

<template>
  <div
    class="chat-layout"
    :class="{
      'chat-layout--mobile': isMobileViewport,
      'chat-layout--mobile-list': isMobileViewport && mobileView === 'list',
      'chat-layout--mobile-chat': isMobileViewport && mobileView === 'chat'
    }"
  >
    <!-- Far-Left Navigation Sidebar -->
    <aside class="right-sidebar">
      <div class="right-sidebar-inner">
        <div class="right-sidebar-section right-sidebar-actions">
          <button
            type="button"
            class="right-sidebar-action right-sidebar-action--labeled tooltip"
            :class="{ 'right-sidebar-action--notification-active': notificationsEnabled }"
            :data-tooltip="notificationActionLabel"
            :aria-label="notificationActionLabel"
            :aria-pressed="notificationsEnabled"
            :disabled="notificationToggleDisabled"
            @click="toggleNotifications"
          >
            <Bell v-if="notificationsEnabled" :size="20" aria-hidden="true" />
            <BellOff v-else :size="20" aria-hidden="true" />
            <span class="right-sidebar-action__label">{{ notificationStateLabel }}</span>
          </button>
          <button
            v-if="showAdminEntry"
            type="button"
            class="right-sidebar-action right-sidebar-action--admin tooltip"
            :data-tooltip="t('nav.admin')"
            :aria-label="t('nav.admin')"
            @click="openAdmin"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
              <title>{{ t('nav.admin') }}</title>
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
            <span class="right-sidebar-action__label">{{ t('nav.admin') }}</span>
          </button>
        </div>

        <div class="right-sidebar-section right-sidebar-user-group">
          <button type="button" class="right-sidebar-user tooltip" :data-tooltip="t('nav.personalSettings')" :aria-label="t('nav.personalSettings')" @click="router.push('/settings')">
            <UiAvatar :src="session?.avatarUrl" :fallback="session?.displayName?.[0] || 'U'" size="sm" />
          </button>
          <button type="button" class="right-sidebar-action right-sidebar-action--danger tooltip" :data-tooltip="t('auth.signOut')" :aria-label="t('auth.signOut')" @click="logout">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
              <title>{{ t('auth.signOut') }}</title>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>

    <!-- Middle-Left Chat List Sidebar -->
    <aside class="left-sidebar">
      <div class="sidebar-inner">
        <div class="sidebar-header">
          <button
            type="button"
            class="header-action mobile-menu-action"
            :aria-label="t('nav.openNavigation')"
            :aria-expanded="showMobileNavigation"
            @click="showMobileNavigation = true"
          >
            <Menu :size="22" aria-hidden="true" />
          </button>
          <h1 class="brand-title">{{ store.site.siteName }}</h1>
          <div class="sidebar-header-actions">
            <button
              type="button"
              class="header-action"
              :title="t('chat.addPeople')"
              :aria-label="t('chat.addPeople')"
              aria-haspopup="dialog"
              :aria-expanded="showAddConversation"
              @click="openAddConversation"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <title>{{ t('chat.addPeople') }}</title>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="sidebar-divider"></div>

        <div class="sidebar-section sidebar-list">
          <div v-if="sidebarLoading" class="sidebar-hint">{{ t('chat.loadingConversations') }}</div>
          <div v-else-if="!conversationItems.length" class="sidebar-hint">{{ t('chat.noConversations') }}</div>
          <button
            type="button"
            v-for="item in conversationItems" :key="item.key"
            class="sidebar-item" :class="{ 'sidebar-item--active': activeRoomKey === item.key }"
            @click="selectConversation(item)"
          >
            <UiAvatar :src="item.avatarUrl" :fallback="item.fallback?.[0] || '?'" size="sm" />
            <div class="sidebar-label-group">
              <div class="sidebar-item__top">
                <strong class="sidebar-label">{{ item.title }}</strong>
                <span class="sidebar-label sidebar-item__time">{{ formatListTime(item.lastMessageAt) }}</span>
              </div>
              <div class="sidebar-item__bottom">
                <p class="sidebar-label sidebar-item__preview">{{ item.subtitle }}</p>
                <span
                  v-if="isRoomMuted(item)"
                  class="sidebar-muted-indicator"
                  :title="t('chat.muted')"
                  :aria-label="t('chat.muted')"
                >
                  <BellOff :size="14" aria-hidden="true" />
                </span>
                <span v-if="item.unreadCount > 0" class="sidebar-unread-badge">
                  {{ item.unreadCount > 99 ? '99+' : item.unreadCount }}
                </span>
              </div>
            </div>
          </button>
        </div>

		<PublicGroupDiscovery :items="publicGroupItems" @select="openPublicGroupPreview" />
      </div>
    </aside>

    <!-- Right Main Chat Window -->
    <main class="chat-main">
      <template v-if="activeRoom">
        <header class="chat-header">
          <button
            type="button"
            class="chat-header__back"
            :aria-label="t('chat.backToConversationList')"
            @click="returnToMobileConversationList"
          >
            <ArrowLeft :size="24" aria-hidden="true" />
          </button>
          <UiAvatar
            class="chat-header__avatar"
            :src="activeRoomAvatar"
            :fallback="roomLabel(activeRoom)?.[0] || '?'"
            size="sm"
          />
          <div class="chat-header__identity">
            <h2>{{ roomLabel(activeRoom) }}</h2>
            <span>{{ activeRoomSubtitle }}</span>
          </div>
          <div class="chat-header__actions">
            <div
              class="chat-header__status"
              :class="wsConnected ? 'online' : 'offline'"
              :title="wsConnected ? t('chat.connected') : t('chat.connecting')"
              :aria-label="wsConnected ? t('chat.connected') : t('chat.connecting')"
              role="status"
            ></div>
            <button
              type="button"
              class="chat-header__button"
              :class="{ 'chat-header__button--active': activeRoomMuted }"
              :title="activeRoomMuted ? t('chat.unmuteCurrent') : t('chat.muteCurrent')"
              :aria-label="activeRoomMuted ? t('chat.unmuteCurrent') : t('chat.muteCurrent')"
              :aria-pressed="activeRoomMuted"
              @click="toggleActiveRoomMute"
            >
              <BellOff v-if="activeRoomMuted" :size="19" aria-hidden="true" />
              <Bell v-else :size="19" aria-hidden="true" />
              <span>{{ activeRoomMuted ? t('chat.mutedShort') : t('chat.mute') }}</span>
            </button>
            <button
              v-if="activeRoom.kind !== 'dm'"
              type="button"
              class="chat-header__button"
              :aria-label="showMemberPanel ? t('chat.closeMembers') : t('chat.viewMembers')"
              :aria-expanded="showMemberPanel"
              @click="toggleMemberPanel"
            >
              <UsersRound :size="19" aria-hidden="true" />
              <span>{{ showMemberPanel ? t('chat.collapseMembers') : t('chat.members') }}</span>
            </button>
            <button
              v-if="canManageActiveRoom"
              type="button"
              class="chat-header__button"
              :aria-label="t('chat.openGroupSettings')"
              @click="openGroupEditor"
            >
              <Settings :size="19" aria-hidden="true" />
              <span>{{ t('chat.groupSettings') }}</span>
            </button>
          </div>
        </header>

        <section ref="messagesEl" class="chat-messages">
          <button v-if="messages.length" type="button" class="load-more-btn" @click="loadOlder">{{ t('chat.loadEarlier') }}</button>
          <div v-if="loading" class="messages-hint">{{ t('chat.loadingMessages') }}</div>
          <div v-else-if="!messages.length" class="messages-hint">{{ t('chat.noMessages') }}</div>

          <article
            v-for="msg in messages" :key="msg.id"
            class="message-row"
            :class="{
              'message-row--own': isOwnMessage(msg),
              'message-row--moderatable': canModerateMessages
            }"
          >
            <UiAvatar
              v-if="!isOwnMessage(msg)"
              class="message-avatar"
              :src="msg.sender.avatarUrl"
              :alt="msg.sender.displayName"
              :fallback="msg.sender.displayName"
              size="sm"
            />
            <div
              class="message-bubble"
              :class="{ 'message-bubble--with-attachment': msg.attachment }"
              @contextmenu="openMessageContextMenu($event, msg)"
              @pointerdown="startMessageLongPress($event, msg)"
              @pointermove="trackMessageLongPress"
              @pointerup="cancelMessageLongPress"
              @pointercancel="cancelMessageLongPress"
            >
              <div v-if="activeRoom.kind !== 'dm' && !isOwnMessage(msg)" class="message-sender-name">
                <span>{{ msg.sender.displayName }}</span>
                <SenderSourceBadge :source="msg.sender.source" />
              </div>
              <p v-if="msg.content">{{ msg.content }}</p>
              <MessageAttachment v-if="msg.attachment" :attachment="msg.attachment" />
              <span class="message-time">{{ formatBubbleTime(msg.createdAt) }}</span>
            </div>
          </article>
        </section>

        <MessageContextMenu
          :open="Boolean(messageMenu.message)"
          :x="messageMenu.x"
          :y="messageMenu.y"
          @close="closeMessageMenu"
          @delete="confirmDeleteMessage"
        />

        <footer class="chat-composer">
          <div v-if="pendingAttachment" class="composer-attachment">
            <PendingAttachmentPreview :attachment="pendingAttachment" @clear="clearAttachment" />
          </div>
          <div v-if="error" class="composer-error">{{ error }}</div>
          <div class="composer-row">
            <input ref="fileInputEl" type="file" class="composer-file-input" @change="uploadAttachment" />
            <button
              type="button"
              class="composer-btn"
              :disabled="!activeRoom || roomEveryoneMuted"
              :title="t('chat.addAttachment')"
              :aria-label="t('chat.addAttachment')"
              @click="openFilePicker"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
                <title>{{ t('chat.addAttachment') }}</title>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <UiTextarea
              v-model="composerText" class="composer-input" auto-grow :max-height="120" rows="1"
              :disabled="!activeRoom || roomEveryoneMuted"
              :placeholder="roomEveryoneMuted ? t('chat.muteEveryoneEnabled') : t('chat.messagePlaceholder')"
              @keydown="handleComposerKeydown"
            />
            <button
              type="button"
              class="composer-send"
              :disabled="sending || !activeRoom || roomEveryoneMuted || (!composerText.trim() && !pendingAttachment)"
              :title="t('chat.sendMessage')"
              :aria-label="t('chat.sendMessage')"
              @click="sendMessage"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#111b21" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <title>{{ t('chat.send') }}</title>
                <line x1="4" y1="12" x2="20" y2="12"/>
                <polyline points="14 6 20 12 14 18"/>
              </svg>
            </button>
          </div>
        </footer>
      </template>

      <div v-else class="chat-empty">
        <div class="empty-content">
          <div class="empty-brand">
            <span class="empty-title">{{ store.site.siteName }}</span>
          </div>
        </div>
      </div>
    </main>

    <div v-if="showMemberPanel" class="room-management-layer" @click.self="closeMemberPanel">
      <aside class="room-management-sidebar">
        <MemberPanel
          :room="activeRoom"
          :members="groupMembers"
          :loading="memberLoading"
          :can-manage="canManageActiveRoom"
          :invite-user-id="inviteUserId"
          :available-invite-users="availableInviteUsers"
          :invite-submitting="inviteSubmitting"
          @close="closeMemberPanel"
          @update:invite-user-id="inviteUserId = $event"
          @invite="inviteMember"
          @remove-member="removeMember"
          @delete-group="deleteGroup"
        />
      </aside>
    </div>

    <MobileNavigationDrawer
      :show="showMobileNavigation"
      :session="session"
      :show-admin="showAdminEntry"
      :notifications-enabled="notificationsEnabled"
      :notification-label="notificationActionLabel"
      :notification-disabled="notificationToggleDisabled"
      @close="closeMobileNavigation"
      @settings="navigateFromMobileDrawer(openSettings)"
      @admin="navigateFromMobileDrawer(openAdmin)"
      @notification="toggleNotifications"
      @logout="navigateFromMobileDrawer(logout)"
    />

    <AddConversationDialog
      :show="showAddConversation"
      :users="usersWithoutDm"
      :opening-dm-user-id="openingDmUserId"
      :error="error"
      @close="closeAddConversation"
      @create-group="startGroupCreation"
      @open-dm="openDm"
    />

    <CreateGroupDialog
      :show="showCreateGroup"
      :users="users"
      :form="createGroupForm"
      :submitting="creatingGroup"
      @close="closeCreateGroup"
      @toggle-member="toggleCreateGroupMember"
      @submit="createGroup"
    />

    <PublicGroupJoinDialog
      :show="Boolean(publicGroupPreview)"
      :channel="publicGroupPreview"
      :joining="joiningPublicGroup"
      @close="closePublicGroupPreview"
      @join="confirmPublicGroupJoin"
    />

    <GroupSettingsDialog
      :show="showGroupEditor"
      :room="activeRoom"
      :form="groupSettingsForm"
      :saving="groupSettingsSaving"
      :avatar-uploading="groupAvatarUploading"
      @close="closeGroupEditor"
      @upload-avatar="uploadGroupAvatar"
      @save="saveGroupSettings"
    />
  </div>
</template>

<style scoped>
.chat-layout {
  position: fixed;
  top: var(--chat-viewport-offset-top, 0px);
  left: 0;
  display: flex;
  width: 100%;
  height: var(--chat-viewport-height, 100dvh);
  min-height: 100dvh;
  overflow: hidden;
  background: #f0f1f2;
}

.left-sidebar {
  flex-shrink: 0;
  width: 350px;
  height: 100%;
  position: relative;
  z-index: 10;
  overflow: hidden;
  background: #ffffff;
  border-right: 1px solid #e9edef;
}

.left-sidebar .sidebar-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  background: #ffffff;
}

.mobile-menu-action {
  display: none;
}

.brand-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #1f2329;
  font-family: system-ui, -apple-system, sans-serif;
}

.sidebar-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-action {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #54656f;
  cursor: pointer;
  text-decoration: none;
  transition: background 150ms, color 150ms;
}

.header-action:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #111b21;
}

.header-action:active,
.sidebar-item:active,
.chat-header__button:active,
.composer-btn:active:not(:disabled),
.composer-send:active:not(:disabled) {
  background: rgba(0, 0, 0, 0.08);
}

.sidebar-section {
  flex-shrink: 0;
}

.sidebar-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
  touch-action: pan-y;
}

.sidebar-list::-webkit-scrollbar { width: 4px; }
.sidebar-list::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.15); border-radius: 2px; }

.sidebar-divider {
  flex-shrink: 0;
  height: 1px;
  background: #f0f2f5;
}

.sidebar-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 8px;
  font-size: 13px;
  color: #8696a0;
}

.sidebar-item svg {
  flex-shrink: 0;
}

.sidebar-label-group {
  flex: 1;
  min-width: 0;
}

/* biome-ignore lint/correctness/noUnknownPseudoClass: Vue deep selector */
.sidebar-item :deep(.ui-avatar) {
  flex-shrink: 0;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: calc(100% - 16px);
  margin: 4px 8px;
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 150ms;
  touch-action: manipulation;
}

.sidebar-item:hover {
  background: #f5f6f6;
}

.sidebar-item--active {
  background: #f0f2f5;
}

.sidebar-item__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.sidebar-item__top strong {
  font-size: 15px;
  font-weight: 500;
  color: #111b21;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-item__time {
  font-size: 12px;
  color: #667781;
  flex-shrink: 0;
}

.sidebar-item__preview {
  margin: 0;
  font-size: 13px;
  color: #667781;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-item__bottom {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  min-width: 0;
}

.sidebar-unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: #111b21;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.right-sidebar {
  flex-shrink: 0;
  width: 68px;
  height: 100%;
  position: relative;
  z-index: 10;
  overflow: hidden;
  background: #f0f2f5;
  border-right: 1px solid #e9edef;
}

.right-sidebar-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #f0f2f5;
  padding: 16px 8px;
  align-items: center;
}

.right-sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  width: 100%;
}

.right-sidebar-user-group {
  margin-top: auto;
}

.right-sidebar-action,
.right-sidebar-user {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #54656f;
  cursor: pointer;
  transition: background 150ms, color 150ms, transform 150ms;
  padding: 0;
  position: relative;
  touch-action: manipulation;
}

/* 头像按钮的悬停高亮跟随头像方形圆角，而非圆形 */
.right-sidebar-user {
  border-radius: var(--radius-control);
}

.sidebar-muted-indicator {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: #8696a0;
}

.right-sidebar-action:hover,
.right-sidebar-user:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #111b21;
}

.right-sidebar-action--danger:hover {
  background: rgba(254, 242, 242, 0.8);
  color: #dc2626;
}

.right-sidebar-action--admin,
.right-sidebar-action--labeled {
  width: 52px;
  height: 56px;
  gap: 4px;
  border-radius: 8px;
}

.right-sidebar-action--admin {
  flex-direction: column;
}

.right-sidebar-action--labeled {
  flex-direction: column;
}

.right-sidebar-action--notification-active {
  background: rgba(15, 23, 42, 0.06);
  color: #111b21;
}

.right-sidebar-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.right-sidebar-action__label {
  max-width: 100%;
  font-size: 10px;
  line-height: 1.1;
  overflow-wrap: anywhere;
  text-align: center;
}

.tooltip {
  position: relative;
}

.tooltip::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 120%;
  top: 50%;
  transform: translateY(-50%);
  background: #333;
  color: #fff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 150ms ease, transform 150ms ease;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.tooltip:hover::after {
  opacity: 1;
  transform: translateY(-50%) translateX(4px);
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #f0f1f2;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: #f0f2f5;
  border-bottom: 1px solid #e9edef;
}

.chat-header__back {
  display: none;
}

.chat-header__avatar {
  flex: 0 0 auto;
}

.chat-header__identity {
  display: grid;
  flex: 1;
  gap: 2px;
  min-width: 0;
}

.chat-header__identity span {
  overflow: hidden;
  color: #667781;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.chat-header__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid #d8dee2;
  border-radius: 8px;
  background: #fff;
  color: #54656f;
  font-size: 12px;
  cursor: pointer;
  transition: background 150ms, color 150ms, border-color 150ms;
  touch-action: manipulation;
}

.chat-header__button:hover {
  background: #f5f7fa;
  border-color: #c7d0d6;
  color: #111b21;
}

.chat-header__button--active {
  border-color: rgba(15, 23, 42, 0.2);
  background: rgba(15, 23, 42, 0.06);
  color: #111b21;
}

.header-action:focus-visible {
  outline: 2px solid #111b21;
  outline-offset: 2px;
}

.chat-header h2 {
  margin: 0;
  padding: 0;
  font-size: 16px;
  font-weight: 600;
  color: #111b21;
  background: transparent;
  border-radius: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-header__status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d1d5db;
}

.chat-header__status.online {
  background: #10b981;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  touch-action: pan-y;
}

.chat-messages::-webkit-scrollbar { width: 6px; }
.chat-messages::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.15); border-radius: 3px; }

.load-more-btn {
  display: block;
  margin: 0 auto 16px;
  padding: 6px 16px;
  border: 1px solid #e8ecf0;
  border-radius: 8px;
  background: #fff;
  color: #54656f;
  font-size: 12px;
  cursor: pointer;
  transition: background 150ms, border-color 150ms;
}

.load-more-btn:hover {
  background: #f5f7fa;
  border-color: #d1d5db;
}

.messages-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  color: #8696a0;
  font-size: 14px;
}

.message-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: 12px;
  width: 100%;
  justify-content: flex-start;
}

.message-row--own {
  justify-content: flex-end;
}

.message-avatar {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  box-shadow: none;
}

.message-bubble {
  max-width: 65%;
  padding: 6px 10px 7px;
  border-radius: 8px;
  background: #ffffff;
  border: none;
  position: relative;
  word-break: break-word;
  box-shadow: 0 1px 0.5px rgba(11,20,26,.13);
}

.message-row--moderatable .message-bubble {
  touch-action: pan-y;
  -webkit-touch-callout: none;
}

.message-bubble--with-attachment {
  padding-bottom: 20px;
}

.message-row--own .message-bubble {
  background: #dbeafe;
}

.message-sender-name {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 600;
  color: #111b21;
  margin-bottom: 4px;
}

.message-time {
  position: absolute;
  right: 8px;
  bottom: 6px;
  font-size: 11px;
  line-height: 1;
  color: #667781;
  white-space: nowrap;
  user-select: none;
}

.message-bubble p {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.45;
  color: #111b21;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 短消息在末行预留时间戳宽度，避免气泡收缩后正文与右下角时间重叠。 */
.message-bubble:not(.message-bubble--with-attachment) p::after {
  content: '';
  display: inline-block;
  width: 3.5em;
  height: 0;
}

.chat-composer {
  margin-top: auto;
  margin-bottom: 0;
  padding: 10px 16px;
  background: #f0f2f5;
  border-top: 1px solid #e9edef;
  position: relative;
  z-index: 2;
  margin-left: 0;
  margin-right: 0;
  border-radius: 0;
  max-width: none;
  width: auto;
}

.composer-attachment {
  min-width: 0;
  margin-bottom: 10px;
}

.composer-error {
  margin-bottom: 8px;
  font-size: 12px;
  color: #dc2626;
  text-align: center;
}

.composer-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.composer-file-input {
  display: none;
}

.composer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #54656f;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms, color 150ms;
  touch-action: manipulation;
}

.composer-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
  color: #111b21;
}

.composer-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.composer-input {
  flex: 1;
  min-width: 0;
}

/* biome-ignore lint/correctness/noUnknownPseudoClass: Vue deep selector */
:deep(.composer-input.ui-textarea) {
  width: 100%;
  min-width: 0;
  border: none;
  background: #ffffff;
  box-shadow: none;
  min-height: 40px;
  border-radius: 8px;
  padding: 10px 16px;
  color: #111b21;
  font-size: 15px;
  resize: none;
}

/* biome-ignore lint/correctness/noUnknownPseudoClass: Vue deep selector */
:deep(.composer-input.ui-textarea:focus) {
  border-color: transparent;
  box-shadow: none;
}

/* biome-ignore lint/correctness/noUnknownPseudoClass: Vue deep selector */
:deep(.composer-input.ui-textarea::placeholder) {
  color: #8696a0;
}

.composer-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms;
  touch-action: manipulation;
}

.composer-send:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
}

.composer-send:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.chat-empty {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.3;
  user-select: none;
}

.empty-title {
  font-size: 28px;
  font-weight: 400;
  letter-spacing: 0.02em;
  color: #111b21;
}

.room-management-layer {
  width: 340px;
  flex-shrink: 0;
  height: 100%;
}

.room-management-sidebar {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  background: #f7f9fa;
  border-left: 1px solid #e9edef;
  touch-action: pan-y;
}

@media (max-width: 960px) {
  .chat-layout {
    min-height: 0;
    background: #ffffff;
  }

  .right-sidebar {
    display: none;
  }

  .left-sidebar {
    width: 100%;
    max-width: none;
    border-right: 0;
  }

  .chat-main {
    width: 100%;
    flex: 0 0 100%;
  }

  .chat-layout--mobile-list .chat-main,
  .chat-layout--mobile-chat .left-sidebar {
    display: none;
  }

  .sidebar-header {
    min-height: 64px;
    gap: 8px;
    padding:
      max(8px, env(safe-area-inset-top))
      max(12px, env(safe-area-inset-right))
      8px
      max(8px, env(safe-area-inset-left));
  }

  .mobile-menu-action {
    display: flex;
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
  }

  .brand-title {
    flex: 1;
    min-width: 0;
    font-size: 21px;
  }

  .header-action {
    flex-basis: 44px;
    width: 44px;
    height: 44px;
  }

  .sidebar-header-actions {
    gap: 0;
  }

  .sidebar-list {
    padding-bottom: max(8px, env(safe-area-inset-bottom));
    overscroll-behavior: contain;
  }

  .sidebar-item {
    width: 100%;
    min-height: 68px;
    margin: 0;
    padding: 11px max(16px, env(safe-area-inset-right)) 11px max(16px, env(safe-area-inset-left));
    border-radius: 0;
  }

  .sidebar-item + .sidebar-item {
    border-top: 1px solid #f0f2f5;
  }

  .chat-header {
    min-height: 64px;
    gap: 8px;
    padding:
      max(8px, env(safe-area-inset-top))
      max(8px, env(safe-area-inset-right))
      8px
      max(4px, env(safe-area-inset-left));
  }

  .chat-header__back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: #111b21;
    touch-action: manipulation;
  }

  .chat-header__back:active {
    background: rgba(0, 0, 0, 0.08);
  }

  .chat-header__avatar {
    flex: 0 0 36px;
  }

  .chat-header__identity h2 {
    font-size: 15px;
  }

  .chat-header__button {
    width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
  }

  .chat-header__button span {
    display: none;
  }

  .chat-header__status {
    width: 7px;
    height: 7px;
  }

  .chat-header__actions {
    gap: 0;
  }

  .chat-messages {
    padding: 14px max(10px, env(safe-area-inset-right)) 18px max(10px, env(safe-area-inset-left));
    scrollbar-gutter: auto;
  }

  .message-row {
    margin-bottom: 8px;
  }

  .message-bubble {
    max-width: 88%;
  }

  .chat-composer {
    padding:
      8px
      max(8px, env(safe-area-inset-right))
      max(8px, env(safe-area-inset-bottom))
      max(8px, env(safe-area-inset-left));
  }

  .composer-row {
    gap: 4px;
  }

  .composer-btn,
  .composer-send {
    width: 44px;
    height: 44px;
  }

  /* biome-ignore lint/correctness/noUnknownPseudoClass: Vue deep selector */
  :deep(.composer-input.ui-textarea) {
    min-height: 44px;
    padding: 11px 12px;
    font-size: 16px;
  }

  .room-management-layer {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    justify-content: flex-end;
    width: auto;
    height: auto;
    padding-left: 48px;
    background: rgba(11, 20, 26, 0.35);
  }

  .room-management-sidebar {
    width: min(360px, 100%);
    height: 100%;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    box-shadow: -12px 0 30px rgba(11, 20, 26, 0.16);
  }
}

@media (max-width: 380px) {
  .chat-header__avatar,
  .chat-header__status {
    display: none;
  }

  .chat-header {
    gap: 4px;
  }

  .message-bubble {
    max-width: 92%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .header-action,
  .sidebar-item,
  .chat-header__button,
  .composer-btn,
  .composer-send {
    transition: none;
  }
}
</style>
