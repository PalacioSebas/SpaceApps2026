/* Adaptador opcional de esta página; el componente no depende de él. */
(() => {
  const params = new URLSearchParams(location.search);
  const viewer = document.querySelector('papastronomy-object-viewer');
  viewer.setAttribute('object', params.get('object') === 'young-star' ? 'young-star' : 'brown-dwarf');
  viewer.setAttribute('explanation', params.get('explanation') === 'technical' ? 'technical' : 'simple');
  viewer.shadowRoot.querySelector('.object-picker').addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('object', viewer.getAttribute('object'));
    history.replaceState(null, '', url);
  });
  if (params.get('from') === 'explorer') {
    document.getElementById('return-link').hidden = false;
    document.getElementById('return-hint').hidden = false;
  }
})();
