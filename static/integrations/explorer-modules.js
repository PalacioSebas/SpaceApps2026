/* Único adaptador específico del explorador actual. Reescribir este puente al cambiar su UI. */
(() => {
  const FPS=[1,1.2,2,3.5,4,6];
  const controls={fps:'select-fps',showFlags:'chk-flags',showAIMarkers:'chk-ai-markers',
    invertPixels:'chk-invert',stretchLinearity:'slider-stretch',contrastGain:'slider-contrast',
    showGaiaCat:'chk-gaia',showWiseCat:'chk-wise',showPmVectors:'chk-pm-vectors',
    showNamedObjects:'chk-named-objects',showTemporalTrail:'chk-temporal-trail',contextSurvey:'select-context-survey'};

  function createHost({state,document:doc,location,operations:ops={},access}) {
    const initialParams=new URL(location.href).searchParams;
    const node=id=>doc.getElementById(id);
    let previousProfile=null;
    let active=false;
    const settings=()=>({maxFrames:state.frameLimit,fps:state.fps,showFlags:state.showFlags,showAIMarkers:state.showAIMarkers});
    function setControl(key,value) {
      const element=node(controls[key]);
      if (!element) return;
      if (typeof value === 'boolean') element.checked=value;
      else {
        if (key === 'fps' && element.options && !Array.from(element.options).some(option=>Number(option.value) === value)) {
          const option=doc.createElement('option');option.value=String(value);option.textContent=`${value} fps`;element.append(option);
        }
        element.value=String(value);
      }
    }
    function getContext() {
      const available=state.moduleDataSequence === state.exploreSequence && Boolean(state.exploreData) && !state.isLoading;
      const current=state.moduleSpectrum;
      return {
        target:available ? state.exploreData.target_info : null,
        detections:available ? (state.allAiDetections || []) : [],
        analysisFrames:available ? (state.exploreData.target_info.analysis_frame_indices || []).map(index=>state.exploreData.epochs[index]).filter(Boolean) : [],
        selectedDetectionId:available ? state.selectedDetectionId : null,
        spectrum:available && current?.exploreSequence === state.exploreSequence && current.sequence === state.spectrumSequence ? current.data : null,
        settings:settings(),temporal:Boolean(state.temporalSearch),loading:Boolean(state.isLoading),
        revision:JSON.stringify([state.exploreSequence,state.moduleDataSequence,state.isLoading,settings()]),
        conversationKey:String(state.exploreSequence),
        answerKey:JSON.stringify([state.exploreSequence,state.selectedDetectionId,state.selectedPixel,state.spectrumSequence,Boolean(current)]),
      };
    }
    function applySettings(patch,revision) {
      const context=getContext();
      if (context.loading || context.revision !== revision) throw new Error('El contexto cambió. Pedí una propuesta nueva.');
      if (!patch || !Number.isInteger(patch.maxFrames) || patch.maxFrames < 1 || patch.maxFrames > (state.temporalSearch ? 32 : 102)
          || !FPS.includes(patch.fps) || typeof patch.showFlags !== 'boolean' || typeof patch.showAIMarkers !== 'boolean') {
        throw new Error('Revisá recortes, FPS y opciones de la propuesta.');
      }
      state.frameLimit=patch.maxFrames;state.fps=patch.fps;state.showFlags=patch.showFlags;state.showAIMarkers=patch.showAIMarkers;
      if (node('input-max-frames')) node('input-max-frames').value=String(state.frameLimit);
      for (const key of ['fps','showFlags','showAIMarkers']) setControl(key,state[key]);
      ops.startBlinkTimer?.();ops.renderCanvas?.();
    }
    function applyProfile(profile,reason) {
      const changedLevel=previousProfile?.level !== profile?.level || previousProfile?.id !== profile?.id;
      previousProfile=profile;
      if (!profile || !['initial','enter','reset'].includes(reason) && !changedLevel) return;
      const values=globalThis.PapastronomyProfiles.effectiveSettings(profile);
      const first=reason === 'initial';
      if (first && !initialParams.has('ra') && !initialParams.has('dec') && profile.lastRegion) {
        state.ra=profile.lastRegion.ra;state.dec=profile.lastRegion.dec;
        if (!initialParams.has('temporal')) state.temporalSearch=profile.lastRegion.temporal;
      }
      for (const key of Object.keys(controls)) {
        if (!(key in values) || first && key === 'invertPixels' && initialParams.has('invert')) continue;
        state[key]=values[key];setControl(key,values[key]);
      }
      state.frameLimit=values.maxFrames;
      if (node('input-max-frames')) node('input-max-frames').value=String(values.maxFrames);
      if (!(first && initialParams.has('fov')) && node('input-fov')) {
        node('input-fov').value=String(values.fov);
        if (!state.exploreData) state.fov=values.fov;
      }
      if (!(first && initialParams.has('timeline'))) state.spectrumPlotMode=values.spectrumPlotMode === 'spectrum' ? 'spectrum' : 'timeline';
      // View modes depend on the available analysis; never enable an unavailable difference.
      if (active) {
        ops.setViewMode?.(values.viewMode === 'diff' && !state.exploreData?.target_info?.difference_available ? 'blink' : values.viewMode);
        ops.startBlinkTimer?.();ops.rebake?.();ops.renderPlot?.();
      } else state.viewMode=values.viewMode;
    }
    function onNavigate(target) {
      ops.setRoute?.(target === 'assistant' ? 'assistant' : 'explorer');
      const explorer=node('explorer-root');
      if (explorer) explorer.hidden=target === 'assistant';
      if (target === 'assistant') return;
      if (active) { ops.renderCanvas?.();ops.renderContext?.();ops.resizePlot?.(); }
      const focus=node(target === 'spectrum' ? 'spectrum-panel-title' : target === 'detector' ? 'ai-detections-list' : 'coord-form');
      if (focus && target !== 'explorer') {
        focus.setAttribute('tabindex','-1');focus.focus({preventScroll:true});focus.scrollIntoView({block:'start',behavior:'auto'});
      }
    }
    function getLearning3DUrl() {
      const url=new URL('/static/learn-3d/index.html',location.href);
      url.searchParams.set('from','explorer');
      url.searchParams.set('explanation',access.session.profile?.explanations === 'tecnica' ? 'technical' : 'simple');
      const lang=new URL(location.href).searchParams.get('lang');
      if (lang === 'es' || lang === 'en') url.searchParams.set('lang',lang);
      return url.href;
    }
    const host={getContext,applySettings,applyProfile,onNavigate,getLearning3DUrl,activate() {active=true;}};
    // Solo se ofrece si el explorador integra el panel 3D; si no, la cabecera abre la página en otra pestaña.
    if (typeof ops.openLearning3D === 'function') host.openLearning3D=()=>ops.openLearning3D();
    return host;
  }

  let workspace,host,controller,lastSavedRegionKey=null;
  function refresh() {
    if (!workspace || !host) return;
    const profile=workspace.access.session.profile;
    const regionKey=JSON.stringify([profile?.id,state.exploreSequence]);
    if (profile && !state.isLoading && state.moduleDataSequence === state.exploreSequence && state.exploreData && lastSavedRegionKey !== regionKey) {
      workspace.access.rememberRegion(state.ra,state.dec,state.temporalSearch);
      lastSavedRegionKey=regionKey;
    }
    workspace.refresh();
  }
  async function start() {
    workspace=document.getElementById('personal-workspace');
    if (!workspace) return;
    if (state.embed) { workspace.setAttribute('embedded','');workspace.access.setAttribute('embedded',''); }
    if (!document.getElementById('input-max-frames')) {
      const label=document.createElement('label');
      label.className='flex items-center gap-2 bg-slate-900/90 border border-slate-700 rounded-lg px-2.5 py-1 text-xs';
      const caption=document.createElement('span');caption.textContent='Recortes';
      const input=document.createElement('input');
      input.type='number';input.id='input-max-frames';input.min='1';input.max='102';input.step='1';input.required=true;input.value=String(state.frameLimit);
      input.className='bg-transparent text-white w-14';
      label.append(caption,input);document.getElementById('coord-form')?.append(label);
    }
    host=createHost({state,document,location,access:workspace.access,operations:{
      startBlinkTimer,renderCanvas,renderContext:renderContextSkyMap,setViewMode,
      rebake:rebakeAllOpticalCanvases,renderPlot:renderSpectrumOrLightCurve,
      resizePlot() {const plot=document.getElementById('spectrum-plot');if (window.Plotly && plot?.data) Plotly.Plots.resize(plot);},
      setRoute(section) {const hash=section === 'assistant' ? '#asistente' : '#explorador';if (location.hash !== hash) history.pushState(null,'',hash);},
      ...(window.PapastronomyLearn3D ? {openLearning3D:()=>window.PapastronomyLearn3D.openFromHeader()} : {}),
    }});
    workspace.configure(host);
    const currentWorkspace=workspace;
    await currentWorkspace.ready();
    if (workspace !== currentWorkspace || !currentWorkspace.isConnected) return;
    controller?.abort();controller=new AbortController();
    const signal=controller.signal;
    const frameInput=document.getElementById('input-max-frames');
    frameInput?.addEventListener('change',()=>{
      const value=Number(frameInput.value);
      if (Number.isInteger(value) && value >= 1 && value <= 102) {state.frameLimit=value;workspace.access.remember({maxFrames:value});refresh();}
    },{signal});
    const manualMap={...Object.fromEntries(Object.entries(controls).map(([key,id])=>[id,key])),
      'select-tl-fps':'fps','input-fov':'fov','select-fov-preset':'fov'};
    document.addEventListener('change',event=>{
      const key=manualMap[event.target.id];
      if (key) workspace.access.remember({[key]:key === 'fov' ? Number(document.getElementById('input-fov').value) : state[key]});
      if (key === 'showTemporalTrail') workspace.access.remember({showPmVectors:state.showPmVectors});
      refresh();
    },{signal});
    document.getElementById('coord-form')?.addEventListener('submit',()=>{
      workspace.access.remember({fov:Number(document.getElementById('input-fov').value),maxFrames:state.frameLimit});
    },{signal});
    document.addEventListener('click',event=>{
      const id=event.target.closest?.('[id]')?.id;
      if (['btn-toggle-star-motion','btn-toggle-star-motion-context'].includes(id)) workspace.access.remember({showPmVectors:state.showPmVectors,showTemporalTrail:state.showTemporalTrail});
      if (id?.startsWith('mode-')) workspace.access.remember({viewMode:state.viewMode});
      if (['btn-plot-spectrum','btn-plot-lightcurve'].includes(id)) workspace.access.remember({spectrumPlotMode:state.spectrumPlotMode});
    },{signal});
    const route=()=>{
      if (['#asistente','#explorador'].includes(location.hash)) workspace.showSection(location.hash === '#asistente' ? 'assistant' : 'explorer');
    };
    window.addEventListener('hashchange',route,{signal});
    window.addEventListener('popstate',route,{signal});
    if (location.hash === '#asistente') workspace.showSection('assistant');
  }
  window.PapastronomyIntegration=Object.freeze({createHost,start,refresh,activate() {host?.activate();},
    destroy() {controller?.abort();controller=null;workspace=null;host=null;lastSavedRegionKey=null;},
  });
})();
