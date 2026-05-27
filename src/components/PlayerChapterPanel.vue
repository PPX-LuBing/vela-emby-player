<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { formatChapterRange, type PlaybackChapter } from '../composables/playbackChapters'

const props = defineProps<{
  chapters: readonly PlaybackChapter[]
  playbackPosition: number
  formatTime: (seconds: number) => string
}>()

const emit = defineEmits<{
  close: []
  seek: [chapter: PlaybackChapter]
}>()

const chapterRows = computed(() => props.chapters.map((chapter) => ({
  chapter,
  key: `${chapter.index}-${chapter.startSeconds}`,
  range: formatChapterRange(chapter, props.formatTime),
  tagLabel: chapter.kind === 'intro' ? '片头' : chapter.kind === 'outro' ? '片尾' : '',
  isActive: props.playbackPosition >= chapter.startSeconds &&
    (chapter.endSeconds === null || props.playbackPosition < chapter.endSeconds),
  isSkippable: chapter.kind !== 'chapter',
})))
</script>

<template>
  <div class="player-chapters">
    <div class="player-chapters__header">
      <div class="player-chapters__title">
        <strong>章节</strong>
        <span>{{ chapters.length }} 个章节</span>
      </div>
      <VBtn size="small" icon variant="tonal" type="button" aria-label="关闭章节面板" @click="emit('close')">
        <X :size="16" />
      </VBtn>
    </div>

    <div class="player-chapters__list">
      <button
        v-for="row in chapterRows"
        :key="row.key"
        class="player-chapters__item"
        :class="{
          'player-chapters__item--active': row.isActive,
          'player-chapters__item--skippable': row.isSkippable,
        }"
        type="button"
        :data-chapter-name="row.chapter.name"
        @click="emit('seek', row.chapter)"
      >
        <span>
          <strong>{{ row.chapter.name }}</strong>
          <em>{{ row.range }}</em>
        </span>
        <small v-if="row.tagLabel">{{ row.tagLabel }}</small>
      </button>
    </div>
  </div>
</template>

<style scoped>
.player-chapters {
  position: absolute;
  top: 74px;
  right: 18px;
  z-index: 7;
  display: grid;
  width: min(420px, calc(100% - 36px));
  max-height: calc(100% - 220px);
  gap: 12px;
  padding: 14px;
  overflow: auto;
  background: rgb(var(--v-theme-surface));
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.player-chapters__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.player-chapters__title {
  display: grid;
  gap: 3px;
}

.player-chapters__title strong {
  font-size: 1rem;
  line-height: 1.25;
}

.player-chapters__title span {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.78rem;
}

.player-chapters__list {
  display: grid;
  gap: 8px;
}

.player-chapters__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px;
  color: inherit;
  text-align: left;
  background: transparent;
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  cursor: pointer;
}

.player-chapters__item:hover,
.player-chapters__item--active {
  border-color: rgb(var(--v-theme-primary));
}

.player-chapters__item--skippable {
  border-color: rgba(var(--v-theme-primary), 0.6);
}

.player-chapters__item span {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.player-chapters__item strong,
.player-chapters__item em {
  min-width: 0;
  overflow-wrap: anywhere;
}

.player-chapters__item strong {
  font-size: 0.84rem;
  font-weight: 500;
  line-height: 1.25;
}

.player-chapters__item em {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.72rem;
  font-style: normal;
}

.player-chapters__item small {
  flex: 0 0 auto;
  padding: 4px 7px;
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
  font-size: 0.68rem;
  font-weight: 500;
}

@media (max-width: 720px) {
  .player-chapters {
    top: 68px;
    right: 12px;
    left: 12px;
    width: auto;
    max-height: calc(100% - 240px);
  }
}
</style>
