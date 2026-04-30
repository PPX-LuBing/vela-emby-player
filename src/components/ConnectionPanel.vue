<script setup lang="ts">
import { computed, reactive } from 'vue'
import { LogIn, LogOut, Server } from 'lucide-vue-next'
import type { EmbySession } from '../composables/useEmbyClient'

const props = defineProps<{
  session: Readonly<EmbySession | null>
  isBusy: boolean
}>()

const emit = defineEmits<{
  login: [serverUrl: string, username: string, password: string, displayName?: string]
  logout: []
}>()

const form = reactive({
  serverUrl: 'http://localhost:8096',
  username: '',
  password: '',
})

const canSubmit = computed(
  () => form.serverUrl.trim() && form.username.trim(),
)

function submitLogin() {
  if (!canSubmit.value || props.isBusy) {
    return
  }

  emit('login', form.serverUrl, form.username, form.password)
}
</script>

<template>
  <section class="connection-panel">
    <div class="connection-panel__heading">
      <span class="connection-panel__icon"><Server :size="18" /></span>
      <div>
        <p class="connection-panel__eyebrow">Emby Server</p>
        <h2 class="connection-panel__title">
          {{ session ? session.username : '连接媒体服务器' }}
        </h2>
      </div>
    </div>

    <form v-if="!session" class="connection-panel__form" @submit.prevent="submitLogin">
      <VTextField
        v-model.trim="form.serverUrl"
        label="服务器地址"
        type="url"
        placeholder="http://192.168.1.10:8096"
        autocomplete="url"
      />

      <VTextField
        v-model.trim="form.username"
        label="用户名"
        type="text"
        autocomplete="username"
      />

      <VTextField
        v-model="form.password"
        label="密码（可选）"
        type="password"
        autocomplete="current-password"
      />

      <VBtn color="primary" type="submit" :disabled="!canSubmit || isBusy" :loading="isBusy">
        <template #prepend>
          <LogIn :size="18" />
        </template>
        登录
      </VBtn>
    </form>

    <div v-else class="connection-panel__session">
      <p class="connection-panel__server">{{ session.serverUrl }}</p>
      <VBtn variant="tonal" type="button" @click="emit('logout')">
        <template #prepend>
          <LogOut :size="17" />
        </template>
        退出
      </VBtn>
    </div>
  </section>
</template>

<style scoped>
.connection-panel {
  display: grid;
  gap: 16px;
  animation: surface-enter var(--motion-emphasized) both;
}

.connection-panel__heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.connection-panel__icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  color: #ffffff;
  background: var(--color-primary-container);
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
}

.connection-panel__eyebrow,
.connection-panel__server {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.78rem;
}

.connection-panel__title {
  margin: 3px 0 0;
  color: var(--color-text);
  font-size: 1.05rem;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: 0;
}

.connection-panel__form {
  display: grid;
  gap: 16px;
}

.connection-panel__session {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

</style>
