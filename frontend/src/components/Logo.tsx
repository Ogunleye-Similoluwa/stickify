export function Logo() {
  return (
    <svg viewBox="0 0 32 32">
      <path d="M6 4h14l6 6v12a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V6a2 2 0 0 1 2-2z" fill="currentColor" />
      <path d="M20 4v4a2 2 0 0 0 2 2h4" fill="none" stroke="var(--bg)" strokeWidth="2" />
      <circle cx="12" cy="16" r="1.6" fill="var(--bg)" />
      <circle cx="19" cy="16" r="1.6" fill="var(--bg)" />
      <path d="M11.5 20.5c2.4 2 5.6 2 8 0" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
