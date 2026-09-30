const placeholderRows = ['Likely issue', 'Estimated cost', 'Estimated time']

function ExampleResultCard() {
  return (
    <div className="bg-surface border border-line rounded-xl p-6 sm:p-8">
      <span className="text-eyebrow uppercase text-muted">
        Example of what you&apos;ll get
      </span>
      <div className="mt-6 flex flex-col gap-4">
        {placeholderRows.map((label) => (
          <div
            key={label}
            className="flex items-center justify-between border-t border-line pt-4 first:border-t-0 first:pt-0"
          >
            <span className="text-sm text-muted">{label}</span>
            <span className="text-sm font-semibold text-muted">—</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ExampleResultCard
