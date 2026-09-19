/**
 * Hand-drawn 24px icon set on a 1.5px stroke, so every glyph shares the
 * hairline weight the rest of the console is framed with. No icon font,
 * no network request, no layout shift while a font loads.
 */

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function IconGrid(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1" />
    </svg>
  );
}

export function IconChip(props) {
  return (
    <svg {...base} {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
    </svg>
  );
}

export function IconBell(props) {
  return (
    <svg {...base} {...props}>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5Z" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function IconSliders(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  );
}

export function IconBolt(props) {
  return (
    <svg {...base} {...props}>
      <path d="M13.5 2 5 13h6l-1.5 9L19 11h-6l.5-9Z" />
    </svg>
  );
}

export function IconClose(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconChevron(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconArrowRight(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconPlug(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 2v6M15 2v6" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" />
      <path d="M12 17v5" />
    </svg>
  );
}

export function IconCheck(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12.5 9 17.5 20 6.5" />
    </svg>
  );
}

export function IconWarning(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 22 20H2L12 3.5Z" />
      <path d="M12 9.5v4.5M12 17.2v.3" />
    </svg>
  );
}

/** Product mark: a socket face with a live pin. */
export function LogoMark(props) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="1" y="1" width="30" height="30" rx="7" stroke="#353742" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="9.5" stroke="#4b4e5c" strokeWidth="1.25" />
      <path
        d="M17.6 7.5 10.4 18.2h4.6L13.8 24.5 21.6 14.3h-4.8l.8-6.8Z"
        fill="#d97736"
      />
    </svg>
  );
}
