"""Selección conservadora de exposiciones comparables para resta temporal."""

from astropy.time import Time
from math import isfinite


def observation_mjd(value: str) -> float | None:
    try:
        number = float(value)
        return number if isfinite(number) else None
    except (ValueError, TypeError):
        try:
            return float(Time(value).mjd)
        except (ValueError, TypeError):
            return None


def rank_analysis_groups(epochs: list[dict]) -> list[list[int]]:
    """Grupos espectrales solapados, priorizando cobertura y tiempo útil."""
    candidates: set[tuple[int, ...]] = set()
    ordered = sorted(range(len(epochs)), key=lambda i: epochs[i].get("wavelength_center_um", 0))
    for start, anchor in enumerate(ordered):
        group = [anchor]
        for index in ordered[start+1:]:
            ep = epochs[index]
            wl, bw = ep.get("wavelength_center_um", 0), ep.get("bandwidth_um", 0)
            if wl > 0 and bw > 0 and all(
                ep.get("detector") == epochs[i].get("detector")
                and abs(wl - epochs[i].get("wavelength_center_um", 0))
                    <= 0.5 * min(bw, epochs[i].get("bandwidth_um", 0))
                for i in group
            ):
                group.append(index)
        useful = [i for i in group if epochs[i].get("clean_pixels_pct", 0) > 0]
        candidates.add(tuple(sorted(useful or [anchor])))
    def score(group):
        times = {observation_mjd(epochs[i].get("obs_time", "")) for i in group} - {None}
        span = max(times)-min(times) if times else 0
        quality = sum(epochs[i].get("clean_pixels_pct", 0) for i in group)
        return (len(times) >= 2, span, len(group), quality)
    return [list(group) for group in sorted(candidates, key=lambda g: (score(g), tuple(-i for i in g)), reverse=True)]


def select_analysis_frames(epochs: list[dict]) -> list[int]:
    groups = rank_analysis_groups(epochs)
    return groups[0] if groups else []
