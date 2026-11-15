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
    shift_sigma: Optional[float] = Field(None, description="Significancia conjunta (2D) del movimiento ajustado")
    baseline_days: Optional[float] = None
    pm_arcsec_yr: Optional[float] = None
    pm_ra_mas_yr: Optional[float] = None
    pm_dec_mas_yr: Optional[float] = None
    pm_uncertainty_arcsec_yr: Optional[float] = None
    chi2_reduced: Optional[float] = None
    direction: Optional[str] = None
    confidence: Optional[str] = Field(None, description="alta | media (solo si se movió)")
    source: str = Field("point", description="'field' = misma medición que el panel «Objetos que cambian»")
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
        ..., description="moved | moved_away | brightness_changed | possible_change | stable | blended | faint | insufficient"
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
    field_object_id: Optional[int] = Field(None, description="Objeto del panel «Objetos que cambian» que coincide con el punto")
    known_motion: Optional[TimelineKnownMotion] = None
    tracking_applied: bool = Field(False, description="La apertura acompañó al objeto según su movimiento de catálogo")
    stamps: List[TimelineStamp]
    stamp_fov_deg: float
    headline: TimelineHeadline


# ----------------------------------------------------------------------------
# Objetos que cambian (/api/changes): seguimiento de cada estrella en todas las fechas
# ----------------------------------------------------------------------------
class ChangesPosition(BaseModel):
    visit_id: int
    mjd: float
    label: str = ""
    east_arcsec: float
    north_arcsec: float
    uncertainty_arcsec: float
    n_exposures: int


class ChangesMotion(BaseModel):
    status: str = Field(..., description="moving | static | blended | unknown")
    confidence: Optional[str] = None
    sentence: str = ""
    n_visits: int = 0
    baseline_days: Optional[float] = None
    pm_ra_mas_yr: Optional[float] = Field(None, description="μα* medido (mas/año)")
    pm_dec_mas_yr: Optional[float] = Field(None, description="μδ medido (mas/año)")
    pm_total_arcsec_yr: Optional[float] = None
    pm_uncertainty_arcsec_yr: Optional[float] = None
    significance: Optional[float] = None
    chi2_reduced: Optional[float] = None
    shift_arcsec: Optional[float] = None
    shift_sigma: Optional[float] = None
    position_angle_deg: Optional[float] = None
    direction: Optional[str] = None
    ref_mjd: Optional[float] = None
    start_ra: Optional[float] = None
    start_dec: Optional[float] = None
    end_ra: Optional[float] = None
    end_dec: Optional[float] = None
    start_label: Optional[str] = None
    end_label: Optional[str] = None
    positions: List[ChangesPosition] = Field(default_factory=list)


class ChangesBrightness(BaseModel):
    status: str = Field(..., description="variable | possible | stable | blended | faint | insufficient")
    confidence: Optional[str] = None
    sentence: str = ""
    detector: Optional[str] = None
    mode: Optional[str] = None
    photometry: Optional[str] = None
    reference_wavelength_um: Optional[float] = None
    wavelength_span_pct: Optional[float] = None
    n_visits: Optional[int] = None
    baseline_days: Optional[float] = None
    change_pct: Optional[float] = None
    change_sigma: Optional[float] = None
    amplitude_pct: Optional[float] = None
    p_value: Optional[float] = None
    median_snr: Optional[float] = None
    note: str = ""
    first_label: Optional[str] = None
    last_label: Optional[str] = None


class ChangesGaiaMatch(BaseModel):
    source_id: str
    g_mag: Optional[float] = None
    separation_arcsec: float
    pm_ra_mas_yr: Optional[float] = None
    pm_dec_mas_yr: Optional[float] = None
    pm_total_arcsec_yr: Optional[float] = None


class ChangesKnownMatch(BaseModel):
    name: str
    pm_ra_mas_yr: float
    pm_dec_mas_yr: float
    pm_total_arcsec_yr: float
    source: str
    offset_arcsec: float


class ChangesCatalog(BaseModel):
    gaia_status: str = Field(..., description="ok (coincide) | no_match | unavailable")
    gaia: Optional[ChangesGaiaMatch] = None
    known: Optional[ChangesKnownMatch] = None
    gaia_agrees: Optional[bool] = None
    known_agrees: Optional[bool] = None


class ChangesPlanetX(BaseModel):
    distance_au: float
    note: str


class ChangesStampImage(BaseModel):
    image_base64: str
    label: str
    mjd: float
    detector: str
    wavelength_um: float
    cutout_url: str = ""
    east_arcsec: float
    north_arcsec: float


class ChangesStamps(BaseModel):
    fov_arcsec: float
    before: ChangesStampImage
    after: ChangesStampImage


class ChangesObject(BaseModel):
    id: int
    ra: float
    dec: float
    epoch_mjd: float
    kind: str = Field(..., description="moving | brightness | both | steady")
    name: Optional[str] = None
    confidence: Optional[str] = None
    saturated: bool = False
    crowded: bool = False
    peak_snr: float
    n_exposures: int
    motion: ChangesMotion
    brightness: ChangesBrightness
    catalog: ChangesCatalog
    planet_x: Optional[ChangesPlanetX] = None
    stamps: Optional[ChangesStamps] = None


class ChangesKnownTarget(BaseModel):
    name: str
    ra: float
    dec: float
    pm_total_arcsec_yr: float
    source: str
    object_id: Optional[int] = None


class ChangesSummary(BaseModel):
    status: str
    title: str
    detail: str
    notes: List[str] = Field(default_factory=list)


class ChangesVisit(BaseModel):
    visit_id: int
    label: str
    mjd: float
    n_exposures: int


class ChangesResponse(BaseModel):
    ra: float
    dec: float
    fov_deg: float
    n_exposures: int
    n_visits: int
    n_sources: int
    baseline_days: float
    first_label: Optional[str] = None
    last_label: Optional[str] = None
    visits: List[ChangesVisit] = Field(default_factory=list)
    gaia_status: str
    astrometry: Dict[str, int] = Field(default_factory=dict)
    summary: ChangesSummary
    objects: List[ChangesObject] = Field(default_factory=list, description="Objetos que se movieron o cambiaron de brillo")
    steady: List[ChangesObject] = Field(default_factory=list, description="Estrellas seguidas sin cambios medibles")
    known_targets: List[ChangesKnownTarget] = Field(default_factory=list)
