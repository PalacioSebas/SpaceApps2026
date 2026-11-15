// Illustrative spectral curve across SPHEREx's 102 channels (0.75–5.00 µm).
// The shape is synthetic and only meant to demonstrate the interface.

export const LAMBDA_MIN = 0.75;
export const LAMBDA_MAX = 5.0;
export const CHANNELS = 102;

const ABSORPTION = [
  { center: 1.4, width: 0.09, depth: 0.28 },
  { center: 1.9, width: 0.1, depth: 0.22 },
  { center: 2.3, width: 0.08, depth: 0.12 },
  { center: 3.3, width: 0.14, depth: 0.32 },
  { center: 4.6, width: 0.12, depth: 0.18 },
];

export function spectralFlux(lambda: number, variant = 0) {
  const peak = 1.6 + variant * 0.35;
  const continuum = Math.exp(-((Math.log(lambda / peak)) ** 2) / 0.55);
  const dips = ABSORPTION.reduce(
    (acc, band) => acc * (1 - band.depth * Math.exp(-((lambda - band.center) ** 2) / (2 * band.width ** 2))),
    1,
  );
  const ripple = 0.015 * Math.sin(lambda * 23 + variant * 2);
  return Math.max(0, continuum * dips + ripple);
}

export function spectrumPoints(variant = 0) {
  return Array.from({ length: CHANNELS }, (_, i) => {
    const lambda = LAMBDA_MIN + ((LAMBDA_MAX - LAMBDA_MIN) * i) / (CHANNELS - 1);
    return { lambda, flux: spectralFlux(lambda, variant) };
  });
}

export function spectrumPath(width: number, height: number, variant = 0, pad = 4) {
  const points = spectrumPoints(variant);
  const max = Math.max(...points.map((p) => p.flux));
  return points
    .map((p, i) => {
      const x = pad + ((width - pad * 2) * (p.lambda - LAMBDA_MIN)) / (LAMBDA_MAX - LAMBDA_MIN);
      const y = height - pad - ((height - pad * 2) * p.flux) / max;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
