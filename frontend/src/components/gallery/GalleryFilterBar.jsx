import Chip from '../ui/Chip.jsx'

function GalleryFilterBar({ categories, activeCategory, onSelectCategory, count }) {
  return (
    <div className="sticky top-16 z-40 bg-white/95 backdrop-blur border-b border-line">
      <div className="max-w-[1200px] mx-auto px-4 py-4 flex flex-wrap items-center gap-3">
        <Chip selected={activeCategory === 'All'} onClick={() => onSelectCategory('All')}>
          All
        </Chip>
        {categories.map((category) => (
          <Chip
            key={category}
            selected={activeCategory === category}
            onClick={() => onSelectCategory(category)}
          >
            {category}
          </Chip>
        ))}
        <span className="text-sm text-muted ml-auto">
          {count} {count === 1 ? 'photo' : 'photos'}
        </span>
      </div>
    </div>
  )
}

export default GalleryFilterBar
