<script>
  export let name = 'dot';
  export let size = 18;
  export let stroke = 1.8;
  export let label = '';

  const paths = {
    today: 'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
    homework: 'M9 4h6a2 2 0 0 1 2 2v14H7V6a2 2 0 0 1 2-2Zm0 4h6M9 12h6M9 16h4',
    modules: 'M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
    notes: 'M6 3h9l4 4v14H6V3Zm8 0v5h5M9 13h6M9 17h4',
    exams: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 7h3v3H8v-3Z',
    calendar: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z',
    links: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
    focus: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 3v2M12 19v2M3 12h2M19 12h2',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2-1.2L14.6 3h-4l-.4 2.5a7.6 7.6 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2Z',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    plus: 'M12 5v14M5 12h14',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
    check: 'm4 12 5 5L20 6',
    x: 'M6 6l12 12M18 6 6 18',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
    edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
    chevronRight: 'm9 5 7 7-7 7',
    chevronLeft: 'm15 5-7 7 7 7',
    chevronDown: 'm5 9 7 7 7-7',
    arrowLeft: 'M20 12H4m6-6-6 6 6 6',
    photo: 'M4 5h16v14H4V5Zm0 11 4.5-4.5 3 3L15 10l5 5M15 9h.01',
    file: 'M6 3h9l4 4v14H6V3Zm8 0v5h5',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
    menu: 'M4 7h16M4 12h16M4 17h16',
    dot: 'M12 12h.01',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={label ? undefined : 'true'}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
  focusable="false"
>
  <path d={paths[name] || paths.dot} />
</svg>
