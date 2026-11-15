"use client";

import { useState } from "react";
import type { QuestionId } from "@/lib/copilot-data";
import { Hero } from "./hero";
import { CopilotDemo } from "./copilot/copilot-demo";

export function CopilotExperience() {
  const [activeId, setActiveId] = useState<QuestionId>("coords");

  const askFromHero = (id: QuestionId) => {
    setActiveId(id);
    document.getElementById("demo")?.scrollIntoView({ block: "start" });
  };

  return (
    <>
      <Hero onAsk={askFromHero} />
      <CopilotDemo activeId={activeId} onSelect={setActiveId} />
    </>
  );
}
