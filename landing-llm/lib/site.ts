export const site = {
  name: "Papastronomy",
  githubUrl: "https://github.com/papastronomy",
  // Visor Papastronomy (FastAPI). En producción se define con NEXT_PUBLIC_OBSERVATORY_URL.
  observatoryUrl: process.env.NEXT_PUBLIC_OBSERVATORY_URL ?? "http://127.0.0.1:8000/",
  copilotUrl: "/",
};

export const navLinks = [
  { href: "#demo", label: "Demo" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#modos", label: "Modos" },
  { href: "#lanzar", label: "Lanzar" },
];
