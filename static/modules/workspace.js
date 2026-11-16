/* Composición portable: conecta módulos mediante callbacks, sin conocer el DOM científico. */
(() => {
  const base = new URL('.', document.currentScript.src);
  class Workspace extends HTMLElement {
    constructor() { super(); this.attachShadow({mode:'open'}); this.section='explorer'; }
    connectedCallback() {
      if (this.controller) return;
      this.detached=false;
      this.controller=new AbortController();
      this.shadowRoot.innerHTML=`<link rel="stylesheet"><div class="bar"><a href="/" class="identity" aria-label="Papastronomy inicio"><img class="mark-logo" src="/static/images/official-logo.png" alt="Find My X" /><div><span>Tu espacio de exploración</span></div></a><papastronomy-access></papastronomy-access></div><nav aria-label="Secciones de la herramienta"><a href="/">Inicio</a><button type="button" data-section="explorer" aria-pressed="true">Explorador</button><button type="button" data-section="assistant" aria-pressed="false">Asistente</button><a href="/copilot">AI Copilot</a><a href="/login">Iniciar sesión</a><a class="learn" target="_blank" rel="noopener noreferrer" hidden>Aprendé en 3D ↗</a></nav><section class="chat" hidden><papastronomy-assistant></papastronomy-assistant></section>`;
      this.$=selector=>this.shadowRoot.querySelector(selector);
      this.$('link').href=new URL('workspace.css',base).href;
      this.access=this.$('papastronomy-access');
      this.assistant=this.$('papastronomy-assistant');
      if (this.hasAttribute('embedded')) this.access.setAttribute('embedded','');
      const signal=this.controller.signal;
      this.shadowRoot.querySelectorAll('[data-section]').forEach(button=>button.addEventListener('click',()=>this.showSection(button.dataset.section),{signal}));
      this.access.addEventListener('sessionchange',event=>{
        if (!this.started) return;
        this.host?.applyProfile?.(event.detail.profile,event.detail.reason);
        this.refresh();
      },{signal});
      this.$('.learn').addEventListener('click',event=>{
        // Si el anfitrión integra el visor 3D en la página, se abre ahí en lugar de una pestaña nueva.
        if (typeof this.host?.openLearning3D === 'function') {
          event.preventDefault();
          this.showSection('explorer');
          this.host.openLearning3D();
          return;
        }
        const url=this.learningUrl();
        if (!url) { event.preventDefault(); return; }
        event.currentTarget.href=url;
      },{signal});
      if (this.host) this.configure(this.host);
    }
    configure(host) {
      this.host=host;
      if (!this.assistant) return;
      this.assistant.configure({
        getContext:()=>this.getContext(),
        applySettings:(patch,revision)=>this.applySettings(patch,revision),
        onNavigate:target=>this.showSection('explorer',target),
        getLearning3DUrl:()=>this.learningUrl(),
        provider:host.provider,
      });
    }
    async ready() {
      await this.access.ready();
      if (this.detached) return this.access.session;
      this.started=true;
      this.host?.applyProfile?.(this.access.session.profile,'initial');
      this.refresh();
      return this.access.session;
    }
    getContext() {
      const context=this.host?.getContext?.() || {};
      const profile=this.access?.session.profile || null;
      const presets=globalThis.PapastronomyProfiles.PRESETS;
      const level=profile?.level || 'explorador';
      return {...context,
        profile:profile ? {...profile,levelLabel:presets[level].label} : null,
        defaults:presets[level].settings,
        manualOverrides:profile ? profile.overrides : context.settings,
        revision:JSON.stringify([context.revision,profile]),
        conversationKey:JSON.stringify([profile?.id || 'guest',context.conversationKey]),
        answerKey:JSON.stringify([context.answerKey,profile?.explanations]),
      };
    }
    applySettings(patch,revision) {
      const current=this.getContext();
      if (current.loading || current.revision !== revision) throw new Error('El contexto cambió. Pedí una propuesta nueva.');
      if (!this.host?.applySettings) throw new Error('Este anfitrión no permite aplicar ajustes.');
      this.host.applySettings(patch,this.host.getContext().revision);
      this.access.remember(patch);
      this.refresh();
    }
    showSection(section,target='explorer') {
      this.section=section === 'assistant' ? 'assistant' : 'explorer';
      this.$('.chat').hidden=this.section !== 'assistant';
      this.shadowRoot.querySelectorAll('[data-section]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.section === this.section)));
      this.host?.onNavigate?.(this.section === 'assistant' ? 'assistant' : target);
      this.refresh();
    }
    learningUrl() {
      try {
        const value=this.host?.getLearning3DUrl?.();
        if (!value) return null;
        const url=new URL(value,location.href);
        return ['http:','https:'].includes(url.protocol) && url.origin === location.origin ? url.href : null;
      } catch { return null; }
    }
    refresh() {
      if (!this.assistant) return;
      const url=this.learningUrl();
      this.$('.learn').hidden=!url;
      if (url) this.$('.learn').href=url;
      // La flecha ↗ solo tiene sentido cuando el enlace abre otra pestaña.
      this.$('.learn').textContent=typeof this.host?.openLearning3D === 'function' ? 'Aprendé en 3D' : 'Aprendé en 3D ↗';
      this.assistant.refresh();
    }
    disconnectedCallback() { this.detached=true;this.controller?.abort();this.controller=null;this.started=false; }
  }
  if (!customElements.get('papastronomy-workspace')) customElements.define('papastronomy-workspace',Workspace);
})();
