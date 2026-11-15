"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Info, Sparkles } from "lucide-react";
import { answers, answerById, type QuestionId } from "@/lib/copilot-data";
import { AnswerBlocks } from "./answer-blocks";

function useStreamedText(text: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(text.length);
      return;
    }
    setCount(0);
    const id = window.setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          window.clearInterval(id);
          return c;
        }
        return Math.min(c + 4, text.length);
      });
    }, 18);
    return () => window.clearInterval(id);
  }, [text]);

  return { visible: text.slice(0, count), done: count >= text.length };
}

type Props = {
  activeId: QuestionId;
  onSelect: (id: QuestionId) => void;
  connected: boolean;
};

export function ChatPanel({ activeId, onSelect, connected }: Props) {
  const answer = answerById[activeId];
  const missingContext = answer.usesContext && !connected;
  const summary = missingContext
    ? "Sin el contexto del recorte no puedo leer las coordenadas, el header FITS ni el espectro de esta región. Reconectá el contexto para que analice los datos que tenés en pantalla, o preguntame algo conceptual."
    : answer.summary;
  const { visible, done } = useStreamedText(summary);

  return (
    <div className="flex min-h-[560px] flex-col">
      <div className="flex flex-wrap gap-2 border-b border-line p-4 md:px-5" role="group" aria-label="Preguntas de ejemplo">
        {answers.map((a) => {
          const active = a.id === activeId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a.id)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan ${
                active
                  ? "border-violet/50 bg-violet/15 text-stellar"
                  : "border-line-strong text-muted hover:border-violet/30 hover:text-stellar"
              }`}
            >
              {a.short}
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 flex-col gap-5 p-4 md:p-6" aria-live="polite" aria-busy={!done}>
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm border border-line-strong bg-midnight px-4 py-2.5 text-sm leading-relaxed text-stellar">
          {answer.question}
        </div>

        <div className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet/40 bg-violet/10"
          >
            <Sparkles className="h-3.5 w-3.5 text-violet" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <p className="font-mono text-[10px] tracking-[0.22em] text-violet uppercase">
              Papastronomy Copilot
              {answer.usesContext && connected && <span className="text-muted"> · leyendo S-02</span>}
            </p>

            {missingContext && (
              <p className="flex items-center gap-2 rounded-md border border-line-strong bg-navy/70 px-3 py-2 text-xs text-muted">
                <Info aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-cyan" />
                Esta pregunta necesita el contexto del observatorio.
              </p>
            )}

            <p className="text-pretty text-[15px] leading-relaxed text-stellar/90">
              {visible}
              {!done && <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-violet animate-caret" />}
            </p>

            {done && !missingContext && <AnswerBlocks key={answer.id} answer={answer} />}

            {done && (
              <div className="flex flex-wrap gap-2 animate-block-in" style={{ "--block-delay": "300ms" } as React.CSSProperties}>
                {(missingContext
                  ? [{ label: "¿Qué es una enana marrón?", target: "brown-dwarf" as QuestionId }]
                  : answer.followUps
                ).map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => onSelect(f.target)}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-xs text-muted transition-colors hover:border-cyan/40 hover:text-stellar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
                  >
                    {f.label}
                    <ArrowRight aria-hidden="true" className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-line p-4 md:px-5">
        <div className="flex items-center gap-3 rounded-xl border border-line-strong bg-void/60 px-4 py-3">
          <span className="flex-1 truncate text-sm text-muted">Preguntá sobre cualquier objeto o región del cielo…</span>
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted uppercase">Demo</span>
        </div>
      </div>
    </div>
  );
}
