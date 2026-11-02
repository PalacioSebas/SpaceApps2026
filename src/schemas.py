"""
Esquemas Pydantic v2 para la Versión 2.0 (Datos Reales de IRSA + Cruce de Catálogos en Vivo).
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class TargetInfo(BaseModel):
    ra: float = Field(..., description="Ascensión Recta central en grados decimales (ICRS)")
    dec: float = Field(..., description="Declinación central en grados decimales (ICRS)")
    fov: float = Field(..., description="Campo de visión del recorte en grados")
    total_frames: int = Field(..., description="Cantidad total de épocas reales procesadas")
    matched_target_id: Optional[str] = None
    matched_target_name: Optional[str] = None
    matched_description: Optional[str] = None
    data_source: str = Field(..., description="IRSA_SPHEREX_TAP, IRSA_IBE_REAL_FITS o CACHE_REAL_FITS")
    tap_query_executed: str = Field(..., description="Consulta ADQL ejecutada contra IRSA TAP")


class EpochFrame(BaseModel):
    index: int
    obs_time: str
    detector: str
    wavelength_center_um: float
    cutout_url: str
    image_base64: str
    flags_base64: str
    clean_pixels_pct: float


class AIDetection(BaseModel):
    id: int
    type: str = Field(..., description="MOVING_DIPOLE o VARIABLE_MONOPOLE")
    x_pix: float
    y_pix: float
    neg_x_pix: Optional[float] = None
    neg_y_pix: Optional[float] = None
    ra: float
    dec: float
    snr_score: float
    shift_pixels: float
    proper_motion_arcsec_yr: float
    catalog_match: Optional[str] = Field(None, description="ID en Gaia DR3 o AllWISE si existe en catálogo")
    description: str


class ExploreResponse(BaseModel):
    target_info: TargetInfo
    epochs: List[EpochFrame]
    coadd_image_base64: str
    diff_image_base64: str
    ai_detections: List[AIDetection]


class SpectrumPoint(BaseModel):
    wavelength_um: float
    bandwidth_um: float
    flux_mjy_sr: float
    flux_uncertainty: float
    obs_time: str
    detector: str


class MoleculeBand(BaseModel):
    name: str
    label: str
    color: str
    border_color: str
    ranges_um: List[List[float]]


class SpectralDiagnosis(BaseModel):
    classification: str
    confidence: float
    effective_temp_k_est: int
    detected_molecules: List[str]
    summary: str


class SpectrumResponse(BaseModel):
    ra: float
    dec: float
    x_pix: float
    y_pix: float
    total_bands_sampled: int
    spectrum: List[SpectrumPoint]
    reference_molecules: List[MoleculeBand]
    ai_diagnosis: SpectralDiagnosis