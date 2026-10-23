/** Lists carry only a versioned URL, never the base64 image or a roster copy. */
export function logoReference(id, hasLogo, updatedAt) {
  if (!id || !hasLogo) return {};
  const version = updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt ?? "");
  return { logoUrl: `/api/team-logos/${id}${version ? `?v=${encodeURIComponent(version)}` : ""}` };
}
