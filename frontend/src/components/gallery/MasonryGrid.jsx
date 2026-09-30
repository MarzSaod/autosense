import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import GalleryTile from './GalleryTile.jsx'

function computeColumnCount() {
  const width = window.innerWidth
  if (width >= 1024) return 3
  if (width >= 640) return 2
  return 1
}

function useColumnCount() {
  const [count, setCount] = useState(computeColumnCount)

  useEffect(() => {
    function handleResize() {
      setCount(computeColumnCount())
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return count
}

function MasonryGrid({ images, onOpenImage }) {
  const columnCount = useColumnCount()
  const columns = Array.from({ length: columnCount }, () => [])
  images.forEach((image, index) => {
    columns[index % columnCount].push(image)
  })

  return (
    <div className="flex gap-4 items-start">
      {columns.map((columnImages, columnIndex) => (
        <div key={columnIndex} className="flex-1 flex flex-col">
          <AnimatePresence mode="popLayout">
            {columnImages.map((image) => (
              <GalleryTile key={image.id} image={image} index={image.id} onOpen={onOpenImage} />
            ))}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

export default MasonryGrid
