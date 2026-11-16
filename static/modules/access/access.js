/* <papastronomy-access> consume su modelo y comunica cambios mediante eventos. */
(() => {
  "use strict";
  const assetBase = new URL(".", document.currentScript.src);

  class PapastronomyAccess extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.waiters = [];
    }

    ensureStore() {
      const embedded = this.hasAttribute("embedded");
      if (this.store && this.embedded === embedded) return;
      const model = globalThis.PapastronomyProfiles;
      if (!model) throw new Error("Cargá access/model.js antes de access/access.js.");
      this.embedded = embedded;
      this.store = new model.Store(embedded ? null : undefined);
      if (embedded) this.store.data.entered = true;
    }

    get session() {
      this.ensureStore();
      return {
        entered: this.store.data.entered,
        profile: this.store.get(),
        persistent: this.embedded ? false : this.store.persistent,
      };
    }

    getSettings() {
      return globalThis.PapastronomyProfiles.effectiveSettings(this.session.profile);
    }

    connectedCallback() {
      if (this.abort) return;
      this.ensureStore();
      this.abort = new AbortController();
      const signal = this.abort.signal;
      this.shadowRoot.innerHTML = `
        <link rel="stylesheet">
        <div class="account-bar">
          <div><strong class="account-name" data-i18n-skip></strong><span class="account-description"></span></div>
          <div class="account-actions">
            <button class="profile-button" type="button">Mi perfil</button>
            <button class="switch-button" type="button">Cambiar cuenta</button>
            <button class="logout-button" type="button">Salir</button>
          </div>
        </div>
        <p class="storage-status" role="status"></p>
        <dialog aria-labelledby="access-title" aria-describedby="access-description">
          <form>
            <header><div><p class="eyebrow">Acceso demo</p><h2 id="access-title"></h2></div><button type="button" class="close-button" aria-label="Cerrar">×</button></header>
            <p id="access-description">Elegí una cuenta de demostración o continuá como invitado.</p>
            <div class="accounts" role="group" aria-label="Cuenta de demostración"></div>
            <div class="fields">
              <label>Alias<input name="alias" maxlength="40" autocomplete="nickname" required></label>
              <label>Experiencia<select name="level"></select></label>
              <label>Interés<select name="interest"></select></label>
              <label>Explicaciones<select name="explanations"></select></label>
            </div>
            <p class="defaults" aria-live="polite"></p>
            <p class="dialog-storage-status" role="status"></p>
            <button class="reset-button" type="button">Restaurar configuración del perfil</button>
            <div class="dialog-actions"><button class="guest-button" type="button">Continuar como invitado</button><button class="cancel-button" type="button">Cancelar</button><button class="save-button" type="submit">Entrar al explorador</button></div>
          </form>
        </dialog>`;
      this.$ = selector => this.shadowRoot.querySelector(selector);
      this.$("link").href = new URL("access.css", assetBase).href;
      this.dialog = this.$("dialog");
      this.form = this.$("form");
      const model = globalThis.PapastronomyProfiles;
      for (const [name, choices] of [["level", model.PRESETS], ["interest", model.INTERESTS], ["explanations", model.EXPLANATIONS]]) {
        for (const [value, choice] of Object.entries(choices)) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = typeof choice === "string" ? choice : choice.label;
          this.form.elements[name].append(option);
        }
      }
      this.$(".profile-button").addEventListener("click", () => this.open(), { signal });
      this.$(".switch-button").addEventListener("click", () => this.openLogin(), { signal });
      this.$(".logout-button").addEventListener("click", () => this.logout(), { signal });
      this.$(".guest-button").addEventListener("click", () => this.enterGuest(), { signal });
      this.$(".cancel-button").addEventListener("click", () => this.cancelDialog(), { signal });
      this.$(".close-button").addEventListener("click", () => this.cancelDialog(), { signal });
      this.$(".reset-button").addEventListener("click", () => this.resetSettings(), { signal });
      this.$(".accounts").addEventListener("click", event => {
        const button = event.target.closest("[data-account]");
        if (button) this.fillForm(button.dataset.account);
      }, { signal });
      this.dialog.addEventListener("cancel", event => { event.preventDefault(); this.cancelDialog(); }, { signal });
      this.form.addEventListener("submit", event => {
        event.preventDefault();
        if (!this.form.reportValidity()) return;
        const fields = {};
        for (const name of ["alias", "level", "interest", "explanations"]) fields[name] = this.form.elements[name].value;
        if (this.mode === "edit") this.store.update(fields);
        else this.store.enter(this.selectedId, fields);
        this.complete(this.mode === "edit" ? "profile" : "enter");
      }, { signal });
      this.form.elements.level.addEventListener("change", () => this.updateDefaults(), { signal });
      this.renderSummary();
      this.unsubscribeLanguage=globalThis.PapastronomyI18n?.subscribe(()=>this.renderSummary());
      if (this.waiters.length && !this.session.entered) this.openLogin();
    }

    ready() {
      const session = this.session;
      if (session.entered) return Promise.resolve(session);
      const promise = new Promise(resolve => this.waiters.push(resolve));
      this.openLogin();
      return promise;
    }

    open() {
      if (this.session.profile) this.openDialog("edit");
      else this.openLogin();
    }

    openLogin() {
      this.openDialog("login");
    }

    openDialog(mode) {
      this.ensureStore();
      if (this.embedded || !this.isConnected || !this.dialog) return;
      this.mode = mode;
      this.$("#access-title").textContent = mode === "edit" ? "Mi perfil" : "Tu punto de partida en el cielo";
      this.$("#access-description").textContent = mode === "edit"
        ? "Tus preferencias definen los valores iniciales. Podés ajustar los controles durante la exploración."
        : "Elegí una cuenta de demostración o continuá como invitado.";
      this.$(".accounts").hidden = mode === "edit";
      this.$(".reset-button").hidden = mode !== "edit";
      this.$(".guest-button").hidden = mode === "edit";
      this.$(".cancel-button").hidden = !this.session.entered;
      this.$(".save-button").textContent = mode === "edit" ? "Guardar perfil" : "Entrar al explorador";
      this.renderAccounts();
      this.fillForm(this.session.profile?.id || "principiante");
      if (!this.dialog.open) this.dialog.showModal();
    }

    renderAccounts() {
      const container = this.$(".accounts");
      container.replaceChildren();
      for (const [id, preset] of Object.entries(globalThis.PapastronomyProfiles.PRESETS)) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.account = id;
        const title = document.createElement("strong");
        const description = document.createElement("span");
        title.textContent = preset.label;
        description.textContent = preset.description;
        button.append(title, description);
        container.append(button);
      }
    }

    fillForm(id) {
      this.selectedId = id;
      const profile = this.store.get(id);
      for (const name of ["alias", "level", "interest", "explanations"]) this.form.elements[name].value = profile[name];
      this.shadowRoot.querySelectorAll("[data-account]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.account === id));
      });
      this.updateDefaults();
      this.renderStorageStatus();
    }

    updateDefaults() {
      const model = globalThis.PapastronomyProfiles;
      const selected = this.store.get(this.selectedId);
      const settings = model.effectiveSettings({ ...selected, level: this.form.elements.level.value });
      this.$(".defaults").textContent = `${settings.maxFrames} recortes · ${settings.fps} fps · campo de ${settings.fov}° · FLAGS ${settings.showFlags ? "visibles" : "ocultas"}. Tus ajustes manuales tienen prioridad.`;
    }

    cancelDialog() {
      if (!this.session.entered) this.enterGuest();
      else this.dialog.close();
    }

    enterGuest() {
      if (this.embedded) return;
      this.store.leave(true);
      this.complete("guest");
    }

    logout() {
      if (this.embedded) return;
      this.store.leave(false);
      this.complete("logout");
      this.openLogin();
    }

    complete(reason) {
      this.dialog?.close();
      this.renderSummary();
      const session = this.session;
      this.dispatchEvent(new CustomEvent("sessionchange", { bubbles: true, composed: true, detail: { reason, ...session } }));
      if (session.entered) {
        for (const resolve of this.waiters.splice(0)) resolve(session);
      }
    }

    remember(patch) {
      if (this.session.profile && !this.embedded) this.store.remember(patch);
      this.renderStorageStatus();
    }

    rememberRegion(ra, dec, temporal) {
      if (this.session.profile && !this.embedded) this.store.rememberRegion(ra, dec, temporal);
      this.renderStorageStatus();
    }

    resetSettings() {
      if (!this.session.profile || this.embedded) return;
      this.store.reset();
      this.updateDefaults();
      this.renderStorageStatus();
      this.dispatchEvent(new CustomEvent("sessionchange", { bubbles: true, composed: true, detail: { reason: "reset", ...this.session } }));
    }

    renderSummary() {
      if (!this.$) return;
      const { profile, entered } = this.session;
      this.$(".account-bar").hidden = this.embedded;
      this.$(".account-name").textContent = profile?.alias || (globalThis.PapastronomyI18n?.t(entered ? "Invitado" : "Acceso demo") || (entered ? "Invitado" : "Acceso demo"));
      this.$(".account-description").textContent = profile ? globalThis.PapastronomyProfiles.PRESETS[profile.level].label : "Exploración con todas las funciones";
      this.$(".profile-button").textContent = profile ? "Mi perfil" : "Entrar";
      this.$(".switch-button").hidden = !profile;
      this.$(".logout-button").hidden = !entered;
      this.renderStorageStatus();
    }

    renderStorageStatus() {
      if (!this.$) return;
      const text = !this.embedded && !this.session.persistent
        ? "El navegador no pudo guardar las preferencias. Se conservarán durante esta visita." : "";
      this.$(".storage-status").textContent = text;
      this.$(".dialog-storage-status").textContent = text;
    }

    disconnectedCallback() {
      this.unsubscribeLanguage?.();
      this.abort?.abort();
      this.abort = null;
      this.dialog?.close();
      for (const resolve of this.waiters.splice(0)) resolve(this.session);
    }
  }

  if (!customElements.get("papastronomy-access")) customElements.define("papastronomy-access", PapastronomyAccess);
})();
