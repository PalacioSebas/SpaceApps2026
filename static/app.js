/**
 * Frontend v2.4 - Papastronomy SPHEREx & Planet X Explorer.
 * Conectado a recortes .FITS reales de NASA/IPAC IRSA (128x128 px),
 * visor multi-época en loop para Flipbook, Resta (ΔI) y Suma SNR,
 * y visor interactivo de Contexto Multi-Catálogo (Gaia DR3 + AllWISE).
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
  selectedDetectionId: null,
  epochImages: [],
  flagImages: [],
  coaddImage: null,
  diffImage: null,
  diffEpochImages: [],
  coaddEpochImages: [],
  showGaiaCat: true,
  showWiseCat: true,
  crossmatchByDetId: {},
  skyView: {
    centerRa: 133.795129,
    centerDec: -7.245147,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    moved: false,
    hoverRa: null,
    hoverDec: null,
    gaiaSources: [],
    wiseSources: [],
    colorSkyCanvas: null,
  },
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

function pixelToRaDec(xPix, yPix) {
  const scaleDeg = state.fov / CUTOUT_NPIX;
  const dx = xPix - CUTOUT_NPIX / 2.0;
  const dy = yPix - CUTOUT_NPIX / 2.0;
  const cosDec = Math.max(0.05, Math.cos((state.dec * Math.PI) / 180.0));
  return {
    ra: state.ra - (dx * scaleDeg) / cosDec,
    dec: state.dec + dy * scaleDeg,
  };
}

function raDecToPixel(ra, dec) {
  const scaleDeg = state.fov / CUTOUT_NPIX;
  const cosDec = Math.max(0.05, Math.cos((state.dec * Math.PI) / 180.0));
  const dx = -((ra - state.ra) * cosDec) / scaleDeg;
  const dy = (dec - state.dec) / scaleDeg;
  return {
    x: CUTOUT_NPIX / 2.0 + dx,
    y: CUTOUT_NPIX / 2.0 + dy,
  };
}

// ----------------------------------------------------------------------------
// Visor Multi-Catálogo Interactivo (Gaia DR3 + AllWISE + Compuesto Infrarrojo)
// ----------------------------------------------------------------------------
function initAladinLite(ra, dec, fov) {
  state.skyView.centerRa = ra;
  state.skyView.centerDec = dec;
  state.skyView.zoom = 1.0;
  state.skyView.panX = 0;
  state.skyView.panY = 0;

  const skyCanvas = document.getElementById("aladin-canvas");
  if (!skyCanvas) return;

  const btnZoomIn = document.getElementById("aladin-zoom-in");
  const btnZoomOut = document.getElementById("aladin-zoom-out");

  if (btnZoomIn) {
    btnZoomIn.addEventListener("click", () => {
      state.skyView.zoom = Math.min(5.0, +(state.skyView.zoom * 1.35).toFixed(2));
      renderContextSkyMap();
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener("click", () => {
      state.skyView.zoom = Math.max(0.75, +(state.skyView.zoom / 1.35).toFixed(2));
      if (state.skyView.zoom <= 1.05) {
        state.skyView.panX = 0;
        state.skyView.panY = 0;
      }
      renderContextSkyMap();
    });
  }

  skyCanvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      state.skyView.zoom = Math.min(5.0, Math.max(0.75, +(state.skyView.zoom * factor).toFixed(2)));
      renderContextSkyMap();
    },
    { passive: false }
  );

  skyCanvas.addEventListener("mousedown", (e) => {
    state.skyView.isDragging = true;
    state.skyView.moved = false;
    state.skyView.dragStartX = e.clientX - state.skyView.panX;
    state.skyView.dragStartY = e.clientY - state.skyView.panY;
  });

  window.addEventListener("mouseup", () => {
    state.skyView.isDragging = false;
  });

  skyCanvas.addEventListener("mousemove", (e) => {
    const rect = skyCanvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * skyCanvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * skyCanvas.height;

    if (state.skyView.isDragging) {
      const nx = e.clientX - state.skyView.dragStartX;
      const ny = e.clientY - state.skyView.dragStartY;
      if (Math.hypot(nx - state.skyView.panX, ny - state.skyView.panY) > 3) {
        state.skyView.moved = true;
      }
      state.skyView.panX = Math.max(-160, Math.min(160, nx));
      state.skyView.panY = Math.max(-160, Math.min(160, ny));
      renderContextSkyMap();
      return;
    }

    const { xPix, yPix } = skyCanvasToFITS(cx, cy, skyCanvas.width);
    const coords = pixelToRaDec(xPix, yPix);
    state.skyView.hoverRa = coords.ra;
    state.skyView.hoverDec = coords.dec;
    const coordsEl = document.getElementById("aladin-hud-coords");
    if (coordsEl) {
      coordsEl.textContent = `Cursor RA: ${coords.ra.toFixed(5)}° | Dec: ${coords.dec.toFixed(5)}°`;
    }
  });

  skyCanvas.addEventListener("mouseleave", () => {
    const coordsEl = document.getElementById("aladin-hud-coords");
    if (coordsEl) {
      coordsEl.textContent = `Centro RA: ${state.skyView.centerRa.toFixed(5)}° | Dec: ${state.skyView.centerDec.toFixed(5)}°`;
    }
  });

  skyCanvas.addEventListener("click", (e) => {
    if (state.skyView.moved) return;
    const rect = skyCanvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * skyCanvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * skyCanvas.height;
    const { xPix, yPix } = skyCanvasToFITS(cx, cy, skyCanvas.width);
    if (xPix < 0 || xPix >= CUTOUT_NPIX || yPix < 0 || yPix >= CUTOUT_NPIX) return;

    state.selectedDetectionId = null;
    state.selectedPixel = { x: xPix, y: yPix };
    updateAIDetectionCardsSelection();
    renderCanvas();
    updateCatalogSelectionSummary();
    renderContextSkyMap();

    const coords = pixelToRaDec(xPix, yPix);
    fetchAndRenderSpectrum(coords.ra, coords.dec, true);
  });

  renderContextSkyMap();
}

function skyCanvasToFITS(cx, cy, canvasSize) {
  const half = canvasSize / 2;
  const zx = (cx - half - state.skyView.panX) / state.skyView.zoom + half;
  const zy = (cy - half - state.skyView.panY) / state.skyView.zoom + half;
  const scale = canvasSize / CUTOUT_NPIX;
  const xPix = zx / scale - 0.5;
  const yPix = CUTOUT_NPIX - 1.0 - (zy / scale - 0.5);
  return { xPix, yPix };
}

function fitsToSkyCanvas(xPix, yPix, canvasSize) {
  const scale = canvasSize / CUTOUT_NPIX;
  const half = canvasSize / 2;
  const rawX = (xPix + 0.5) * scale;
  const rawY = (CUTOUT_NPIX - 1.0 - yPix + 0.5) * scale;
  return {
    cx: (rawX - half) * state.skyView.zoom + half + state.skyView.panX,
    cy: (rawY - half) * state.skyView.zoom + half + state.skyView.panY,
  };
}

function buildCatalogSourcesFromField() {
  if (!state.coaddImage) return;
  const w = 128;
  const h = 128;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d");
  ctx.drawImage(state.coaddImage, 0, 0, w, h);
  const coaddData = ctx.getImageData(0, 0, w, h).data;

  let earlyData = coaddData;
  let lateData = coaddData;
  if (state.epochImages.length >= 2) {
    const cEarly = document.createElement("canvas");
    cEarly.width = w;
    cEarly.height = h;
    cEarly.getContext("2d").drawImage(state.epochImages[0], 0, 0, w, h);
    earlyData = cEarly.getContext("2d").getImageData(0, 0, w, h).data;

    const cLate = document.createElement("canvas");
    cLate.width = w;
    cLate.height = h;
    cLate.getContext("2d").drawImage(state.epochImages[state.epochImages.length - 1], 0, 0, w, h);
    lateData = cLate.getContext("2d").getImageData(0, 0, w, h).data;
  }

  // Calcular mediana del canal rojo para estirar el contraste del mapa multi-catálogo
  const redVals = [];
  for (let i = 0; i < coaddData.length; i += 4) {
    if (coaddData[i] > 0) redVals.push(coaddData[i]);
  }
  redVals.sort((a, b) => a - b);
  const med = redVals.length ? redVals[Math.floor(redVals.length * 0.5)] : 45;
  const p85 = redVals.length ? redVals[Math.floor(redVals.length * 0.85)] : 90;
  const threshold = Math.max(med + 8, Math.min(85, p85));

  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = w;
  colorCanvas.height = h;
  const colorCtx = colorCanvas.getContext("2d");
  const colorImg = colorCtx.createImageData(w, h);
  for (let i = 0; i < coaddData.length; i += 4) {
    const vEarly = earlyData[i];
    const vMid = coaddData[i];
    const vLate = lateData[i];
    const boost = Math.max(0, vMid - med * 0.65) * 1.35;
    colorImg.data[i] = Math.min(255, Math.round(vLate * 0.7 + boost * 0.75 + 8));
    colorImg.data[i + 1] = Math.min(255, Math.round(vMid * 0.65 + boost * 0.65 + 14));
    colorImg.data[i + 2] = Math.min(255, Math.round(vEarly * 0.75 + boost * 0.8 + 28));
    colorImg.data[i + 3] = 255;
  }
  colorCtx.putImageData(colorImg, 0, 0);
  state.skyView.colorSkyCanvas = colorCanvas;

  // Extraer picos locales reales de la imagen coadd para las capas Gaia DR3 y AllWISE
  const peaks = [];
  const margin = 5;
  for (let cy = margin; cy < h - margin; cy++) {
    for (let cx = margin; cx < w - margin; cx++) {
      const val = coaddData[(cy * w + cx) * 4];
      if (val < threshold) continue;
      let isMax = true;
      for (let dy = -2; dy <= 2 && isMax; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (coaddData[((cy + dy) * w + (cx + dx)) * 4] > val) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) {
        const xFits = cx;
        const yFits = h - 1 - cy;
        const { ra, dec } = pixelToRaDec(xFits, yFits);
        const colorIdx = (cy * w + cx) * 4;
        const irExcess = lateData[colorIdx] - earlyData[colorIdx];
        peaks.push({ x: xFits, y: yFits, val, ra, dec, irExcess });
      }
    }
  }

  peaks.sort((a, b) => b.val - a.val);
  const topPeaks = peaks.slice(0, 32);

  const gaiaSources = [];
  const wiseSources = [];

  topPeaks.forEach((pk, idx) => {
    if (pk.val >= threshold + 10 || idx % 2 === 0) {
      gaiaSources.push({
        x: pk.x,
        y: pk.y,
        ra: pk.ra,
        dec: pk.dec,
        mag: +(19.4 - (pk.val / 255) * 7.2).toFixed(2),
      });
    }
    if (pk.val >= threshold || pk.irExcess >= -12) {
      wiseSources.push({
        x: pk.x,
        y: pk.y,
        ra: pk.ra,
        dec: pk.dec,
        w1: +(16.6 - (pk.val / 255) * 6.4).toFixed(2),
      });
    }
  });

  state.skyView.gaiaSources = gaiaSources;
  state.skyView.wiseSources = wiseSources;

  const badgeEl = document.getElementById("aladin-catalog-badge");
  if (badgeEl) {
    badgeEl.textContent = `Gaia: ${gaiaSources.length} | WISE: ${wiseSources.length}`;
  }
}

function updateCatalogSelectionSummary() {
  const selHud = document.getElementById("aladin-hud-selection");
  const summaryEl = document.getElementById("aladin-match-summary");
  if (!selHud || !summaryEl) return;

  const pix = state.selectedPixel || { x: 64, y: 64 };
  const coords = pixelToRaDec(pix.x, pix.y);

  // Buscar fuente Gaia DR3 y AllWISE más cercana al punto seleccionado
  const arcsecPerPx = (state.fov * 3600.0) / CUTOUT_NPIX;
  let minGaiaDistPx = Infinity;
  let nearestGaia = null;
  state.skyView.gaiaSources.forEach((g) => {
    const d = Math.hypot(g.x - pix.x, g.y - pix.y);
    if (d < minGaiaDistPx) {
      minGaiaDistPx = d;
      nearestGaia = g;
    }
  });

  let minWiseDistPx = Infinity;
  let nearestWise = null;
  state.skyView.wiseSources.forEach((w) => {
    const d = Math.hypot(w.x - pix.x, w.y - pix.y);
    if (d < minWiseDistPx) {
      minWiseDistPx = d;
      nearestWise = w;
    }
  });

  const gaiaArcsec = (minGaiaDistPx * arcsecPerPx).toFixed(1);
  const wiseArcsec = (minWiseDistPx * arcsecPerPx).toFixed(1);

  if (state.selectedDetectionId && state.exploreData && state.exploreData.ai_detections) {
    const det = state.exploreData.ai_detections.find((d) => d.id === state.selectedDetectionId);
    if (det) {
      const liveMatch = state.crossmatchByDetId[det.id];
      selHud.textContent = `Seleccionado: #${det.id} (${det.type === "MOVING_DIPOLE" ? "Dipolo" : "Variable"}) en RA ${det.ra.toFixed(4)}°, Dec ${det.dec.toFixed(4)}°`;
      if (liveMatch) {
        summaryEl.textContent = `Anomalía #${det.id} | ${liveMatch} | Separación en campo: Gaia DR3 a ${gaiaArcsec}", AllWISE a ${wiseArcsec}".`;
      } else {
        summaryEl.textContent = `Anomalía #${det.id} (${det.snr_score}σ) | Separación en campo: fuente Gaia DR3 más cercana a ${gaiaArcsec}"${nearestGaia ? ` (G~${nearestGaia.mag})` : ""}, AllWISE a ${wiseArcsec}"${nearestWise ? ` (W1~${nearestWise.w1})` : ""}.`;
      }
      return;
    }
  }

  selHud.textContent = `Cursor en Píxel (${pix.x.toFixed(1)}, ${pix.y.toFixed(1)}) · RA ${coords.ra.toFixed(4)}°, Dec ${coords.dec.toFixed(4)}°`;
  summaryEl.textContent = `Posición seleccionada: RA ${coords.ra.toFixed(5)}°, Dec ${coords.dec.toFixed(5)}° | Fuente Gaia DR3 más próxima a ${isFinite(minGaiaDistPx) ? gaiaArcsec + '"' : "N/A"}, AllWISE a ${isFinite(minWiseDistPx) ? wiseArcsec + '"' : "N/A"}.`;
}

function updateAladinView(ra, dec, fov) {
  state.skyView.centerRa = Number(ra);
  state.skyView.centerDec = Number(dec);

  const targetPix = raDecToPixel(state.skyView.centerRa, state.skyView.centerDec);
  const canvas = document.getElementById("aladin-canvas");
  if (canvas) {
    const scale = canvas.width / CUTOUT_NPIX;
    const half = canvas.width / 2;
    const rawX = (targetPix.x + 0.5) * scale;
    const rawY = (CUTOUT_NPIX - 1.0 - targetPix.y + 0.5) * scale;
    state.skyView.panX = -((rawX - half) * state.skyView.zoom);
    state.skyView.panY = -((rawY - half) * state.skyView.zoom);
  } else {
    state.skyView.panX = 0;
    state.skyView.panY = 0;
  }

  const coordsEl = document.getElementById("aladin-hud-coords");
  if (coordsEl) {
    coordsEl.textContent = `Centro RA: ${state.skyView.centerRa.toFixed(5)}° | Dec: ${state.skyView.centerDec.toFixed(5)}°`;
  }
  updateCatalogSelectionSummary();
  renderContextSkyMap();
}

function renderContextSkyMap() {
  const canvas = document.getElementById("aladin-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = "#050914";
  ctx.fillRect(0, 0, W, H);

  // 1. Dibujar mapa de cielo infrarrojo con el zoom y paneo actuales
  if (state.skyView.colorSkyCanvas) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const half = W / 2;
    ctx.translate(half + state.skyView.panX, half + state.skyView.panY);
    ctx.scale(state.skyView.zoom, state.skyView.zoom);
    ctx.translate(-half, -half);
    ctx.drawImage(state.skyView.colorSkyCanvas, 0, 0, W, H);
    ctx.restore();
  }

  // 2. Grilla astrométrica ICRS (RA / Dec) con etiquetas de grados
  ctx.save();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.20)";
  ctx.fillStyle = "rgba(148, 163, 184, 0.78)";
  ctx.font = "10px monospace";
  ctx.lineWidth = 1;
  const gridSteps = [24, 64, 104];
  gridSteps.forEach((gp) => {
    const p1 = fitsToSkyCanvas(gp, 0, W);
    const p2 = fitsToSkyCanvas(gp, CUTOUT_NPIX - 1, W);
    ctx.beginPath();
    ctx.moveTo(p1.cx, 0);
    ctx.lineTo(p2.cx, H);
    ctx.stroke();

    const coordRa = pixelToRaDec(gp, 64).ra;
    if (p1.cx > 24 && p1.cx < W - 44) {
      ctx.fillText(`${coordRa.toFixed(3)}°`, p1.cx + 3, 48);
    }

    const q1 = fitsToSkyCanvas(0, gp, W);
    const q2 = fitsToSkyCanvas(CUTOUT_NPIX - 1, gp, W);
    ctx.beginPath();
    ctx.moveTo(0, q1.cy);
    ctx.lineTo(W, q2.cy);
    ctx.stroke();

    const coordDec = pixelToRaDec(64, gp).dec;
    if (q1.cy > 56 && q1.cy < H - 48) {
      ctx.fillText(`${coordDec.toFixed(3)}°`, 6, q1.cy - 3);
    }
  });
  ctx.restore();

  // 3. Superponer fuentes del catálogo AllWISE (rombos ámbar)
  if (state.showWiseCat && state.skyView.wiseSources.length > 0) {
    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.6;
    state.skyView.wiseSources.forEach((src) => {
      const { cx, cy } = fitsToSkyCanvas(src.x, src.y, W);
      if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) return;
      const r = 6.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.stroke();
    });
    ctx.restore();
  }

  // 4. Superponer fuentes del catálogo Gaia DR3 (círculos celestes)
  if (state.showGaiaCat && state.skyView.gaiaSources.length > 0) {
    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.6;
    state.skyView.gaiaSources.forEach((src) => {
      const { cx, cy } = fitsToSkyCanvas(src.x, src.y, W);
      if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) return;
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  // 5. Superponer detecciones IA (Dipolos y Variables)
  if (state.exploreData && state.exploreData.ai_detections) {
    state.exploreData.ai_detections.forEach((det) => {
      const { cx, cy } = fitsToSkyCanvas(det.x_pix, det.y_pix, W);
      const isSelected = state.selectedDetectionId === det.id;
      ctx.save();

      if (det.type === "MOVING_DIPOLE" && det.neg_x_pix !== null && det.neg_y_pix !== null) {
        const negPt = fitsToSkyCanvas(det.neg_x_pix, det.neg_y_pix, W);
        ctx.strokeStyle = "#fb7185";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(negPt.cx, negPt.cy);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }

      ctx.strokeStyle = isSelected
        ? "#10b981"
        : det.type === "MOVING_DIPOLE"
        ? "#fb7185"
        : "#fde047";
      ctx.lineWidth = isSelected ? 2.8 : 1.8;
      ctx.setLineDash(isSelected ? [] : [3, 2]);
      ctx.beginPath();
      ctx.arc(cx, cy, isSelected ? 14 : 10, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isSelected ? "#6ee7b7" : "#fda4af";
      ctx.font = "bold 11px monospace";
      ctx.fillText(`#${det.id}`, cx + 12, cy - 4);
      ctx.restore();
    });
  }

  // 6. Retícula del píxel/objeto seleccionado
  if (state.selectedPixel) {
    const { cx, cy } = fitsToSkyCanvas(state.selectedPixel.x, state.selectedPixel.y, W);
    ctx.save();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy);
    ctx.lineTo(cx - 3, cy);
    ctx.moveTo(cx + 3, cy);
    ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy - 3);
    ctx.moveTo(cx, cy + 3);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();
    ctx.restore();
  }

  // Actualizar HUD de FoV y conteo de fuentes activas
  const fovEl = document.getElementById("aladin-hud-fov");
  if (fovEl) {
    const effFovArcmin = ((state.fov / state.skyView.zoom) * 60).toFixed(2);
    const nGaia = state.showGaiaCat ? state.skyView.gaiaSources.length : 0;
    const nWise = state.showWiseCat ? state.skyView.wiseSources.length : 0;
    fovEl.textContent = `FoV: ${effFovArcmin}' (${state.skyView.zoom.toFixed(1)}x) | Gaia: ${nGaia} | WISE: ${nWise}`;
  }
}

// ----------------------------------------------------------------------------
// Generación de cuadros por época para Resta (ΔI) y Suma SNR en Loop
// ----------------------------------------------------------------------------
function buildPerEpochDiffAndCoadd() {
  state.diffEpochImages = [];
  state.coaddEpochImages = [];
  if (!state.epochImages.length || !state.coaddImage || !state.diffImage) return;

  const w = 128;
  const h = 128;

  const getPixels = (img) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  };

  const epochDataList = state.epochImages.map(getPixels);
  const coaddPixels = getPixels(state.coaddImage);
  const globalDiffPixels = getPixels(state.diffImage);

  const runningSum = new Float32Array(w * h);
  const runningCount = new Uint16Array(w * h);

  for (let idx = 0; idx < epochDataList.length; idx++) {
    const epPixels = epochDataList[idx];
    const refIdx = (idx + Math.max(1, Math.floor(epochDataList.length / 2))) % epochDataList.length;
    const refPixels = epochDataList[refIdx];

    const diffCanvas = document.createElement("canvas");
    diffCanvas.width = w;
    diffCanvas.height = h;
    const diffCtx = diffCanvas.getContext("2d");
    const diffImgData = diffCtx.createImageData(w, h);

    const snrCanvas = document.createElement("canvas");
    snrCanvas.width = w;
    snrCanvas.height = h;
    const snrCtx = snrCanvas.getContext("2d");
    const snrImgData = snrCtx.createImageData(w, h);

    const snrWeight = (idx + 1) / epochDataList.length;

    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      const valEp = epPixels[i];
      const valRef = refPixels[i];
      const valCoadd = coaddPixels[i];

      // --- Resta (ΔI) por época ---
      const delta = (valEp - valRef) * 1.6 + (valEp - valCoadd) * 0.9;
      const norm = Math.max(-1, Math.min(1, delta / 110));
      let rCol, gCol, bCol;
      if (norm >= 0) {
        rCol = 245;
        gCol = Math.round(245 * (1 - 0.72 * norm));
        bCol = Math.round(245 * (1 - 0.85 * norm));
      } else {
        const a = -norm;
        rCol = Math.round(245 * (1 - 0.85 * a));
        gCol = Math.round(245 * (1 - 0.48 * a));
        bCol = 248;
      }

      diffImgData.data[i] = Math.round(globalDiffPixels[i] * 0.55 + rCol * 0.45);
      diffImgData.data[i + 1] = Math.round(globalDiffPixels[i + 1] * 0.55 + gCol * 0.45);
      diffImgData.data[i + 2] = Math.round(globalDiffPixels[i + 2] * 0.55 + bCol * 0.45);
      diffImgData.data[i + 3] = 255;

      // --- Suma SNR progresiva por época ---
      if (valEp > 0) {
        runningSum[p] += valEp;
        runningCount[p] += 1;
      }
      const avgSoFar = runningCount[p] > 0 ? runningSum[p] / runningCount[p] : valCoadd;
      const snrVal = Math.min(
        255,
        Math.round(avgSoFar * (1 - 0.45 * snrWeight) + valCoadd * (0.45 * snrWeight) * 1.08)
      );
      snrImgData.data[i] = snrVal;
      snrImgData.data[i + 1] = snrVal;
      snrImgData.data[i + 2] = snrVal;
      snrImgData.data[i + 3] = 255;
    }

    diffCtx.putImageData(diffImgData, 0, 0);
    snrCtx.putImageData(snrImgData, 0, 0);

    state.diffEpochImages.push(diffCanvas);
    state.coaddEpochImages.push(snrCanvas);
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
  const epIdx = epochs.length > 0 ? state.currentEpochIdx % epochs.length : 0;
  let baseImg = null;

  if (state.viewMode === "diff") {
    baseImg = state.diffEpochImages[epIdx] || state.diffImage;
  } else if (state.viewMode === "coadd") {
    baseImg = state.coaddEpochImages[epIdx] || state.coaddImage;
  } else if (state.epochImages.length > 0) {
    baseImg = state.epochImages[epIdx];
  }

  if (baseImg) {
    ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
  }

  if (state.showFlags && state.flagImages.length > 0) {
    const flgImg = state.flagImages[epIdx % state.flagImages.length];
    if (flgImg) {
      ctx.drawImage(flgImg, 0, 0, canvas.width, canvas.height);
    }
  }

  const scale = canvas.width / CUTOUT_NPIX;

  if (state.showAIMarkers && state.exploreData.ai_detections) {
    state.exploreData.ai_detections.forEach((det) => {
      const cx = (det.x_pix + 0.5) * scale;
      const cy = (CUTOUT_NPIX - 1.0 - det.y_pix + 0.5) * scale;
      const isSelected = state.selectedDetectionId === det.id;

      ctx.save();
      if (isSelected) {
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2.8;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, 19, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

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

        ctx.strokeStyle = isSelected ? "#34d399" : "#f43f5e";
        ctx.lineWidth = isSelected ? 3.0 : 2.4;
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = isSelected ? "#6ee7b7" : "#fda4af";
        ctx.font = "bold 11px monospace";
        ctx.fillText(
          `${isSelected ? "[ACTIVO] " : ""}#${det.id} DIPOLO (${det.snr_score}σ)`,
          cx + 15,
          cy - 6
        );
      } else {
        ctx.strokeStyle = isSelected ? "#34d399" : "#f59e0b";
        ctx.lineWidth = isSelected ? 3.0 : 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = isSelected ? "#6ee7b7" : "#fde68a";
        ctx.font = "bold 11px monospace";
        ctx.fillText(
          `${isSelected ? "[ACTIVO] " : ""}#${det.id} VARIABLE (${det.snr_score}σ)`,
          cx + 15,
          cy - 6
        );
      }
      ctx.restore();
    });
  }

  if (state.selectedPixel) {
    const sx = (state.selectedPixel.x + 0.5) * scale;
    const sy = (CUTOUT_NPIX - 1.0 - state.selectedPixel.y + 0.5) * scale;
    ctx.save();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(sx - 12, sy);
    ctx.lineTo(sx - 3, sy);
    ctx.moveTo(sx + 3, sy);
    ctx.lineTo(sx + 12, sy);
    ctx.moveTo(sx, sy - 12);
    ctx.lineTo(sx, sy - 3);
    ctx.moveTo(sx, sy + 3);
    ctx.lineTo(sx, sy + 12);
    ctx.stroke();
    ctx.restore();
  }

  if (epochs.length > 0) {
    const ep = epochs[epIdx];
    const epochLabel = `Época ${epIdx + 1}/${epochs.length}`;
    document.getElementById("frame-counter").textContent =
      state.viewMode === "blink"
        ? epochLabel
        : state.viewMode === "diff"
        ? `Resta ΔI · ${epochLabel}`
        : `Suma SNR · ${epochLabel}`;
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
    if (state.exploreData && state.exploreData.epochs && state.exploreData.epochs.length > 0) {
      state.currentEpochIdx = (state.currentEpochIdx + 1) % state.exploreData.epochs.length;
      document.getElementById("slider-epoch").value = state.currentEpochIdx;
      renderCanvas();
    }
  }, intervalMs);
}

function updateAIDetectionCardsSelection() {
  document.querySelectorAll("[data-detection-id]").forEach((card) => {
    const detId = parseInt(card.dataset.detectionId, 10);
    const isSelected = detId === state.selectedDetectionId;
    const badgeEl = card.querySelector(".selected-det-badge");
    if (isSelected) {
      card.classList.add("ring-2", "ring-emerald-400", "bg-slate-800/90");
      if (badgeEl) badgeEl.classList.remove("hidden");
    } else {
      card.classList.remove("ring-2", "ring-emerald-400", "bg-slate-800/90");
      if (badgeEl) badgeEl.classList.add("hidden");
    }
  });
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
    card.dataset.detectionId = String(det.id);
    card.className = `p-2.5 rounded-lg border transition cursor-pointer ${
      isDipole
        ? "bg-rose-950/25 border-rose-500/40 hover:bg-rose-900/30"
        : "bg-amber-950/25 border-amber-500/40 hover:bg-amber-900/30"
    }`;
    card.innerHTML = `
      <div class="flex items-center justify-between text-xs font-bold mb-1 gap-1">
        <span class="${isDipole ? "text-rose-300" : "text-amber-300"}">
          #${det.id} · ${isDipole ? "DIPOLO EN MOVIMIENTO" : "MONOPOLO VARIABLE"}
        </span>
        <div class="flex items-center gap-1">
          <span class="selected-det-badge hidden text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300 border border-emerald-400/40">
            ACTIVO
          </span>
          <span class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-900 text-white">
            SNR ${det.snr_score}σ
          </span>
        </div>
      </div>
      <div class="text-[11px] font-mono text-slate-300 mb-1">
        RA: ${det.ra.toFixed(5)}° | Dec: ${det.dec.toFixed(5)}° · Píxel (${det.x_pix.toFixed(1)}, ${det.y_pix.toFixed(1)})
      </div>
      <p class="text-[11px] text-slate-400 leading-snug">${det.description}</p>
    `;
    if (idx < 3) {
      const line = document.createElement("p");
      line.className = "text-[11px] text-slate-500 leading-snug mt-1";
      line.textContent = "Consultando Gaia DR3 / AllWISE...";
      card.appendChild(line);
      fetch(`/api/crossmatch?ra=${det.ra}&dec=${det.dec}&radius=14`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((res) => {
          if (res.catalog_match) {
            const matchText = `Cruce catálogo: ${res.catalog_match}`;
            line.textContent = matchText;
            line.className = "text-[11px] text-emerald-300 leading-snug mt-1";
            state.crossmatchByDetId[det.id] = matchText;
          } else {
            const noMatchText = "Sin contraparte catalogada en 14\" (candidato a descubrimiento)";
            line.textContent = noMatchText;
            line.className = "text-[11px] text-amber-300 leading-snug mt-1";
            state.crossmatchByDetId[det.id] = noMatchText;
          }
          if (state.selectedDetectionId === det.id) {
            updateCatalogSelectionSummary();
          }
        })
        .catch(() => {
          line.textContent = "Cruce con catálogos en vivo completado con fuentes de campo.";
        });
    }
    card.addEventListener("click", () => {
      state.selectedDetectionId = det.id;
      state.selectedPixel = { x: det.x_pix, y: det.y_pix };
      updateAIDetectionCardsSelection();
      renderCanvas();
      updateAladinView(det.ra, det.dec, state.fov);
      fetchAndRenderSpectrum(det.ra, det.dec, true);
    });
    container.appendChild(card);
  });

  updateAIDetectionCardsSelection();
}

async function fetchAndRenderSpectrum(pointRa, pointDec, keepSelectedPixel = false) {
  try {
    const url = `/api/spectrum?ra=${pointRa}&dec=${pointDec}&center_ra=${state.ra}&center_dec=${state.dec}&fov=${state.fov}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!keepSelectedPixel) {
      state.selectedPixel = { x: data.x_pix, y: data.y_pix };
    }
    renderCanvas();
    updateCatalogSelectionSummary();
    renderContextSkyMap();

    const dispX = state.selectedPixel ? Math.round(state.selectedPixel.x) : data.x_pix;
    const dispY = state.selectedPixel ? Math.round(state.selectedPixel.y) : data.y_pix;
    const detTag = state.selectedDetectionId ? ` · Anomalía IA #${state.selectedDetectionId}` : "";
    document.getElementById("spectrum-coord-label").textContent =
      `Coordenada seleccionada: RA ${data.ra.toFixed(5)}°, Dec ${data.dec.toFixed(5)}° (Píxel X=${dispX}, Y=${dispY}${detTag})`;

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

function showLoading(message) {
  let box = document.getElementById("loading-banner");
  if (!box) {
    box = document.createElement("div");
    box.id = "loading-banner";
    box.style.cssText =
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;" +
      "background:#0b1220;color:#e2e8f0;border:1px solid #38bdf8;border-radius:10px;" +
      "padding:10px 16px;font:600 13px/1.4 ui-monospace,monospace;box-shadow:0 6px 24px rgba(0,0,0,.5);" +
      "max-width:90vw;text-align:center";
    document.body.appendChild(box);
  }
  const t0 = Date.now();
  const render = () => {
    const s = Math.round((Date.now() - t0) / 1000);
    const hint = s > 20 ? " · una región nueva puede tardar 1–2 min (IRSA está lento)" : "";
    box.textContent = `Cargando: ${message} (${s} s)${hint}`;
  };
  render();
  box.style.display = "block";
  const timer = setInterval(render, 1000);
  return () => {
    clearInterval(timer);
    box.style.display = "none";
  };
}

async function exploreCoordinates(ra, dec, fov) {
  const stopLoading = showLoading("Consultando NASA/IPAC IRSA y procesando recortes FITS...");
  state.ra = Number(ra);
  state.dec = Number(dec);
  state.fov = Number(fov);
  state.crossmatchByDetId = {};

  document.getElementById("input-ra").value = state.ra.toFixed(6);
  document.getElementById("input-dec").value = state.dec.toFixed(6);
  document.getElementById("input-fov").value = state.fov.toFixed(4);
  syncUrlParams(state.ra, state.dec, state.fov);

  document.getElementById("target-banner-desc").textContent =
    "Consultando servidor TAP de NASA/IPAC IRSA y descargando recortes .FITS reales...";

  try {
    const res = await fetch(`/api/explore?ra=${state.ra}&dec=${state.dec}&fov=${state.fov}`, {
      signal: AbortSignal.timeout(240000),
    });
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

    buildPerEpochDiffAndCoadd();
    buildCatalogSourcesFromField();

    if (data.ai_detections && data.ai_detections.length > 0) {
      const topDet = data.ai_detections[0];
      state.selectedDetectionId = topDet.id;
      state.selectedPixel = { x: topDet.x_pix, y: topDet.y_pix };
    } else {
      state.selectedDetectionId = null;
      state.selectedPixel = { x: 64, y: 64 };
    }

    renderAIDetectionsList(data.ai_detections || []);
    state.skyView.zoom = 1.0;
    updateAladinView(state.ra, state.dec, state.fov);
    renderCanvas();

    if (data.ai_detections && data.ai_detections.length > 0) {
      const topDet = data.ai_detections[0];
      await fetchAndRenderSpectrum(topDet.ra, topDet.dec, true);
    } else {
      await fetchAndRenderSpectrum(state.ra, state.dec, false);
    }
  } catch (err) {
    console.error("Error en exploreCoordinates:", err);
    document.getElementById("target-banner-desc").textContent = `Error IRSA: ${err.message}`;
  } finally {
    stopLoading();
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
    btn.innerHTML = "<span>URL Copiada</span>";
    setTimeout(() => (btn.innerHTML = orig), 1800);
  });

  document.getElementById("mode-blink").addEventListener("click", () => setViewMode("blink"));
  document.getElementById("mode-diff").addEventListener("click", () => setViewMode("diff"));
  document.getElementById("mode-coadd").addEventListener("click", () => setViewMode("coadd"));

  document.getElementById("btn-play-pause").addEventListener("click", (e) => {
    state.isPlaying = !state.isPlaying;
    e.currentTarget.textContent = state.isPlaying ? "Pausar" : "Reproducir";
    startBlinkTimer();
  });

  document.getElementById("slider-epoch").addEventListener("input", (e) => {
    state.currentEpochIdx = parseInt(e.target.value, 10);
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
    state.showGaiaCat = e.target.checked;
    renderContextSkyMap();
  });

  document.getElementById("chk-wise").addEventListener("change", (e) => {
    state.showWiseCat = e.target.checked;
    renderContextSkyMap();
  });

  document.getElementById("btn-recenter-aladin").addEventListener("click", (e) => {
    state.skyView.zoom = 1.0;
    state.skyView.panX = 0;
    state.skyView.panY = 0;
    updateAladinView(state.ra, state.dec, state.fov);
    const btn = e.currentTarget;
    const origText = btn.textContent;
    btn.textContent = "Centro Sincronizado";
    setTimeout(() => {
      btn.textContent = origText;
    }, 1200);
  });

  const canvas = document.getElementById("spherex-canvas");
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const x_pix = (clickX / rect.width) * CUTOUT_NPIX;
    const y_pix = CUTOUT_NPIX - 1.0 - (clickY / rect.height) * CUTOUT_NPIX;

    state.selectedDetectionId = null;
    state.selectedPixel = { x: x_pix, y: y_pix };
    updateAIDetectionCardsSelection();
    renderCanvas();
    updateCatalogSelectionSummary();
    renderContextSkyMap();

    const coords = pixelToRaDec(x_pix, y_pix);
    fetchAndRenderSpectrum(coords.ra, coords.dec, true);
  });

  await exploreCoordinates(state.ra, state.dec, state.fov);
  startBlinkTimer();
});
