"use client";

import { useLanguage } from "@/lib/i18n";

import { useState } from "react";
import type { QuestionId } from "@/lib/copilot-data";
import { ContextPanel } from "./context-panel";
import { ChatPanel } from "./chat-panel";
import { Reveal } from "../reveal";

type Props = {
  activeId: QuestionId;
  onSelect: (id: QuestionId) => void;
};

export function CopilotDemo({ activeId, onSelect }: Props) {
  const { t } = useLanguage();
  const [connected, setConnected] = useState(true);

  return (
    <section id="demo" aria-labelledby="demo-title" className="relative scroll-mt-20 px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal className="mb-10 flex flex-col gap-3 md:mb-14">
          <p className="font-mono text-[10px] tracking-[0.22em] text-violet uppercase">{t("Demo en vivo · Candidato S-02")}</p>
          <h2 id="demo-title" className="text-gradient max-w-2xl text-3xl font-medium tracking-[-0.035em] text-balance md:text-5xl">
            {t("El copiloto lee lo mismo que vos estás mirando.")}
          </h2>
        </Reveal>

        <Reveal delay={120}>
          <div className="glass overflow-hidden rounded-2xl shadow-[0_40px_120px_-40px_rgba(155,140,255,0.35),0_0_0_1px_rgba(85,214,255,0.04)]">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              </span>
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted uppercase">
                {t("papastronomy / explorer / ")}<span className="text-stellar">{t("copilot")}</span>
              </p>
            </div>
            <div className="grid lg:grid-cols-12">
              <div className="lg:col-span-5">
                <ContextPanel connected={connected} onToggle={() => setConnected((c) => !c)} activeId={activeId} />
              </div>
              <div className="lg:col-span-7">
                <ChatPanel activeId={activeId} onSelect={onSelect} connected={connected} />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
