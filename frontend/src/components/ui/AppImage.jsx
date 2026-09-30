import { useState } from 'react'
import Skeleton from './Skeleton.jsx'

function AppImage({
  src,
  alt,
  ratio,
  className = '',
  objectPosition,
  priority = false,
  fallbackLabel,
}) {
  const [status, setStatus] = useState('loading')
  const wrapperStyle = ratio ? { aspectRatio: ratio } : undefined
  const imgStyle = objectPosition ? { objectPosition } : undefined

  return (
    <div
      className={`${ratio ? 'relative' : ''} overflow-hidden ${className}`}
      style={wrapperStyle}
    >
      {status !== 'loaded' && status !== 'error' && (
        <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
      )}

      {status !== 'error' && (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          style={imgStyle}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {status === 'error' && fallbackLabel && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-teal-soft to-surface p-4">
          <span className="text-sm font-medium text-muted text-center">{fallbackLabel}</span>
        </div>
      )}
    </div>
  )
}

export default AppImage
