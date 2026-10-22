import React from 'react';

// A small, whimsical loading animation: tiny glyphs for the map features
// this app deals in (tree, building, water, node, road) "popping" onto the
// page in a staggered loop while OSM data is being fetched.
const GLYPHS: React.ReactNode[] = [
  // tree
  <circle cx="7" cy="7" r="5" />,
  // building
  <rect x="2" y="3" width="10" height="9" />,
  // water droplet
  <path d="M7 1.5c2.5 3 4 5.3 4 7.3a4 4 0 1 1-8 0c0-2 1.5-4.3 4-7.3z" />,
  // tree node
  <>
    <circle cx="7" cy="7" r="2.6" />
  </>,
  // road dash
  <rect x="1" y="6" width="12" height="2.2" rx="1.1" />,
];

const LoadingParticles: React.FC<{ label: string }> = ({ label }) => (
  <div className="qsp-particles" role="status" aria-label={label}>
    <div className="qsp-particles__row">
      {GLYPHS.map((glyph, i) => (
        <svg
          key={i}
          className="qsp-particle"
          style={{ animationDelay: `${i * 0.14}s` }}
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="currentColor"
        >
          {glyph}
        </svg>
      ))}
    </div>
    <span className="qsp-particles__label">{label}</span>
  </div>
);

export default LoadingParticles;
