<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { Check, Edit3, LogOut, Plus, Trash2, X } from 'lucide-vue-next'
import {
  PLAYBACK_QUALITY_OPTIONS,
  type EmbySession,
  type PlaybackPreferences,
} from '../composables/useEmbyClient'

type DialogMode = 'add' | 'edit'

const props = defineProps<{
  session: Readonly<EmbySession | null>
  accounts: readonly EmbySession[]
  defaultPlaybackUserAgent: string
  isBusy: boolean
  playbackPreferences: Readonly<PlaybackPreferences>
  playbackUserAgent: string
  errorMessage: string
}>()

const emit = defineEmits<{
  login: [serverUrl: string, username: string, password: string, displayName?: string]
  clearLocalAccounts: []
  logout: []
  removeAccount: [accountId: string]
  signOutCurrentOnly: []
  switchAccount: [accountId: string]
  updateAccount: [accountId: string, updates: { displayName: string; serverUrl: string }]
  updatePlaybackPreferences: [preferences: PlaybackPreferences]
  updatePlaybackUserAgent: [userAgent: string]
}>()

const isDialogOpen = shallowRef(false)
const isClearAccountsDialogOpen = shallowRef(false)
const dialogMode = shallowRef<DialogMode>('add')
const editingAccountId = shallowRef('')
const form = reactive({
  displayName: '',
  serverUrl: 'http://localhost:8096',
  username: '',
  password: '',
})
const userAgentDraft = shallowRef(props.playbackUserAgent)
const playbackPreferenceDraft = reactive<PlaybackPreferences>({
  preferredAudioLanguage: props.playbackPreferences.preferredAudioLanguage,
  preferredSubtitleLanguage: props.playbackPreferences.preferredSubtitleLanguage,
  defaultForceTranscode: props.playbackPreferences.defaultForceTranscode,
  defaultQualityPreset: props.playbackPreferences.defaultQualityPreset,
  customMaxStreamingBitrate: props.playbackPreferences.customMaxStreamingBitrate,
})

const dialogTitle = computed(() =>
  dialogMode.value === 'add' ? '添加 Emby 服务' : '编辑服务器',
)
const canSubmit = computed(() => {
  if (dialogMode.value === 'edit') {
    return form.displayName.trim() && form.serverUrl.trim()
  }

  return form.serverUrl.trim() && form.username.trim()
})

watch(isDialogOpen, (nextOpen) => {
  if (!nextOpen) {
    editingAccountId.value = ''
  }
})

watch(
  () => props.playbackUserAgent,
  (nextUserAgent) => {
    userAgentDraft.value = nextUserAgent
  },
)

watch(
  () => props.playbackPreferences,
  (nextPreferences) => {
    playbackPreferenceDraft.preferredAudioLanguage = nextPreferences.preferredAudioLanguage
    playbackPreferenceDraft.preferredSubtitleLanguage = nextPreferences.preferredSubtitleLanguage
    playbackPreferenceDraft.defaultForceTranscode = nextPreferences.defaultForceTranscode
    playbackPreferenceDraft.defaultQualityPreset = nextPreferences.defaultQualityPreset
    playbackPreferenceDraft.customMaxStreamingBitrate = nextPreferences.customMaxStreamingBitrate
  },
)

function openAddDialog() {
  dialogMode.value = 'add'
  editingAccountId.value = ''
  form.displayName = ''
  form.serverUrl = 'http://localhost:8096'
  form.username = ''
  form.password = ''
  isDialogOpen.value = true
}

function openEditDialog(account: EmbySession) {
  dialogMode.value = 'edit'
  editingAccountId.value = account.id
  form.displayName = account.displayName
  form.serverUrl = account.serverUrl
  form.username = account.username
  form.password = ''
  isDialogOpen.value = true
}

async function submitDialog() {
  if (!canSubmit.value || props.isBusy) {
    return
  }

  if (dialogMode.value === 'edit') {
    emit('updateAccount', editingAccountId.value, {
      displayName: form.displayName,
      serverUrl: form.serverUrl,
    })
    isDialogOpen.value = false
    return
  }

  emit('login', form.serverUrl, form.username, form.password, form.displayName)
  isDialogOpen.value = false
}

function formatServer(serverUrl: string) {
  try {
    return new URL(serverUrl).host
  } catch {
    return serverUrl
  }
}

function savePlaybackUserAgent() {
  emit('updatePlaybackUserAgent', userAgentDraft.value)
}

function resetPlaybackUserAgent() {
  userAgentDraft.value = props.defaultPlaybackUserAgent
  emit('updatePlaybackUserAgent', props.defaultPlaybackUserAgent)
}

function savePlaybackPreferences() {
  emit('updatePlaybackPreferences', {
    preferredAudioLanguage: playbackPreferenceDraft.preferredAudioLanguage,
    preferredSubtitleLanguage: playbackPreferenceDraft.preferredSubtitleLanguage,
    defaultForceTranscode: playbackPreferenceDraft.defaultForceTranscode,
    defaultQualityPreset: playbackPreferenceDraft.defaultQualityPreset,
    customMaxStreamingBitrate: playbackPreferenceDraft.customMaxStreamingBitrate,
  })
}

function resetPlaybackPreferences() {
  playbackPreferenceDraft.preferredAudioLanguage = ''
  playbackPreferenceDraft.preferredSubtitleLanguage = ''
  playbackPreferenceDraft.defaultForceTranscode = false
  playbackPreferenceDraft.defaultQualityPreset = 'original'
  playbackPreferenceDraft.customMaxStreamingBitrate = 12_000_000
  savePlaybackPreferences()
}

function confirmClearLocalAccounts() {
  isClearAccountsDialogOpen.value = false
  emit('clearLocalAccounts')
}
</script>

<template>
  <section class="settings-view">
    <div class="settings-view__header">
      <div>
        <h2 class="section-title">服务器</h2>
      </div>
      <VBtn color="primary" type="button" @click="openAddDialog">
        <template #prepend>
          <Plus :size="17" />
        </template>
        添加服务
      </VBtn>
    </div>

    <VCard class="settings-card" variant="flat">
      <div class="settings-card__heading">
        <div>
          <h3>已保存服务器</h3>
        </div>
        <VBtn
          v-if="session"
          variant="tonal"
          type="button"
          @click="emit('signOutCurrentOnly')"
        >
          <template #prepend>
            <LogOut :size="16" />
          </template>
          断开当前
        </VBtn>
      </div>

      <div v-if="accounts.length" class="account-list">
        <VCard
          v-for="account in accounts"
          :key="account.id"
          class="account-row"
          :class="{ 'account-row--active': session?.id === account.id }"
          variant="flat"
        >
          <div class="account-row__main">
            <strong>{{ account.displayName }}</strong>
            <span>{{ account.username }} · {{ formatServer(account.serverUrl) }}</span>
          </div>
          <div class="account-row__actions">
            <VBtn
              type="button"
              icon
              variant="tonal"
              size="small"
              :disabled="session?.id === account.id || isBusy"
              title="切换"
              @click="emit('switchAccount', account.id)"
            >
              <Check :size="16" />
            </VBtn>
            <VBtn
              type="button"
              icon
              variant="tonal"
              size="small"
              title="编辑"
              @click="openEditDialog(account)"
            >
              <Edit3 :size="16" />
            </VBtn>
            <VBtn
              type="button"
              icon
              variant="tonal"
              size="small"
              color="error"
              title="删除"
              @click="emit('removeAccount', account.id)"
            >
              <Trash2 :size="16" />
            </VBtn>
          </div>
        </VCard>
      </div>
      <VSheet v-else class="empty-settings">
        <span>还没有保存的 Emby 服务</span>
      </VSheet>
    </VCard>

    <VCard class="settings-card" variant="flat">
      <div class="settings-card__heading">
        <div>
          <h3>播放请求</h3>
          <p>自定义 mpv 拉流时使用的 User-Agent。</p>
        </div>
      </div>

      <div class="playback-agent-form">
        <VTextField
          v-model.trim="userAgentDraft"
          label="播放 User-Agent"
          :placeholder="defaultPlaybackUserAgent"
          density="comfortable"
          variant="solo-filled"
          hide-details
        />
        <div class="playback-agent-form__actions">
          <VBtn variant="tonal" type="button" @click="resetPlaybackUserAgent">
            恢复默认
          </VBtn>
          <VBtn color="primary" type="button" @click="savePlaybackUserAgent">
            保存 UA
          </VBtn>
        </div>
      </div>
      <p class="settings-note">
        该设置只影响 mpv/libmpv 播放流请求；WebView 的普通 API 请求无法可靠自定义 User-Agent。
      </p>
    </VCard>

    <VCard class="settings-card" variant="flat">
      <div class="settings-card__heading">
        <div>
          <h3>默认播放偏好</h3>
          <p>进入播放器时自动选择匹配的音轨、字幕和转码策略。</p>
        </div>
      </div>

      <div class="playback-preferences-form">
        <VTextField
          v-model.trim="playbackPreferenceDraft.preferredAudioLanguage"
          label="默认音轨语言"
          placeholder="例如：chi / zho / eng / jpn"
          density="comfortable"
          variant="solo-filled"
          hide-details
        />
        <VTextField
          v-model.trim="playbackPreferenceDraft.preferredSubtitleLanguage"
          label="默认字幕语言"
          placeholder="留空则默认关闭字幕"
          density="comfortable"
          variant="solo-filled"
          hide-details
        />
        <VSwitch
          v-model="playbackPreferenceDraft.defaultForceTranscode"
          class="playback-preferences-form__switch"
          color="primary"
          label="默认强制转码"
          hide-details
        />
        <VSelect
          v-model="playbackPreferenceDraft.defaultQualityPreset"
          label="默认播放质量"
          :items="PLAYBACK_QUALITY_OPTIONS"
          item-title="title"
          item-value="value"
          density="comfortable"
          variant="solo-filled"
          hide-details
        />
        <VTextField
          v-if="playbackPreferenceDraft.defaultQualityPreset === 'custom'"
          v-model.number="playbackPreferenceDraft.customMaxStreamingBitrate"
          label="自定义最大码率（bps）"
          type="number"
          min="1000000"
          max="120000000"
          step="1000000"
          density="comfortable"
          variant="solo-filled"
          hide-details
        />
        <div class="playback-agent-form__actions">
          <VBtn variant="tonal" type="button" @click="resetPlaybackPreferences">
            恢复默认
          </VBtn>
          <VBtn color="primary" type="button" @click="savePlaybackPreferences">
            保存偏好
          </VBtn>
        </div>
      </div>
      <p class="settings-note">
        语言匹配会同时检查 Emby 返回的 Language 和 DisplayTitle；例如中文可尝试 chi、zho 或 chinese。
      </p>
    </VCard>

    <VCard class="settings-card settings-card--danger" variant="flat">
      <div class="settings-card__heading">
        <div>
          <h3>本地安全存储</h3>
          <p>已保存账号的访问令牌存放在系统 Keychain，不再写入浏览器 localStorage。</p>
        </div>
        <VBtn
          color="error"
          variant="tonal"
          type="button"
          :disabled="isBusy || accounts.length === 0"
          @click="isClearAccountsDialogOpen = true"
        >
          <template #prepend>
            <Trash2 :size="16" />
          </template>
          清除本地账号
        </VBtn>
      </div>
      <p class="settings-note">
        清除后会删除 Keychain 中的账号凭据、旧版明文账号缓存和当前登录状态；服务器端账号不会被删除。
      </p>
    </VCard>

    <VAlert v-if="errorMessage" type="error" variant="tonal">{{ errorMessage }}</VAlert>

    <VDialog v-model="isDialogOpen" max-width="460">
      <VCard class="server-dialog">
        <div class="server-dialog__header">
          <h3>{{ dialogTitle }}</h3>
          <VBtn icon variant="tonal" size="small" type="button" @click="isDialogOpen = false">
            <X :size="17" />
          </VBtn>
        </div>

        <form class="server-dialog__form" @submit.prevent="submitDialog">
          <VTextField
            v-if="dialogMode === 'edit'"
            v-model.trim="form.displayName"
            label="显示名称"
          />

          <VTextField
            v-if="dialogMode === 'add'"
            v-model.trim="form.displayName"
            label="显示名称（可选）"
            placeholder="例如：家里 NAS"
          />

          <VTextField
            v-model.trim="form.serverUrl"
            label="服务器地址"
            placeholder="http://192.168.1.10:8096"
          />

          <VTextField
            v-if="dialogMode === 'add'"
            v-model.trim="form.username"
            label="用户名"
            autocomplete="username"
          />

          <VTextField
            v-if="dialogMode === 'add'"
            v-model="form.password"
            label="密码（可选）"
            type="password"
            autocomplete="current-password"
          />

          <div class="server-dialog__actions">
            <VBtn variant="tonal" type="button" @click="isDialogOpen = false">
              取消
            </VBtn>
            <VBtn color="primary" type="submit" :disabled="!canSubmit || isBusy" :loading="isBusy">
              {{ dialogMode === 'add' ? '添加并登录' : '保存' }}
            </VBtn>
          </div>
        </form>
      </VCard>
    </VDialog>

    <VDialog v-model="isClearAccountsDialogOpen" max-width="440">
      <VCard class="server-dialog">
        <div class="server-dialog__header">
          <h3>清除本地账号？</h3>
          <VBtn icon variant="tonal" size="small" type="button" @click="isClearAccountsDialogOpen = false">
            <X :size="17" />
          </VBtn>
        </div>

        <p class="settings-note">
          这会从本机 Keychain 删除所有已保存 Emby token，并清空当前会话。之后需要重新登录。
        </p>

        <div class="server-dialog__actions">
          <VBtn variant="tonal" type="button" @click="isClearAccountsDialogOpen = false">
            取消
          </VBtn>
          <VBtn color="error" type="button" :loading="isBusy" @click="confirmClearLocalAccounts">
            确认清除
          </VBtn>
        </div>
      </VCard>
    </VDialog>
  </section>
</template>

<style scoped>
.settings-view {
  display: grid;
  align-content: start;
  gap: 14px;
  max-width: 860px;
  animation: surface-enter var(--motion-emphasized) both;
}

.settings-view__header,
.settings-card__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  background: color-mix(in srgb, var(--color-panel) 86%, transparent);
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 10px;
  box-shadow: none;
}

.settings-card--danger {
  border-color: color-mix(in srgb, rgb(var(--v-theme-error)) 28%, rgb(255 255 255 / 7%));
}

.settings-card__heading h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.25;
}

.settings-card__heading p,
.settings-note {
  margin: 4px 0 0;
  color: var(--color-muted);
  font-size: 0.84rem;
  line-height: 1.4;
}

.playback-agent-form {
  display: grid;
  gap: 10px;
}

.playback-preferences-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.playback-preferences-form__switch {
  align-self: center;
}

.playback-agent-form__actions {
  display: flex;
  justify-content: end;
  gap: 8px;
}

.account-list {
  display: grid;
  gap: 10px;
}

.account-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 60px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--color-secondary-container) 52%, transparent);
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 8px;
  transition:
    background-color var(--motion-fast),
    border-color var(--motion-fast),
    transform var(--motion-fast);
}

.account-row:hover {
  background: color-mix(in srgb, var(--color-secondary-container) 78%, transparent);
  transform: translateY(-1px);
}

.account-row--active {
  border-color: color-mix(in srgb, var(--color-signal) 55%, transparent);
}

.account-row__main {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.account-row__main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-row__main span {
  overflow-wrap: anywhere;
}

.account-row__main strong {
  color: var(--color-text);
  font-size: 0.98rem;
  font-weight: 650;
  line-height: 1.3;
}

.account-row__main span,
.empty-settings {
  color: var(--color-muted);
  font-size: 0.84rem;
  line-height: 1.35;
}

.account-row__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.server-dialog {
  display: grid;
  gap: 16px;
  padding: 18px;
  background: var(--color-panel);
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 10px;
  box-shadow: var(--elevation-3);
  animation: dialog-enter var(--motion-emphasized) both;
}

.server-dialog__form {
  display: grid;
  gap: 12px;
}

.server-dialog__header,
.server-dialog__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.server-dialog__header h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 1.32rem;
  font-weight: 650;
  line-height: 1.25;
}

.server-dialog__actions {
  justify-content: end;
}

@keyframes dialog-enter {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 620px) {
  .settings-view__header,
  .settings-card__heading,
  .account-row {
    align-items: stretch;
    flex-direction: column;
  }

  .account-row__actions {
    justify-content: flex-end;
  }

  .playback-preferences-form {
    grid-template-columns: 1fr;
  }
}
</style>
