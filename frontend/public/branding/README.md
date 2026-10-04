# CaptainScout identity

Original geometric artwork: a captain profile, angled monocular, mint gem signal,
and a cyan radar arc. No third-party logo references or tracing were used.

- `captainscout-mark.svg`: compact 64-unit identity, used in the header.
- `captainscout-wordmark.svg`: reusable horizontal lockup with the subtitle.
- `captainscout-app-icon.svg`: dark-backed application icon.
- `captainscout-gem.svg`: decorative signal with radar rings.
- `../favicon.svg`: the same compact mark for browser tabs.

Palette matches the interface: midnight #0a121b, mint #83dfbd, cyan-blue
#8dbbdf, light #eaf0f5, muted #a1b2c2. SVGs include standalone titles;
inline image uses beside equivalent text and decorative motifs use empty alt
text and aria-hidden containers. The header uses native text for readability.

The Captain’s Radar panel is a coming-soon visual extension point only.
It has no monitoring, discoveries, data sources, or transaction behavior.

Offline responsive regression QA: `frontend/tests/browser-qa.cjs` renders the
actual page with wallet and contract fixtures, serves local brand SVGs, and
checks layout at 1440, 768, 390, and 320 pixels. All external requests are blocked.
