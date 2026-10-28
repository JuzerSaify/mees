interface BrandMarkProps {
  size?: number
  title?: string
}

export function BrandMark({ size = 28, title = 'Kern' }: BrandMarkProps): React.JSX.Element {
  return (
    <svg
      aria-label={title}
      className="brand-mark"
      height={size}
      role="img"
      viewBox="0 0 32 32"
      width={size}
    >
      <rect fill="currentColor" height="32" rx="7" width="32" />
      <path
        d="M8.2 6.5h4.3v7.6l6.6-7.6h5l-7.5 8.6L25 25.5h-5.2l-7.3-8.7v8.7H8.2V6.5Z"
        fill="#FCFCFA"
      />
      <rect fill="#2A8C80" height="19" rx="1.5" width="1.8" x="24.1" y="6.5" />
    </svg>
  )
}

export function Wordmark(): React.JSX.Element {
  return (
    <span className="wordmark">
      <BrandMark size={22} />
      <span>kern</span>
    </span>
  )
}
