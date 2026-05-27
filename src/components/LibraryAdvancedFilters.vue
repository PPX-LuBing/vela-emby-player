<script setup lang="ts">
import { RotateCcw } from 'lucide-vue-next'
import type { LibraryAdvancedFilterState } from '../composables/libraryFilters'

interface FilterOption {
  label: string
  value: string
}

const props = defineProps<{
  filters: LibraryAdvancedFilterState
  typeOptions: readonly FilterOption[]
  yearOptions: readonly FilterOption[]
  genreOptions: readonly FilterOption[]
  hasActiveFilters: boolean
}>()

const emit = defineEmits<{
  updateFilters: [filters: LibraryAdvancedFilterState]
  reset: []
}>()

function updateFilter(key: keyof LibraryAdvancedFilterState, value: string) {
  emit('updateFilters', {
    ...props.filters,
    [key]: value,
  })
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-start gap-2.5 min-w-0 lt-md:flex-col lt-md:items-stretch" aria-label="高级筛选">
    <VSelect
      class="flex-1 basis-[150px] max-w-[180px] min-w-[140px] lt-md:max-w-none"
      :model-value="filters.type"
      :items="typeOptions"
      item-title="label"
      item-value="value"
      label="类型"
      density="compact"
      variant="solo-filled"
      hide-details
      data-filter="type"
      @update:model-value="updateFilter('type', String($event))"
    />
    <VSelect
      class="flex-1 basis-[150px] max-w-[180px] min-w-[140px] lt-md:max-w-none"
      :model-value="filters.year"
      :items="yearOptions"
      item-title="label"
      item-value="value"
      label="年份"
      density="compact"
      variant="solo-filled"
      hide-details
      data-filter="year"
      @update:model-value="updateFilter('year', String($event))"
    />
    <VSelect
      class="flex-1 basis-[150px] max-w-[180px] min-w-[140px] lt-md:max-w-none"
      :model-value="filters.genre"
      :items="genreOptions"
      item-title="label"
      item-value="value"
      label="类型标签"
      density="compact"
      variant="solo-filled"
      hide-details
      data-filter="genre"
      @update:model-value="updateFilter('genre', String($event))"
    />
    <VBtn
      class="flex-none"
      type="button"
      variant="tonal"
      :disabled="!hasActiveFilters"
      @click="emit('reset')"
    >
      <template #prepend>
        <RotateCcw :size="16" />
      </template>
      重置筛选
    </VBtn>
  </div>
</template>
