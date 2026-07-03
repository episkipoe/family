export function rangesOverlap(a, b) {
  if (!Number.isFinite(a?.lat) || !Number.isFinite(a?.lng) || !Number.isFinite(b?.lat) || !Number.isFinite(b?.lng)) {
    return true;
  }

  return a.lat === b.lat && a.lng === b.lng;
}
