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
  <section class="grid gap-4">
    <div class="flex items-center gap-3">
      <span class="grid h-[38px] w-[38px] place-items-center bg-[rgb(var(--v-theme-primary))] text-[rgb(var(--v-theme-on-primary))]"><Server :size="18" /></span>
      <div>
        <p class="m-0 text-[0.78rem] text-[rgba(var(--v-theme-on-surface),0.68)]">Emby Server</p>
        <h2 class="m-0 mt-[3px] text-[1.05rem] font-500 leading-[1.25] tracking-0">
          {{ session ? session.username : '连接媒体服务器' }}
        </h2>
      </div>
    </div>

    <form v-if="!session" class="grid gap-4" @submit.prevent="submitLogin">
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

    <div v-else class="flex items-center justify-between gap-3">
      <p class="m-0 text-[0.78rem] text-[rgba(var(--v-theme-on-surface),0.68)]">{{ session.serverUrl }}</p>
      <VBtn variant="tonal" type="button" @click="emit('logout')">
        <template #prepend>
          <LogOut :size="17" />
        </template>
        退出
      </VBtn>
    </div>
  </section>
</template>
