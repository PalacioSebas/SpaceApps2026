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
        activity: 'Arrastrá suavemente la esfera y seguí una franja. Su textura es ilustrativa: sirve para imaginar una atmósfera que gira.',
        simple: 'La luz que recibimos atraviesa una atmósfera. Sus gases y nubes pueden cambiar el brillo que vemos al girar el objeto. Las franjas del modelo ayudan a imaginar esa idea; su forma es artística.',
        technical: 'La opacidad atmosférica depende de la longitud de onda: diferentes bandas pueden sondear distintas profundidades. La heterogeneidad de la atmósfera puede producir variabilidad rotacional. Las franjas no representan un mapa observado.',
        takeaway: 'Un cambio de brillo también puede venir de la atmósfera.',
        source: 'atmosphere',
      },
      {
        id: 'temperature', number: '02', title: 'El calor que queda', short: 'Temperatura',
        activity: 'Acercate con Zoom y revisá el relieve de luz y sombra. Ese brillo está realzado: no permite medir temperatura.',
        simple: 'Una enana marrón no sostiene la fusión de hidrógeno como una estrella. Se enfría con el tiempo y emite energía. No todas tienen la misma temperatura: esta ilustración no asigna una temperatura a un objeto real.',
        technical: 'Estos objetos subestelares no mantienen la fusión estable de hidrógeno característica de la secuencia principal. Su evolución térmica depende, entre otros factores, de la masa y la edad. La temperatura requiere un análisis de observaciones y modelos.',
        takeaway: 'El color elegido aquí no es un termómetro.',
        source: 'brownDwarfs',
      },
      {
        id: 'infrared', number: '03', title: 'Ver más allá del visible', short: 'Infrarrojo',
        activity: 'Alterná Visible e Infrarrojo y compará las paletas. Cambian los colores del dibujo, no las propiedades del objeto.',
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
  const youngStar = {
    id: 'young-star',
    title: 'Estrella joven con disco',
    subtitle: 'Una estrella en formación. Un entorno que cambia.',
    category: 'Estrellas jóvenes',
    disclosure: 'Ilustración educativa · sistema genérico',
    limits: 'La estrella, el disco, sus colores y movimientos son ilustrativos y no están a escala. No es una reconstrucción de RW Aurigae ni un diagnóstico de sus cambios actuales; no utiliza mediciones del explorador.',
    topics: [
      {
        id: 'star', number: '01', title: 'La estrella y su entorno', short: 'Estrella',
        activity: 'Empezá por la estrella sin el disco. Después pulsá Mostrar disco para descubrir el entorno del sistema.',
        simple: 'Una estrella joven puede estar rodeada de material que quedó de su formación. En esta escena vemos la estrella central y un disco de gas y polvo. La luz y el tamaño están realzados para poder explorar la idea.',
        technical: 'Los discos circumestelares son parte del entorno de muchas estrellas jóvenes. Este esquema muestra una estrella y un disco inclinado, sin ajustar masa, edad, tamaño o geometría a una fuente observada.',
        takeaway: 'El sistema del dibujo es genérico, no un mapa de RW Aurigae.', source: 'disks',
      },
      {
        id: 'disk', number: '02', title: 'El polvo también emite luz', short: 'Disco',
        activity: 'Compará la escena con y sin disco. La paleta infrarroja lo resalta de forma artística; no compara flujos medidos.',
        simple: 'El polvo puede absorber luz de la estrella y volver a emitir energía en infrarrojo. Por eso estudiar distintas longitudes de onda ayuda a investigar su entorno. La paleta infrarroja resalta el disco de forma artística.',
        technical: 'La emisión térmica del polvo puede contribuir al exceso infrarrojo respecto de la fotosfera estelar. La paleta del modelo no calcula transferencia radiativa ni temperatura; tampoco reproduce la respuesta de filtros de SPHEREx.',
        takeaway: 'Una paleta ayuda a explicar; el espectro permite medir.', source: 'systems',
      },
      {
        id: 'variability', number: '03', title: '¿Por qué puede cambiar el brillo?', short: 'Variabilidad',
        activity: 'Arrastrá verticalmente para ver el disco con distintas inclinaciones. Este esquema no simula un oscurecimiento medido ni demuestra su causa.',
        simple: 'El material alrededor de una estrella puede tapar parte de su luz según nuestra línea de visión. RW Aur A es un ejemplo de estrella joven con oscurecimientos estudiados. El modelo no determina qué causó una variación concreta.',
        technical: 'En RW Aur A se han investigado oscurecimientos y material circumestelar. La extinción variable es una posibilidad que requiere contrastar observaciones. Una diferencia de brillo aislada o esta ilustración no establece una causa física.',
        takeaway: 'Para interpretar un cambio, revisá fechas, bandas y calidad de las observaciones.', source: 'rwAur',
      },
    ],
    sources: {
      disks: { title: 'NASA · Hubble’s Album of Planet-Forming Disks', url: 'https://science.nasa.gov/missions/hubble/hubbles-album-of-planet-forming-disks/' },
      systems: { title: 'NASA · Planetary Systems', url: 'https://science.nasa.gov/universe/stars/planetary-system/' },
      rwAur: { title: 'NASA · Estudio de los oscurecimientos de RW Aur A', url: 'https://www.nasa.gov/universe/chandra-may-have-first-evidence-of-a-young-star-devouring-a-planet/' },
    },
    reviewedOn: '2026-11-14',
  };
  // Evita que el anfitrión o una instancia alteren el contenido de las demás.
  function freeze(value) {
    Object.values(value).forEach(item => { if (item && typeof item === 'object') freeze(item); });
    return Object.freeze(value);
  }
  window.Papastronomy3DContent = freeze(content);
  window.Papastronomy3DObjects = freeze({ 'brown-dwarf': content, 'young-star': youngStar });
})();
