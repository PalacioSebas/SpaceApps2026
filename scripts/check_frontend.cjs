// Regresiones de memoria y repintado; solo necesita Node, sin npm ni navegador.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const frames = [];
const intervals = new Map();
let nextInterval = 1;
const context = vm.createContext({
  console,
  document: { addEventListener() {} },
  requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
  setInterval(callback) { const id = nextInterval++; intervals.set(id, callback); return id; },
  clearInterval(id) { intervals.delete(id); },
  Image: class {
    removeAttribute(name) { if (name === "src") this.cancelled = true; }
  },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../static/app.js"), "utf8"), context);
vm.runInContext(`
  let renders = 0;
  renderCanvas = () => { renders++; };
  renderContextSkyMap = () => { renders++; };
  for (let i = 0; i < 50; i++) schedulePlaneRender();
`, context);
assert.equal(frames.length, 1, "Los eventos se agrupan en un solo frame");
frames.shift()();
assert.equal(vm.runInContext("renders", context), 2);
vm.runInContext("schedulePlaneRender()", context);
assert.equal(frames.length, 1, "Se permite programar el próximo frame");

vm.runInContext(`
  ensureExternalSurveyImage("allwise", 0, 0, .05);
  const firstImage = state.externalSurveyCache.values().next().value.img;
  for (let i = 1; i < 10; i++) ensureExternalSurveyImage("allwise", i, 0, .05);
`, context);
assert.equal(vm.runInContext("state.externalSurveyCache.size", context), 6);
assert.equal(vm.runInContext("firstImage.cancelled", context), true);
assert.equal(vm.runInContext("firstImage.onload", context), null);
vm.runInContext(`
  const recentKey = state.externalSurveyCache.keys().next().value;
  ensureExternalSurveyImage("allwise", 4, 0, .05);
  ensureExternalSurveyImage("allwise", 10, 0, .05);
`, context);
assert.equal(vm.runInContext("state.externalSurveyCache.has(recentKey)", context), true);

vm.runInContext(`
  const payload = {epochs: [{image_base64: "png", flags_base64: "mask", obs_time: "60800"}],
                   detector_coadds: {D1: {image_base64: "coadd", frame_count: 2}},
                   coadd_image_base64: "coadd", diff_image_base64: "diff"};
  releaseImagePayload(payload);
  getVisibleTileBounds = () => ({gxMin: 0, gxMax: 1, gyMin: 0, gyMax: 1, centerGx: 0, centerGy: 0});
  for (let gx = 0; gx < 50; gx++) {
    state.tileGrid.set(gx + ",0", {key: gx + ",0", gx, gy: 0, status: "ready", aiDetections: []});
  }
  trimTileCache();
`, context);
assert.equal(vm.runInContext("payload.epochs[0].obs_time", context), "60800");
assert.equal(vm.runInContext("payload.epochs[0].image_base64", context), undefined);
assert.equal(vm.runInContext("payload.detector_coadds.D1.frame_count", context), 2);
assert.equal(vm.runInContext("state.tileGrid.size", context), 32);
assert.equal(vm.runInContext('state.tileGrid.has("0,0") && state.tileGrid.has("1,0")', context), true);
vm.runInContext('state.isPlaying = true; startBlinkTimer(); startBlinkTimer();', context);
assert.equal(intervals.size, 1, "Reiniciar la animación no duplica temporizadores");
vm.runInContext('state.isPlaying = false; startBlinkTimer();', context);
assert.equal(intervals.size, 0, "Pausar cancela la animación");
assert.equal(vm.runInContext('state.timerId', context), null);
console.log("Frontend: repintado, cachés, cancelación, metadatos, sectores y temporizadores correctos.");
