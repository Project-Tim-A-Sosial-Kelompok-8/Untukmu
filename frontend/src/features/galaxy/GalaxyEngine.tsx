"use client";

/**
 * The visual scene uses classic-script controls in a same-origin document.
 * React screens and the R3F scheduler run inside that document.
 */
export function GalaxyEngine({ initialScreen }: { initialScreen?: "admin" | "doa" }) {
  return <iframe className="galaxy-frame" src={`/visual/index.html${initialScreen ? `?screen=${initialScreen}` : ""}`} title="Galaksi Untukmu" allow="fullscreen" />;
}
