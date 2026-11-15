/* Contenido educativo portable. Sin lecturas del explorador ni datos de fuentes reales. */
(() => {
  const content = {
    id: 'brown-dwarf',
    title: 'Enana marrón',
    subtitle: 'Un mundo tenue. Otra forma de mirar.',
    disclosure: 'Ilustración educativa · objeto genérico',
    limits: 'Los colores, las nubes y la velocidad son ilustrativos. Esta esfera no reconstruye WISE 0855 ni Epsilon Indi B y no utiliza mediciones del explorador.',
    topics: [
      {
        id: 'atmosphere', number: '01', title: 'Una atmósfera con historia', short: 'Atmósfera',
        simple: 'La luz que recibimos atraviesa una atmósfera. Sus gases y nubes pueden cambiar el brillo que vemos al girar el objeto. Las franjas del modelo ayudan a imaginar esa idea; su forma es artística.',
        technical: 'La opacidad atmosférica depende de la longitud de onda: diferentes bandas pueden sondear distintas profundidades. La heterogeneidad de la atmósfera puede producir variabilidad rotacional. Las franjas no representan un mapa observado.',
        takeaway: 'Un cambio de brillo también puede venir de la atmósfera.',
        source: 'atmosphere',
      },
      {
        id: 'temperature', number: '02', title: 'El calor que queda', short: 'Temperatura',
        simple: 'Una enana marrón no sostiene la fusión de hidrógeno como una estrella. Se enfría con el tiempo y emite energía. No todas tienen la misma temperatura: esta ilustración no asigna una temperatura a un objeto real.',
        technical: 'Estos objetos subestelares no mantienen la fusión estable de hidrógeno característica de la secuencia principal. Su evolución térmica depende, entre otros factores, de la masa y la edad. La temperatura requiere un análisis de observaciones y modelos.',
        takeaway: 'El color elegido aquí no es un termómetro.',
        source: 'brownDwarfs',
      },
      {
        id: 'infrared', number: '03', title: 'Ver más allá del visible', short: 'Infrarrojo',
        simple: 'Las enanas marrones frías son muy tenues en luz visible. El infrarrojo permite estudiarlas. Cambiá la representación para imaginar cómo asignamos colores a luz que nuestros ojos no ven.',
        technical: 'La emisión de las enanas marrones frías se estudia en el infrarrojo. SPHEREx mide luz en múltiples bandas espectrales. Esta paleta es conceptual: no aplica curvas de respuesta de filtros ni genera un espectro o una imagen calibrada.',
        takeaway: 'Para medir una fuente, volvé a su espectro y sus observaciones.',
        source: 'spherex',
      },
    ],
    sources: {
      atmosphere: { title: 'NASA · Anatomy of Brown Dwarf’s Atmosphere', url: 'https://science.nasa.gov/resource/anatomy-of-brown-dwarfs-atmosphere/' },
      brownDwarfs: { title: 'NASA · What Makes Brown Dwarfs Unique?', url: 'https://science.nasa.gov/mission/webb/science-overview/science-explainers/what-makes-brown-dwarfs-unique/' },
      spherex: { title: 'NASA · Misión SPHEREx', url: 'https://science.nasa.gov/mission/spherex/' },
    },
    reviewedOn: '2026-11-14',
  };
  // Evita que el anfitrión o una instancia alteren el contenido de las demás.
  function freeze(value) {
    Object.values(value).forEach(item => { if (item && typeof item === 'object') freeze(item); });
    return Object.freeze(value);
  }
  window.Papastronomy3DContent = freeze(content);
})();
