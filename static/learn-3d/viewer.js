/* Visor educativo WebGL autónomo. No usa librerías, red, perfiles ni APIs científicas. */
(() => {
  'use strict';
  const assetBase = new URL('.', document.currentScript.src);
  const vertex = `attribute vec2 position;
    varying vec2 screen;
    void main() { screen = position; gl_Position = vec4(position, 0.0, 1.0); }`;
  const fragment = `#ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec2 screen;
    uniform float aspect, zoom, yaw, pitch, phase, infrared, objectKind, diskVisible;
    float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
    float noise(vec3 p) {
      vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
        mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
        mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
    }
    float cloud(vec3 p) { return .55*noise(p)+.28*noise(p*2.0)+.17*noise(p*4.0); }
    vec3 toLocal(vec3 n) {
      vec3 q = vec3(n.x,cos(pitch)*n.y-sin(pitch)*n.z,sin(pitch)*n.y+cos(pitch)*n.z);
      return vec3(cos(yaw)*q.x+sin(yaw)*q.z,q.y,-sin(yaw)*q.x+cos(yaw)*q.z);
    }
    vec4 over(vec4 front, vec4 back) {
      return vec4(front.rgb+back.rgb*(1.0-front.a),front.a+back.a*(1.0-front.a));
    }
    vec4 youngStar(vec2 p) {
      // Rayo ortográfico: esfera central + intersección con un disco plano
      // en coordenadas locales. La profundidad decide qué queda delante.
      float radius=.30;
      float distance=length(p);
      float starDepth=100.0;
      vec4 star=vec4(0.0);
      if (distance < radius) {
        float z=sqrt(radius*radius-dot(p,p));
        starDepth=3.0-z;
        vec3 normal=vec3(p,z)/radius;
        float grain=cloud(toLocal(normal)*12.0+vec3(phase*.04));
        vec3 light=mix(vec3(1.0,.43,.12),vec3(1.0,.91,.62),normal.z);
        light*=.86+.14*grain;
        star=vec4(light,1.0);
      }
      vec4 disk=vec4(0.0);
      vec3 origin=toLocal(vec3(p,3.0));
      vec3 direction=toLocal(vec3(0.0,0.0,-1.0));
      float diskDepth=100.0;
      if (diskVisible > .5 && abs(direction.y) > .01) {
        diskDepth=-origin.y/direction.y;
        vec3 position=origin+diskDepth*direction;
        float r=length(position.xz);
        if (diskDepth > 0.0 && r > .49 && r < 1.65) {
          float angle=atan(position.z,position.x)-phase*.12;
          float texture=cloud(vec3(cos(angle)*r*5.0,r*3.0,sin(angle)*r*5.0));
          float rings=.5+.5*sin(r*57.0+texture*4.0+sin(angle*3.0)*.8);
          float edge=smoothstep(.49,.61,r)*(1.0-smoothstep(1.40,1.65,r));
          float opacity=edge*(.40+.42*texture+.12*rings);
          vec3 visible=mix(vec3(.17,.085,.050),vec3(.73,.43,.20),.35+.55*texture);
          vec3 ir=mix(vec3(.26,.10,.40),vec3(.97,.35,.16),clamp(1.6-r,0.0,1.0));
          vec3 color=mix(visible,ir,infrared)*(.76+.24*rings);
          disk=vec4(color*opacity,opacity);
        }
      }
      vec4 body=diskDepth < starDepth ? over(disk,star) : over(star,disk);
      float halo=distance < .95 ? exp(-max(0.0,distance-radius)*10.0)*.25 : 0.0;
      vec3 haloColor=mix(vec3(.95,.44,.12),vec3(.96,.26,.35),infrared);
      return over(body,vec4(haloColor*halo,halo));
    }
    void main() {
      if (objectKind > .5) {
        gl_FragColor=youngStar(screen*vec2(aspect,1.0)/(.48*zoom));
        return;
      }
      // Intersección ortográfica de un rayo con una esfera de radio unitario.
      vec2 p = screen * vec2(aspect, 1.0) / (.67 * zoom);
      float r = length(p);
      if (r > 1.0) {
        // Fuera del halo, transparencia negra exacta. No dejar RGB de la
        // atmósfera en píxeles transparentes: algunos compositores lo filtran.
        if (r > 1.45) { gl_FragColor = vec4(0.0); return; }
        float halo = exp(-(r-1.0)*16.0)*.16;
        vec3 haloColor = mix(vec3(.75,.29,.12),vec3(.73,.31,.54),infrared);
        gl_FragColor = vec4(haloColor * halo, halo);
        return;
      }
      vec3 n = vec3(p,sqrt(max(0.0,1.0-dot(p,p))));
      vec3 q = vec3(n.x, cos(pitch)*n.y-sin(pitch)*n.z, sin(pitch)*n.y+cos(pitch)*n.z);
      q = vec3(cos(yaw)*q.x+sin(yaw)*q.z,q.y,-sin(yaw)*q.x+cos(yaw)*q.z);
      float turbulence = cloud(q*5.5+vec3(phase*.025,0,0));
      float bands = sin(q.y*37.0 + turbulence*7.0 + sin(q.x*6.0+q.z*4.0)*.7);
      float detail = cloud(q*22.0+vec3(phase*.05,0,0));
      float pattern = clamp(.43+.2*bands+.56*(turbulence-.5)+.21*(detail-.5),0.0,1.0);
      vec3 warm = mix(vec3(.16,.054,.036),vec3(.83,.49,.25),pattern);
      warm = mix(warm,vec3(.93,.72,.48),smoothstep(.63,.9,pattern)*.7);
      vec3 ir = mix(vec3(.16,.09,.35),vec3(.88,.25,.29),smoothstep(.1,.62,pattern));
      ir = mix(ir,vec3(1.0,.78,.40),smoothstep(.48,.85,pattern));
      float light = .32+.68*max(0.0,dot(n,normalize(vec3(-.55,.5,1.1))));
      float edge = pow(1.0-n.z,2.4);
      vec3 color = mix(warm,ir,infrared)*light + edge*vec3(.25,.11,.065);
      gl_FragColor = vec4(color,1.0);
    }`;

  function renderer(canvas) {
    // El shader entrega RGB premultiplicado por alfa, igual que el compositor.
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL no disponible');
    const shaders = [];
    let program, buffer;
    function destroy() {
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      shaders.forEach(shader => gl.deleteShader(shader));
    }
    try {
      program = gl.createProgram();
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, 'position');
      const uniforms = Object.fromEntries(['aspect','zoom','yaw','pitch','phase','infrared','objectKind','diskVisible'].map(k => [k,gl.getUniformLocation(program,k)]));
      return {
        draw(values) {
          const bounds = canvas.getBoundingClientRect();
          if (!bounds.width || !bounds.height) return;
          const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
          const w = Math.max(1,Math.round(bounds.width*dpr)), h = Math.max(1,Math.round(bounds.height*dpr));
          if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; }
          gl.viewport(0,0,w,h);
          gl.useProgram(program);
          gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
          gl.uniform1f(uniforms.aspect,w/h);
          for (const key of ['zoom','yaw','pitch','phase','infrared','objectKind','diskVisible']) gl.uniform1f(uniforms[key],values[key]);
          gl.drawArrays(gl.TRIANGLES,0,6);
        },
        destroy,
      };
    } catch (error) { destroy(); throw error; }
  }

  class ObjectViewer extends HTMLElement {
    static get observedAttributes() { return ['explanation','object']; }
    constructor() {
      super();
      this.attachShadow({mode:'open'});
      this.yaw=.4; this.pitch=-.12; this.zoom=1; this.phase=0; this.infrared=0;
      this.topicIndex=0; this.frame=0; this.inView=true; this.lost=false;
      this.objectKind=0;
      this.diskVisible=1; this.guided=false; this.guideSnapshot=null;
    }
    connectedCallback() {
      if (this.abort) return;
      this.content = window.Papastronomy3DContent;
      if (!this.content) { this.shadowRoot.textContent='Falta cargar content.js antes de viewer.js.'; return; }
      this.abort=new AbortController();
      const signal=this.abort.signal;
      this.motion=window.matchMedia('(prefers-reduced-motion: reduce)');
      this.playing=!this.motion.matches;
      // Plantilla estática; los textos educativos y valores del anfitrión usan textContent.
      this.shadowRoot.innerHTML=`
        <link rel="stylesheet">
        <div class="intro"><div><p class="eyebrow"></p><h1></h1><p class="subtitle"></p></div>
          <div class="pickers"><label class="style">Objeto educativo<select class="object-picker" aria-label="Objeto educativo"></select></label>
          <label class="style">Estilo de explicación<select class="explanation-picker" aria-label="Estilo de explicación"><option value="simple">Simple · para empezar</option><option value="technical">Técnica · más detalle</option></select></label></div></div>
        <div class="tour-bar"><div><span class="tour-mark" aria-hidden="true">✧</span><div><strong>Una pausa para descubrir</strong><p>Tres miradas al objeto, a tu ritmo.</p></div></div><button type="button" class="guide-start">Guiame <span aria-hidden="true">↗</span></button><button type="button" class="guide-exit" hidden>Salir del recorrido</button></div>
        <div class="layout"><div class="scene">
          <div class="orbit" aria-hidden="true"></div>
          <div class="scene-crosshair" aria-hidden="true"></div>
          <canvas class="viewport" tabindex="0" role="img" aria-describedby="help limits"></canvas>
          <div class="topline"><span class="tag"></span><span class="mode-name">VISIBLE</span></div>
          <div class="hotspots" role="group" aria-label="Puntos de interés educativos"></div>
          <div class="fallback" role="status" hidden>No se pudo iniciar el visor 3D. Necesita WebGL habilitado en el navegador. Podés seguir leyendo los tres temas.<br><button type="button" class="retry">Reintentar visor</button></div>
          <div class="scene-footer"><span class="scene-label">OBJETO EDUCATIVO / SIN ESCALA</span><span aria-hidden="true">↔ &nbsp; ↕</span></div>
          <p class="hint" id="help">Arrastrá para rotar · flechas con teclado · usá Zoom para acercarte</p>
        </div><section class="details" aria-label="Explicación del objeto">
          <div class="chapter-header"><p class="chapter">Una mirada más cerca</p><span class="step"></span></div><progress class="guide-progress" max="3" value="1" aria-label="Progreso del recorrido" hidden></progress><div class="topics" role="group" aria-label="Temas"></div>
          <div class="reading" aria-live="polite" aria-atomic="true"><h2></h2><p class="explanation"></p><p class="takeaway"></p></div>
          <div class="guide-task" hidden><span>Probá esto</span><p></p></div>
          <a class="source" target="_blank" rel="noopener noreferrer"></a>
          <div class="pager"><button type="button" class="previous" hidden>← Anterior</button><button type="button" class="next">Siguiente tema →</button></div>
        </section></div>
        <div class="controls"><div class="modes" role="group" aria-label="Representación artística"><button type="button" data-mode="0" aria-pressed="true">Visible · ilustración</button><button type="button" data-mode="1" aria-pressed="false">Infrarrojo · falso color</button></div>
          <div class="tools"><button class="play" type="button"></button><button class="reset" type="button">Restablecer vista</button><label class="zoom">Zoom<input type="range" min="0.75" max="1.35" step="0.01" value="1" aria-label="Zoom del objeto"><output>1.00×</output></label></div></div>
        <div class="disk-row" hidden><button class="disk-toggle" type="button" aria-pressed="true">Ocultar disco</button><p class="disk-note"></p></div>
        <p class="guide-status" role="status" aria-live="polite"></p>
        <p class="caption" role="status"></p><p class="limits" id="limits"></p>`;
      this.$=selector=>this.shadowRoot.querySelector(selector);
      this.$('link').href=new URL('viewer.css',assetBase).href;
      this.canvas=this.$('canvas');
      this.objects=window.Papastronomy3DObjects || {'brown-dwarf':this.content};
      for (const item of Object.values(this.objects)) {
        const option=document.createElement('option'); option.value=item.id; option.textContent=item.title;
        this.$('.object-picker').append(option);
      }
      this.$('.object-picker').addEventListener('change',event=>this.setAttribute('object',event.target.value),{signal});
      this.$('.explanation-picker').addEventListener('change',event=>this.setAttribute('explanation',event.target.value),{signal});
      this.shadowRoot.addEventListener('click',event=>{
        const button=event.target.closest('[data-topic]');
        if (button) this.selectTopic(this.content.topics.findIndex(topic=>topic.id===button.dataset.topic));
      },{signal});
      this.$('.next').addEventListener('click',()=>this.nextTopic(),{signal});
      this.$('.previous').addEventListener('click',()=>this.selectTopic(Math.max(0,this.topicIndex-1)),{signal});
      this.$('.guide-start').addEventListener('click',()=>this.startGuide(),{signal});
      this.$('.guide-exit').addEventListener('click',()=>this.stopGuide(),{signal});
      this.$('.disk-toggle').addEventListener('click',()=>this.setDiskVisible(!this.diskVisible),{signal});
      this.shadowRoot.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>this.setMode(Number(button.dataset.mode)),{signal}));
      this.$('.play').addEventListener('click',()=>this.setPlaying(!this.playing),{signal});
      this.$('.reset').addEventListener('click',()=>this.reset(),{signal});
      this.$('input').addEventListener('input',event=>this.setZoom(Number(event.target.value)),{signal});
      this.$('.retry').addEventListener('click',()=>this.startRenderer(),{signal});
      this.canvas.addEventListener('pointerdown',event=>{
        if (event.button !== 0 || this.drag) return;
        this.drag={id:event.pointerId,x:event.clientX,y:event.clientY};
        this.setPlaying(false); this.canvas.setPointerCapture(event.pointerId);
      },{signal});
      this.canvas.addEventListener('pointermove',event=>{
        if (!this.drag || this.drag.id !== event.pointerId) return;
        // El shader transforma de vista a superficie: invertir los deltas
        // hace que el punto agarrado acompañe al cursor en ambos ejes.
        this.yaw-=(event.clientX-this.drag.x)*.008;
        this.pitch=Math.max(-1.3,Math.min(1.3,this.pitch-(event.clientY-this.drag.y)*.008));
        this.drag.x=event.clientX; this.drag.y=event.clientY; this.draw();
      },{signal});
      for (const name of ['pointerup','pointercancel','lostpointercapture']) this.canvas.addEventListener(name,()=>{this.drag=null;},{signal});
      this.canvas.addEventListener('keydown',event=>{
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0',' '].includes(event.key)) return;
        event.preventDefault();
        if (event.key === ' ') { this.setPlaying(!this.playing); return; }
        if (event.key === '0') { this.reset(); return; }
        if (['+','=','-'].includes(event.key)) { this.setZoom(this.zoom+(event.key === '-' ? -.05 : .05)); return; }
        this.setPlaying(false);
        if (event.key === 'ArrowLeft') this.yaw+=.12;
        if (event.key === 'ArrowRight') this.yaw-=.12;
        if (event.key === 'ArrowUp') this.pitch=Math.min(1.3,this.pitch+.12);
        if (event.key === 'ArrowDown') this.pitch=Math.max(-1.3,this.pitch-.12);
        this.draw();
      },{signal});
      this.canvas.addEventListener('webglcontextlost',event=>{
        event.preventDefault(); this.lost=true; this.cancelFrame();
        this.$('.fallback').hidden=false;
      },{signal});
      this.canvas.addEventListener('webglcontextrestored',()=>this.startRenderer(),{signal});
      document.addEventListener('visibilitychange',()=>this.schedule(),{signal});
      this.motion.addEventListener('change',event=>{ if (event.matches) this.setPlaying(false); },{signal});
      this.resize=new ResizeObserver(()=>this.draw()); this.resize.observe(this.$('.scene'));
      this.intersection=new IntersectionObserver(entries=>{this.inView=entries[0].isIntersecting;this.schedule();});
      this.intersection.observe(this);
      this.selectObject(this.getAttribute('object')); this.startRenderer();
    }
    attributeChangedCallback(name) {
      if (!this.$ || !this.isConnected) return;
      if (name === 'object') this.selectObject(this.getAttribute('object'));
      else this.selectTopic(this.topicIndex,false);
    }
    selectObject(id) {
      if (this.guided) this.stopGuide();
      this.content=Object.hasOwn(this.objects,id) ? this.objects[id] : this.objects['brown-dwarf'];
      this.objectKind=this.content.id === 'young-star' ? 1 : 0;
      this.$('.object-picker').value=this.content.id;
      this.$('h1').textContent=this.content.title;
      this.$('.subtitle').textContent=this.content.subtitle;
      this.$('.eyebrow').textContent=`Aprendé en 3D / ${this.content.category || 'Objetos subestelares'}`;
      this.$('.tag').textContent=this.content.disclosure;
      this.$('.limits').textContent=this.content.limits;
      this.canvas.setAttribute('aria-label',`${this.content.title}, ilustración genérica en 3D. Flechas para rotar; más y menos para zoom; espacio para pausar; cero para restablecer.`);
      this.$('.orbit').hidden=this.objectKind === 1;
      this.$('.hint').textContent=this.objectKind === 1
        ? 'Arrastrá verticalmente para inclinar el disco · también podés usar las flechas'
        : 'Arrastrá para rotar · flechas con teclado · usá Zoom para acercarte';
      for (const container of ['.topics','.hotspots']) {
        this.$(container).replaceChildren();
        this.content.topics.forEach((topic,index)=>{
          const button=document.createElement('button'); button.type='button';button.dataset.topic=topic.id;
          if (container === '.hotspots') {
            button.className=`hotspot point-${index}`;
            const number=document.createElement('span');number.textContent=topic.number;
            button.append(number,document.createTextNode(topic.short));
          } else button.textContent=topic.short;
          this.$(container).append(button);
        });
      }
      this.$('.disk-row').hidden=this.objectKind !== 1;
      this.$('.guide-status').textContent='';
      this.reset();this.setDiskVisible(true);this.selectTopic(0);this.setMode(this.infrared);this.updateGuideUI();
    }
    selectTopic(index,prepareView=true) {
      if (!Number.isInteger(index) || !this.content.topics[index]) return;
      this.topicIndex=index;
      const topic=this.content.topics[index];
      const style=this.getAttribute('explanation') === 'technical' ? 'technical' : 'simple';
      this.$('.explanation-picker').value=style;
      this.$('h2').textContent=topic.title;
      this.$('.explanation').textContent=topic[style];
      this.$('.takeaway').textContent=topic.takeaway;
      this.$('.step').textContent=`${topic.number} / ${String(this.content.topics.length).padStart(2,'0')}`;
      const source=this.content.sources[topic.source];
      this.$('.source').textContent=`Leer la referencia · ${source.title} ↗`;
      this.$('.source').href=source.url;
      this.shadowRoot.querySelectorAll('[data-topic]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.topic === topic.id)));
      if (this.guided && prepareView) this.applyGuideStep();
      this.updateGuideUI();
    }
    setMode(value) {
      this.infrared=value === 1 ? 1 : 0;
      this.shadowRoot.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.mode) === this.infrared)));
      this.$('.caption').textContent=this.infrared
        ? 'Infrarrojo · paleta conceptual. Los colores no indican temperaturas ni flujos medidos.'
        : 'Visible · ilustración con brillo realzado. No reproduce lo que verían nuestros ojos.';
      this.$('.mode-name').textContent=this.infrared ? 'INFRARROJO / FALSO COLOR' : 'VISIBLE / ILUSTRACIÓN';
      this.draw();
    }
    setDiskVisible(value) {
      this.diskVisible=value ? 1 : 0;
      this.$('.disk-toggle').setAttribute('aria-pressed',String(Boolean(this.diskVisible)));
      this.$('.disk-toggle').textContent=this.diskVisible ? 'Ocultar disco' : 'Mostrar disco';
      this.$('.disk-note').textContent=this.diskVisible
        ? 'Estrella + disco · compará la ilustración con y sin polvo.'
        : 'Solo la estrella · ocultar el disco cambia el dibujo, no las propiedades de una fuente real.';
      this.draw();
    }
    nextTopic() {
      if (this.guided && this.topicIndex === this.content.topics.length-1) { this.stopGuide(true); return; }
      this.selectTopic((this.topicIndex+1)%this.content.topics.length);
    }
    startGuide() {
      if (this.guided) return;
      this.guideSnapshot={yaw:this.yaw,pitch:this.pitch,zoom:this.zoom,phase:this.phase,
        infrared:this.infrared,diskVisible:this.diskVisible,playing:this.playing,topicIndex:this.topicIndex};
      this.guided=true;
      this.$('.guide-status').textContent='Recorrido iniciado. Avanzá a tu ritmo; al salir recuperás tu vista anterior.';
      this.setPlaying(false);this.selectTopic(0);
    }
    applyGuideStep() {
      this.setPlaying(false);
      this.yaw=.4;
      this.pitch=this.objectKind === 1 ? (this.topicIndex === 2 ? .22 : .65) : -.12;
      this.setZoom(this.objectKind === 0 && this.topicIndex === 1 ? 1.15 : 1);
      this.setMode(this.topicIndex === (this.objectKind === 1 ? 1 : 2) ? 1 : 0);
      if (this.objectKind === 1) this.setDiskVisible(this.topicIndex !== 0);
      this.draw();
    }
    stopGuide(completed=false) {
      if (!this.guided) return;
      const saved=this.guideSnapshot;
      this.guided=false;this.guideSnapshot=null;
      this.yaw=saved.yaw;this.pitch=saved.pitch;this.phase=saved.phase;
      this.setZoom(saved.zoom);this.setMode(saved.infrared);this.setDiskVisible(saved.diskVisible);
      this.selectTopic(saved.topicIndex);
      this.setPlaying(saved.playing && !this.motion?.matches);
      this.$('.guide-status').textContent=completed
        ? 'Recorrido completo. Recuperaste tu vista; podés seguir explorando libremente.'
        : 'Recorrido finalizado. Recuperaste tu vista anterior.';
      this.updateGuideUI();
    }
    updateGuideUI() {
      this.$('.guide-start').hidden=this.guided;
      this.$('.guide-exit').hidden=!this.guided;
      this.$('.guide-progress').hidden=!this.guided;
      this.$('.guide-progress').max=this.content.topics.length;
      this.$('.guide-progress').value=this.topicIndex+1;
      this.$('.guide-task').hidden=!this.guided;
      this.$('.guide-task p').textContent=this.content.topics[this.topicIndex].activity || 'Explorá el objeto y revisá su explicación.';
      this.$('.previous').hidden=!this.guided;
      this.$('.previous').disabled=this.topicIndex === 0;
      this.$('.next').textContent=this.guided
        ? (this.topicIndex === this.content.topics.length-1 ? 'Terminar recorrido ✓' : 'Siguiente paso →')
        : 'Siguiente tema →';
    }
    setZoom(value) {
      this.zoom=Math.max(.75,Math.min(1.35,value));
      this.$('input').value=this.zoom; this.$('output').textContent=`${this.zoom.toFixed(2)}×`; this.draw();
    }
    reset() { this.yaw=.4;this.pitch=this.objectKind === 1 ? .65 : -.12;this.phase=0;this.setZoom(1); }
    setPlaying(value) {
      this.playing=Boolean(value);
      this.$('.play').textContent=this.playing ? 'Pausar animación' : 'Animar objeto';
      this.$('.play').setAttribute('aria-pressed',String(this.playing)); this.schedule();
    }
    startRenderer() {
      this.cancelFrame(); this.engine?.destroy(); this.engine=null;
      try { this.engine=renderer(this.canvas); this.lost=false; }
      catch (error) { console.warn('Aprendé en 3D:',error.message); }
      this.$('.fallback').hidden=Boolean(this.engine);
      for (const selector of ['.play','.reset','input']) this.$(selector).disabled=!this.engine;
      this.setPlaying(this.playing); this.draw();
    }
    draw() { if (this.engine && !this.lost) this.engine.draw(this); }
    cancelFrame() { cancelAnimationFrame(this.frame);this.frame=0;this.previousTime=null; }
    schedule() {
      this.cancelFrame();
      if (!this.isConnected || !this.engine || this.lost || !this.playing || !this.inView || document.hidden) return;
      const tick=time=>{
        const delta=this.previousTime === null ? 0 : Math.min((time-this.previousTime)/1000,.05);
        this.previousTime=time; this.phase+=delta; this.yaw+=delta*.09; this.draw();
        this.frame=requestAnimationFrame(tick);
      };
      this.frame=requestAnimationFrame(tick);
    }
    disconnectedCallback() {
      this.cancelFrame();this.abort?.abort();this.abort=null;this.drag=null;
      this.guided=false;this.guideSnapshot=null;
      this.resize?.disconnect();this.intersection?.disconnect();this.engine?.destroy();this.engine=null;
    }
  }
  if (!customElements.get('papastronomy-object-viewer')) customElements.define('papastronomy-object-viewer',ObjectViewer);
})();
