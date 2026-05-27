import type { EmbyItem, UserItemData } from './useEmbyClient'

export function updateItemsUserData(itemsToUpdate: readonly EmbyItem[], itemId: string, userData: UserItemData) {
  return itemsToUpdate.map((item) => (item.Id === itemId ? mergeUserData(item, userData) : item))
}

export function mergeUserData(item: EmbyItem, userData: UserItemData): EmbyItem {
  return {
    ...item,
    UserData: {
      ...item.UserData,
      ...userData,
    },
  }
}
