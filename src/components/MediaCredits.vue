<script setup lang="ts">
import { computed } from 'vue'
import { Building2, Clapperboard, PenLine, UserRound } from 'lucide-vue-next'
import type { EmbyItem, EmbyPerson, EmbyStudio } from '../composables/useEmbyClient'

const props = defineProps<{
  item: Readonly<EmbyItem>
}>()

const emit = defineEmits<{
  searchPerson: [name: string]
}>()

const directors = computed(() => peopleByType(['director']))
const writers = computed(() => peopleByType(['writer']))
const cast = computed(() => peopleByType(['actor', 'gueststar']).slice(0, 14))
const studios = computed(() => uniqueStudios(props.item.Studios ?? []))
const hasCredits = computed(() => Boolean(
  directors.value.length || writers.value.length || cast.value.length || studios.value.length,
))

function searchPerson(person: EmbyPerson) {
  emit('searchPerson', person.Name)
}

function peopleByType(types: readonly string[]) {
  const acceptedTypes = new Set(types)
  return uniquePeople((props.item.People ?? []).filter((person) => {
    const personType = person.Type?.toLowerCase().replace(/\s+/g, '') ?? ''
    return acceptedTypes.has(personType)
  }))
}

function uniquePeople(people: readonly EmbyPerson[]) {
  const seen = new Set<string>()
  const result: EmbyPerson[] = []
  for (const person of people) {
    const key = person.Name.trim().toLowerCase()
    if (!key || seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(person)
  }
  return result
}

function uniqueStudios(studios: readonly EmbyStudio[]) {
  const seen = new Set<string>()
  const result: EmbyStudio[] = []
  for (const studio of studios) {
    const key = studio.Name.trim().toLowerCase()
    if (!key || seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(studio)
  }
  return result
}
</script>

<template>
  <section v-if="hasCredits" class="grid gap-4 bg-[rgb(var(--v-theme-surface))] p-5">
    <div class="flex items-end justify-between gap-4">
      <div>
        <p class="m-0 mb-1 text-[0.72rem] font-500 tracking-[0.11em] uppercase">Credits</p>
        <h3 class="m-0 text-[1.06rem] font-500 leading-[1.25]">演职员与制作信息</h3>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4 lt-md:grid-cols-1">
      <div v-if="directors.length" class="grid content-start gap-2.5 min-w-0">
        <h4 class="m-0 flex items-center gap-[7px] text-[0.82rem] font-500 text-[rgba(255,255,255,0.72)]"><Clapperboard :size="16" />导演</h4>
        <div class="flex min-w-0 flex-wrap gap-2">
          <button
            v-for="person in directors"
            :key="`director-${person.Name}`"
            class="cursor-pointer border border-[rgba(var(--v-border-color),var(--v-border-opacity))] bg-[rgba(var(--v-theme-on-surface),0.08)] px-2.5 py-[7px] text-inherit text-[0.8rem] hover:border-[rgb(var(--v-theme-primary))]"
            type="button"
            :data-person-name="person.Name"
            @click="searchPerson(person)"
          >
            {{ person.Name }}
          </button>
        </div>
      </div>

      <div v-if="writers.length" class="grid content-start gap-2.5 min-w-0">
        <h4 class="m-0 flex items-center gap-[7px] text-[0.82rem] font-500 text-[rgba(255,255,255,0.72)]"><PenLine :size="16" />编剧</h4>
        <div class="flex min-w-0 flex-wrap gap-2">
          <button
            v-for="person in writers"
            :key="`writer-${person.Name}`"
            class="cursor-pointer border border-[rgba(var(--v-border-color),var(--v-border-opacity))] bg-[rgba(var(--v-theme-on-surface),0.08)] px-2.5 py-[7px] text-inherit text-[0.8rem] hover:border-[rgb(var(--v-theme-primary))]"
            type="button"
            :data-person-name="person.Name"
            @click="searchPerson(person)"
          >
            {{ person.Name }}
          </button>
        </div>
      </div>

      <div v-if="cast.length" class="col-span-full grid content-start gap-2.5 min-w-0">
        <h4 class="m-0 flex items-center gap-[7px] text-[0.82rem] font-500 text-[rgba(255,255,255,0.72)]"><UserRound :size="16" />演员</h4>
        <div class="flex min-w-0 flex-wrap gap-2">
          <button
            v-for="person in cast"
            :key="`cast-${person.Name}`"
            class="flex w-[min(100%,220px)] cursor-pointer items-center gap-2.5 border border-[rgba(var(--v-border-color),var(--v-border-opacity))] bg-[rgba(var(--v-theme-on-surface),0.08)] p-2 text-left text-inherit hover:border-[rgb(var(--v-theme-primary))] lt-md:w-full"
            type="button"
            :data-person-name="person.Name"
            @click="searchPerson(person)"
          >
            <span class="grid h-[34px] w-[34px] flex-none place-items-center bg-[rgb(var(--v-theme-primary))] text-[0.88rem] text-[rgb(var(--v-theme-on-primary))] font-500">{{ person.Name.slice(0, 1).toUpperCase() }}</span>
            <span class="grid min-w-0 gap-0.5">
              <strong class="overflow-hidden text-ellipsis whitespace-nowrap text-[0.82rem] font-500">{{ person.Name }}</strong>
              <em v-if="person.Role" class="overflow-hidden text-ellipsis whitespace-nowrap text-[0.72rem] text-[rgba(var(--v-theme-on-surface),0.68)] not-italic">{{ person.Role }}</em>
            </span>
          </button>
        </div>
      </div>

      <div v-if="studios.length" class="col-span-full grid content-start gap-2.5 min-w-0">
        <h4 class="m-0 flex items-center gap-[7px] text-[0.82rem] font-500 text-[rgba(255,255,255,0.72)]"><Building2 :size="16" />工作室</h4>
        <div class="flex min-w-0 flex-wrap gap-2">
          <span
            v-for="studio in studios"
            :key="studio.Id || studio.Name"
            class="cursor-default border border-[rgba(var(--v-border-color),var(--v-border-opacity))] bg-[rgba(var(--v-theme-on-surface),0.08)] px-2.5 py-[7px] text-[rgba(255,255,255,0.7)] text-[0.8rem]"
          >
            {{ studio.Name }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
