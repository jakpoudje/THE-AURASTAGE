export const TYPE_LABEL: Record<string, string> = { audio: "Audio", image: "Image", video: "Video", document: "Document", reference: "Reference" };
export function bytes(n: number | null) {
  if (!n) return null;
  return n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
}
export function secs(n: number | null) {
  if (!n) return null;
  const m = Math.floor(n / 60), s = n - m * 60;
  return m ? `${m}:${s.toFixed(0).padStart(2, "0")}` : `${s.toFixed(1)} s`;
}
export function specLine(s: { media_type: string | null; size_bytes: number | null; duration_seconds: number | null; sample_rate: number | null; channels: number | null; width: number | null; height: number | null }) {
  return [
    s.width && s.height ? `${s.width}×${s.height}` : null,
    secs(s.duration_seconds),
    s.sample_rate ? `${(s.sample_rate / 1000).toFixed(1)} kHz` : null,
    s.channels ? (s.channels === 1 ? "mono" : s.channels === 2 ? "stereo" : `${s.channels} ch`) : null,
    s.media_type?.split("/")[1]?.toUpperCase() ?? null,
    bytes(s.size_bytes),
  ].filter(Boolean).join(" · ");
}
const ACTIONS: Record<string, string> = {
  AssetRegistered: "Added", AssetUpdated: "Details changed", AssetVersionAdded: "New version", AssetLinked: "Linked", AssetUnlinked: "Link removed",
  AssetArchived: "Archived", AssetRestored: "Restored",
};
export const actionLabel = (a: string) => ACTIONS[a] ?? a;
