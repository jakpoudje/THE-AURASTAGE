export type Usage = { kind: "audio_clip" | "render" | "link" | "reference"; scene_id: string | null; label: string; href: string | null };
export type LibraryAsset = {
  id: string; project_id: string; type: "audio" | "image" | "video" | "document" | "reference"; name: string; checksum: string | null;
  media_type: string | null; size_bytes: number | null; duration_seconds: number | null; created_at: string;
  category: string; description: string; tags: string[]; current_version: number; versions: number; archived: boolean; updated_at: string;
  specs: { media_type: string | null; size_bytes: number | null; duration_seconds: number | null; sample_rate: number | null; channels: number | null; width: number | null; height: number | null };
  usage: Usage[];
};
export type Library = {
  assets: LibraryAsset[]; total: number; library_size: number; archived_count: number;
  category_counts: Record<string, number>; type_counts: Record<string, number>;
  categories: { id: string; label: string }[];
  scenes: { id: string; number: number; heading: string }[];
  characters: { id: string; name: string }[];
  media_ready: boolean; search_note: string; engine_version: string;
};
export type AssetDetail = {
  asset: LibraryAsset;
  versions: { version_number: number; checksum: string | null; note: string; created_at: string; current: boolean; size_bytes: number | null; media_type: string | null }[];
  links: Usage[];
  history: { action: string; metadata: Record<string, unknown>; created_at: string }[];
};
export type Filters = { q: string; category: string | null; type: string | null; usage: "any" | "used" | "unused"; scene_id: string | null; archived: boolean; sort: "newest" | "name" };
