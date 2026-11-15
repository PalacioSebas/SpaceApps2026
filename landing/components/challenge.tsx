import Image from "next/image";
import { Clock, Layers, Lock, Compass } from "lucide-react";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const points = [
  {
    icon: Layers,
    title: "Many wavelengths, one object",
    body: "Some phenomena only reveal themselves when the same region of sky is examined across different infrared wavelengths.",
  },
  {
    icon: Clock,
    title: "Change lives between images",
    body: "Comparing observations taken at different times can expose motion or brightness changes that no single image can show.",
  },
  {
    icon: Lock,
    title: "Data is hard to reach",
    body: "Accessing, calibrating and interpreting raw astronomical data is rarely straightforward, even for experienced researchers.",
  },
  {
    icon: Compass,
    title: "A systematic way in",
    body: "Papastronomy aims to make this exploration more accessible, repeatable and systematic — from query to candidate.",
  },
];

export function Challenge() {
  return (
    <section id="challenge" aria-labelledby="challenge-title" className="relative py-28 md:py-40">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 md:px-8 lg:grid-cols-12 lg:gap-20">
        <Reveal className="relative lg:col-span-5">
          <figure className="relative overflow-hidden rounded-2xl border border-line">
            <Image
              src="/images/challenge.png"
              alt="Infrared view of towering columns of interstellar gas and dust scattered with stars"
              width={1024}
              height={1280}
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="aspect-[4/5] h-auto w-full object-cover"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-void/80 via-transparent to-transparent" />
            <div aria-hidden="true" className="coord-grid absolute inset-0 opacity-40 mix-blend-screen" />
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1/3 overflow-hidden">
              <div className="animate-scan h-full w-full bg-gradient-to-b from-transparent via-cyan/10 to-transparent" />
            </div>
            <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 font-mono text-[10px] uppercase tracking-[0.2em] text-stellar/80">
              <span>Infrared · star-forming region</span>
              <span className="text-muted">Illustrative</span>
            </figcaption>
          </figure>
          <div aria-hidden="true" className="absolute -left-3 -top-3 h-6 w-6 border-l border-t border-cyan/60" />
          <div aria-hidden="true" className="absolute -bottom-3 -right-3 h-6 w-6 border-b border-r border-cyan/60" />
        </Reveal>

        <div className="flex flex-col justify-center lg:col-span-7">
          <SectionHeading
            id="challenge-title"
            index="01"
            eyebrow="The scientific challenge"
            title="The universe holds questions we have yet to answer."
            description="Faint, cold or distant objects — including any hypothetical body in the outer Solar System — may hide in plain sight within survey data. Finding them requires looking at the sky in new ways."
          />
          <ul className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            {points.map((point, i) => (
              <Reveal as="li" key={point.title} delay={i * 90} className="bg-void p-6 transition-colors hover:bg-navy md:p-7">
                <point.icon aria-hidden="true" className="h-5 w-5 text-cyan" strokeWidth={1.5} />
                <h3 className="mt-5 text-base font-medium text-stellar">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{point.body}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
