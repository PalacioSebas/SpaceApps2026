/* Chat portable. El anfitrión aporta contexto/acciones; el proveedor aporta respuestas. */
(() => {
  'use strict';
  const assetBase = new URL('.', document.currentScript.src);
  const clone = value => JSON.parse(JSON.stringify(value));
  const text = (value, max=12000) => typeof value === 'string' ? value.slice(0,max) : '';
  const account = context => context.profile?.id || 'guest';
  const scope = context => context.conversationKey || JSON.stringify([account(context),context.target?.ra,context.target?.dec,context.target?.fov]);
  const contextStamp = context => JSON.stringify([account(context),scope(context),context.revision ?? null,context.answerKey ?? null]);
  const safeUrl = value => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : null; } catch { return null; } };
  function validPatch(patch, temporal=false) {
    return patch && Number.isInteger(patch.maxFrames) && patch.maxFrames >= 1 && patch.maxFrames <= (temporal ? 32 : 102)
      && [1,1.2,2,3.5,4,6].includes(patch.fps) && typeof patch.showFlags === 'boolean' && typeof patch.showAIMarkers === 'boolean';
  }
  function normalizeResponse(value, context={}) {
    if (!value || typeof value !== 'object') throw new Error('El proveedor no devolvió una respuesta válida.');
    const summary = text(value.summary || value.text,4000);
    if (!summary.trim()) throw new Error('El proveedor devolvió una respuesta vacía.');
    const result = {summary, text:text(value.text || summary), detail:text(value.detail), memory:value.memory,
      sources:(Array.isArray(value.sources) ? value.sources : []).slice(0,12).filter(s=>s && typeof s === 'object').map(s=>({
        title:text(s.title,200),kind:text(s.kind,100),url:safeUrl(s.url),
        facts:(Array.isArray(s.facts) ? s.facts : []).slice(0,20).map(f=>text(f,1500)).filter(Boolean),
      })),
      followUps:(Array.isArray(value.followUps) ? value.followUps : []).slice(0,4).map(p=>text(p,400)).filter(Boolean),
      choices:(Array.isArray(value.choices) ? value.choices : []).slice(0,4).filter(c=>c && typeof c === 'object').map(c=>({label:text(c.label,100),prompt:text(c.prompt,400)})),
      actions:(Array.isArray(value.actions) ? value.actions : []).slice(0,5).filter(a=>a && ['explorer','detector','spectrum','configure','learn3d'].includes(a.id)).map(a=>({id:a.id,label:text(a.label,100),object:a.object})),
    };
    if (validPatch(value.proposal?.settings,context.temporal)) result.proposal={settings:{maxFrames:value.proposal.settings.maxFrames,
      fps:value.proposal.settings.fps,showFlags:value.proposal.settings.showFlags,showAIMarkers:value.proposal.settings.showAIMarkers},maxFrames:context.temporal ? 32 : 102};
    return result;
  }

  class Assistant extends HTMLElement {
    constructor() {
      super();this.attachShadow({mode:'open'});this.options={};this.conversation={};this.history=[];
      this.forms=new Map();this.sequence=0;this.pending=null;this.accountId=undefined;
    }
    configure(options={}) {
      this.cancelPending();
      this.options={...options};
      this.provider=options.provider || globalThis.PapastronomyAssistantRules?.createLocalProvider();
      if (this.events) this.reset();
      return this;
    }
    connectedCallback() {
      if (this.events) return;
      this.events=new AbortController();
      this.shadowRoot.innerHTML=`<link rel="stylesheet">
        <section aria-label="Asistente de observaciones">
          <header><div><p class="eyebrow">PAPASTRONOMY / ASISTENTE</p><h2>Entender lo que ves.</h2><p class="provider"></p></div><button type="button" class="clear">Nueva charla</button></header>
          <div class="layout"><aside><details open><summary>Guías para explorar</summary><div class="topics"></div></details><div class="context" role="status"></div></aside>
          <div class="chat"><div class="messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversación"></div><div class="suggestions"></div>
            <form class="composer"><label for="prompt">Tu consulta</label><div class="compose-row"><textarea id="prompt" maxlength="400" rows="2" required placeholder="Preguntá por una imagen, un candidato o un espectro…"></textarea><button type="submit">Enviar ↗</button></div></form>
            <p class="status" role="status"></p><p class="limits">Las detecciones son candidatos para revisar. El asistente no confirma descubrimientos.</p>
          </div></div>
        </section>`;
      this.$=selector=>this.shadowRoot.querySelector(selector);
      this.$('link').href=new URL('assistant.css',assetBase).href;
      this.provider ||= globalThis.PapastronomyAssistantRules?.createLocalProvider();
      this.shadowRoot.addEventListener('click',event=>{
        const target=event.target.closest?.('button,a');
        if (!target) return;
        if (target.classList.contains('clear')) {this.reset();this.$('textarea').focus();}
        else if (target.dataset.prompt) this.send(target.dataset.prompt);
        else if (target.dataset.nav) this.navigate(target.dataset.nav);
        else if (target.dataset.learning) {
          const href=this.learningUrl(target.dataset.learning);
          if (!href) {event.preventDefault();this.$('.status').textContent='El acceso al visor 3D todavía no está conectado.';}
          else target.href=href;
        }
      },{signal:this.events.signal});
      this.shadowRoot.addEventListener('submit',event=>{
        event.preventDefault();
        if (event.target.classList.contains('composer')) this.send(this.$('textarea').value);
        else if (event.target.classList.contains('proposal')) this.applyProposal(event.target);
      },{signal:this.events.signal});
      this.reset();
    }
    context() {
      try { return this.options.getContext?.() || {}; }
      catch { this.$('.status').textContent='No se pudo leer el contexto de la herramienta.';return {}; }
    }
    element(tag,className,value) {
      const node=this.ownerDocument.createElement(tag);
      if (className) node.className=className;
      if (value !== undefined) node.textContent=value;
      return node;
    }
    button(label,kind,value) {
      const button=this.element('button','',label);button.type='button';button.dataset[kind]=value;return button;
    }
    append(role,value) {
      const message=this.element('article',`message ${role}`);message.id=`message-${++this.sequence}`;
      message.append(this.element('span','author',role === 'user' ? 'Vos' : 'Asistente'),this.element('p','body',value));
      this.$('.messages').append(message);
      this.history.push({role,content:value});this.history=this.history.slice(-30);
      while (this.$('.messages').children.length > 30) this.$('.messages').firstElementChild.remove();
      for (const form of this.forms.keys()) if (!this.$('.messages').contains(form)) this.forms.delete(form);
      return message;
    }
    reset(context=this.context()) {
      this.cancelPending();
      if (!this.$) return;
      this.forms.clear();this.history=[];this.conversation={scope:scope(context)};this.accountId=account(context);
      this.$('.messages').replaceChildren();this.$('textarea').value='';this.$('.status').textContent='';
      const alias=context.profile?.alias ? `Hola, ${context.profile.alias}. ` : 'Hola. ';
      this.append('assistant',alias+'Puedo explicar el campo, revisar candidatos y preparar ajustes. Elegí una guía o escribí una consulta.');
      this.$('.topics').replaceChildren();
      for (const prompt of globalThis.PapastronomyAssistantRules?.TOPICS || []) this.$('.topics').append(this.button(prompt,'prompt',prompt));
      this.refresh();
    }
    refresh() {
      if (!this.$) return this.context();
      const context=this.context();
      if (this.accountId !== account(context)) { this.reset(context);return context; }
      if (this.conversation.scope !== scope(context)) this.conversation={scope:scope(context)};
      if (this.pending && this.pending.stamp !== contextStamp(context)) {
        this.cancelPending();this.append('assistant','El contexto cambió mientras se preparaba la respuesta. Volvé a consultar para usar los datos actuales.');
      }
      this.$('.provider').textContent=this.provider?.label || (this.provider ? 'Proveedor de respuestas conectado' : 'Proveedor de respuestas no disponible');
      this.$('.context').textContent=`${context.profile?.levelLabel || context.profile?.level || 'Invitado'} · ${context.loading ? 'Cargando campo' : context.target?.matched_target_name || (context.target ? 'Campo por coordenadas' : 'Sin campo cargado')}`;
      this.$('.suggestions').replaceChildren();
      const prompts=globalThis.PapastronomyAssistantRules?.suggestionsFor(context) || [];
      for (const prompt of prompts) this.$('.suggestions').append(this.button(prompt,'prompt',prompt));
      for (const [form,record] of this.forms) {
        const stale=record.stamp !== contextStamp(context) || context.loading;
        form.querySelector('button[type=submit]').disabled=stale || !this.options.applySettings;
        form.querySelector('.proposal-status').textContent=stale ? 'El contexto cambió. Pedí una propuesta nueva.' : !this.options.applySettings ? 'La herramienta aún no conectó la aplicación de ajustes.' : '';
      }
      this.setBusy(Boolean(this.pending));
      return context;
    }
    setBusy(busy) {
      if (!this.$) return;
      this.$('.composer').setAttribute('aria-busy',String(busy));
      this.shadowRoot.querySelectorAll('.composer button,.topics button,.suggestions button,.followups button,.actions button').forEach(button=>{button.disabled=busy;});
    }
    cancelPending() {
      const pending=this.pending;
      if (!pending) return;
      this.pending=null;pending.controller.abort();clearTimeout(pending.timer);pending.finishDelay?.();pending.message.remove();this.setBusy(false);
    }
    async send(value) {
      const prompt=String(value || '').trim().slice(0,400);
      if (!prompt || this.pending || !this.$) return;
      const current=this.refresh();
      if (!this.provider?.respond) {this.$('.status').textContent='No hay un proveedor de respuestas disponible.';return;}
      const context=clone(current),conversation=clone({...this.conversation,messages:this.history});
      this.append('user',prompt);this.$('textarea').value='';this.$('.status').textContent='';
      const message=this.element('article','message assistant pending','Preparando respuesta');message.setAttribute('role','status');
      this.$('.messages').append(message);
      const pending={message,stamp:contextStamp(context),controller:new AbortController(),timer:null};
      this.pending=pending;this.setBusy(true);this.scroll();
      try {
        const raw=await this.provider.respond({message:prompt,context,conversation,signal:pending.controller.signal});
        if (this.pending !== pending || pending.controller.signal.aborted) return;
        await new Promise(resolve=>{pending.finishDelay=resolve;pending.timer=setTimeout(resolve,350);});
        if (this.pending !== pending || pending.controller.signal.aborted) return;
        if (pending.stamp !== contextStamp(this.context())) {this.refresh();return;}
        const response=normalizeResponse(raw,context);
        this.conversation=response.memory && typeof response.memory === 'object' ? {...clone(response.memory),scope:scope(context)} : this.conversation;
        this.cancelPending();
        const answer=this.append('assistant',response.summary);
        if (response.detail) {const details=this.element('details','answer-details');details.append(this.element('summary','','Ver explicación completa'),this.element('p','',response.detail));answer.append(details);}
        if (response.proposal) this.addProposal(answer,response.proposal,context);
        this.addEvidence(answer,response);
        this.addActions(answer,response);
        this.refresh();this.scroll();
      } catch (error) {
        if (this.pending !== pending || pending.controller.signal.aborted) return;
        if (pending.stamp !== contextStamp(this.context())) {this.refresh();return;}
        this.cancelPending();
        this.append('assistant','No pude preparar la respuesta. Podés volver a intentarlo.');
        this.$('.status').textContent=text(error?.message,300) || 'El proveedor de respuestas no está disponible.';
        this.scroll();
      }
    }
    addEvidence(message,response) {
      if (!response.sources.length) return;
      const details=this.element('details','sources');details.append(this.element('summary','',`Fuentes y datos usados (${response.sources.length})`));
      for (const source of response.sources) {
        const article=this.element('article','source');article.append(this.element('span','kind',source.kind),this.element('h4','',source.title));
        const list=this.element('ul');for (const fact of source.facts) list.append(this.element('li','',fact));article.append(list);
        if (source.url) {const link=this.element('a','','Abrir referencia ↗');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';article.append(link);}
        details.append(article);
      }
      message.append(details);
    }
    learningUrl(object) {
      return globalThis.PapastronomyAssistantRules?.learningLink(this.options.getLearning3DUrl?.(),this.ownerDocument.baseURI,object);
    }
    addActions(message,response) {
      this.$('.messages').querySelectorAll('.actions,.followups').forEach(node=>{node.hidden=true;});
      const actions=this.element('div','actions');
      for (const action of response.actions) {
        if (action.id === 'learn3d') {
          const href=this.learningUrl(action.object);if (!href) continue;
          const link=this.element('a','',action.label);link.href=href;link.target='_blank';link.rel='noopener noreferrer';
          link.dataset.learning=action.object === 'young-star' ? 'young-star' : 'brown-dwarf';
          link.setAttribute('aria-label',`${action.label} (abre otra pestaña)`);actions.append(link);
        } else actions.append(this.button(action.label,'nav',action.id));
      }
      if (actions.children.length) message.append(actions);
      const followups=this.element('div','followups');
      for (const prompt of response.followUps) followups.append(this.button(prompt,'prompt',prompt));
      for (const choice of response.choices) followups.append(this.button(choice.label,'prompt',choice.prompt));
      if (followups.children.length) message.append(followups);
    }
    navigate(target) {
      if (!['explorer','detector','spectrum','configure'].includes(target)) return;
      if (target === 'configure') {this.send('Configurá la app para mí');return;}
      const context=this.refresh();
      if (target !== 'explorer' && (!context.target || context.loading)) {this.send('¿Qué estoy viendo en este campo?');return;}
      try {
        if (!this.options.onNavigate) throw new Error('La herramienta aún no conectó la navegación.');
        this.options.onNavigate(target);
      } catch (error) {this.$('.status').textContent=text(error.message,300);}
    }
    addProposal(message,proposal,context) {
      const form=this.element('form','proposal');form.append(this.element('h3','','Tu propuesta, editable'));
      const fields=this.element('div','proposal-fields');
      for (const [key,label] of [['maxFrames','Recortes'],['fps','Reproducción'],['showFlags','FLAGS'],['showAIMarkers','Marcas del detector']]) {
        const wrapper=this.element('label');wrapper.append(this.element('span','',label));
        const control=this.element(key === 'maxFrames' ? 'input' : 'select');control.name=key;
        if (key === 'maxFrames') {control.type='number';control.min='1';control.max=String(proposal.maxFrames);control.step='1';control.required=true;}
        else for (const [value,label] of key === 'fps' ? [1,1.2,2,3.5,4,6].map(n=>[String(n),`${n} fps`]) : [['true','Visibles'],['false','Ocultas']]) {
          const option=this.element('option','',label);option.value=value;control.append(option);
        }
        control.value=String(proposal.settings[key]);wrapper.append(control);fields.append(wrapper);
      }
      const submit=this.element('button','','Aplicar estos ajustes');submit.type='submit';
      const status=this.element('p','proposal-status');status.setAttribute('role','status');
      form.append(fields,this.element('p','proposal-note','Revisá los valores antes de aplicar. Los recortes se usan en la próxima exploración; el campo y las coordenadas se conservan.'),submit,status);
      this.forms.set(form,{stamp:contextStamp(context),revision:context.revision});message.append(form);
    }
    async applyProposal(form) {
      const record=this.forms.get(form),context=this.refresh();
      if (!record || record.stamp !== contextStamp(context) || context.loading || !form.reportValidity()) return;
      const values=form.elements,patch={maxFrames:Number(values.maxFrames.value),fps:Number(values.fps.value),showFlags:values.showFlags.value === 'true',showAIMarkers:values.showAIMarkers.value === 'true'};
      const status=form.querySelector('.proposal-status');
      if (!validPatch(patch,context.temporal)) {status.textContent='Revisá los valores de la propuesta.';return;}
      if (!this.options.applySettings) {status.textContent='La herramienta aún no conectó la aplicación de ajustes.';return;}
      form.querySelector('button[type=submit]').disabled=true;
      try {
        await this.options.applySettings(patch,record.revision);
        this.forms.delete(form);for (const control of form.elements) control.disabled=true;
        status.textContent='Ajustes aplicados. Podés seguir modificándolos en la herramienta.';
      } catch (error) {status.textContent=text(error.message,300) || 'No se pudieron aplicar los ajustes.';this.refresh();}
    }
    scroll() {const log=this.$('.messages');log.scrollTop=log.scrollHeight;}
    disconnectedCallback() {
      this.cancelPending();this.events?.abort();this.events=null;this.forms.clear();
    }
  }
  globalThis.PapastronomyAssistantSupport=Object.freeze({contextStamp,normalizeResponse,validPatch});
  if (!customElements.get('papastronomy-assistant')) customElements.define('papastronomy-assistant',Assistant);
})();
