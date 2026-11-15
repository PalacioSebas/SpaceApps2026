/* Contenido educativo portable. Sin lecturas del explorador ni datos de fuentes reales. */
(() => {
  const content = {
    id: 'brown-dwarf',
    title: 'Enana marrón',
    subtitle: 'Un mundo tenue. Otra forma de mirar.',
    category: 'Objetos subestelares',
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
  // Las traducciones conservan identificadores, orden y referencias científicas.
  const brownDwarfEn = {
    ...content,
    title: 'Brown dwarf',
    subtitle: 'A faint world. Another way to see.',
    category: 'Substellar objects',
    disclosure: 'Educational illustration · generic object',
    limits: 'The colors, clouds and speed are illustrative. This sphere does not reconstruct WISE 0855 or Epsilon Indi B and does not use measurements from the explorer.',
    topics: [
      {
        ...content.topics[0],
        title: 'An atmosphere with a story', short: 'Atmosphere',
        activity: 'Gently drag the sphere and follow a band. Its texture is illustrative: it helps you imagine a rotating atmosphere.',
        simple: 'The light we receive passes through an atmosphere. Its gases and clouds can change the brightness we see as the object rotates. The bands on the model help illustrate that idea; their shapes are artistic.',
        technical: 'Atmospheric opacity depends on wavelength: different bands can probe different depths. Atmospheric heterogeneity can produce rotational variability. The bands do not represent an observed map.',
        takeaway: 'A change in brightness can also come from the atmosphere.',
      },
      {
        ...content.topics[1],
        title: 'The heat that remains', short: 'Temperature',
        activity: 'Use Zoom to move closer and inspect the light and shadow. The brightness is enhanced: it cannot be used to measure temperature.',
        simple: 'A brown dwarf does not sustain hydrogen fusion like a star. It cools over time and emits energy. Brown dwarfs do not all have the same temperature: this illustration does not assign a temperature to a real object.',
        technical: 'These substellar objects do not sustain the stable hydrogen fusion characteristic of the main sequence. Their thermal evolution depends on factors including mass and age. Determining temperature requires analysis of observations and models.',
        takeaway: 'The color chosen here is not a thermometer.',
      },
      {
        ...content.topics[2],
        title: 'Seeing beyond visible light', short: 'Infrared',
        activity: 'Switch between Visible and Infrared and compare the palettes. The colors of the illustration change, not the properties of the object.',
        simple: 'Cold brown dwarfs are very faint in visible light. Infrared light lets us study them. Switch the representation to imagine how we assign colors to light our eyes cannot see.',
        technical: 'Emission from cold brown dwarfs is studied in the infrared. SPHEREx measures light in multiple spectral bands. This palette is conceptual: it does not apply filter response curves or generate a spectrum or calibrated image.',
        takeaway: 'To measure a source, return to its spectrum and observations.',
      },
    ],
    sources: {
      atmosphere: { ...content.sources.atmosphere, title: 'NASA · Anatomy of a Brown Dwarf’s Atmosphere' },
      brownDwarfs: { ...content.sources.brownDwarfs, title: 'NASA · What Makes Brown Dwarfs Unique?' },
      spherex: { ...content.sources.spherex, title: 'NASA · SPHEREx Mission' },
    },
  };
  const youngStarEn = {
    ...youngStar,
    title: 'Young star with a disk',
    subtitle: 'A star taking shape. An environment that changes.',
    category: 'Young stars',
    disclosure: 'Educational illustration · generic system',
    limits: 'The star, disk, colors and motion are illustrative and are not to scale. This is not a reconstruction of RW Aurigae or a diagnosis of its current changes; it does not use measurements from the explorer.',
    topics: [
      {
        ...youngStar.topics[0],
        title: 'The star and its surroundings', short: 'Star',
        activity: 'Start with the star without its disk. Then select Show disk to discover the system’s surroundings.',
        simple: 'A young star can be surrounded by material left over from its formation. In this scene we see the central star and a disk of gas and dust. The light and size are enhanced to help explore the idea.',
        technical: 'Circumstellar disks are part of the environment of many young stars. This illustration shows a star and an inclined disk, without fitting mass, age, size or geometry to an observed source.',
        takeaway: 'The illustrated system is generic, not a map of RW Aurigae.',
      },
      {
        ...youngStar.topics[1],
        title: 'Dust emits light too', short: 'Disk',
        activity: 'Compare the scene with and without the disk. The infrared palette highlights it artistically; it does not compare measured fluxes.',
        simple: 'Dust can absorb light from the star and emit energy again in the infrared. Studying different wavelengths therefore helps us investigate its surroundings. The infrared palette highlights the disk artistically.',
        technical: 'Thermal emission from dust can contribute to an infrared excess relative to the stellar photosphere. The model’s palette does not calculate radiative transfer or temperature, and does not reproduce the response of SPHEREx filters.',
        takeaway: 'A palette helps explain; a spectrum makes measurement possible.',
      },
      {
        ...youngStar.topics[2],
        title: 'Why can brightness change?', short: 'Variability',
        activity: 'Drag vertically to view the disk at different inclinations. This illustration does not simulate a measured dimming event or establish its cause.',
        simple: 'Material around a star can block some of its light along our line of sight. RW Aur A is an example of a young star with studied dimming events. The model does not determine what caused a particular change.',
        technical: 'Dimming events and circumstellar material have been investigated in RW Aur A. Variable extinction is one possibility that requires comparison with observations. An isolated brightness difference or this illustration cannot establish a physical cause.',
        takeaway: 'To interpret a change, check observation dates, bands and data quality.',
      },
    ],
    sources: {
      disks: { ...youngStar.sources.disks, title: 'NASA · Hubble’s Album of Planet-Forming Disks' },
      systems: { ...youngStar.sources.systems, title: 'NASA · Planetary Systems' },
      rwAur: { ...youngStar.sources.rwAur, title: 'NASA · Investigating RW Aur A’s Dimming Events' },
    },
  };
  // Evita que el anfitrión o una instancia alteren el contenido de las demás.
  function freeze(value) {
    Object.values(value).forEach(item => { if (item && typeof item === 'object') freeze(item); });
    return Object.freeze(value);
  }
  window.Papastronomy3DContent = freeze(content);
  window.Papastronomy3DObjects = freeze({ 'brown-dwarf': content, 'young-star': youngStar });
  window.Papastronomy3DLocales = freeze({
    es: window.Papastronomy3DObjects,
    en: { 'brown-dwarf': brownDwarfEn, 'young-star': youngStarEn },
  });
})();
