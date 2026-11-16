const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL || "/explorer";

export const site = {
  name: "Find My X · Papastronomy",
  landingUrl: "/",
  appUrl: explorerUrl,
  copilotUrl: process.env.NEXT_PUBLIC_COPILOT_URL || "/copilot",
  loginUrl: process.env.NEXT_PUBLIC_LOGIN_URL || "/login",
  learning3dUrl: "/static/learn-3d/index.html",
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
