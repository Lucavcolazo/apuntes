const PATHS = {
  upload: <path d="M12 15V4m0 0L8 8m4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  fit: <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  play: <path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M9 5.5v13M15 5.5v13" strokeWidth="2.6" />,
  reset: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />,
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  sidebarLeft: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  sidebarRight: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>
  ),
  download: <path d="M12 4v11m0 0-4-4m4 4 4-4M4 20h16" />,
  print: <path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z" />,
  save: <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM8 4v5h7V4M8 20v-6h8v6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  book: <path d="M4 5a1 1 0 0 1 1-1h5a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5a1 1 0 0 1-1-1zM20 5a1 1 0 0 0-1-1h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5a1 1 0 0 0 1-1z" />,
  headphones: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="14" width="4.5" height="6.5" rx="1.5" />
      <rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5" />
    </>
  ),
  fan: (
    <>
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 10.4c-.6-3.6.6-6.9 3.3-6.9 2.3 0 2.4 3.3-.4 5.4L13.4 10M13.6 12c3.6-.6 6.9.6 6.9 3.3 0 2.3-3.3 2.4-5.4-.4L14 13.4M12 13.6c.6 3.6-.6 6.9-3.3 6.9-2.3 0-2.4-3.3.4-5.4l1.5-1.1M10.4 12c-3.6.6-6.9-.6-6.9-3.3 0-2.3 3.3-2.4 5.4.4l1.1 1.5" />
    </>
  ),
  plane: <path d="M10.6 3.6a1.4 1.4 0 0 1 2.8 0V9.2l7.1 4.1v2l-7.1-2.1v4.6l2.1 1.6v1.7L12 20.1l-3.5 1v-1.7l2.1-1.6v-4.6l-7.1 2.1v-2l7.1-4.1z" />,
  rain: <path d="M7.5 3.5S4 8 4 10.5a3.5 3.5 0 0 0 7 0C11 8 7.5 3.5 7.5 3.5zM16.5 9.5S13 14 13 16.5a3.5 3.5 0 0 0 7 0c0-2.5-3.5-7-3.5-7z" />,
  white: <path d="M3 12h2.5l2-5 3 10 3-14 3 14 2-5H21" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />
    </>
  ),
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  check: <path d="M5 12.5 10 17 19 7" />,
  cards: <path d="M8 4h11a1 1 0 0 1 1 1v12M4 8h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />,
  calendar: <path d="M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M8 3v4M16 3v4" />,
  search: <path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.8-4.8" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  archive: <path d="M3 5h18v4H3zM5 9v10h14V9M10 13h4" />,
  chart: <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  highlighter: <path d="m9 11-5 5v4h4l5-5M9 11l6-6 4 4-6 6M9 11l4 4" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
