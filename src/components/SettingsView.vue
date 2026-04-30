<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { Check, Edit3, LogOut, Plus, Trash2, X } from 'lucide-vue-next'
import type { EmbySession } from '../composables/useEmbyClient'

type DialogMode = 'add' | 'edit'

const props = defineProps<{
  session: Readonly<EmbySession | null>
  accounts: readonly EmbySession[]
  isBusy: boolean
  errorMessage: string
}>()

const emit = defineEmits<{
  login: [serverUrl: string, username: string, password: string, displayName?: string]
  logout: []
  removeAccount: [accountId: string]
  signOutCurrentOnly: []
  switchAccount: [accountId: string]
  updateAccount: [accountId: string, updates: { displayName: string; serverUrl: string }]
}>()

const isDialogOpen = shallowRef(false)
const dialogMode = shallowRef<DialogMode>('add')
const editingAccountId = shallowRef('')
const form = reactive({
  displayName: '',
  serverUrl: 'http://localhost:8096',
  username: '',
  password: '',
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

.settings-card__heading h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.25;
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
}
</style>
