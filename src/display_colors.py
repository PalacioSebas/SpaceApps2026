"""Paletas de visualización con NumPy, sin cargar el motor gráfico Matplotlib."""

import numpy as np


# Azul → blanco → rojo, a partir de los once puntos de la escala RdBu (ColorBrewer).
_DIVERGING_ANCHORS = np.array([
    [5, 48, 97], [33, 102, 172], [67, 147, 195], [146, 197, 222],
    [209, 229, 240], [247, 247, 247], [253, 219, 199], [244, 165, 130],
    [214, 96, 77], [178, 24, 43], [103, 0, 31],
], dtype=float) / 255
_SAMPLES = np.linspace(0, 1, 256)
_GRAY = (255 * _SAMPLES).astype(np.uint8)
_DIVERGING = (255 * np.column_stack([
    np.interp(_SAMPLES, np.linspace(0, 1, len(_DIVERGING_ANCHORS)), channel)
    for channel in _DIVERGING_ANCHORS.T
])).astype(np.uint8)


def colorize(normalized, divergent=False):
    """Devuelve RGBA, con transparencia para píxeles no finitos."""
    valid = np.isfinite(normalized)
    indices = np.minimum((np.where(valid, normalized, 0).clip(0, 1) * 256).astype(int), 255)
    rgba = np.zeros((*indices.shape, 4), dtype=np.uint8)
    if divergent:
        rgba[..., :3] = _DIVERGING[indices]
    else:
        rgba[..., :3] = _GRAY[indices, None]
    rgba[..., 3] = valid * 255
    rgba[~valid] = 0
    return rgba
