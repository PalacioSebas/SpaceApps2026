import type { ReactNode } from "react";
import { Reveal } from "./reveal";

type SectionHeadingProps = {
  index: string;
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  id?: string;
};

export function SectionHeading({
  index,
  eyebrow,
  title,
  description,
  align = "left",
  id,
}: SectionHeadingProps) {
  const centered = align === "center";
  return (
    <Reveal className={`flex flex-col gap-5 ${centered ? "items-center text-center" : ""}`}>
      <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.22em] text-cyan">
        <span className="text-muted">{index}</span>
        <span aria-hidden="true" className="h-px w-8 bg-cyan/50" />
        {eyebrow}
      </p>
      <h2
        id={id}
        className={`text-gradient text-balance text-4xl font-medium leading-[1.05] tracking-tight md:text-6xl ${
          centered ? "max-w-4xl" : "max-w-3xl"
        }`}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={`text-pretty text-base leading-relaxed text-muted md:text-lg ${
            centered ? "max-w-2xl" : "max-w-xl"
          }`}
        >
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}
