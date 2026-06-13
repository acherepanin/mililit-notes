export function FolderTileIcon({ gradientId }: { gradientId: string }) {
  return (
    <svg className="folder-tile-icon" viewBox="0 0 80 64" aria-hidden>
      <defs>
        <linearGradient
          id={gradientId}
          x1="10"
          y1="8"
          x2="70"
          y2="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--accent)" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--accent-2) 70%, var(--accent))" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M6 18c0-5 4-9 9-9h20l8 10h27c5 0 9 4 9 9v26c0 5-4 9-9 9H15c-5 0-9-4-9-9V18z"
      />
      <path fill="color-mix(in srgb, white 30%, transparent)" d="M6 24h68v6H6z" />
      <path fill="color-mix(in srgb, black 12%, transparent)" d="M34 9h7l8 10H34V9z" />
    </svg>
  );
}
