/* =====================================================================
   Observatorio · puente entre app.js y la Sección 1.

   - Solo LEE el estado global de app.js (`state`, `getSynchronizedTemporalState`).
   - Para cambiar algo reutiliza los controles existentes (slider de época,
     botón de reproducción, pasos de la secuencia), así la lógica sigue en app.js.
   - app.js avisa con el evento `papastronomy:update`; acá se agrupan los avisos
     en un solo repintado por cuadro y cada bloque se redibuja solo si cambió.
   ===================================================================== */
(() => {
  const $ = (id) => document.getElementById(id);
  const last = new Map();
  let queued = false;

  function changed(key, signature) {
    if (last.get(key) === signature) return false;
    last.set(key, signature);
    return true;
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      try {
        update();
      } catch (err) {
        console.error("Observatorio: no se pudo actualizar la vista", err);
      }
    });
  }

  // ---------- Formato ----------
  const MINUS = "−";
  const fmtRa = (v) => `${Number(v).toFixed(4)}°`;
  const fmtDec = (v) => `${v < 0 ? MINUS : "+"}${Math.abs(Number(v)).toFixed(4)}°`;
  const fmtFov = (v) => `${Number(v).toFixed(Number(v) < 0.1 ? 3 : 2).replace(/0+$/, "").replace(/\.$/, "")}°`;
  const detectorCode = (raw) => {
    const match = String(raw || "").match(/D?\s*([1-6])\b/i);
    return match ? `D${match[1]}` : String(raw || "D?");
  };

  // ---------- Explicaciones (simple / técnica según el perfil) ----------
  // El perfil guarda "simple", "equilibrada" o "tecnica"; solo "tecnica" usa el texto técnico.
  function isTechnical() {
    return $("personal-workspace")?.access?.session?.profile?.explanations === "tecnica";
  }
  const HINTS = {
    fits: {
      simple: "Los datos técnicos que trae cada foto: tamaño, cómo se proyecta el cielo y en qué unidad se mide el brillo. Pasá el cursor por cada clave para ver qué significa.",
      tecnica: "Claves de la HDU de imagen del recorte activo: geometría, WCS, unidad de flujo y metadatos de la exposición.",
    },
    spectrum: {
      simple: "Cuánta luz infrarroja emite el objeto en cada longitud de onda: a la izquierda luz más «azul», a la derecha más «roja».",
      tecnica: "Fotometría por banda en el píxel seleccionado (MJy/sr), 0.75–5.0 µm, a partir de los recortes cargados.",
    },
    analysis: {
      simple: "La IA compara fotos del mismo lugar tomadas en fechas distintas y busca objetos que se movieron o cambiaron de brillo.",
      tecnica: "Imagen de diferencia (media tardía − media temprana) en bandas comparables; detecciones por umbral de SNR.",
    },
  };
  const FITS_KEY_HELP = {
    SIMPLE: "Archivo FITS estándar (T = sí).",
    BITPIX: "Formato de cada píxel: -32 = número decimal de 32 bits.",
    NAXIS: "Cantidad de dimensiones de la imagen (2 = una foto plana).",
    NAXIS1: "Ancho de la imagen, en píxeles.",
    NAXIS2: "Alto de la imagen, en píxeles.",
    CTYPE1: "Eje horizontal: ascensión recta (RA) en proyección tangente (TAN). SIP = corrección de la distorsión óptica.",
    CTYPE2: "Eje vertical: declinación (Dec) en proyección tangente (TAN).",
    BUNIT: "Unidad del brillo: megajansky por estereorradián (brillo por unidad de área del cielo).",
    DETECTOR: "Cuál de los 6 detectores de SPHEREx tomó la foto; cada uno cubre un rango de longitudes de onda.",
    "DATE-OBS": "Fecha y hora (UTC) en que se tomó la foto.",
  };
  const ANALYSIS_TERM_HELP = {
    "obs-an-candidates-term": "Objetos que cambiaron entre una fecha y otra.",
    "obs-an-diff-term": "Qué fotos se restaron: la más nueva menos la más vieja.",
    "obs-an-status-term": "El hallazgo más fuerte y qué tan claro es. σ = cuántas veces supera al ruido; desde 5σ se considera confiable.",
  };

  /** Escribe texto con fragmentos resaltados sin usar innerHTML (los datos vienen del servidor). */
  function setReading(el, parts) {
    el.replaceChildren(
      ...parts.filter((p) => p !== null && p !== undefined && p !== "").map((part) => {
        if (typeof part === "string") return document.createTextNode(part);
        const b = document.createElement("b");
        b.textContent = part.b;
        return b;
      })
    );
  }
  const sigma = (value) => `${Number(value).toFixed(1)}σ`;

  function hasData() {
    return Boolean(state.exploreData?.epochs?.length) && state.moduleDataSequence === state.exploreSequence;
  }
  function currentEpoch() {
    const epochs = state.exploreData?.epochs || [];
    return epochs[Math.min(Math.max(0, state.currentEpochIdx || 0), epochs.length - 1)] || null;
  }

  // ---------- Barra superior y objetivo ----------
  function updateHeader() {
    const data = hasData() ? state.exploreData : null;
    const sig = JSON.stringify([state.ra, state.dec, state.fov, data?.target_info?.total_bands, data?.epochs?.length, state.isLoading]);
    if (!changed("header", sig)) return;
    $("obs-pill-text").textContent = `RA ${fmtRa(state.ra)} · Dec ${fmtDec(state.dec)} · FoV ${fmtFov(state.fov)}`;
    $("obs-ra").textContent = fmtRa(state.ra);
    $("obs-dec").textContent = fmtDec(state.dec);
    $("obs-fov").textContent = fmtFov(state.fov);
    const bands = data?.target_info?.total_bands || data?.epochs?.length || 0;
    $("obs-mode-chip").textContent = state.isLoading
      ? "Cargando…"
      : data
      ? `IR ${bands} banda${bands === 1 ? "" : "s"} · WCS`
      : "Sin datos";
  }

  // ---------- Observaciones ----------
  function updateEpochList() {
    const list = $("obs-epoch-list");
    const epochs = hasData() ? state.exploreData.epochs : [];
    if (changed("epochs", `${state.exploreSequence}:${epochs.length}`)) {
      list.replaceChildren(
        ...epochs.map((ep, index) => {
          const li = document.createElement("li");
          const btn = document.createElement("button");
          btn.type = "button";
          btn.dataset.index = String(index);
          const wl = Number(ep.wavelength_center_um);
          const name = document.createElement("span");
          name.textContent = `E${(ep.epoch_id ?? index) + 1} · ${detectorCode(ep.detector)}`;
          const value = document.createElement("span");
          value.className = "obs-wl";
          value.textContent = wl > 0 ? `${wl.toFixed(2)} µm` : "λ n/d";
          btn.title = `Recorte ${index + 1}: ${ep.detector || "detector"} · ${wl > 0 ? wl.toFixed(3) : "?"} µm · ${ep.clean_pixels_pct}% píxeles limpios`;
          btn.append(name, value);
          li.append(btn);
          return li;
        })
      );
      $("obs-epoch-count").textContent = epochs.length ? String(epochs.length) : "";
      last.delete("epoch-active");
    }
    const active = epochs.length ? state.currentEpochIdx : -1;
    if (!changed("epoch-active", String(active))) return;
    list.querySelectorAll("button[aria-current]").forEach((b) => b.removeAttribute("aria-current"));
    const btn = list.querySelector(`button[data-index="${active}"]`);
    if (!btn) return;
    btn.setAttribute("aria-current", "true");
    // Desplazar solo la lista (no la página) para mantener visible el recorte activo.
    const top = btn.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + btn.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - list.clientHeight / 2 + btn.offsetHeight / 2;
    }
  }

  // ---------- Cabecera FITS y λ del mapa ----------
  const HEADER_KEYS = ["SIMPLE", "BITPIX", "NAXIS", "NAXIS1", "NAXIS2", "CTYPE1", "CTYPE2", "BUNIT", "DETECTOR", "DATE-OBS"];
  function updateFitsHeader() {
    const ep = hasData() ? currentEpoch() : null;
    const index = ep ? state.currentEpochIdx : -1;
    const technical = isTechnical();
    if (!changed("fits", `${state.exploreSequence}:${index}:${technical}`)) return;
    $("obs-fits-hint").textContent = HINTS.fits[technical ? "tecnica" : "simple"];
    const dl = $("obs-fits-header");
    const header = ep?.fits_header || {};
    const keys = HEADER_KEYS.filter((key) => key in header);
    dl.dataset.empty = ep ? "Cabecera no disponible para este recorte." : "Esperando un recorte…";
    dl.replaceChildren(
      ...keys.flatMap((key) => {
        const dt = document.createElement("dt");
        dt.textContent = key;
        if (FITS_KEY_HELP[key]) dt.title = FITS_KEY_HELP[key];
        const dd = document.createElement("dd");
        dd.textContent = header[key];
        dd.title = `${key} = ${header[key]}`;
        return [dt, dd];
      })
    );
    $("obs-fits-epoch").textContent = ep ? `#${index + 1}` : "";
    const wl = Number(ep?.wavelength_center_um);
    $("obs-map-lambda").textContent = wl > 0 ? `λ ${wl.toFixed(2)} µm · MJy/sr` : "λ -- µm · MJy/sr";
  }

  // ---------- Análisis ----------
  function updateAnalysis() {
    const data = hasData() ? state.exploreData : null;
    const detections = data ? state.allAiDetections || [] : [];
    const technical = isTechnical();
    const sig = JSON.stringify([state.exploreSequence, Boolean(data), technical, detections.map((d) => [d.id, d.type, d.snr_score])]);
    if (!changed("analysis", sig)) return;
    $("obs-analysis-hint").textContent = HINTS.analysis[technical ? "tecnica" : "simple"];
    for (const [id, help] of Object.entries(ANALYSIS_TERM_HELP)) $(id).title = help;
    $("obs-an-candidates").textContent = data ? String(detections.length) : "--";

    const info = data?.target_info;
    const indices = info?.analysis_frame_indices || [];
    const comparable = Boolean(info?.difference_available && indices.length >= 2);
    const firstEp = comparable ? data.epochs[indices[0]] : null;
    const lastEp = comparable ? data.epochs[indices[indices.length - 1]] : null;
    const tagA = `E${(firstEp?.epoch_id ?? 0) + 1}`;
    const tagB = `E${(lastEp?.epoch_id ?? 0) + 1}`;
    const diffEl = $("obs-an-diff");
    diffEl.title = info?.analysis_note || "";
    diffEl.textContent = !data ? "--" : comparable ? `${tagB} ${MINUS} ${tagA}` : technical ? "No disponible" : "Sin fotos para comparar";

    const statusEl = $("obs-an-status");
    const best = (type) => detections.filter((d) => d.type === type).sort((a, b) => b.snr_score - a.snr_score)[0];
    const dipole = best("MOVING_DIPOLE");
    const variable = best("VARIABLE_MONOPOLE");
    statusEl.className = "is-violet";
    if (!data) statusEl.textContent = "--";
    else if (dipole) statusEl.textContent = technical ? `Dipolo ${sigma(dipole.snr_score)}` : `Se movió · ${sigma(dipole.snr_score)}`;
    else if (variable) {
      statusEl.textContent = technical ? `Monopolo ${sigma(variable.snr_score)}` : `Cambió de brillo · ${sigma(variable.snr_score)}`;
      statusEl.className = "is-amber";
    } else {
      statusEl.textContent = technical ? "Sin anomalías" : "Sin cambios";
      statusEl.className = "";
    }

    setReading($("obs-analysis-reading"), data ? analysisReading({ technical, comparable, tagA, tagB, dipole, variable, detections, info }) : []);
  }

  function analysisReading({ technical, comparable, tagA, tagB, dipole, variable, detections, info }) {
    const weak = (det) => (det.snr_score < 5 ? (technical ? " (SNR < 5: requiere confirmación)." : " Es una señal débil: conviene confirmarla con más fotos.") : ".");
    const match = (det) => (det.catalog_match ? (technical ? ` Contraparte: ${det.catalog_match}.` : ` Coincide con un objeto ya catalogado (${det.catalog_match}).`) : "");
    if (!comparable) {
      return technical
        ? [info?.analysis_note || "Sin pares comparables para construir la imagen de diferencia."]
        : ["No se puede comparar: hacen falta al menos dos fotos de la ", { b: "misma banda" }, " tomadas en ", { b: "fechas distintas" }, ", y esta región no las tiene."];
    }
    if (dipole) {
      return technical
        ? [`Dipolo entre ${tagA} y ${tagB} con SNR `, { b: sigma(dipole.snr_score) },
           dipole.shift_arcsec != null ? `, desplazamiento ${Number(dipole.shift_arcsec).toFixed(2)}″` : "",
           dipole.proper_motion_arcsec_yr ? `, μ ≈ ${Number(dipole.proper_motion_arcsec_yr).toFixed(2)}″/año` : "",
           weak(dipole), match(dipole), ` ${detections.length} candidato${detections.length === 1 ? "" : "s"} en total.`]
        : ["Un objeto ", { b: "cambió de posición" }, ` entre ${tagA} y ${tagB}. Su señal es `, { b: sigma(dipole.snr_score) },
           dipole.snr_score >= 5 ? "; desde 5σ ya se considera una detección confiable." : ".", dipole.snr_score < 5 ? weak(dipole) : "", match(dipole)];
    }
    if (variable) {
      return technical
        ? [`Monopolo (variabilidad) entre ${tagA} y ${tagB} con SNR `, { b: sigma(variable.snr_score) }, weak(variable), match(variable)]
        : ["Un objeto ", { b: "cambió de brillo" }, ` (no de lugar) entre ${tagA} y ${tagB}, con una señal de `, { b: sigma(variable.snr_score) }, weak(variable), match(variable)];
    }
    return technical
      ? [`Diferencia ${tagB} − ${tagA} sin residuos por encima del umbral de detección.`]
      : [`Se compararon ${tagA} y ${tagB} y `, { b: "nada se movió ni cambió de brillo" }, ": el campo está quieto."];
  }

  // ---------- Espectro chico ----------
  function spectrumLabel() {
    const det = (state.allAiDetections || []).find((d) => d.id === state.selectedDetectionId);
    if (det) return det.iau_designation ? det.iau_designation.replace(/^SPHEREx\s+/, "") : `Anomalía #${det.id}`;
    return state.exploreData?.target_info?.matched_target_name || "Centro";
  }
  function updateSpectrum() {
    const current = state.moduleSpectrum;
    const data = current && current.exploreSequence === state.exploreSequence ? current.data : null;
    const status = window.PapastronomyI18n?.sourceText($("spectrum-coord-label")) ?? $("spectrum-coord-label")?.textContent ?? "";
    const technical = isTechnical();
    const sig = (data ? `data:${current.sequence}` : `empty:${state.isLoading}:${status}`) + `:${technical}`;
    if (!changed("spectrum", sig)) return;
    $("obs-spectrum-hint").textContent = HINTS.spectrum[technical ? "tecnica" : "simple"];
    const plot = $("obs-spectrum-mini");
    const empty = $("obs-spectrum-empty");
    if (!data || !window.Plotly || !data.spectrum?.length) {
      if (window.Plotly) Plotly.purge(plot);
      empty.hidden = false;
      empty.textContent = state.isLoading
        ? "Esperando la región…"
        : status.startsWith("No se pudo")
        ? "No se pudo medir el espectro. Tocá una fuente del mapa para reintentar."
        : "Midiendo el espectro del objetivo…";
      $("obs-spectrum-label").textContent = "";
      setReading($("obs-spectrum-reading"), []);
      return;
    }
    empty.hidden = true;
    $("obs-spectrum-label").textContent = spectrumLabel();
    const points = data.spectrum
      .filter((p) => Number.isFinite(p.wavelength_um) && Number.isFinite(p.flux_mjy_sr))
      .sort((a, b) => a.wavelength_um - b.wavelength_um);
    setReading($("obs-spectrum-reading"), spectrumReading(data, points, technical));
    const trace = {
      x: points.map((p) => p.wavelength_um),
      y: points.map((p) => p.flux_mjy_sr),
      mode: "lines+markers",
      line: { color: "#55d6ff", width: 1.6, shape: "spline", smoothing: 0.6 },
      marker: { color: "#55d6ff", size: 3.5 },
      fill: "tozeroy",
      fillcolor: "rgba(85, 214, 255, 0.08)",
      hovertemplate: "λ %{x:.2f} µm<br>%{y:.3f} MJy/sr<extra></extra>",
    };
    const layout = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 4, r: 4, t: 6, b: 4 },
      xaxis: { range: [0.75, 5.0], visible: false, fixedrange: true },
      yaxis: { showticklabels: false, zeroline: false, gridcolor: "rgba(243, 245, 250, 0.06)", nticks: 4, fixedrange: true },
      showlegend: false,
      hoverlabel: { bgcolor: "#0a1020", bordercolor: "#55d6ff", font: { family: "Geist Mono, monospace", size: 11, color: "#f3f5fa" } },
    };
    Plotly.react(plot, [trace], layout, { responsive: true, displayModeBar: false });
  }

  function spectrumReading(data, points, technical) {
    const diag = data.ai_diagnosis || {};
    const n = points.length;
    const count = `${n} medicion${n === 1 ? "" : "es"}`;
    if (!n) return ["Sin mediciones válidas en este punto."];
    const peak = points.reduce((a, b) => (b.flux_mjy_sr > a.flux_mjy_sr ? b : a));
    const peakLabel = `${peak.wavelength_um.toFixed(2)} µm`;
    if (technical) {
      const molecules = (diag.detected_molecules || []).join(", ");
      return [
        { b: diag.classification || "Sin clasificación" },
        diag.confidence != null ? ` · confianza ${Math.round(diag.confidence * 100)}%` : "",
        diag.effective_temp_k_est ? ` · T_eff ≈ ${diag.effective_temp_k_est} K` : "",
        molecules ? ` · ${molecules}` : "",
        ` · pico en ${peakLabel} · ${n} bandas.`,
      ];
    }
    const kind = String(diag.classification || "").toLowerCase();
    if (kind.includes("insuficiente") || n < 3) {
      return ["Hay ", { b: "pocas mediciones con señal clara" }, ` (${count}). Tocá otra fuente del mapa o cargá más recortes para ver mejor su color.`];
    }
    if (kind.includes("fría")) {
      return ["Brilla más hacia ", { b: "5 µm" }, ": así se ven los objetos ", { b: "fríos" }, ", como una enana marrón, o rodeados de polvo. ", `(${count})`];
    }
    if (kind.includes("estelar")) {
      return ["Brilla más cerca de ", { b: peakLabel }, " y se apaga hacia 5 µm: así se ve una ", { b: "estrella común" }, `. (${count})`];
    }
    if (kind.includes("intermedio")) {
      return ["Su luz está ", { b: "repartida" }, " entre el infrarrojo cercano y el medio: no es claramente una estrella común ni un objeto frío. ", `(${count})`];
    }
    return ["Brilla más cerca de ", { b: peakLabel }, `. (${count})`];
  }

  // ---------- Barra de épocas ----------
  function updateTimeline() {
    const ready = hasData() && typeof getSynchronizedTemporalState === "function";
    const sync = ready ? getSynchronizedTemporalState() : null;
    const frames = sync?.seqFrames || [];
    const K = ready ? sync.K : 0;
    const active = ready ? sync.activeStep : -1;
    const playing = Boolean(state.isPlaying);
    const sig = JSON.stringify([state.exploreSequence, K, active, playing, state.isLoading, frames.map((f) => f.frameKey)]);
    if (!changed("timeline", sig)) return;

    const play = $("obs-play");
    play.setAttribute("aria-pressed", String(playing));
    play.setAttribute("aria-label", playing ? "Pausar secuencia" : "Reproducir secuencia");
    play.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    ["obs-prev", "obs-play", "obs-next"].forEach((id) => { $(id).disabled = !ready || state.isLoading; });

    const dots = $("obs-track-dots");
    dots.replaceChildren(
      ...Array.from({ length: K }, (_, i) => {
        const frame = frames[i] || {};
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.step = String(i);
        const label = frame.title || frame.badgeText || frame.shortTag || `Paso ${i + 1}`;
        btn.title = label;
        btn.setAttribute("aria-label", `Ir a la época ${i + 1}: ${label}`);
        if (i < active) btn.classList.add("is-past");
        if (frame.kind === "historic") btn.classList.add("is-historic");
        if (i === active) btn.setAttribute("aria-current", "step");
        return btn;
      })
    );
    $("obs-track-fill").style.width = K > 1 && active >= 0 ? `${(active / (K - 1)) * 100}%` : "0";
    $("obs-epoch-label").textContent = ready ? `Época ${active + 1} / ${K}` : "Época -- / --";
    const frame = sync?.activeFrame || {};
    $("obs-epoch-caption").textContent = ready ? frame.title || frame.badgeText || frame.shortTag || "" : "";
  }

  // ---------- Botón "Ver en 3D" sobre el mapa ----------
  function selectedNamedObject() {
    return (state.skyView?.namedObjects || []).find((o) => o.id === state.selectedNamedObjectId) || null;
  }
  function updateMap3d() {
    const obj = hasData() ? selectedNamedObject() : null;
    const show = Boolean(obj?.model_3d && window.PapastronomyLearn3D);
    if (!changed("map3d", show ? `${obj.id}:${obj.model_3d}` : "none")) return;
    const btn = $("obs-map-3d");
    btn.hidden = !show;
    if (show) {
      $("obs-map-3d-label").textContent = `Ver en 3D · ${obj.name}`;
      btn.title = `Abre debajo del mapa una ilustración educativa en 3D de ${obj.category || "este astro"}`;
    }
  }

  function update() {
    updateMap3d();
    updateHeader();
    updateEpochList();
    updateFitsHeader();
    updateAnalysis();
    updateSpectrum();
    updateTimeline();
  }

  // ---------- Acciones (reutilizan los controles de app.js) ----------
  function pausePlayback() {
    if (state.isPlaying) $("btn-play-pause")?.click();
  }
  function goToStep(index) {
    if (!hasData()) return;
    const K = getSynchronizedTemporalState().K;
    const step = ((index % K) + K) % K;
    pausePlayback();
    // Los pasos de "Secuencia Histórica Sincronizada" ya saben sincronizar ambos mapas.
    document.querySelector(`#multi-epoch-steps-bar [data-step-idx="${step}"]`)?.click();
  }
  function goToEpoch(index) {
    const slider = $("slider-epoch");
    if (!slider || slider.disabled) return;
    pausePlayback();
    slider.value = String(index);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function bind() {
    $("obs-play").addEventListener("click", () => $("btn-play-pause")?.click());
    $("obs-map-3d").addEventListener("click", () => {
      const obj = selectedNamedObject();
      if (obj?.model_3d) window.PapastronomyLearn3D?.open(obj);
    });
    $("obs-prev").addEventListener("click", () => goToStep(getSynchronizedTemporalState().activeStep - 1));
    $("obs-next").addEventListener("click", () => goToStep(getSynchronizedTemporalState().activeStep + 1));
    $("obs-track-dots").addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-step]");
      if (btn) goToStep(Number(btn.dataset.step));
    });
    $("obs-epoch-list").addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-index]");
      if (btn) goToEpoch(Number(btn.dataset.index));
    });
    $("obs-search-pill").addEventListener("click", () => {
      const input = $("input-ra");
      if (!input) return;
      window.scrollTo({ top: 0, behavior: "smooth" });
      input.focus({ preventScroll: true });
      input.select();
    });
    const mini = $("obs-spectrum-mini");
    new ResizeObserver(() => {
      if (window.Plotly && mini.data) Plotly.Plots.resize(mini);
    }).observe(mini);
  }

  document.addEventListener("papastronomy:update", schedule);
  // Cambiar de perfil o de preferencia de explicaciones cambia el tono de los textos.
  document.addEventListener("sessionchange", schedule);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { bind(); schedule(); });
  } else {
    bind();
    schedule();
  }
})();
