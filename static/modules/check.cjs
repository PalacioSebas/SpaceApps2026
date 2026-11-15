// Contrato del compositor portable. No simula el navegador ni el pipeline científico.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Node {
  constructor(dataset = {}) { this.dataset = dataset; this.handlers = {}; this.hidden = false; this.attributes = {}; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  addEventListener(name, callback) { (this.handlers[name] ||= []).push(callback); }
  emit(name, detail) { for (const callback of this.handlers[name] || []) callback({detail, currentTarget:this, preventDefault() {}}); }
}
let profile = {
  id:'principiante', alias:'Ada', level:'principiante', interest:'aprender',
  explanations:'simple', overrides:{fps:6}, lastRegion:null,
};
let entered = false;
const remembered = [];
function makeShadow() {
  const access = new Node();
  Object.defineProperty(access, 'session', {get() { return {entered, profile, persistent:true}; }});
  access.ready = async () => { entered=true; };
  access.remember = patch => remembered.push({...patch});
  const assistant = new Node();
  assistant.configure = options => { assistant.options=options; };
  assistant.refresh = () => { assistant.refreshes=(assistant.refreshes || 0)+1; };
  const sections = ['explorer','assistant'].map(section => new Node({section}));
  const nodes = new Map([
    ['link',new Node()], ['papastronomy-access',access], ['papastronomy-assistant',assistant],
    ['.chat',new Node()], ['.learn',new Node()],
  ]);
  return {innerHTML:'', querySelector(selector) {
    assert.ok(nodes.has(selector), `El compositor pidió un selector inesperado: ${selector}`);
    return nodes.get(selector);
  }, querySelectorAll(selector) {
    assert.equal(selector,'[data-section]');
    return sections;
  }, nodes, sections};
}
class Element extends Node {
  attachShadow() { return this.shadowRoot=makeShadow(); }
}
let Workspace;
let fetches = 0;
const location = new URL('https://example.test/science/index.html?ra=123');
const environment = vm.createContext({
  HTMLElement:Element, URL, AbortController, location,
  document:{currentScript:{src:'https://example.test/portable/workspace.js'},
    getElementById() { throw new Error('Los módulos no deben consultar IDs del explorador'); },
    querySelector() { throw new Error('Los módulos no deben consultar el DOM del explorador'); },
  },
  customElements:{get() {}, define(name, definition) { assert.equal(name,'papastronomy-workspace');Workspace=definition; }},
  fetch() { fetches++;throw new Error('El compositor no debe iniciar solicitudes científicas'); },
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'access/model.js'),'utf8'),environment,{filename:'access/model.js'});
vm.runInContext(fs.readFileSync(path.join(__dirname,'workspace.js'),'utf8'),environment,{filename:'workspace.js'});
environment.window=environment;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../integrations/explorer-modules.js'),'utf8'),environment,{filename:'explorer-modules.js'});

function checkExplorerHost() {
  const createHost=environment.PapastronomyIntegration.createHost;
  const initialState=() => ({
    ra:123,dec:-4,fov:.1,frameLimit:20,fps:2,showFlags:false,showAIMarkers:true,
    invertPixels:true,stretchLinearity:0,contrastGain:1,
    showGaiaCat:true,showWiseCat:true,showPmVectors:true,showNamedObjects:false,showTemporalTrail:true,
    contextSurvey:'spherex',spectrumPlotMode:'timeline',viewMode:'blink',temporalSearch:true,
    exploreSequence:2,moduleDataSequence:1,spectrumSequence:4,isLoading:false,
    exploreData:{target_info:{ra:123,dec:-4,fov:.1,analysis_frame_indices:[0,5],difference_available:false},epochs:[{index:0,detector:'D1'}]},
    allAiDetections:[{id:7,type:'MOVING_DIPOLE'}],selectedDetectionId:7,selectedPixel:{x:3,y:4},
    moduleSpectrum:{exploreSequence:1,sequence:4,data:{spectrum:[{flux_mjy_sr:12}] }},
  });
  function makeHost(query='?ra=123&dec=-4&fov=0.1&invert=1&timeline=1&temporal=1&lang=en') {
    const state=initialState();
    const nodes=new Map();
    const getNode=id => {
      if (!nodes.has(id)) {
        const control=new Node();
        control.value=id === 'input-fov' ? '0.1' : '';
        control.focus=()=>{control.focused=true;};
        control.scrollIntoView=()=>{control.scrolled=true;};
        if (id === 'select-fps') {
          control.options=[1,2,4,6].map(value=>({value:String(value)}));
          control.append=option=>control.options.push(option);
        }
        nodes.set(id,control);
      }
      return nodes.get(id);
    };
    const doc={getElementById:getNode,createElement() {return new Node();}};
    const calls=[];
    const operations=Object.fromEntries(['startBlinkTimer','renderCanvas','renderContext','resizePlot','setViewMode','rebake','renderPlot']
      .map(name=>[name,(...args)=>calls.push({name,args})]));
    operations.explore=operations.fetchSpectrum=()=>{throw new Error('Un cambio de módulo no debe descargar datos');};
    const access={session:{profile:{explanations:'tecnica'}}};
    const host=createHost({state,document:doc,location:new URL('https://example.test/tool/'+query),operations,access});
    return {host,state,nodes,getNode,calls,access};
  }
  const current=makeHost();
  let result=current.host.getContext();
  assert.equal(result.target,null,'Un campo de una exploración anterior no llega al asistente');
  assert.equal(result.detections.length,0);
  assert.equal(result.selectedDetectionId,null);
  assert.equal(result.spectrum,null);
  current.state.moduleDataSequence=2;
  result=current.host.getContext();
  assert.equal(result.target,current.state.exploreData.target_info);
  assert.equal(result.analysisFrames.length,1,'Índices de análisis inexistentes se descartan');
  assert.equal(result.detections[0].id,7);
  assert.equal(result.spectrum,null,'Una medición de otro campo se oculta');
  current.state.moduleSpectrum.exploreSequence=2;
  result=current.host.getContext();
  assert.equal(result.spectrum,current.state.moduleSpectrum.data);
  const answerKey=result.answerKey;
  current.state.spectrumSequence++;
  assert.equal(current.host.getContext().spectrum,null,'Pedir nueva fotometría invalida la anterior');
  assert.notEqual(current.host.getContext().answerKey,answerKey);
  current.state.isLoading=true;
  result=current.host.getContext();
  assert.equal(result.target,null);
  assert.equal(result.spectrum,null);
  current.state.isLoading=false;

  const patch={maxFrames:12,fps:3.5,showFlags:true,showAIMarkers:false};
  const beforeSettings=current.host.getContext().revision;
  current.state.frameLimit=22;
  assert.throws(()=>current.host.applySettings(patch,beforeSettings),/contexto cambió/);
  for (const invalid of [
    {...patch,maxFrames:0},{...patch,maxFrames:103},{...patch,maxFrames:1.5},
    {...patch,fps:3},{...patch,showFlags:1},{...patch,showAIMarkers:'false'},null,
  ]) assert.throws(()=>current.host.applySettings(invalid,current.host.getContext().revision),/Revisá/);
  assert.throws(()=>current.host.applySettings({...patch,maxFrames:33},current.host.getContext().revision),/Revisá/);
  current.host.applySettings(patch,current.host.getContext().revision);
  assert.equal(current.state.frameLimit,12);
  assert.equal(current.state.fps,3.5,'La velocidad fraccionaria de la línea histórica es válida');
  assert.equal(current.getNode('input-max-frames').value,'12');
  assert.equal(current.getNode('select-fps').value,'3.5');
  assert.ok(current.getNode('select-fps').options.some(option=>option.value === '3.5'));
  assert.equal(current.getNode('chk-flags').checked,true);

  const profile={id:'avanzado',alias:'A',level:'avanzado',explanations:'tecnica',interest:'analisis',
    overrides:{fps:3.5,showFlags:false,viewMode:'diff'},lastRegion:{ra:200,dec:10,temporal:false}};
  current.host.applyProfile(profile,'initial');
  assert.equal(current.state.ra,123,'Los parámetros explícitos de URL tienen prioridad sobre la región del perfil');
  assert.equal(current.state.dec,-4);
  assert.equal(current.state.temporalSearch,true);
  assert.equal(current.state.fov,.1);
  assert.equal(current.getNode('input-fov').value,'0.1');
  assert.equal(current.state.invertPixels,true);
  assert.equal(current.state.spectrumPlotMode,'timeline');
  assert.equal(current.state.fps,3.5);
  assert.equal(current.state.showFlags,false,'Las preferencias manuales prevalecen sobre el nivel');
  current.state.fps=1.2;
  current.state.viewMode='rgb';
  current.host.applyProfile({...profile,alias:'Solo cambié mi alias'},'profile');
  assert.equal(current.state.fps,1.2,'Editar alias no restaura una velocidad antigua');
  assert.equal(current.state.viewMode,'rgb','Editar alias conserva el modo científico actual');
  current.host.activate();
  current.host.applyProfile(profile,'reset');
  assert.equal(current.state.fov,.1,'Cambiar un perfil no reinterpreta la geometría de datos cargados');
  assert.equal(current.getNode('input-fov').value,'0.05','FoV del perfil queda pendiente para la próxima exploración');
  assert.equal(current.calls.filter(call=>call.name === 'setViewMode').at(-1).args[0],'blink','No activa una resta no disponible');

  const remembered=makeHost('');
  remembered.state.exploreData=null;
  remembered.state.moduleDataSequence=0;
  remembered.host.applyProfile({...profile,overrides:{fps:1.2,fov:.2,spectrumPlotMode:'lightcurve'}},'initial');
  assert.equal(remembered.state.ra,200);
  assert.equal(remembered.state.dec,10);
  assert.equal(remembered.state.temporalSearch,false);
  assert.equal(remembered.state.fov,.2,'Sin imágenes cargadas, la geometría inicial puede tomar el perfil');
  assert.equal(remembered.state.fps,1.2);
  assert.equal(remembered.state.spectrumPlotMode,'timeline','Migra la preferencia antigua lightcurve');
  const count=current.calls.length;
  current.host.onNavigate('assistant');
  assert.equal(current.getNode('explorer-root').hidden,true);
  assert.equal(current.calls.length,count,'Abrir chat no vuelve a procesar ni cargar el campo');
  current.host.onNavigate('spectrum');
  assert.equal(current.getNode('explorer-root').hidden,false);
  assert.equal(current.getNode('spectrum-panel-title').focused,true);
  assert.equal(current.getNode('spectrum-panel-title').scrolled,true);
  assert.ok(current.calls.every(call=>!['explore','fetchSpectrum'].includes(call.name)));
  const link=new URL(current.host.getLearning3DUrl());
  assert.equal(link.origin,'https://example.test');
  assert.equal(link.pathname,'/static/learn-3d/index.html');
  assert.equal(link.searchParams.get('from'),'explorer');
  assert.equal(link.searchParams.get('explanation'),'technical');
  assert.equal(link.searchParams.get('lang'),'en');
  current.access.session.profile=null;
  assert.equal(new URL(current.host.getLearning3DUrl()).searchParams.get('explanation'),'simple');
  console.log('Adaptador: datos vigentes, URL, geometría pendiente, propuestas y preferencias manuales: OK.');
}

(async () => {
  const base = {revision:'field-1', conversationKey:'field-scope', answerKey:'selection-1', loading:false,
    settings:{maxFrames:20,fps:2,showFlags:false,showAIMarkers:true}, target:null};
  const applies = [], profiles = [], navigations = [];
  let learning = '/portable/learn-3d/index.html?object=young-star&lang=es';
  const host = {
    getContext:() => ({...base}),
    applySettings:(patch,revision) => applies.push({patch,revision}),
    applyProfile:(value,reason) => profiles.push({value,reason}),
    onNavigate:target => navigations.push(target),
    getLearning3DUrl:() => learning,
  };
  const workspace = new Workspace();
  workspace.configure(host);
  workspace.connectedCallback();
  const {assistant,access} = workspace;
  assert.equal(workspace.shadowRoot.nodes.get('link').href,'https://example.test/portable/workspace.css');
  assert.equal(typeof assistant.options.getContext,'function');
  assert.equal(typeof assistant.options.applySettings,'function');
  assert.equal(typeof assistant.options.onNavigate,'function');
  access.emit('sessionchange',{profile,reason:'enter'});
  assert.equal(profiles.length,0,'El arranque espera a ready() antes de aplicar un perfil');
  await workspace.ready();
  assert.equal(profiles.length,1);
  assert.equal(profiles[0].reason,'initial');
  assert.equal(profiles[0].value,profile);
  assert.equal(workspace.started,true);

  let context = workspace.getContext();
  assert.equal(context.profile.alias,'Ada');
  assert.equal(context.profile.levelLabel,'Principiante');
  assert.equal(context.defaults.fps,1);
  assert.equal(context.manualOverrides.fps,6,'Los ajustes manuales llegan separados y tienen prioridad para el motor');
  assert.equal(context.settings.fps,2,'El compositor conserva el estado real informado por el anfitrión');
  const initialRevision=context.revision;
  const initialScope=context.conversationKey;
  profile={...profile,alias:'Ada editada',explanations:'tecnica'};
  assert.notEqual(workspace.getContext().revision,initialRevision);
  assert.notEqual(workspace.getContext().answerKey,context.answerKey);
  profile={...profile,id:'avanzado',level:'avanzado'};
  assert.notEqual(workspace.getContext().conversationKey,initialScope,'Cambiar de cuenta cambia el ámbito de conversación');
  profile=null;
  context=workspace.getContext();
  assert.equal(context.profile,null);
  assert.equal(context.manualOverrides,base.settings,'El invitado conserva sus controles actuales');
  assert.ok(context.conversationKey.includes('guest'));
  assert.equal(context.defaults.fps,2);
  assert.equal(applies.length,0,'Consultar contexto y navegar no aplica ajustes');

  const patch={maxFrames:12,fps:4,showFlags:true,showAIMarkers:false};
  const proposalRevision=workspace.getContext().revision;
  base.revision='field-2';
  assert.throws(() => workspace.applySettings(patch,proposalRevision),/contexto cambió/);
  assert.equal(applies.length,0);
  assert.equal(remembered.length,0);
  base.loading=true;
  assert.throws(() => workspace.applySettings(patch,workspace.getContext().revision),/contexto cambió/);
  base.loading=false;
  workspace.applySettings(patch,workspace.getContext().revision);
  assert.equal(applies.length,1);
  assert.equal(applies[0].patch,patch);
  assert.equal(applies[0].revision,base.revision,'Solo el adaptador del anfitrión recibe su revisión interna');
  assert.deepEqual(remembered,[patch]);
  const apply=host.applySettings;
  delete host.applySettings;
  assert.throws(() => workspace.applySettings(patch,workspace.getContext().revision),/no permite/);
  host.applySettings=apply;

  workspace.showSection('assistant');
  assert.equal(workspace.section,'assistant');
  assert.equal(workspace.shadowRoot.nodes.get('.chat').hidden,false);
  assert.equal(navigations.at(-1),'assistant');
  assert.equal(workspace.shadowRoot.sections[1].attributes['aria-pressed'],'true');
  assistant.options.onNavigate('spectrum');
  assert.equal(workspace.section,'explorer');
  assert.equal(workspace.shadowRoot.nodes.get('.chat').hidden,true);
  assert.equal(navigations.at(-1),'spectrum');
  assert.equal(applies.length,1);
  assert.equal(fetches,0,'Abrir chat o volver al explorador no descarga observaciones');
  profile={id:'explorador',alias:'Una cuenta nueva',level:'explorador',explanations:'equilibrada',overrides:{}};
  access.emit('sessionchange',{profile,reason:'enter'});
  assert.equal(profiles.at(-1).value,profile);
  assert.equal(profiles.at(-1).reason,'enter');

  assert.equal(workspace.learningUrl(),'https://example.test/portable/learn-3d/index.html?object=young-star&lang=es');
  for (learning of ['https://other.example/3d','javascript:alert(1)','data:text/html,hello','ftp://example.test/data',null]) {
    assert.equal(workspace.learningUrl(),null);
    workspace.refresh();
    assert.equal(workspace.shadowRoot.nodes.get('.learn').hidden,true);
  }
  learning='https://example.test/models/index.html?lang=en';
  workspace.refresh();
  assert.equal(workspace.shadowRoot.nodes.get('.learn').hidden,false);
  assert.equal(assistant.options.getLearning3DUrl(),learning);
  assert.equal(workspace.shadowRoot.nodes.get('.learn').href,learning);

  const embedded = new Workspace();
  embedded.setAttribute('embedded','');
  embedded.connectedCallback();
  assert.equal(embedded.access.hasAttribute('embedded'),true);
  const signal=workspace.controller.signal;
  workspace.disconnectedCallback();
  assert.equal(signal.aborted,true);
  assert.equal(workspace.started,false);
  workspace.disconnectedCallback();
  embedded.disconnectedCallback();
  console.log('Módulos: composición portable, ámbitos de cuenta, revisiones, navegación y enlaces seguros: OK.');
  checkExplorerHost();
  await checkInitialAccessGate();
})().catch(error => { console.error(error);process.exitCode=1; });

async function checkInitialAccessGate() {
  let initialize, rejectAccess, starts=0, fetches=0;
  const stopped=new Error('Fin deliberado de la prueba de acceso');
  const gate=new Promise((resolve,reject)=>{rejectAccess=reject;});
  const bootstrap={URLSearchParams,console,
    window:{location:{search:''},PapastronomyIntegration:{start() {starts++;return gate;}}},
    document:{addEventListener(name,callback) {if (name === 'DOMContentLoaded') initialize=callback;},getElementById() {return {};}},
    ResizeObserver:class {observe() {}},
    fetch() {fetches++;throw new Error('No deben consultarse datos antes del acceso');},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),bootstrap);
  const initialization=initialize();
  assert.equal(starts,1,'El explorador espera el acceso portable');
  assert.equal(fetches,0,'No se consultan objetivos ni FITS mientras el acceso está pendiente');
  rejectAccess(stopped);
  await assert.rejects(initialization,error=>error === stopped);
  assert.equal(fetches,0);
  console.log('Arranque: la primera consulta espera la elección de acceso/invitado: OK.');
}
