export const site = {
  name: "Find My X · Papastronomy",
  githubUrl: "https://github.com/PalacioSebas/SpaceApps2026",
  landingUrl: process.env.NEXT_PUBLIC_LANDING_URL ?? "/",
  observatoryUrl: process.env.NEXT_PUBLIC_OBSERVATORY_URL ?? "/explorer",
  copilotUrl: process.env.NEXT_PUBLIC_COPILOT_URL ?? "/copilot",
  loginUrl: process.env.NEXT_PUBLIC_LOGIN_URL ?? "/login",
};

export const navLinks = [
  { href: "#demo", label: "Demo" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#modos", label: "Modos" },
  { href: "#lanzar", label: "Lanzar" },
];
