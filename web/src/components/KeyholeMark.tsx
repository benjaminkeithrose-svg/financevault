/** The Financial Vault mark: a keyhole cut through a solid block, in the current colourway. */
export function KeyholeMark({ size = 28, label }: { size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="keyhole-mark"
    >
      <rect width="140" height="140" fill="var(--mark-block)" />
      <circle cx="70" cy="56" r="26" fill="var(--mark-hole)" />
      <path d="M56 66 L84 66 L94 116 L46 116 Z" fill="var(--mark-hole)" />
    </svg>
  );
}
