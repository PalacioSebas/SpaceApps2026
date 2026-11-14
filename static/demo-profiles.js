/* Perfiles locales de demostración. No representan autenticación ni permisos. */
(function (root) {
  "use strict";
  const STORAGE_KEY = "papastronomy.demo-profiles.v1";
  const COMMON = Object.freeze({ fov: .05, maxFrames: 10, fps: 2, showFlags: false,
    showAIMarkers: true, invertPixels: false, stretchLinearity: 0, contrastGain: 1,
    showGaiaCat: true, showWiseCat: true, showPmVectors: true, showNamedObjects: false,
    contextSurvey: "spherex", viewMode: "blink", spectrumPlotMode: "spectrum" });
  const PRESETS = Object.freeze({
    principiante: Object.freeze({ label: "Principiante", alias: "Visitante del cielo",
      description: "Una primera mirada, con explicaciones simples y una secuencia pausada.",
      explanations: "simple", settings: Object.freeze({ ...COMMON, fps: 1 }) }),
    explorador: Object.freeze({ label: "Explorador", alias: "Explorador del cielo",
      description: "Compará exposiciones y descubrí qué cuentan los espectros.",
      explanations: "equilibrada", settings: COMMON }),
    avanzado: Object.freeze({ label: "Avanzado", alias: "Analista del cielo",
      description: "Más recortes iniciales, reproducción rápida y máscaras de calidad visibles.",
      explanations: "tecnica", settings: Object.freeze({ ...COMMON, maxFrames: 16, fps: 4, showFlags: true }) }),
  });
  const INTERESTS = Object.freeze({ aprender: "Aprender astronomía", objetos: "Explorar objetos", analisis: "Analizar observaciones" });
  const EXPLANATIONS = Object.freeze({ simple: "Simples", equilibrada: "Equilibradas", tecnica: "Técnicas" });
  const numberRules = { fov: [0.005, 1], maxFrames: [1, 102], stretchLinearity: [0, 1], contrastGain: [.4, 2.5] };
  const enums = { fps: [1, 2, 4, 6], contextSurvey: ["spherex", "allwise", "2mass", "dss2"],
    viewMode: ["blink", "coadd", "rgb", "diff"], spectrumPlotMode: ["spectrum", "lightcurve"] };
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function cleanOverrides(value) {
    const result = {};
    if (!value || typeof value !== "object") return result;
    for (const key of Object.keys(COMMON)) {
      if (!own(value, key)) continue;
      const candidate = value[key];
      if (typeof COMMON[key] === "boolean") {
        if (typeof candidate === "boolean") result[key] = candidate;
      } else if (own(enums, key)) {
        if (enums[key].includes(candidate)) result[key] = candidate;
      } else if (own(numberRules, key)) {
        const [min, max] = numberRules[key];
        if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= min && candidate <= max
            && (key !== "fov" || candidate > min) && (key !== "maxFrames" || Number.isInteger(candidate))) result[key] = candidate;
      }
    }
    return result;
  }

  function cleanProfile(id, value = {}) {
    const level = own(PRESETS, value.level) ? value.level : id;
    const alias = typeof value.alias === "string" ? value.alias.trim().slice(0, 40) : "";
    let lastRegion = null;
    const region = value.lastRegion;
    if (region && Number.isFinite(region.ra) && region.ra >= 0 && region.ra <= 360
        && Number.isFinite(region.dec) && region.dec >= -90 && region.dec <= 90) {
      lastRegion = { ra: region.ra, dec: region.dec, temporal: region.temporal === true };
    }
    return { id, alias: alias || PRESETS[id].alias, level,
      interest: own(INTERESTS, value.interest) ? value.interest : "aprender",
      explanations: own(EXPLANATIONS, value.explanations) ? value.explanations : PRESETS[level].explanations,
      overrides: cleanOverrides(value.overrides), lastRegion };
  }

  function effectiveSettings(profile) {
    return { ...PRESETS[profile.level].settings, ...cleanOverrides(profile.overrides) };
  }

  class Store {
    constructor(storage) {
      this.persistent = true;
      if (storage === undefined) {
        try { storage = root.localStorage; } catch { storage = null; }
      }
      this.storage = storage;
      this.data = { version: 1, entered: false, activeId: null, profiles: {} };
      try {
        if (!storage) throw new Error("Sin almacenamiento local");
        const raw = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
        if (raw && raw.version === 1) {
          for (const id of Object.keys(PRESETS)) {
            const value = raw.profiles?.[id];
            if (value && typeof value === "object") this.data.profiles[id] = cleanProfile(id, value);
          }
          this.data.activeId = own(PRESETS, raw.activeId) ? raw.activeId : null;
          this.data.entered = raw.entered === true;
        }
      } catch { this.persistent = false; }
    }
    save() {
      try {
        if (!this.storage) throw new Error("Sin almacenamiento local");
        this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        this.persistent = true;
      } catch { this.persistent = false; }
    }
    get(id = this.data.activeId) {
      return own(PRESETS, id) ? cleanProfile(id, this.data.profiles[id]) : null;
    }
    enter(id, fields = {}) {
      if (!own(PRESETS, id)) throw new Error("Perfil demo desconocido");
      this.data.profiles[id] = cleanProfile(id, { ...this.get(id), ...fields });
      this.data.activeId = id;
      this.data.entered = true;
      this.save();
      return this.get();
    }
    update(fields) {
      const current = this.get();
      if (!current) return null;
      const changes = {};
      for (const key of ["alias", "level", "interest", "explanations"]) if (own(fields, key)) changes[key] = fields[key];
      return this.enter(current.id, { ...current, ...changes });
    }
    remember(patch) {
      const profile = this.get();
      if (!profile) return;
      profile.overrides = { ...profile.overrides, ...cleanOverrides(patch) };
      this.data.profiles[profile.id] = profile;
      this.save();
    }
    rememberRegion(ra, dec, temporal) {
      const profile = this.get();
      if (!profile) return;
      this.data.profiles[profile.id] = cleanProfile(profile.id, { ...profile, lastRegion: { ra, dec, temporal } });
      this.save();
    }
    reset() {
      const profile = this.get();
      if (!profile) return;
      profile.overrides = {};
      this.data.profiles[profile.id] = profile;
      this.save();
    }
    leave(guest = false) {
      this.data.activeId = null;
      this.data.entered = guest;
      this.save();
    }
  }
  root.DemoProfiles = Object.freeze({ STORAGE_KEY, PRESETS, INTERESTS, EXPLANATIONS, Store, effectiveSettings, cleanOverrides });
})(globalThis);
