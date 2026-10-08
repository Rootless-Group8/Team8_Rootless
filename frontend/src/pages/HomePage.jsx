import { Link } from "react-router-dom";
import { PassportIcon, PlaneIcon, VisaIcon, MapIcon, SearchIcon } from "../components/icons";

// Northern-lights hero background: soft blurred aurora bands over a dark
// night sky, a scatter of stars, and a two-layer mountain silhouette
// along the bottom for depth. Pure SVG/CSS — no illustration assets
// needed, and it scales to fill .hero via preserveAspectRatio="none".
function AuroraBackground() {
  return (
    <svg
      className="hero-bg"
      viewBox="0 0 1200 600"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <filter id="auroraBlurSoft">
          <feGaussianBlur stdDeviation="34" />
        </filter>
        <filter id="auroraBlurWide">
          <feGaussianBlur stdDeviation="52" />
        </filter>
      </defs>

      <rect width="1200" height="600" fill="#0d0a1f" />

      <ellipse cx="750" cy="100" rx="560" ry="190" fill="#3d2c71" opacity="0.85" filter="url(#auroraBlurWide)" />
      <ellipse cx="930" cy="60" rx="480" ry="150" fill="#416f92" opacity="0.75" filter="url(#auroraBlurSoft)" />
      <ellipse cx="680" cy="130" rx="520" ry="130" fill="#a6d785" opacity="0.7" filter="url(#auroraBlurWide)" />
      <ellipse cx="450" cy="50" rx="380" ry="100" fill="#e8c93d" opacity="0.55" filter="url(#auroraBlurSoft)" />
      <ellipse cx="220" cy="120" rx="320" ry="110" fill="#dd6152" opacity="0.45" filter="url(#auroraBlurWide)" />

      {/* stars */}
      <circle cx="90" cy="40" r="2" fill="#fff" opacity="0.9" />
      <circle cx="180" cy="130" r="1.4" fill="#fff" opacity="0.7" />
      <circle cx="370" cy="30" r="1.8" fill="#fff" opacity="0.8" />
      <circle cx="500" cy="100" r="1.4" fill="#fff" opacity="0.6" />
      <circle cx="140" cy="220" r="1.8" fill="#fff" opacity="0.7" />
      <circle cx="1050" cy="220" r="1.4" fill="#fff" opacity="0.6" />
      <circle cx="60" cy="300" r="1.8" fill="#fff" opacity="0.7" />
      <circle cx="1140" cy="300" r="2" fill="#fff" opacity="0.8" />
      <circle cx="900" cy="180" r="1.4" fill="#fff" opacity="0.6" />
      <circle cx="1000" cy="60" r="1.8" fill="#fff" opacity="0.75" />

      {/* mountain silhouette, two layers for depth */}
      <path
        d="M0 600 L0 440 L90 390 L195 435 L300 375 L405 420 L510 360 L615 405 L720 345 L825 397 L945 352 L1050 390 L1140 368 L1200 405 L1200 600 Z"
        fill="#050310"
      />
      <path
        d="M0 600 L0 480 L105 450 L225 472 L345 442 L450 465 L570 435 L690 462 L810 432 L930 458 L1050 435 L1200 450 L1200 600 Z"
        fill="#0a0718"
        opacity="0.9"
      />
    </svg>
  );
}

const quicklinks = [
  { to: "/dashboard", label: "Check your passport", icon: <PassportIcon />, tone: "gold" },
  { to: "/visa-explorer", label: "Plan your trip", icon: <PlaneIcon />, tone: "green" },
  { to: "/visa-explorer", label: "Get visa help", icon: <VisaIcon />, tone: "coral" },
  { to: "/dashboard", label: "Move abroad", icon: <MapIcon />, tone: "blue" },
];

const helps = [
  {
    color: "var(--ui-color-aurora-gold)",
    icon: <PassportIcon />,
    title: "Passport Guidance",
    body: "Understand what countries you can visit with your current passport, and what visas you might need.",
  },
  {
    color: "var(--ui-color-aurora-green)",
    icon: <VisaIcon />,
    title: "Visa Support",
    body: "Get up-to-date visa information, application steps, and helpful checklists for every country.",
  },
  {
    color: "var(--ui-color-aurora-coral)",
    icon: <PlaneIcon />,
    title: "Move Abroad",
    body: "Find the best countries for your goals, compare options, and learn about residency and work permits.",
  },
  {
    color: "var(--ui-color-aurora-blue)",
    icon: <MapIcon />,
    title: "Travel Planning",
    body: "Explore visa-free access, entry requirements, and travel tips for your next adventure.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <AuroraBackground />
        <div className="hero-content">
          <p className="hero-eyebrow">rootless</p>
          <h1 className="hero-title">
            New country,
            <br />
            same you.
          </h1>
          <p className="hero-subtitle">
            Whether you're moving abroad, planning a dream trip, or figuring out your visa —
            rootless makes it simple.
          </p>

          <form className="hero-search" onSubmit={(e) => e.preventDefault()} role="search">
            <input type="text" placeholder="Where do you want to go?" aria-label="Search destination" />
            <button type="submit" aria-label="Search">
              <SearchIcon />
            </button>
          </form>

          <div className="hero-quicklinks">
            {quicklinks.map((q) => (
              <Link key={q.label} to={q.to} className="hero-quicklink">
                <span className={`hero-quicklink-icon hero-quicklink-icon--${q.tone}`}>{q.icon}</span>
                {q.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="wave-section">
        <div className="app-main">
          <h2 className="section-heading">How Rootless Helps</h2>
          <div className="helps-grid">
            {helps.map((h) => (
              <div className="helps-card" key={h.title}>
                <div className="helps-card-icon" style={{ background: h.color }}>
                  {h.icon}
                </div>
                <h3>{h.title}</h3>
                <p>{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="app-main">
        <div className="banner-grid">
          <div className="banner-card banner-card--coral">
            <h2>Know Your Passport</h2>
            <p>
              Enter your passport details to see visa-free access, visa on arrival options, and
              countries that require a visa.
            </p>
            <Link to="/dashboard" className="banner-cta">
              Check My Passport →
            </Link>
          </div>

          <div className="banner-card banner-card--gold">
            <h2>Visa Requirements</h2>
            <p>
              Get the latest visa requirements, application steps, and processing times for your
              destination.
            </p>
            <Link to="/visa-explorer" className="banner-cta">
              Find Visa Info →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
