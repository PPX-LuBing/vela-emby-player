<script setup lang="ts">
import type { EmbyItem } from '../composables/useEmbyClient'
import { formatRuntimeMinutes } from '../composables/mediaItemDisplay'
import LibraryMediaCard from './LibraryMediaCard.vue'

defineProps<{
  title: string
  items: readonly EmbyItem[]
  getImageUrl: (item: EmbyItem, width?: number) => string
}>()

const emit = defineEmits<{
  selectItem: [item: EmbyItem]
}>()

function formatMeta(item: EmbyItem) {
  const parts = []

  if (item.Type === 'Episode' && item.SeriesName) {
    parts.push(item.SeriesName)
  }

  if (item.Type === 'Audio') {
    const artist = item.AlbumArtist || item.AlbumArtists?.[0] || item.Artists?.[0]
    if (artist) {
      parts.push(artist)
    }
    if (item.Album) {
      parts.push(item.Album)
    }
  }

  if (item.Type === 'MusicAlbum') {
    const artist = item.AlbumArtist || item.AlbumArtists?.[0] || item.Artists?.[0]
    if (artist) {
      parts.push(artist)
    }
  }

  if (item.ProductionYear) {
    parts.push(String(item.ProductionYear))
  }

  const runtime = formatRuntimeMinutes(item.RunTimeTicks)
  if (runtime) {
    parts.push(runtime)
  }

  if (!parts.length && item.Genres?.[0]) {
    parts.push(item.Genres[0])
  }

  return parts.join(' · ') || item.Type
}
</script>

<template>
  <section class="related-rail-section">
    <div class="related-rail-section__header">
      <div>
        <p class="related-rail-section__kicker">Recommendations</p>
        <h3 class="related-rail-section__title">{{ title }}</h3>
      </div>
      <span>{{ items.length }} 项</span>
    </div>

    <div class="related-rail" :aria-label="title">
      <LibraryMediaCard
        v-for="item in items"
        :key="item.Id"
        :data-related-id="item.Id"
        :item="item"
        :selected="false"
        :meta="formatMeta(item)"
        :get-image-url="getImageUrl"
        @select-item="emit('selectItem', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.related-rail-section {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: rgb(var(--v-theme-surface));
}

.related-rail-section__header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.related-rail-section__kicker {
  margin: 0 0 4px;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.related-rail-section__title {
  margin: 0;
  font-size: 1.06rem;
  font-weight: 500;
  line-height: 1.25;
}

.related-rail-section__header span {
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.82rem;
}

.related-rail {
  display: grid;
  grid-auto-columns: clamp(142px, 14vw, 184px);
  grid-auto-flow: column;
  gap: 12px;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 2px 12px;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.related-rail::-webkit-scrollbar {
  display: none;
}

@media (max-width: 720px) {
  .related-rail-section__header {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .related-rail {
    grid-auto-columns: 136px;
  }
}
</style>
