// Integridad de las vistas: ejecutar con Node, sin npm ni imágenes externas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class Canvas {
  constructor() { this.width = 128; this.height = 128; this.data = null; }
  getContext() {
    const canvas = this;
    return {
      createImageData: (w, h) => ({data: new Uint8ClampedArray(w*h*4)}),
      putImageData: (image) => { canvas.data = image.data; },
      drawImage: (image) => { canvas.data = image.data.slice(); },
      getImageData: () => ({data: canvas.data}),
    };
  }
}
const context = vm.createContext({
  document: {addEventListener() {}, createElement: () => new Canvas()}, console,
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8'), context);
function check(code) { return vm.runInContext(code, context); }
check(`
  state.contrastGain = 1; state.stretchLinearity = 0; state.invertPixels = false;
  const imageA = {data: new Uint8ClampedArray(128*128*4)};
  const imageB = {data: new Uint8ClampedArray(128*128*4)};
  for (let i=0; i<128*128; i++) {
    const v = i % 256;
    imageA.data.set([v,v,v,i%11 === 0 ? 0 : 255],i*4);
    imageB.data.set([240,240,240,i%7 === 0 ? 0 : 255],i*4);
    if (i%11 === 0) imageA.data.fill(0,i*4,i*4+4);
  }
  const originalA = imageA.data.slice();
  const visuals = createTileVisualCanvases(imageB,[imageA,imageB]);
`);
assert.equal(check('visuals.epochCanvases[0].data.every((v,i)=>v===originalA[i])'), true,
  'La exposición se conserva exactamente, sin rellenar huecos con la mediana');
check(`state.tileGrid.set('1,0',{status:'ready',visualGrids:{mid:new Float32Array(128*128).fill(1),epochs:[]}});
const rebaked = renderTileCanvasesFromGrids(0,0,visuals.visualGrids);`);
assert.equal(check('rebaked.epochCanvases[0].data.every((v,i)=>v===originalA[i])'), true,
  'Un sector vecino no altera los píxeles de una exposición');
check(`state.invertPixels = true; const inverted = renderTileCanvasesFromGrids(0,0,visuals.visualGrids);`);
assert.equal(check('inverted.epochCanvases[0].data.every((v,i)=> i%4===3 ? v===originalA[i] : v===(originalA[i-i%4+3] ? 255-originalA[i] : 0))'), true,
  'La inversión conserva la cobertura');
check(`state.invertPixels = false; state.originVisualGrids=visuals.visualGrids;
state.exploreData={epochs:[{wavelength_center_um:1,obs_time:'2025-01-01'}, {wavelength_center_um:4,obs_time:'2025-01-02'}]};`);
assert.equal(check('buildThreeBandRgbCanvas()'), null, 'Sin banda verde no se inventa un canal RGB');
check(`const manual = computeManualEpochPairCanvas(0,1,'diff');`);
assert.equal(check('manual.data.every((v,i)=>i%4!==3 || v===(Number.isFinite(visuals.visualGrids.epochs[0][Math.floor(i/4)]) && Number.isFinite(visuals.visualGrids.epochs[1][Math.floor(i/4)]) ? 255:0))'), true,
  'La comparación manual conserva la intersección de cobertura');
check(`const fixed = computeShiftAndStackCanvas(0,0);`);
assert.equal(check('fixed.data[3]'), 0, 'El apilado no rellena un punto ausente en todos los recortes');
check(`state.originVisualGrids={mid:new Float32Array(128*128).fill(.5),epochs:[new Float32Array(128*128).fill(.5),new Float32Array(128*128).fill(.5)]};
const shifted=computeShiftAndStackCanvas(1000000,0);`);
assert.equal(check('shifted.data[3]'), 255, 'El último recorte sigue cubriendo el borde');
assert.equal(check('shifted.data[0]'), 128, 'El apilado no añade ganancia artificial de brillo');
check(`state.ra=133.795129; state.dec=-7.245147; state.fov=.05;
state.skyView.zoom=1; state.skyView.panX=0; state.skyView.panY=0;
const pos=raDecToPixel(133.8,-7.24);
const back=pixelToRaDec(pos.x,pos.y);
const screen=fitsToSkyCanvas(pos.x,pos.y,384);
const inverse=skyCanvasToFITS(screen.cx,screen.cy,384);`);
assert.ok(check('Math.abs(back.ra-133.8)<1e-9 && Math.abs(back.dec+7.24)<1e-9'));
assert.ok(check('Math.abs(inverse.xPix-pos.x)<1e-9 && Math.abs(inverse.yPix-pos.y)<1e-9'));
assert.ok(check('screen.cx<192 && screen.cy<192'), 'Norte arriba y ascensión recta creciente a la izquierda');
check(`state.skyView.namedObjects=[];
mergeNamedObjects([{id:'catalog-star',ra:133.8,dec:-7.24}]);
mergeCatalogSources('gaiaSources',[{id:'gaia-star',ra:133.8,dec:-7.24}]);`);
assert.equal(check('state.skyView.namedObjects[0].ra'), 133.8, 'El catálogo conserva su RA');
assert.ok(check('Math.abs(state.skyView.namedObjects[0].x-pos.x)<1e-9 && Math.abs(state.skyView.gaiaSources[0].y-pos.y)<1e-9'),
  'Las marcas conservan la proyección astrométrica aunque exista un pico cercano');
console.log('Imágenes: píxeles, cobertura, inversión, RGB incompleto, A/B, apilado y coordenadas correctos.');
check(`const drawCalls=[]; const drawing={drawImage(...args){drawCalls.push(args);}};
drawSeamlessTileImage(drawing,{naturalWidth:384,naturalHeight:384},{fullCutout:true,x:0,y:0,w:384,h:384});
drawSeamlessTileImage(drawing,{naturalWidth:384,naturalHeight:384},{fullCutout:false,x:0,y:0,w:288,h:288});`);
assert.equal(check('drawCalls[0][3]'),384,'Un relevamiento externo utiliza todo su campo, sin recortar una esquina');
assert.equal(check('drawCalls[1][1]'),48,'El margen del mosaico se escala a la resolución de la imagen');
assert.equal(check('drawCalls[1][3]'),288,'El sector central conserva el mismo FoV en imágenes de distinta resolución');
check(`state.originVisualGrids.epochs[1].fill(NaN);
const uncovered = computeShiftAndStackCanvas(-1000000,0);`);
assert.equal(check('uncovered.data[3]'),0,'Fuera del borde no se extienden los píxeles del primer recorte');
console.log('Relevamientos externos: campo completo y márgenes correctos; apilado sin extensión de bordes.');
assert.equal(check('getAutoEpochIndices([{valid_pixels_pct:80},{valid_pixels_pct:0},{valid_pixels_pct:50}]).join(",")'),'0,2',
  'El flipbook automático omite recortes sin datos y mantiene los otros');
assert.equal(check('getAutoEpochIndices([{valid_pixels_pct:0}]).join(",")'),'0',
  'Un campo vacío sigue siendo accesible y puede informar su estado');
