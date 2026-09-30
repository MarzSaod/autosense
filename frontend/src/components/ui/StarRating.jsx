import { Star } from './Icon.jsx'

const sizeClasses = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

function StarRating({ rating = 0, size = 'md' }) {
  const stars = [1, 2, 3, 4, 5]
  const starSize = sizeClasses[size] || sizeClasses.md

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`Rated ${rating} out of 5 stars`}
    >
      {stars.map((star) => (
        <Star
          key={star}
          className={`${starSize} ${star <= Math.round(rating) ? 'text-teal fill-current' : 'text-line-strong'}`}
        />
      ))}
    </div>
  )
}

export default StarRating
