import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

type Tech = { name: string; tag: string; layer: "Science" | "Backend" | "Interface"; body: string; wide?: boolean };

const stack: Tech[] = [
  {
    name: "NASA SPHEREx",
    tag: "Mission data",
    layer: "Science",
    body: "All-sky infrared spectral survey observations across 102 channels from 0.75 to 5.00 µm.",
    wide: true,
  },
  { name: "FITS", tag: "Data format", layer: "Science", body: "The standard container for astronomical images and metadata." },
  { name: "WCS", tag: "Coordinates", layer: "Science", body: "World Coordinate System mapping pixels to positions on the sky." },
  { name: "Astropy", tag: "Astronomy", layer: "Backend", body: "Core library for FITS I/O, coordinates and units." },
  { name: "NumPy / SciPy", tag: "Numerics", layer: "Backend", body: "Array processing, filtering and numerical analysis." },
  { name: "Python", tag: "Language", layer: "Backend", body: "The scientific processing pipeline." },
  { name: "FastAPI", tag: "API", layer: "Backend", body: "A typed, fast HTTP layer serving processed observations." },
  {
    name: "JavaScript",
    tag: "Visualization",
    layer: "Interface",
    body: "Interactive in-browser rendering of images, spectra and epoch comparisons.",
    wide: true,
  },
];

const layerColor: Record<Tech["layer"], string> = {
  Science: "text-cyan",
  Backend: "text-violet",
  Interface: "text-stellar",
};

export function TechStack() {
  return (
    <section id="technology" aria-labelledby="technology-title" className="relative py-28 md:py-40">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              id="technology-title"
              index="05"
              eyebrow="Built with real science and technology"
              title="Where astronomy meets engineering."
              description="Papastronomy combines scientific data processing, backend engineering and interactive visualization — each layer chosen for rigor and transparency."
            />
            <Reveal delay={120}>
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.2em]">
                {(Object.keys(layerColor) as Tech["layer"][]).map((layer) => (
                  <li key={layer} className="flex items-center gap-2 text-muted">
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full bg-current ${layerColor[layer]}`} />
                    {layer}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:col-span-7 lg:grid-cols-3">
            {stack.map((t, i) => (
              <Reveal
                as="li"
                key={t.name}
                delay={i * 60}
                className={`group relative flex min-h-44 flex-col justify-between bg-void p-6 transition-colors duration-500 hover:bg-navy ${
                  t.wide ? "lg:col-span-2" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${layerColor[t.layer]}`}>{t.tag}</span>
                  <span className="font-mono text-[10px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div>
                  <h3 className="text-2xl font-medium tracking-tight text-stellar transition-transform duration-500 group-hover:-translate-y-0.5">
                    {t.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t.body}</p>
                </div>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-6 bottom-0 h-px scale-x-0 bg-gradient-to-r from-cyan to-violet transition-transform duration-500 group-hover:scale-x-100"
                />
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
