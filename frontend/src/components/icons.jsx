// Simple stroke icons used on the home page. These are placeholders —
// swap for the team's actual illustrated icon set whenever that's ready;
// these just keep the layout functional and on-palette in the meantime.

const common = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function PassportIcon() {
  return (
    <svg {...common}>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <path d="M9 16h6" />
    </svg>
  );
}

export function PlaneIcon() {
  return (
    <svg {...common}>
      <path d="M2 16l20-7-7 20-3-8-8-3z" />
      <path d="M15 9l-4 4" />
    </svg>
  );
}

export function VisaIcon() {
  return (
    <svg {...common}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9h6" />
      <path d="M7 13h4" />
      <circle cx="17" cy="14" r="2.5" />
    </svg>
  );
}

export function MapIcon() {
  return (
    <svg {...common}>
      <path d="M9 20l-6-2V4l6 2 6-2 6 2v14l-6-2-6 2z" />
      <path d="M9 6v14" />
      <path d="M15 4v14" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...common} width="18" height="18">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}
