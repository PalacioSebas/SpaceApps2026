// Reglas del asistente demo: no necesita npm, servicios ni un navegador.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ URL, AbortController, DOMException });
vm.runInContext(fs.readFileSync(path.join(__dirname,'rules.js'),'utf8'), context);
const assistant = context.PapastronomyAssistantRules;
const profiles = { PRESETS: {
  principiante: {settings:{maxFrames:10,fps:1,showFlags:false,showAIMarkers:true}},
  avanzado: {settings:{maxFrames:16,fps:4,showFlags:true,showAIMarkers:true}},
}};
for (const [question, intent] of [
  ['Configurá la app para mí', 'configure'], ['¿Por qué no hay detecciones?', 'detector'],
  ['Explicá el candidato seleccionado', 'candidate'], ['¿Qué es un dipolo?', 'types'],
  ['Ayudame a empezar', 'start'], ['Qué significa el espectro', 'spectrum'],
  ['Por qué está borrosa la imagen', 'images'], ['No veo la imagen', 'images'],
  ['Explicá esta detección', 'candidate'], ['No hay candidatos', 'detector'], ['Cuál es la capital de Francia', 'unknown'],
]) assert.equal(assistant.classify(question), intent, question);
const base = { profile: { id: 'principiante', level: 'principiante', explanations: 'simple' },
  defaults: profiles.PRESETS.principiante.settings,
  target: { difference_available: false, analysis_note: 'Faltan referencias fotométricas.' },
  manualOverrides: {}, detections: [], selectedDetectionId: null };
assert.match(assistant.reply('detector', base).text, /Faltan referencias fotométricas/);
assert.doesNotMatch(assistant.reply('detector', base).text, /no encontró candidatos/);
assert.match(assistant.reply('detector', { ...base, target: null }).text, /no hay un campo cargado/);
assert.match(assistant.reply('detector', { ...base, loading: true }).text, /se está cargando/);
const available = { ...base, target: { difference_available: true } };
assert.match(assistant.reply('detector', available).text, /no encontró candidatos/);
const detection = { id: 7, type: 'MOVING_DIPOLE', snr_score: 8.5, shift_arcsec: 1.25,
  description: 'Diagnóstico técnico de prueba.' };
const selected = { ...available, detections: [detection], selectedDetectionId: 7 };
assert.match(assistant.reply('candidato', selected).text, /Candidato #7/);
assert.match(assistant.reply('candidato', selected).text, /1,25″/);
assert.doesNotMatch(assistant.reply('candidato', selected).text, /planeta confirmado|descubrimiento/i);
assert.match(assistant.reply('candidato', { ...selected, selectedDetectionId: 999 }).text, /Seleccioná un candidato/);
assert.match(assistant.reply('candidato', { ...selected, loading: true }).text, /se está cargando/);
assert.match(assistant.reply('¿qué tiempo hará mañana?', base).text, /consultas predefinidas/);
const technical = { ...selected, profile: { ...base.profile, explanations: 'tecnica' } };
assert.match(assistant.reply('candidato', technical).text, /Diagnóstico técnico de prueba/);
assert.doesNotMatch(assistant.reply('candidato', selected).text, /Diagnóstico técnico de prueba/);
const defaultProposal = assistant.reply('configurar', base).proposal;
assert.equal(defaultProposal.settings.fps, 1);
assert.equal(defaultProposal.settings.maxFrames, 10);
const advanced = assistant.propose({ ...base, defaults: profiles.PRESETS.avanzado.settings });
assert.equal(advanced.settings.fps, 4);
assert.equal(advanced.settings.showFlags, true);
const manual = { fps: 6, maxFrames: 23, showFlags: false, fov: .12, ra: 100 };
const proposal = assistant.propose({ ...base, defaults: profiles.PRESETS.avanzado.settings, manualOverrides: manual });
assert.equal(proposal.settings.fps, 6, 'La propuesta conserva los ajustes manuales');
assert.equal(proposal.settings.maxFrames, 23);
assert.equal(proposal.settings.showFlags, false);
assert.equal(proposal.settings.fov, undefined, 'El asistente no cambia la geometría del campo');
assert.equal(proposal.settings.ra, undefined);
assert.equal(assistant.propose({ ...base, temporal: true, manualOverrides: {maxFrames: 102} }).settings.maxFrames, 32);
assert.equal(manual.maxFrames, 23, 'Preparar una propuesta no modifica preferencias ni datos');
assert.equal(base.manualOverrides.fps, undefined);
assert.equal(assistant.reply('Mostrame un ejemplo', base).proposal, undefined,
  'El recorrido solo explica pasos: no genera observaciones ficticias');
console.log('Asistente demo: consultas, estado real, selección, estilos, propuestas y prioridad manual correctos.');

// Respuestas integradas: las fuentes se construyen con los datos de la consulta.
const field = { ...base, target: { ...base.target, matched_target_name: 'Campo de prueba',
  ra: 10, dec: -20, fov: .05, total_frames: 6, total_epochs: 2, total_bands: 3, data_source: 'CACHE_REAL_FITS' },
  analysisFrames: [{index: 0, detector: 'D1', wavelength_center_um: 1.1, obs_time: '60800'}] };
for (const [question, intent] of [['Qué es SPHEREx', 'mission'], ['Qué estoy viendo', 'view'],
  ['Puedo usar la resta temporal', 'compare'], ['Cuánto brillo tiene la fuente', 'brightness'],
  ['Puede confirmar un planeta', 'limits']]) assert.equal(assistant.classify(question), intent);
const view = assistant.reply('Qué estoy viendo', field);
assert.match(view.text, /Campo de prueba/);
assert.match(view.sources[0].facts.join(' '), /6 recortes.*2 instantes/);
assert.match(assistant.reply('Puedo usar la resta temporal', field).sources[1].facts.join(' '), /60800/);
assert.ok(assistant.reply('Qué es SPHEREx').sources.every(s => /^https:\/\/(science.nasa.gov|irsa.ipac.caltech.edu)\//.test(s.url)));
assert.equal(assistant.reply('Qué estoy viendo', { ...field, loading: true }).sources.some(s => s.kind === 'Datos de esta consulta'), false,
  'Durante la carga no se citan datos de la región anterior');
const candidateAnswer = assistant.reply('candidato', selected);
assert.ok(candidateAnswer.sources.some(s => s.title === 'Candidato #7' && s.facts.some(f => f.includes('8,5σ'))));
detection.snr_score = 99;
assert.ok(candidateAnswer.sources.some(s => s.facts.some(f => f.includes('8,5σ'))), 'Las fuentes del historial son una instantánea');
const measured = { ...field, spectrum: { ra:10, dec:-20, spectrum:[
  {wavelength_um:1.2, flux_mjy_sr:0, flux_uncertainty:.03, detector:'D1', obs_time:'60800'},
  {wavelength_um:2.2, flux_mjy_sr:NaN, flux_uncertainty:.02, detector:'D2', obs_time:'60801'},
] } };
const brightness = assistant.reply('Cuánto brillo tiene la fuente', measured);
assert.match(brightness.text, /1 medición/);
assert.ok(brightness.sources.some(s => s.facts.some(f => f.includes('0.000 MJy/sr'))), 'Un brillo cero es un dato válido');
assert.ok(brightness.sources.every(s => s.facts.every(f => !f.includes('NaN'))));
assert.equal(assistant.reply('Cuánto brillo tiene la fuente', {...measured, spectrum:null}).sources.some(s => s.kind === 'Medición de esta consulta'), false);
assert.ok(assistant.reply('No entiendo esta pregunta', field).followUps.length > 0);
console.log('Respuestas integradas: fuentes, instantáneas, carga y fotometría verificadas.');

// Continuidad, aclaraciones y sugerencias dependen de la conversación y sus datos.
const remembered = assistant.reply('Qué es un dipolo', selected);
const verification = assistant.reply('¿Y cómo lo compruebo?', selected, remembered.memory);
assert.equal(verification.intent, 'types');
assert.match(verification.text, /Buscá un par comparable/);
assert.notEqual(verification.text, remembered.text);
assert.ok(verification.actions.some(a => a.id === 'detector'));
const explanation = assistant.reply('¿Y eso qué significa?', selected, remembered.memory);
assert.equal(explanation.intent, 'types');
assert.match(explanation.text, /signos de la resta/);
const freshField = assistant.reply('¿Y cómo lo compruebo?', {...selected, conversationKey:'another-field'}, remembered.memory);
assert.equal(freshField.intent, 'clarify', 'No arrastrar un tema de otro campo');
const freshAccount = assistant.reply('¿Y eso qué significa?', {...selected, profile:{id:'otra-cuenta'}}, remembered.memory);
assert.equal(freshAccount.intent, 'clarify', 'No arrastrar un tema de otra cuenta');
const ambiguous = assistant.reply('¿Por qué cambia?', selected, remembered.memory);
assert.equal(ambiguous.intent, 'clarify');
assert.deepEqual(Array.from(ambiguous.choices, c => c.label), ['Entre bandas','Entre fechas']);
assert.equal(assistant.reply('entre bandas', selected, ambiguous.memory).intent, 'images');
assert.equal(assistant.reply('entre fechas', selected, ambiguous.memory).intent, 'compare');
assert.equal(assistant.reply('¿Por qué cambia el brillo?', selected).intent, 'clarify');
assert.ok(!assistant.suggestionsFor(available).some(q => /seleccionado/.test(q)), 'No sugerir un candidato inexistente');
assert.ok(assistant.suggestionsFor(selected).some(q => /seleccionado/.test(q)));
assert.ok(!assistant.suggestionsFor(base).some(q => /seleccionado/.test(q)));
assert.ok(!assistant.suggestionsFor({...selected,loading:true}).some(q => /seleccionado/.test(q)));
assert.ok(!assistant.suggestionsFor(base,'spectrum').some(q => /Cuánto brillo/.test(q)), 'No sugerir una medición pendiente');
assert.ok(assistant.suggestionsFor(measured,'spectrum').some(q => /Cuánto brillo/.test(q)));
assert.ok(assistant.reply('Qué significa el espectro', selected).actions.some(a => a.id==='spectrum'));
assert.ok(assistant.reply('Cómo empiezo', {target:null}).actions.some(a => a.id==='explorer'));
assert.ok(candidateAnswer.summary.length < candidateAnswer.text.length && candidateAnswer.detail.includes(candidateAnswer.text));
const nextConfiguration = assistant.reply('¿Y cómo lo aplico?', base, assistant.reply('Configurá la app',base).memory);
assert.ok(nextConfiguration.proposal);
assert.equal(nextConfiguration.proposal.settings.fps,1);
console.log('Conversación: continuidad, aclaraciones, reinicios, sugerencias y acciones verificadas.');
assert.ok(!assistant.reply('¿Y cómo lo compruebo?', selected, assistant.reply('candidato', selected).memory).followUps.some(q => /cómo lo compruebo/.test(q)),
  'No volver a sugerir la pregunta recién respondida');
assert.ok(assistant.suggestionsFor({...selected, selectedDetectionId:null}).some(q => /resultados/.test(q)),
  'Si hay candidatos sin selección, ofrecer ver los resultados');

// La guía y el modelo son accesibles incluso sin campo o durante una carga.
for (const prompt of ['¿Qué es una enana marrón?', 'Explicame las enanas marrones', 'Explorar en 3D']) {
  assert.equal(assistant.classify(prompt), 'brownDwarf');
  for (const ctx of [{}, {...base, loading:true}, selected]) {
    const response = assistant.reply(prompt, ctx);
    assert.ok(response.actions.some(action => action.id === 'learn3d'));
    assert.ok(response.sources.some(source => source.url?.includes('what-makes-brown-dwarfs-unique')));
    assert.equal(response.sources.some(source => source.kind === 'Datos de esta consulta'), false);
    assert.equal(response.proposal, undefined);
    assert.match(response.text, /educativ[oa]/);
  }
}
assert.equal(assistant.classify('¿El candidato es una enana marrón?'), 'candidate', 'La guía no clasifica una detección');
assert.match(assistant.reply('¿Qué es una enana marrón?', technical).text, /secuencia principal/);
assert.doesNotMatch(assistant.reply('¿Qué es una enana marrón?', base).text, /secuencia principal/);
const dwarf = assistant.reply('¿Qué es una enana marrón?', base);
assert.match(assistant.reply('¿Y cómo lo compruebo?', base, dwarf.memory).text, /observaciones/);
assert.ok(assistant.TOPICS.includes('¿Qué es una enana marrón?'));
assert.equal(assistant.learningLink('/static/learn-3d/index.html?explanation=technical', 'http://localhost:8000/#asistente'),
  'http://localhost:8000/static/learn-3d/index.html?explanation=technical');
for (const href of [null, '', 'javascript:alert(1)', 'https://example.org/model', '//example.org/model', 'file:///model']) {
  assert.equal(assistant.learningLink(href, 'http://localhost:8000/'), null);
}
console.log('Asistente → 3D: guía general, estilos, fuentes, continuidad y ruta local revisable: OK.');

for (const prompt of ['¿Qué es una estrella joven con disco?', 'Explicame el disco de polvo', 'Contame sobre RW Aurigae']) {
  assert.equal(assistant.classify(prompt),'youngStar');
  for (const ctx of [{}, {...base,loading:true}, selected]) {
    const response=assistant.reply(prompt,ctx);
    assert.ok(response.actions.some(action=>action.id==='learn3d' && action.object==='young-star'));
    assert.ok(response.sources.some(source=>source.url?.includes('planetary-system')));
    assert.equal(response.sources.some(source=>source.kind==='Datos de esta consulta'),false);
    assert.equal(response.proposal,undefined);
    assert.match(response.text,/ilustrativ|ilustración/);
  }
}
assert.equal(assistant.classify('¿El candidato es una estrella joven?'),'candidate');
assert.match(assistant.reply('¿Qué es una estrella joven?',technical).text,/transferencia radiativa/);
assert.doesNotMatch(assistant.reply('¿Qué es una estrella joven?',base).text,/transferencia radiativa/);
const starAnswer=assistant.reply('¿Qué es una estrella joven?',base);
assert.match(assistant.reply('¿Y cómo lo compruebo?',base,starAnswer.memory).text,/incliná el disco/);
assert.equal(new URL(assistant.learningLink('/model?explanation=technical','https://example.test/','young-star')).searchParams.get('object'),'young-star');
assert.equal(new URL(assistant.learningLink('/model?object=young-star','https://example.test/','brown-dwarf')).searchParams.get('object'),'brown-dwarf');
console.log('Estrella joven: guía sin datos, contexto, estilos, continuidad y selección del modelo: OK.');

(async () => {
  const provider = assistant.createLocalProvider();
  const local = await provider.respond({message:'Qué es SPHEREx', context:{}, conversation:{}, signal:new AbortController().signal});
  assert.equal(local.intent,'mission');
  const canceled = new AbortController();canceled.abort();
  await assert.rejects(provider.respond({message:'hola', context:{}, conversation:{}, signal:canceled.signal}), {name:'AbortError'});

  // A minimal DOM model verifies real async component methods, not WebGL or layout.
  class Node {
    constructor() {this.children=[];this.dataset={};this.textContent='';this.value='';this.attributes={};this.isConnected=true;}
    append(...children) {for (const child of children) {this.children.push(child);child.parent=this;}}
    replaceChildren(...children) {this.children=[];this.append(...children);}
    setAttribute(name,value) {this.attributes[name]=String(value);}
    remove() {if (this.parent) this.parent.children=this.parent.children.filter(child=>child!==this);}
    contains(node) {return this.children.includes(node) || this.children.some(child=>child.contains(node));}
    querySelectorAll() {return [];}
    get firstElementChild() {return this.children[0];}
  }
  let Definition;
  class Element {
    constructor() {this.ownerDocument={baseURI:'https://example.test/tool',createElement(){return new Node();}};}
    attachShadow() {return this.shadowRoot={querySelectorAll(){return [];}};}
  }
  Object.assign(context, {HTMLElement:Element,document:{currentScript:{src:'https://example.test/modules/assistant/assistant.js'}},
    customElements:{get(){},define(name,value){Definition=value;}},
    setTimeout:(callback,ms)=>setTimeout(callback,Math.min(ms,5)),clearTimeout});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'assistant.js'),'utf8'),context);
  const support=context.PapastronomyAssistantSupport;
  assert.ok(support.validPatch({maxFrames:24,fps:1.2,showFlags:false,showAIMarkers:true}));
  assert.ok(support.validPatch({maxFrames:24,fps:3.5,showFlags:false,showAIMarkers:true}));
  assert.equal(support.validPatch({maxFrames:103,fps:2,showFlags:false,showAIMarkers:true}),false);
  assert.equal(support.validPatch({maxFrames:33,fps:2,showFlags:false,showAIMarkers:true},true),false);
  const untrusted=support.normalizeResponse({summary:'<img src=x>',sources:[{url:'javascript:alert(1)',title:'x',facts:['text']}],
    actions:[{id:'deleteEverything',label:'x'}],proposal:{settings:{maxFrames:10000,fps:99,showFlags:true,showAIMarkers:true}}});
  assert.equal(untrusted.summary,'<img src=x>');
  assert.equal(untrusted.sources[0].url,null);
  assert.equal(untrusted.actions.length,0);
  assert.equal(untrusted.proposal,undefined);
  assert.throws(()=>support.normalizeResponse({}),/vacía/);

  let current={profile:{id:'principiante',alias:'<script>text</script>'},revision:1,answerKey:'a',conversationKey:'field-a',target:null};
  const component=new Definition();
  const nodes=new Map();
  component.$=selector=>{if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector);};
  component.options={getContext:()=>current};
  component.provider=provider;
  component.reset();
  assert.ok(component.history[0].content.includes('<script>text</script>'),'El alias se conserva como texto');
  await component.send('Qué es SPHEREx');
  assert.ok(component.history.some(message=>message.content.includes('SPHEREx')));
  assert.equal(component.pending,null);
  assert.equal(component.conversation.topic,'mission');

  let resolvePending, receivedSignal;
  component.provider={label:'Proveedor de prueba',respond({signal}){receivedSignal=signal;return new Promise(resolve=>{resolvePending=resolve;});}};
  const waiting=component.send('explicá mi campo');
  assert.ok(component.pending);
  current={...current,revision:2,answerKey:'b'};
  component.refresh();
  assert.equal(component.pending,null);
  assert.equal(receivedSignal.aborted,true);
  resolvePending({summary:'RESPUESTA OBSOLETA'});await waiting;
  assert.equal(component.history.some(message=>message.content.includes('RESPUESTA OBSOLETA')),false);

  // Even if the host forgot refresh(), late responses are checked against current state.
  const late=component.send('otra consulta');
  current={...current,answerKey:'selected-new-pixel'};
  resolvePending({summary:'SELECCION ANTERIOR'});await late;
  assert.equal(component.history.some(message=>message.content.includes('SELECCION ANTERIOR')),false);

  const accountWait=component.send('cuenta anterior');
  current={...current,profile:{id:'avanzado',alias:'Otra cuenta'}};
  component.refresh();
  resolvePending({summary:'CUENTA ANTERIOR'});await accountWait;
  assert.equal(component.history.length,1);
  assert.ok(component.history[0].content.includes('Otra cuenta'));
  assert.equal(component.conversation.topic,undefined);

  // A response only prepares a proposal; an explicit, current submission invokes the host.
  let applied=0,appliedPatch;
  component.options.applySettings=async patch=>{applied++;appliedPatch=patch;};
  const proposalForm=new Node(),proposalStatus=new Node(),proposalSubmit=new Node();
  proposalForm.reportValidity=()=>true;
  proposalForm.querySelector=selector=>selector.includes('button') ? proposalSubmit : proposalStatus;
  proposalForm.elements=[new Node(),new Node(),new Node(),new Node()];
  for (const [index,key,value] of [[0,'maxFrames','24'],[1,'fps','1.2'],[2,'showFlags','true'],[3,'showAIMarkers','false']]) {
    proposalForm.elements[key]=proposalForm.elements[index];proposalForm.elements[index].value=value;
  }
  component.forms.set(proposalForm,{stamp:support.contextStamp(current),revision:current.revision});
  current={...current,answerKey:'new-selection-before-apply'};
  await component.applyProposal(proposalForm);assert.equal(applied,0,'Una propuesta anterior nunca se aplica');
  component.forms.set(proposalForm,{stamp:support.contextStamp(current),revision:current.revision});
  await component.applyProposal(proposalForm);
  assert.equal(applied,1);assert.equal(appliedPatch.fps,1.2);
  assert.equal(appliedPatch.maxFrames,24);assert.equal(appliedPatch.showFlags,true);assert.equal(appliedPatch.showAIMarkers,false);
  assert.ok(proposalForm.elements.every(control=>control.disabled));
  assert.equal(component.forms.has(proposalForm),false);

  component.provider={respond:async()=>{throw new Error('Servicio temporalmente fuera de línea');}};
  await component.send('hola');
  assert.match(component.$('.status').textContent,/fuera de línea/);
  assert.equal(component.pending,null);

  component.provider={respond({signal}){receivedSignal=signal;return new Promise(resolve=>{resolvePending=resolve;});}};
  const disconnected=component.send('última consulta');
  let abortedEvents=0;component.events={abort(){abortedEvents++;}};
  component.disconnectedCallback();
  assert.equal(abortedEvents,1);assert.equal(receivedSignal.aborted,true);assert.equal(component.pending,null);
  resolvePending({summary:'RESPUESTA DESPUES DE DESMONTAR'});await disconnected;
  assert.equal(component.history.some(message=>message.content.includes('DESPUES DE DESMONTAR')),false);
  console.log('Chat portable: proveedor intercambiable, texto seguro, errores, contexto/cuenta obsoletos y liberación: OK.');
})().catch(error=>{console.error(error);process.exitCode=1;});
