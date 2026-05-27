import { describe, expect, it } from 'vitest'
import {
  createDefaultLibraryAdvancedFilters,
  createLibraryAdvancedFilterOptions,
  filterItemsByAdvancedFilters,
  hasActiveLibraryAdvancedFilters,
} from './libraryFilters'
import type { EmbyItem } from './useEmbyClient'

const items: EmbyItem[] = [
  { Id: 'movie-1', Name: 'Movie One', Type: 'Movie', ProductionYear: 2026, Genres: ['Drama'] },
  { Id: 'movie-2', Name: 'Movie Two', Type: 'Movie', ProductionYear: 2025, Genres: ['Action'] },
  { Id: 'series-1', Name: 'Series One', Type: 'Series', ProductionYear: 2026, Genres: ['Drama'] },
]

describe('libraryFilters', () => {
  it('filters items by type, year, and genre', () => {
    const filtered = filterItemsByAdvancedFilters(items, {
      type: 'Movie',
      year: '2026',
      genre: 'Drama',
    })

    expect(filtered.map((item) => item.Id)).toEqual(['movie-1'])
  })

  it('creates sorted filter options from loaded items', () => {
    const options = createLibraryAdvancedFilterOptions(items)

    expect(options.types.map((option) => option.label)).toEqual(['全部类型', '电影', '剧集'])
    expect(options.years.map((option) => option.value)).toEqual(['all', '2026', '2025'])
    expect(options.genres.map((option) => option.value)).toEqual(['all', 'Action', 'Drama'])
  })

  it('detects active advanced filters', () => {
    expect(hasActiveLibraryAdvancedFilters(createDefaultLibraryAdvancedFilters())).toBe(false)
    expect(hasActiveLibraryAdvancedFilters({ type: 'Movie', year: 'all', genre: 'all' })).toBe(true)
  })
})
