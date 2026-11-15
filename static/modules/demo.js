/* Anfitrión mínimo: no conoce las APIs ni el código del explorador científico. */
(() => {
  const workspace=document.querySelector('papastronomy-workspace');
  let settings={maxFrames:10,fps:2,showFlags:false,showAIMarkers:true};
  let revision=0;
  let previousProfile=null;
  const render=()=>{document.querySelector('output').textContent=JSON.stringify(settings,null,2);};
  workspace.configure({
    getContext:()=>({settings,revision:String(revision),conversationKey:'demo',answerKey:'sin-observaciones',target:null,detections:[],spectrum:null,loading:false}),
    applyProfile(profile,reason) {
      const changed=previousProfile?.id !== profile?.id || previousProfile?.level !== profile?.level;
      if (profile && (changed || ['initial','enter','reset'].includes(reason))) settings=PapastronomyProfiles.effectiveSettings(profile);
      previousProfile=profile;
      revision++;render();
    },
    applySettings(patch,expected) {
      if (expected !== String(revision)) throw new Error('La configuración cambió.');
      if (!PapastronomyAssistantSupport.validPatch(patch)) throw new Error('Propuesta inválida.');
      settings={...settings,...patch};revision++;render();
    },
    onNavigate(target) {document.getElementById('demo-explorer').hidden=target === 'assistant';},
    getLearning3DUrl:()=>new URL('../learn-3d/index.html',location.href).href,
  });
  render();workspace.ready();
})();
