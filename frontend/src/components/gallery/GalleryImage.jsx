import AppImage from '../ui/AppImage.jsx'

function GalleryImage({ src, alt, caption, className = '' }) {
  return (
    <AppImage
      src={src}
      alt={alt}
      fallbackLabel={caption}
      className={`absolute inset-0 ${className}`}
    />
  )
}

export default GalleryImage
