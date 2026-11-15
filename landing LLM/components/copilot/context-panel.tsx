import Image from "next/image";
import { Link2, Link2Off } from "lucide-react";
import { Spectrum } from "./spectrum";
import type { QuestionId } from "@/lib/copilot-data";

type Props = {
  connected: boolean;
  onToggle: () => void;
  activeId: QuestionId;
};

export function ContextPanel({ connected, onToggle, activeId }: Props) {
  return (
    <div className="flex flex-col gap-4 border-b border-line p-4 md:p-5 lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] tracking-[0.22em] text-muted uppercase">Contexto activo</p>
        <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[10px] tracking-[0.18em] text-stellar uppercase">
          Epoch 3 / 4
        </span>
      </div>

      <figure
        className={`relative aspect-[4/3] overflow-hidden rounded-lg border border-line-strong bg-void transition-opacity duration-500 ${
          connected ? "opacity-100" : "opacity-40"
        }`}
      >
        <Image
          src="/images/sky-field.png"
          alt="Recorte infrarrojo SPHEREx del campo estelar alrededor del candidato S-02"
          fill
          sizes="(min-width: 1024px) 420px, 100vw"
          className="object-cover opacity-80"
        />
        <div className="coord-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-cyan/10 to-transparent animate-scan"
        />
        <div aria-hidden="true" className="absolute top-1/2 left-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2">
          <span className="absolute inset-0 rounded-full border border-violet/70 animate-pulse-ring" />
          <span className="absolute inset-2 rounded-full border border-violet" />
          <span className="absolute top-1/2 -left-4 h-px w-4 bg-violet" />
          <span className="absolute top-1/2 -right-4 h-px w-4 bg-violet" />
          <span className="absolute -top-4 left-1/2 h-4 w-px bg-violet" />
          <span className="absolute -bottom-4 left-1/2 h-4 w-px bg-violet" />
        </div>
        <span className="absolute top-[calc(50%-3.25rem)] left-[calc(50%+2.25rem)] rounded bg-void/80 px-1.5 py-0.5 font-mono text-[10px] text-stellar">
          S-02
        </span>
        <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-void/90 to-transparent px-3 pt-6 pb-2 font-mono text-[10px] tracking-[0.12em] text-cyan">
          <span>RA 180.0042°</span>
          <span>Dec +00.0018°</span>
        </figcaption>
      </figure>

      <div
        className={`rounded-lg border border-line bg-navy/60 p-3 transition-opacity duration-500 ${
          connected ? "opacity-100" : "opacity-40"
        }`}
      >
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] tracking-[0.18em] text-muted uppercase">
          <span>Espectro SPHEREx</span>
          <span className="text-cyan">0.75 – 5.00 µm</span>
        </div>
        <Spectrum highlight={connected && (activeId === "wavelength" || activeId === "coords")} />
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={connected}
        className={`flex items-center gap-2.5 rounded-full border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan ${
          connected
            ? "border-violet/40 bg-violet/10 text-stellar"
            : "border-line-strong bg-transparent text-muted hover:text-stellar"
        }`}
      >
        <span className="relative flex h-2 w-2">
          {connected && <span className="absolute inset-0 rounded-full bg-violet animate-pulse-ring" aria-hidden="true" />}
          <span className={`relative h-2 w-2 rounded-full ${connected ? "bg-violet" : "bg-muted"}`} />
        </span>
        {connected ? (
          <Link2 aria-hidden="true" className="h-3.5 w-3.5 text-violet" />
        ) : (
          <Link2Off aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        <span>
          {connected ? "Contexto conectado: FITS + WCS + Espectro SPHEREx" : "Contexto desconectado · tocá para reconectar"}
        </span>
      </button>
    </div>
  );
}
