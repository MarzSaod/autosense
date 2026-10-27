import { getJson, toCamel } from './client.js'

export async function getGalleryImages(category) {
  const path = category
    ? `/api/gallery?category=${encodeURIComponent(category)}`
    : '/api/gallery'
  return toCamel(await getJson(path))
}

export async function getGalleryCategories() {
  const images = await getJson('/api/gallery')
  const categories = []

  images.forEach((image) => {
    if (image.category && !categories.includes(image.category)) {
      categories.push(image.category)
    }
  })

  return categories
}
