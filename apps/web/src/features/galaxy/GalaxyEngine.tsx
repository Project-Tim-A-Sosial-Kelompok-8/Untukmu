"use client";

/**
 * Fidelity boundary: the original engine relies on classic-script globals and an
 * older bundled Three.js. An isolated same-origin document preserves that ABI.
 * React screens and the R3F scheduler are mounted inside this document.
 */
export function GalaxyEngine({ initialScreen }: { initialScreen?: "admin" | "doa" }) {
  return <iframe className="galaxy-frame" src={`/engine/index.html${initialScreen ? `?screen=${initialScreen}` : ""}`} title="Galaksi Untukmu" allow="fullscreen" />;
}
