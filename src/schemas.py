"""
Esquemas Pydantic v2 para la Versión 2.0 (Datos Reales de IRSA + Cruce de Catálogos en Vivo).
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class PhotometricCalibration(BaseModel):
    frame_index: int
    is_reference: bool
    scale: float
    offset: float
    reference_sources: int
    relative_scatter: float


class DifferenceQuality(BaseModel):
    status: str = "insufficient_epochs"
    target_fwhm_arcsec: Optional[float] = None
    baseline_years: Optional[float] = None
    valid_pixels_pct: float = 0.0
    calibrations: List[PhotometricCalibration] = Field(default_factory=list)
    groups_checked: int = 0


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
    available_bands: List[float] = Field(default_factory=list, description="Longitudes de onda disponibles en los recortes cargados")
    best_band_index: Optional[int] = Field(None, description="Índice de la banda con mayor porcentaje de píxeles limpios")
    best_band_clean_pct: Optional[float] = Field(None, description="Porcentaje de píxeles limpios de la mejor banda")
    total_epochs: int = Field(0, description="Cantidad de instantes temporales distintos")
    total_bands: int = Field(0, description="Cantidad de combinaciones detector/longitud de onda")
    analysis_frame_indices: List[int] = Field(default_factory=list)
    difference_available: bool = False
    analysis_note: str = ""
    difference_quality: DifferenceQuality = Field(default_factory=DifferenceQuality)
    temporal_search: bool = False


class EpochFrame(BaseModel):
    index: int
    epoch_id: int = Field(0, description="Índice temporal agrupado por instante de observación")
    band_id: str = Field("", description="Identificador estable de detector y banda espectral")
    obs_time: str
    detector: str
    wavelength_center_um: float
    bandwidth_um: float = 0.0
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
    shift_arcsec: Optional[float] = None
    proper_motion_arcsec_yr: float
    heliocentric_dist_au_est: Optional[float] = None
    catalog_match: Optional[str] = Field(None, description="ID en Gaia DR3 o AllWISE si existe en catálogo")
    description: str
    positive_support_pixels: Optional[int] = None
    negative_support_pixels: Optional[int] = None
    lobe_flux_balance: Optional[float] = None
    iau_designation: Optional[str] = Field(None, description="Designación astronómica IAU por coordenadas (SPHEREx J...)")
    object_category: Optional[str] = Field(None, description="Categoría legible para el usuario")
    user_explanation: Optional[str] = Field(None, description="Explicación en lenguaje claro de qué detectó la IA")


class DetectorCoadd(BaseModel):
    detector: str
    frame_count: int
    wavelength_min_um: float
    wavelength_max_um: float
    clean_pixels_pct: float
    image_base64: str


class ExploreResponse(BaseModel):
    target_info: TargetInfo
    epochs: List[EpochFrame]
    coadd_image_base64: str
    diff_image_base64: str
    detector_coadds: Dict[str, DetectorCoadd] = Field(default_factory=dict)
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
    confidence: Optional[float] = None
    effective_temp_k_est: Optional[int] = None
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


# ----------------------------------------------------------------------------
# Línea histórica (/api/timeline)
# ----------------------------------------------------------------------------
class TimelineVisit(BaseModel):
    visit_id: int
    mjd_start: float
    mjd_end: float
    mjd_mid: float
    date_iso: str
    label: str = Field(..., description="Fecha corta legible, p. ej. '12 may 2025'")
    n_exposures: int
    detectors: List[str]


class TimelineSeriesPoint(BaseModel):
    visit_id: int
    mjd: float
    date_iso: str
    label: str
    flux_mjy_sr: float
    flux_uncertainty: float
    n_exposures: int
    wavelength_um: float
    cutout_url: str = ""


class TimelineSeries(BaseModel):
    detector: str
    mode: str = Field(..., description="'strict' (λ casi idéntica) o 'approx' (respaldo declarado)")
    photometry: str = Field("aperture", description="'aperture' o 'halo' (núcleo saturado)")
    reference_wavelength_um: float
    wavelength_span_pct: float
    n_visits: int
    baseline_days: float
    points: List[TimelineSeriesPoint]
    note: str = ""
    status: str = Field(..., description="variable | possible | stable | faint | insufficient")
    change_pct: Optional[float] = None
    change_sigma: Optional[float] = None
    amplitude_pct: Optional[float] = None
    variability_p_value: Optional[float] = None
    median_snr: float = 0.0


class TimelinePosition(BaseModel):
    visit_id: int
    mjd: float
    east_arcsec: float
    north_arcsec: float
    uncertainty_arcsec: float
    n_exposures: int


class TimelineMotion(BaseModel):
    status: str = Field(..., description="moved | static | unknown")
    shift_arcsec: Optional[float] = None
    shift_sigma: Optional[float] = None
    baseline_days: Optional[float] = None
    pm_arcsec_yr: Optional[float] = None
    pm_ra_mas_yr: Optional[float] = None
    pm_dec_mas_yr: Optional[float] = None
    positions: List[TimelinePosition] = Field(default_factory=list)


class TimelineKnownMotion(BaseModel):
    name: str
    pm_ra_mas_yr: float
    pm_dec_mas_yr: float
    pm_total_arcsec_yr: float
    ref_epoch_year: float
    ref_ra: float
    ref_dec: float
    source: str
    current_ra: float
    current_dec: float
    current_epoch_year: float
    offset_now_arcsec: float


class TimelineStamp(BaseModel):
    visit_id: int
    detector: str
    mjd: float
    date_iso: str
    label: str
    wavelength_um: float
    cutout_url: str = ""
    image_base64: str
    centroid_east_arcsec: Optional[float] = None
    centroid_north_arcsec: Optional[float] = None


class TimelineHeadline(BaseModel):
    status: str = Field(
        ..., description="moved | moved_away | brightness_changed | possible_change | stable | faint | insufficient"
    )
    title: str
    detail: str
    period: str = ""
    notes: List[str] = Field(default_factory=list)
    technical: str = ""


class TimelineResponse(BaseModel):
    ra: float
    dec: float
    total_exposures: int
    baseline_days: float
    visits: List[TimelineVisit]
    series: List[TimelineSeries]
    default_detector: Optional[str] = None
    motion: TimelineMotion
    known_motion: Optional[TimelineKnownMotion] = None
    tracking_applied: bool = Field(False, description="La apertura acompañó al objeto según su movimiento de catálogo")
    stamps: List[TimelineStamp]
    stamp_fov_deg: float
    headline: TimelineHeadline
