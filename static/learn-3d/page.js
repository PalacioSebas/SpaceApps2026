/* Adaptador opcional de esta página; el componente no depende de él. */
(() => {
  const params = new URLSearchParams(location.search);
  const viewer = document.querySelector('papastronomy-object-viewer');
  viewer.setAttribute('explanation', params.get('explanation') === 'technical' ? 'technical' : 'simple');
  if (params.get('from') === 'explorer') {
    document.getElementById('return-link').hidden = false;
    document.getElementById('return-hint').hidden = false;
  }
})();
