export type QuestionId = "coords" | "brown-dwarf" | "wavelength" | "fits";

export type Telemetry = { label: string; tone: "cyan" | "violet" };

export type Comparison = {
  name: string;
  example: string;
  temperature: string;
  mass: string;
  massScale: number;
};

export type FitsKey = { key: string; value: string; note: string };

export type Answer = {
  id: QuestionId;
  question: string;
  short: string;
  usesContext: boolean;
  summary: string;
  telemetry: Telemetry[];
  comparison?: Comparison[];
  fits?: FitsKey[];
  verdict?: { label: string; text: string };
  followUps: { label: string; target: QuestionId }[];
};

export const answers: Answer[] = [
  {
    id: "coords",
    question: "¿Qué estoy viendo en estas coordenadas?",
    short: "¿Qué estoy viendo?",
    usesContext: true,
    summary:
      "Estás mirando el candidato S-02, una fuente puntual tenue en el recorte activo. Su flujo crece con fuerza hacia 4.4 µm y casi desaparece por debajo de 1.5 µm, con una depresión cerca de 3.3 µm compatible con absorción de metano. Entre Epoch 1 y Epoch 3 su centroide se desplaza 0.12″, algo esperable en un objeto cercano con movimiento propio.",
    telemetry: [
      { label: "RA 180.0042°", tone: "cyan" },
      { label: "Dec +00.0018°", tone: "cyan" },
      { label: "λ 4.40 µm", tone: "violet" },
      { label: 'ΔEpoch +0.12"', tone: "violet" },
      { label: "S/N 14.2", tone: "cyan" },
    ],
    verdict: {
      label: "Interpretación más probable",
      text: "Enana marrón fría (tipo T tardío). Una galaxia con alto corrimiento al rojo es la alternativa principal; Epoch 4 permitiría confirmar el movimiento.",
    },
    followUps: [
      { label: "¿Qué es una enana marrón?", target: "brown-dwarf" },
      { label: "¿Por qué brilla en 4.4 µm?", target: "wavelength" },
    ],
  },
  {
    id: "brown-dwarf",
    question: "¿Qué es una enana marrón y cómo se detecta?",
    short: "¿Qué es una enana marrón?",
    usesContext: false,
    summary:
      "Una enana marrón es un objeto que se formó como una estrella, pero no reunió suficiente masa para fusionar hidrógeno de forma estable. Queda a mitad de camino entre los planetas gigantes y las estrellas más pequeñas: brilla por el calor que le quedó de su formación y se enfría lentamente durante miles de millones de años. Como emite casi toda su luz en el infrarrojo, misiones como SPHEREx son ideales para encontrarlas.",
    telemetry: [
      { label: "13 – 80 M♃", tone: "violet" },
      { label: "T 250 – 2,500 K", tone: "violet" },
      { label: "pico 1 – 5 µm", tone: "cyan" },
    ],
    comparison: [
      { name: "Estrella", example: "El Sol", temperature: "5,770 K", mass: "1,047 M♃", massScale: 1 },
      { name: "Enana marrón", example: "Candidato S-02", temperature: "~650 K", mass: "13 – 80 M♃", massScale: 0.42 },
      { name: "Planeta", example: "Júpiter", temperature: "~125 K", mass: "1 M♃", massScale: 0.08 },
    ],
    followUps: [
      { label: "¿Qué estoy viendo acá?", target: "coords" },
      { label: "¿Por qué brilla en 4.4 µm?", target: "wavelength" },
    ],
  },
  {
    id: "wavelength",
    question: "¿Por qué esta fuente brilla en 4.4 µm pero no en 1.1 µm?",
    short: "¿Por qué 4.4 µm y no 1.1 µm?",
    usesContext: true,
    summary:
      "Por dos razones que se suman. Primero, la temperatura: un objeto a ~650 K emite con máxima intensidad cerca de 4.5 µm (ley de Wien), así que casi no produce luz en 1.1 µm. Segundo, la atmósfera: el metano y el vapor de agua absorben gran parte del infrarrojo cercano, mientras que la región de 4 – 5 µm funciona como una ventana por donde escapa el calor interno.",
    telemetry: [
      { label: "λ 4.40 µm · alto", tone: "violet" },
      { label: "λ 1.10 µm · débil", tone: "cyan" },
      { label: "T_eff ≈ 650 K", tone: "violet" },
      { label: "λ_max ≈ 4.46 µm", tone: "cyan" },
    ],
    verdict: {
      label: "Qué descartar",
      text: "Extinción por polvo: enrojecería la fuente, pero no explica la depresión de metano en 3.3 µm.",
    },
    followUps: [
      { label: "¿Qué es una enana marrón?", target: "brown-dwarf" },
      { label: "Explicame el header FITS", target: "fits" },
    ],
  },
  {
    id: "fits",
    question: "Explicame el header FITS de esta observación",
    short: "Explicame el header FITS",
    usesContext: true,
    summary:
      "El header FITS es la ficha técnica de la imagen: dice dónde apunta el telescopio, qué escala tiene cada píxel, cuándo se tomó y en qué unidades está el brillo. Estas son las claves que uso para ubicar el candidato S-02 en el cielo:",
    telemetry: [
      { label: "WCS · TAN", tone: "cyan" },
      { label: "6.2″ / px", tone: "cyan" },
      { label: "Epoch 3 / 4", tone: "violet" },
    ],
    fits: [
      { key: "CTYPE1", value: "'RA---TAN'", note: "Proyección gnómica del cielo sobre el plano" },
      { key: "CRVAL1", value: "180.0042", note: "Ascensión recta del píxel de referencia (°)" },
      { key: "CRVAL2", value: "0.0018", note: "Declinación del píxel de referencia (°)" },
      { key: "CDELT2", value: "0.001722", note: "Tamaño del píxel: 6.2 segundos de arco" },
      { key: "WAVELEN", value: "4.40", note: "Longitud de onda central del canal (µm)" },
      { key: "BUNIT", value: "'MJy/sr'", note: "Unidades de brillo superficial" },
    ],
    followUps: [
      { label: "¿Qué estoy viendo acá?", target: "coords" },
      { label: "¿Por qué brilla en 4.4 µm?", target: "wavelength" },
    ],
  },
];

export const answerById = Object.fromEntries(answers.map((a) => [a.id, a])) as Record<QuestionId, Answer>;
