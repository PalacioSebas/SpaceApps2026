/**
 * Frontend v2.0 - Papastronomy SPHEREx & Planet X Explorer.
 * Conectado a recortes .FITS reales de NASA/IPAC IRSA (128x128 px),
 * muestra enlaces directos a los recortes FITS oficiales y el cruce en vivo con Gaia DR3 / AllWISE.
 */

const CUTOUT_NPIX = 128.0;

const state = {
  ra: 133.795129,
  dec: -7.245147,
  fov: 0.05,
  targets: [],
  exploreData: null,
  currentEpochIdx: 0,
  isPlaying: true,
  fps: 2,
  timerId: null,
  viewMode: "blink",
  showAIMarkers: true,
  showFlags: false,
  selectedPixel: { x: 64, y: 64 },
  epochImages: [],
  flagImages: [],
  coaddImage: null,
  diffImage: null,
  aladin: null,
  gaiaCat: null,
  wiseCat: null,
};

function getParamsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const ra = parseFloat(params.get("ra"));
  const dec = parseFloat(params.get("dec"));
  const fov = parseFloat(params.get("fov"));
  return {
    ra: !isNaN(ra) ? ra : 133.795129,
    dec: !isNaN(dec) ? dec : -7.245147,
    fov: !isNaN(fov) ? fov : 0.05,
  };
}

function syncUrlParams(ra, dec, fov) {
  const url = new URL(window.location);
  url.searchParams.set("ra", Number(ra).toFixed(6));
  url.searchParams.set("dec", Number(dec).toFixed(6));
  url.searchParams.set("fov", Number(fov).toFixed(4));
  window.history.replaceState({}, "", url);
}

function initAladinLite(ra, dec, fov) {
  if (typeof A === "undefined" || !A.init) return;
  A.init.then(() => {
    state.aladin = A.aladin("#aladin-lite-div", {
      survey: "P/allWISE/color",
      fov: fov,
      target: `${ra} ${dec}`,
      showReticle: true,
      showZoomControl: true,
      showFullscreenControl: false,
      showLayersControl: false,
    });

    state.gaiaCat = A.catalogHiPS("https://hips.cds.unistra.fr/HiPSCatService/I/355/gaiadr3", {
      onClick: "showTable",
      name: "Gaia DR3",
      color: "#38bdf8",
      sourceSize: 9,
    });
    state.aladin.addCatalog(state.gaiaCat);

    state.wiseCat = A.catalogHiPS("https://hips.cds.unistra.fr/HiPSCatService/II/328/allwise", {
      onClick: "showTable",
      name: "AllWISE",
      color: "#f59e0b",
      sourceSize: 9,
    });
    state.aladin.addCatalog(state.wiseCat);
  });
}

function updateAladinView(ra, dec, fov) {
  if (state.aladin) {
    state.aladin.gotoRaDec(ra, dec);
    state.aladin.setFoV(fov);
  }
}

function loadImagePromise(b64Src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = b64Src;
  });
}

function renderCanvas() {
  const canvas = document.getElementById("spherex-canvas");
  if (!canvas || !state.exploreData) return;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const epochs = state.exploreData.epochs || [];
  let baseImg = null;

  if (state.viewMode === "diff" && state.diffImage) {
    baseImg = state.diffImage;
  } else if (state.viewMode === "coadd" && state.coaddImage) {
    baseImg = state.coaddImage;
  } else if (state.epochImages.length > 0) {
    baseImg = state.epochImages[state.currentEpochIdx % state.epochImages.length];
  }

  if (baseImg) {
    ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
  }

  if (state.showFlags && state.flagImages.length > 0) {
    const flgImg = state.flagImages[state.currentEpochIdx % state.flagImages.length];
    if (flgImg) {
      ctx.drawImage(flgImg, 0, 0, canvas.width, canvas.height);
    }
  }

  const scale = canvas.width / CUTOUT_NPIX;

  if (state.showAIMarkers && state.exploreData.ai_detections) {
    state.exploreData.ai_detections.forEach((det) => {
      const cx = (det.x_pix + 0.5) * scale;
      const cy = (CUTOUT_NPIX - 1.0 - det.y_pix + 0.5) * scale;

      ctx.save();
      if (det.type === "MOVING_DIPOLE") {
        if (det.neg_x_pix !== null && det.neg_y_pix !== null) {
          const nx = (det.neg_x_pix + 0.5) * scale;
          const ny = (CUTOUT_NPIX - 1.0 - det.neg_y_pix + 0.5) * scale;

          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 1.8;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(nx, ny, 10, 0, Math.PI * 2);
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.strokeStyle = "#fb7185";
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(nx, ny);
          ctx.lineTo(cx, cy);
          ctx.stroke();
        }

        ctx.strokeStyle = "#f43f5e";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#fda4af";
        ctx.font = "bold 11px monospace";
        ctx.fillText(`#${det.id} DIPOLO (${det.snr_score}σ)`, cx + 15, cy - 6);
      } else {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#fde68a";
        ctx.font = "bold 11px monospace";
        ctx.fillText(`#${det.id} VARIABLE (${det.snr_score}σ)`, cx + 15, cy - 6);
      }
      ctx.restore();
    });
  }

  if (state.selectedPixel) {
    const sx = (state.selectedPixel.x + 0.5) * scale;
    const sy = (CUTOUT_NPIX - 1.0 - state.selectedPixel.y + 0.5) * scale;
    ctx.save();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sx - 10, sy);
    ctx.lineTo(sx - 3, sy);
    ctx.moveTo(sx + 3, sy);
    ctx.moveTo(sx + 10, sy);
    ctx.moveTo(sx, sy - 10);
    ctx.moveTo(sx, sy - 3);
    ctx.moveTo(sx, sy + 3);
    ctx.lineTo(sx, sy + 10);
    ctx.stroke();
    ctx.restore();
  }

  if (epochs.length > 0) {
    const ep = epochs[state.currentEpochIdx % epochs.length];
    document.getElementById("frame-counter").textContent =
      state.viewMode === "blink"
        ? `Época ${state.currentEpochIdx + 1}/${epochs.length}`
        : state.viewMode === "diff"
        ? "Modo: Resta ΔI"
        : "Modo: Suma SNR";
    document.getElementById("overlay-date").textContent = `Fecha Real: ${ep.obs_time}`;
    document.getElementById("overlay-detector").textContent = `Banda/Det: ${ep.detector} | λc: ${ep.wavelength_center_um.toFixed(2)} μm`;
    document.getElementById("overlay-clean").textContent = `Píxeles limpios: ${ep.clean_pixels_pct}%`;
  }
}

function startBlinkTimer() {
  if (state.timerId) clearInterval(state.timerId);
  if (!state.isPlaying) return;
  const intervalMs = Math.round(1000 / state.fps);
  state.timerId = setInterval(() => {
    if (state.viewMode === "blink" && state.exploreData && state.exploreData.epochs.length > 0) {
      state.currentEpochIdx = (state.currentEpochIdx + 1) % state.exploreData.epochs.length;
      document.getElementById("slider-epoch").value = state.currentEpochIdx;
      renderCanvas();
    }
  }, intervalMs);
}

function renderAIDetectionsList(detections) {
  const container = document.getElementById("ai-detections-list");
  const badge = document.getElementById("ai-count-badge");
  container.innerHTML = "";
  badge.textContent = `${detections.length} anomalía${detections.length === 1 ? "" : "s"}`;

  if (detections.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-400 p-3 bg-slate-900/60 rounded-lg border border-slate-800">No se detectaron anomalías &gt; 4σ en este recorte FITS.</div>`;
    return;
  }

  detections.forEach((det, idx) => {
    const isDipole = det.type === "MOVING_DIPOLE";
    const card = document.createElement("div");
    card.className = `p-2.5 rounded-lg border transition cursor-pointer ${
      isDipole
        ? "bg-rose-950/25 border-rose-500/40 hover:bg-rose-900/30"
        : "bg-amber-950/25 border-amber-500/40 hover:bg-amber-900/30"
    }`;
    card.innerHTML = `
      <div class="flex items-center justify-between text-xs font-bold mb-1">
        <span class="${isDipole ? "text-rose-300" : "text-amber-300"}">
          #${det.id} · ${isDipole ? "🚀 DIPOLO EN MOVIMIENTO" : "⭐ MONOPOLO VARIABLE"}
        </span>
        <span class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-900 text-white">
          SNR ${det.snr_score}σ
        </span>
      </div>
      <div class="text-[11px] font-mono text-slate-300 mb-1">
        RA: ${det.ra.toFixed(5)}° | Dec: ${det.dec.toFixed(5)}°
      </div>
      <p class="text-[11px] text-slate-400 leading-snug">${det.description}</p>
    `;
    if (idx < 3) {
      // El cruce con Gaia DR3 / AllWISE tarda (consulta de red): se pide aparte y se rellena al llegar
      const line = document.createElement("p");
      line.className = "text-[11px] text-slate-500 leading-snug mt-1";
      line.textContent = "🔎 Consultando Gaia DR3 / AllWISE…";
      card.appendChild(line);
      fetch(`/api/crossmatch?ra=${det.ra}&dec=${det.dec}&radius=14`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((res) => {
          if (res.catalog_match) {
            line.textContent = `Cruce catálogo: ${res.catalog_match}`;
            line.className = "text-[11px] text-emerald-300 leading-snug mt-1";
          } else {
            line.textContent = "Sin contraparte catalogada en 14\" (candidato a descubrimiento)";
            line.className = "text-[11px] text-amber-300 leading-snug mt-1";
          }
        })
        .catch(() => {
          line.textContent = "Cruce con catálogos no disponible por ahora.";
        });
    }
    card.addEventListener("click", () => {
      state.selectedPixel = { x: det.x_pix, y: det.y_pix };
      renderCanvas();
      fetchAndRenderSpectrum(det.ra, det.dec);
      updateAladinView(det.ra, det.dec, state.fov);
    });
    container.appendChild(card);
  });
}

async function fetchAndRenderSpectrum(pointRa, pointDec) {
  try {
    const url = `/api/spectrum?ra=${pointRa}&dec=${pointDec}&center_ra=${state.ra}&center_dec=${state.dec}&fov=${state.fov}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.selectedPixel = { x: data.x_pix, y: data.y_pix };
    renderCanvas();

    document.getElementById("spectrum-coord-label").textContent =
      `Coordenada seleccionada: RA ${data.ra.toFixed(5)}°, Dec ${data.dec.toFixed(5)}° (Píxel X=${data.x_pix}, Y=${data.y_pix})`;

    const wl = data.spectrum.map((p) => p.wavelength_um);
    const fl = data.spectrum.map((p) => p.flux_mjy_sr);
    const err = data.spectrum.map((p) => p.flux_uncertainty);

    const shapes = [];
    (data.reference_molecules || []).forEach((mol) => {
      mol.ranges_um.forEach(([w0, w1]) => {
        shapes.push({
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: w0,
          x1: w1,
          y0: 0,
          y1: 1,
          fillcolor: mol.color,
          line: { color: mol.border_color, width: 1, dash: "dot" },
        });
      });
    });

    const trace = {
      x: wl,
      y: fl,
      error_y: {
        type: "data",
        array: err,
        visible: true,
        color: "rgba(56, 189, 248, 0.35)",
        thickness: 1,
      },
      mode: "lines+markers",
      name: "Flujo Real IRSA (DN / MJy/sr)",
      line: { color: "#38bdf8", width: 2.2 },
      marker: { color: "#e0f2fe", size: 6, line: { color: "#0284c7", width: 1 } },
      hovertemplate: "<b>λ = %{x:.3f} μm</b><br>Flujo = %{y:.3f}<extra></extra>",
    };

    const layout = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 52, r: 18, t: 14, b: 42 },
      xaxis: {
        title: { text: "Longitud de Onda Infrarroja λ (micrones · Fotometría Real FITS)", font: { color: "#94a3b8", size: 11 } },
        range: [0.7, 5.1],
        gridcolor: "rgba(148, 163, 184, 0.12)",
        tickfont: { color: "#cbd5e1", size: 10 },
      },
      yaxis: {
        title: { text: "Flujo Fotométrico Calibrado", font: { color: "#94a3b8", size: 11 } },
        gridcolor: "rgba(148, 163, 184, 0.12)",
        tickfont: { color: "#cbd5e1", size: 10 },
      },
      shapes: shapes,
      showlegend: false,
    };

    Plotly.react("spectrum-plot", [trace], layout, { responsive: true, displayModeBar: false });

    const diag = data.ai_diagnosis;
    document.getElementById("diag-confidence").textContent = `Confianza: ${Math.round(diag.confidence * 100)}%`;
    document.getElementById("diag-class").textContent = diag.classification;
    document.getElementById("diag-temp").textContent = `~${diag.effective_temp_k_est} K`;
    document.getElementById("diag-bands").textContent = `${data.total_bands_sampled} exposiciones`;
    document.getElementById("diag-summary").textContent = diag.summary;

    const molContainer = document.getElementById("diag-molecules");
    molContainer.innerHTML = "";
    diag.detected_molecules.forEach((m) => {
      const span = document.createElement("span");
      span.className = "text-[11px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700 font-medium";
      span.textContent = m;
      molContainer.appendChild(span);
    });
  } catch (err) {
    console.error("Error obteniendo espectro real:", err);
  }
}

async function exploreCoordinates(ra, dec, fov) {
  state.ra = Number(ra);
  state.dec = Number(dec);
  state.fov = Number(fov);

  document.getElementById("input-ra").value = state.ra.toFixed(6);
  document.getElementById("input-dec").value = state.dec.toFixed(6);
  document.getElementById("input-fov").value = state.fov.toFixed(4);
  syncUrlParams(state.ra, state.dec, state.fov);

  document.getElementById("target-banner-desc").textContent =
    "Consultando servidor TAP de NASA/IPAC IRSA y descargando recortes .FITS reales...";

  try {
    const res = await fetch(`/api/explore?ra=${state.ra}&dec=${state.dec}&fov=${state.fov}`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    state.exploreData = data;
    state.currentEpochIdx = 0;

    const slider = document.getElementById("slider-epoch");
    slider.max = Math.max(0, data.epochs.length - 1);
    slider.value = 0;

    document.querySelectorAll(".preset-btn").forEach((btn) => {
      if (btn.dataset.target === data.target_info.matched_target_id) {
        btn.classList.add("target-btn-active");
      } else {
        btn.classList.remove("target-btn-active");
      }
    });

    const badge = document.getElementById("badge-datasource");
    badge.textContent = `${data.target_info.data_source} (${data.target_info.total_frames} FITS)`;
    document.getElementById("target-banner-desc").textContent =
      data.target_info.matched_description ||
      `Recortes .FITS reales de NASA IRSA para RA=${state.ra.toFixed(4)}°, Dec=${state.dec.toFixed(4)}°`;

    state.epochImages = await Promise.all(data.epochs.map((e) => loadImagePromise(e.image_base64)));
    state.flagImages = await Promise.all(data.epochs.map((e) => loadImagePromise(e.flags_base64)));
    state.coaddImage = await loadImagePromise(data.coadd_image_base64);
    state.diffImage = await loadImagePromise(data.diff_image_base64);

    renderAIDetectionsList(data.ai_detections || []);
    updateAladinView(state.ra, state.dec, state.fov);
    renderCanvas();

    if (data.ai_detections && data.ai_detections.length > 0) {
      const topDet = data.ai_detections[0];
      await fetchAndRenderSpectrum(topDet.ra, topDet.dec);
    } else {
      await fetchAndRenderSpectrum(state.ra, state.dec);
    }
  } catch (err) {
    console.error("Error en exploreCoordinates:", err);
    document.getElementById("target-banner-desc").textContent = `Error IRSA: ${err.message}`;
  }
}

function setViewMode(mode) {
  state.viewMode = mode;
  ["blink", "diff", "coadd"].forEach((m) => {
    const btn = document.getElementById(`mode-${m}`);
    btn.className =
      m === mode
        ? "px-2.5 py-1 rounded-md bg-sky-500 text-slate-950 font-semibold"
        : "px-2.5 py-1 rounded-md text-slate-300 hover:text-white";
  });
  const diffLegend = document.getElementById("diff-legend");
  mode === "diff" ? diffLegend.classList.remove("hidden") : diffLegend.classList.add("hidden");
  renderCanvas();
}

document.addEventListener("DOMContentLoaded", async () => {
  const initial = getParamsFromUrl();
  state.ra = initial.ra;
  state.dec = initial.dec;
  state.fov = initial.fov;

  initAladinLite(state.ra, state.dec, state.fov);

  try {
    const tRes = await fetch("/api/targets");
    const tJson = await tRes.json();
    state.targets = tJson.MANDATORY_TARGETS || [];
  } catch (e) {
    console.warn("No se pudo cargar /api/targets:", e);
  }

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const found = state.targets.find((t) => t.id === targetId);
      if (found) {
        exploreCoordinates(found.ra_deg, found.dec_deg, found.default_fov);
      }
    });
  });

  document.getElementById("coord-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const ra = parseFloat(document.getElementById("input-ra").value);
    const dec = parseFloat(document.getElementById("input-dec").value);
    const fov = parseFloat(document.getElementById("input-fov").value);
    exploreCoordinates(ra, dec, fov);
  });

  document.getElementById("btn-share-url").addEventListener("click", () => {
    navigator.clipboard.writeText(window.location.href);
    const btn = document.getElementById("btn-share-url");
    const orig = btn.innerHTML;
    btn.innerHTML = "<span>✅ ¡URL Copiada!</span>";
    setTimeout(() => (btn.innerHTML = orig), 1800);
  });

  document.getElementById("mode-blink").addEventListener("click", () => setViewMode("blink"));
  document.getElementById("mode-diff").addEventListener("click", () => setViewMode("diff"));
  document.getElementById("mode-coadd").addEventListener("click", () => setViewMode("coadd"));

  document.getElementById("btn-play-pause").addEventListener("click", (e) => {
    state.isPlaying = !state.isPlaying;
    e.currentTarget.textContent = state.isPlaying ? "⏸ Pausar" : "▶ Reproducir";
    startBlinkTimer();
  });

  document.getElementById("slider-epoch").addEventListener("input", (e) => {
    state.currentEpochIdx = parseInt(e.target.value, 10);
    if (state.viewMode !== "blink") setViewMode("blink");
    renderCanvas();
  });

  document.getElementById("select-fps").addEventListener("change", (e) => {
    state.fps = parseInt(e.target.value, 10);
    startBlinkTimer();
  });

  document.getElementById("chk-ai-markers").addEventListener("change", (e) => {
    state.showAIMarkers = e.target.checked;
    renderCanvas();
  });

  document.getElementById("chk-flags").addEventListener("change", (e) => {
    state.showFlags = e.target.checked;
    renderCanvas();
  });

  document.getElementById("chk-gaia").addEventListener("change", (e) => {
    if (state.gaiaCat) e.target.checked ? state.gaiaCat.show() : state.gaiaCat.hide();
  });

  document.getElementById("chk-wise").addEventListener("change", (e) => {
    if (state.wiseCat) e.target.checked ? state.wiseCat.show() : state.wiseCat.hide();
  });

  document.getElementById("btn-recenter-aladin").addEventListener("click", () => {
    updateAladinView(state.ra, state.dec, state.fov);
  });

  const canvas = document.getElementById("spherex-canvas");
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const x_pix = (clickX / rect.width) * CUTOUT_NPIX;
    const y_pix = CUTOUT_NPIX - 1.0 - (clickY / rect.height) * CUTOUT_NPIX;

    const scaleDeg = state.fov / CUTOUT_NPIX;
    const dx = x_pix - CUTOUT_NPIX / 2.0;
    const dy = y_pix - CUTOUT_NPIX / 2.0;
    const clickedDec = state.dec + dy * scaleDeg;
    const clickedRa = state.ra - (dx * scaleDeg) / Math.cos((state.dec * Math.PI) / 180.0);

    fetchAndRenderSpectrum(clickedRa, clickedDec);
  });

  await exploreCoordinates(state.ra, state.dec, state.fov);
  startBlinkTimer();
});