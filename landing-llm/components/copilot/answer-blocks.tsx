"use client";

import { useLanguage } from "@/lib/i18n";

import type { Answer } from "@/lib/copilot-data";

const delay = (ms: number) => ({ "--block-delay": `${ms}ms` }) as React.CSSProperties;

export function AnswerBlocks({ answer }: { answer: Answer }) {
  const { t } = useLanguage();
  return (
    <>
      <ul className="flex flex-wrap gap-1.5 animate-block-in" aria-label={t("Telemetría citada")}>
        {answer.telemetry.map((item) => (
          <li
            key={item.label}
            className={`rounded-md border px-2 py-1 font-mono text-[11px] ${
              item.tone === "cyan" ? "border-cyan/25 bg-cyan/5 text-cyan" : "border-violet/30 bg-violet/10 text-indigo-soft"
            }`}
          >
            {t(item.label)}
          </li>
        ))}
      </ul>

      {answer.comparison && (
        <div className="grid gap-2 sm:grid-cols-3 animate-block-in" style={delay(100)}>
          {answer.comparison.map((c) => {
            const featured = c.name === "Enana marrón";
            return (
              <div
                key={c.name}
                className={`flex flex-col gap-3 rounded-lg border p-3 ${
                  featured ? "border-violet/40 bg-violet/10" : "border-line bg-navy/60"
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-stellar">{t(c.name)}</p>
                  <p className="text-xs text-muted">{t(c.example)}</p>
                </div>
                <div className="flex items-end justify-between gap-2 font-mono text-[11px]">
                  <span className="text-cyan">{c.temperature}</span>
                  <span className="text-muted">{c.mass}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <div
                    className={`h-full rounded-full ${featured ? "bg-violet" : "bg-muted"}`}
                    style={{ width: `${Math.max(c.massScale * 100, 4)}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase sm:col-span-3">
            {t("Escala de masa relativa · M♃ = masas de Júpiter")}
          </p>
        </div>
      )}

      {answer.fits && (
        <dl className="overflow-hidden rounded-lg border border-line bg-void/70 animate-block-in" style={delay(100)}>
          {answer.fits.map((f) => (
            <div
              key={f.key}
              className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-0.5 border-b border-line px-3 py-2 last:border-b-0 sm:grid-cols-[5.5rem_7rem_1fr]"
            >
              <dt className="font-mono text-[11px] text-violet">{f.key}</dt>
              <dd className="font-mono text-[11px] text-cyan">{f.value}</dd>
              <dd className="col-span-2 text-xs text-muted sm:col-span-1">{t(f.note)}</dd>
            </div>
          ))}
        </dl>
      )}

      {answer.verdict && (
        <div className="rounded-lg border border-line bg-navy/60 p-3 animate-block-in" style={delay(180)}>
          <p className="mb-1 font-mono text-[10px] tracking-[0.22em] text-muted uppercase">{t(answer.verdict.label)}</p>
          <p className="text-sm leading-relaxed text-stellar">{t(answer.verdict.text)}</p>
        </div>
      )}
    </>
  );
}
