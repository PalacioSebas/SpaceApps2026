const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL || "http://127.0.0.1:8000";

export const site = {
  name: "Papastronomy",
  // Set the public Explorer URL before building for another environment.
  appUrl: explorerUrl,
  learning3dUrl: new URL("/static/learn-3d/index.html", explorerUrl).href,
  githubUrl: "https://github.com/PalacioSebas/SpaceApps2026",
  challengeUrl: "https://www.spaceappschallenge.org/",
};

export const navLinks = [
  { href: "#challenge", label: "Science" },
  { href: "#platform", label: "Platform" },
  { href: "#process", label: "Process" },
  { href: "#explore", label: "Explore" },
  { href: "#technology", label: "Technology" },
];
