/* =====================================================================
   Visor 3D integrado · panel desplegable debajo de "Contexto Infrarrojo y Catálogos".

   - Muestra <papastronomy-object-viewer> (static/learn-3d) sin abrir otra pestaña.
   - Los scripts del visor se cargan recién la primera vez que se abre el panel.
   - Al cerrar, el visor se retira del DOM: el componente libera WebGL y sus eventos.
   - Los modelos son ilustraciones genéricas: la cabecera muestra los datos reales
     del astro y aclara que el modelo no lo reconstruye.

   API: window.PapastronomyLearn3D.open(astro), .openFromHeader(), .close()
   ===================================================================== */
(() => {
  const $ = (id) => document.getElementById(id);
  const VIEWER_BASE = "/static/learn-3d/";
  const VIEWER_SCRIPTS = ["i18n.js", "content.js", "viewer.js"];
  const MODEL_NAMES = { "brown-dwarf": "enana marrón", "young-star": "estrella joven con disco" };
  const MINUS = "−";
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let loading = null;
  let viewer = null;
  let modelObserver = null;
  let current = { obj: null, model: "brown-dwarf" };
  let openToken = 0;
  let closeTimer = null;
  let returnFocus = null;

  function loadViewer() {
    if (customElements.get("papastronomy-object-viewer")) return Promise.resolve();
    if (!loading) {
      loading = VIEWER_SCRIPTS.reduce(
        (chain, file) =>
          chain.then(
            () =>
              new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = VIEWER_BASE + file;
                script.onload = resolve;
                script.onerror = () => reject(new Error(`No se pudo cargar ${file}`));
                document.head.append(script);
              })
          ),
        Promise.resolve()
      ).catch((err) => {
        loading = null; // permitir reintentar
        throw err;
      });
    }
    return loading;
  }

  const explanationStyle = () =>
    $("personal-workspace")?.access?.session?.profile?.explanations === "tecnica" ? "technical" : "simple";

  // ---------- Cabecera con los datos del astro ----------
  function renderInfo() {
    const { obj, model } = current;
    const facts = $("l3d-facts");
    facts.replaceChildren();
    const addFact = (label, value) => {
      if (value === null || value === undefined || value === "") return;
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      facts.append(dt, dd);
    };
    if (obj) {
      $("l3d-title").textContent = obj.name;
      $("l3d-category").textContent = obj.category || "";
      addFact("Tipo SIMBAD", obj.simbad_otype);
      addFact("Tipo espectral", obj.spectral_type && obj.spectral_type !== "None" ? obj.spectral_type : null);
      addFact("Movimiento propio", Number.isFinite(obj.proper_motion_mas_yr) ? `${obj.proper_motion_mas_yr} mas/año` : null);
      if (Number.isFinite(obj.ra) && Number.isFinite(obj.dec)) {
        addFact("Posición", `RA ${obj.ra.toFixed(4)}° · Dec ${obj.dec < 0 ? MINUS : "+"}${Math.abs(obj.dec).toFixed(4)}°`);
      }
      addFact("Distancia al centro", Number.isFinite(obj.distance_arcsec) ? `${(obj.distance_arcsec / 60).toFixed(2)}′` : null);
      $("l3d-explanation").textContent = obj.explanation || "";
    } else {
      $("l3d-title").textContent = "Aprendé en 3D";
      $("l3d-category").textContent = "Modelos educativos de Papastronomy";
      $("l3d-explanation").textContent =
        "Elegí un modelo y exploralo: giralo, acercalo y recorré sus temas. Para ver el modelo de un astro real, " +
        "seleccioná en el mapa una enana marrón o una estrella joven y tocá «Ver en 3D».";
    }
    facts.hidden = !facts.children.length;
    renderModelNote();
  }

  function renderModelNote() {
    const { obj, model } = current;
    const shown = viewer?.getAttribute("object") || model;
    const name = MODEL_NAMES[shown] || "objeto";
    const note = $("l3d-model-note");
    note.classList.toggle("is-warning", Boolean(obj && shown !== model));
    if (!obj) {
      note.textContent = "Ilustraciones genéricas: no reconstruyen ningún objeto en particular ni usan mediciones.";
    } else if (shown !== model) {
      note.textContent = `Estás viendo el modelo de ${name}, que no corresponde al tipo de ${obj.name}.`;
    } else {
      note.textContent = `El modelo es una ilustración genérica de una ${name}: no reconstruye ${obj.name} ni usa sus mediciones.`;
    }
  }

  // ---------- Abrir / cerrar ----------
  function reveal() {
    const panel = $("learn3d-panel");
    clearTimeout(closeTimer);
    if (panel.hidden) {
      panel.hidden = false;
      // Forzar el estilo inicial antes de animar la apertura.
      void panel.offsetHeight;
    }
    panel.classList.add("is-open");
    panel.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    $("l3d-title").focus({ preventScroll: true });
  }

  async function mountViewer(token) {
    const stage = $("l3d-stage");
    const status = $("l3d-loading");
    if (!viewer) {
      status.hidden = false;
      status.replaceChildren(document.createTextNode("Cargando el visor 3D…"));
    }
    try {
      await loadViewer();
    } catch (err) {
      if (token !== openToken) return;
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "btn btn-sm";
      retry.textContent = "Reintentar";
      retry.addEventListener("click", () => mountViewer(openToken));
      status.replaceChildren(document.createTextNode(`${err.message}. `), retry);
      return;
    }
    if (token !== openToken) return;
    if (!viewer) {
      viewer = document.createElement("papastronomy-object-viewer");
      viewer.setAttribute("lang", window.PapastronomyI18n?.language || "es");
      modelObserver = new MutationObserver(renderModelNote);
      modelObserver.observe(viewer, { attributes: true, attributeFilter: ["object"] });
    }
    viewer.setAttribute("explanation", explanationStyle());
    if (viewer.getAttribute("object") !== current.model) viewer.setAttribute("object", current.model);
    if (!viewer.isConnected) stage.append(viewer);
    status.hidden = true;
    renderModelNote();
  }

  function open(obj) {
    const model = obj?.model_3d && MODEL_NAMES[obj.model_3d] ? obj.model_3d : obj ? null : "brown-dwarf";
    if (!model) return;
    if ($("learn3d-panel").hidden) returnFocus = document.activeElement;
    current = { obj: obj || null, model };
    const token = ++openToken;
    renderInfo();
    reveal();
    void mountViewer(token);
  }

  function selectedNamedObject() {
    if (typeof state === "undefined") return null;
    return (state.skyView?.namedObjects || []).find((o) => o.id === state.selectedNamedObjectId) || null;
  }

  function openFromHeader() {
    const selected = selectedNamedObject();
    open(selected?.model_3d ? selected : null);
  }

  function close() {
    const panel = $("learn3d-panel");
    if (panel.hidden) return;
    openToken++;
    panel.classList.remove("is-open");
    closeTimer = setTimeout(() => {
      panel.hidden = true;
      // Retirar el visor libera WebGL, observadores y animación (disconnectedCallback del componente).
      modelObserver?.disconnect();
      modelObserver = null;
      viewer?.remove();
      viewer = null;
    }, reducedMotion() ? 0 : 320);
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }

  function bind() {
    $("l3d-close").addEventListener("click", close);
    $("learn3d-panel").addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });
    // El estilo de explicación sigue la preferencia del perfil.
    document.addEventListener("sessionchange", () => viewer?.setAttribute("explanation", explanationStyle()));
  }

  window.PapastronomyLearn3D = Object.freeze({ open, openFromHeader, close });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
