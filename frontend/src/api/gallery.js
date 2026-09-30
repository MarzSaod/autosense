import mockGallery from '../mocks/gallery.js'
import { toCamel, delay } from './client.js'

function sortedGallery() {
  return [...mockGallery].sort((a, b) => a.display_order - b.display_order)
}

export async function getGalleryImages() {
  await delay()
  return toCamel(sortedGallery())
}

export async function getGalleryCategories() {
  await delay()
  const categories = []
  sortedGallery().forEach((item) => {
    if (!categories.includes(item.category)) {
      categories.push(item.category)
    }
  })
  return categories
}
