// The Respool symbol: a spool unwinding. White thread bands over a green base, for the dark nav badge.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true">
      <g transform="translate(128 128) scale(1.25) translate(-116.5 -143)">
        <rect x="40" y="184" width="128" height="32" rx="16" fill="#2ed3a2" />
        <g fill="#fff">
          <rect x="72" y="88" width="70" height="22" rx="11" transform="rotate(-15 72 99)" />
          <rect x="72" y="120" width="96" height="22" rx="11" transform="rotate(-15 72 131)" />
          <rect x="72" y="152" width="124" height="22" rx="11" transform="rotate(-15 72 163)" />
        </g>
      </g>
    </svg>
  );
}
