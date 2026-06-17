interface Props {
  size?: number;
  withWordmark?: boolean;
}

/**
 * Brand mark: two overlapping rounded squares (collaboration / shared layers)
 * plus the "Folio" wordmark. Uses currentColor so it adapts to context.
 */
export function Logo({ size = 26, withWordmark = true }: Props) {
  return (
    <span className="logo" aria-label="Folio">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="4" y="9" width="15" height="15" rx="4.5" fill="currentColor" opacity="0.28" />
        <rect x="13" y="9" width="15" height="15" rx="4.5" fill="currentColor" />
      </svg>
      {withWordmark && <span className="logo-word">Folio</span>}
    </span>
  );
}
