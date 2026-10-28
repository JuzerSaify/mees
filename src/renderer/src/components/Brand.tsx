interface BrandMarkProps {
  size?: number
}

export function BrandMark({ size = 28 }: BrandMarkProps): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      height={size}
      viewBox="0 0 512 512"
      width={size}
    >
      <defs>
        <linearGradient
          id="mees-mark-peach"
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          <stop offset="0" stopColor="#FFA976" />
          <stop offset="1" stopColor="#FF9B5A" />
        </linearGradient>
      </defs>
      <path
        d="M77 52H226C239 52 249 62 249 76V232C249 250 257 264 274 264H436C450 264 460 274 460 288V435C460 449 450 459 436 459H76C62 459 52 449 52 435V76C52 62 62 52 77 52Z"
        fill="#261A13"
      />
      <rect
        fill="url(#mees-mark-peach)"
        height="120"
        rx="30"
        width="120"
        x="296"
        y="97"
      />
    </svg>
  )
}

export function Wordmark({
  iconOnly = false
}: {
  iconOnly?: boolean
}): React.JSX.Element {
  return (
    <span
      aria-label={iconOnly ? 'Mees' : undefined}
      className={`wordmark${iconOnly ? ' is-icon-only' : ''}`}
      role={iconOnly ? 'img' : undefined}
    >
      <BrandMark size={iconOnly ? 24 : 22} />
      {iconOnly ? null : <span>Mees</span>}
    </span>
  )
}
