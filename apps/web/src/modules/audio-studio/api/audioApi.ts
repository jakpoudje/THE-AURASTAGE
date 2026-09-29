// Thin client for the Audio Studio + Assets APIs. No logic here.
import type { AudioClip, AudioTrack, SaveAudioClipInput, SessionMix, UpdateAudioTrackInput, LoudnessMeasurementInput } from "@aurastage/contracts";
import { apiDelete, apiGet, apiGetBytes, apiPatch, apiPost, apiPut, apiUpload } from "@/lib/apiClient";
import type { AudioAsset, AudioGeneration, AudioMeasurement, AudioWorkspace } from "../types";

export const audioApi = {
  getWorkspace: (projectId: string) => apiGet<AudioWorkspace>(`/api/projects/${projectId}/audio`),
  spot: (projectId: string, sceneId: string) =>
    apiPost<{ session_id: string; tracks: number; cues: number; shot_plan_version_number: number }>(`/api/projects/${projectId}/audio/scenes/${sceneId}/spot`, {}),
  approve: (projectId: string, sceneId: string) => apiPost<{ version_number: number }>(`/api/projects/${projectId}/audio/scenes/${sceneId}/approve`, {}),
  updateTrack: (trackId: string, patch: UpdateAudioTrackInput) => apiPatch<AudioTrack>(`/api/audio-tracks/${trackId}`, patch),
  updateMix: (projectId: string, sceneId: string, mix: SessionMix, revision: string) =>
    apiPut<{ session_id: string; revision: string; mix: SessionMix }>(`/api/projects/${projectId}/audio/scenes/${sceneId}/mix`, { mix, revision }),
  createClip: (sessionId: string, patch: SaveAudioClipInput) => apiPost<AudioClip>(`/api/audio-sessions/${sessionId}/clips`, patch),
  updateClip: (clipId: string, patch: SaveAudioClipInput) => apiPatch<AudioClip>(`/api/audio-clips/${clipId}`, patch),
  deleteClip: (clipId: string) => apiDelete<{ deleted: true }>(`/api/audio-clips/${clipId}`),
  recordMeasurement: (sessionId: string, m: LoudnessMeasurementInput) => apiPost<AudioMeasurement>(`/api/audio-sessions/${sessionId}/measurements`, m),
  uploadAudio: (projectId: string, file: Blob, meta: { name: string; duration: number; sample_rate: number; channels: number }) =>
    apiUpload<AudioAsset>(
      `/api/projects/${projectId}/assets/audio?name=${encodeURIComponent(meta.name)}&duration=${meta.duration}&sample_rate=${meta.sample_rate}&channels=${meta.channels}`,
      file,
      file.type || "audio/wav"
    ),
  generate: (projectId: string, sceneId: string, body: { clip_id: string | null; kind: AudioGeneration["kind"]; description: string; duration_seconds: number }) =>
    apiPost<AudioGeneration>(`/api/projects/${projectId}/audio/scenes/${sceneId}/generate`, body),
  generateCues: (projectId: string, sceneId: string) =>
    apiPost<{ requested: AudioGeneration[]; skipped: string[] }>(`/api/projects/${projectId}/audio/scenes/${sceneId}/generate-cues`, {}),
  assetBytes: (assetId: string) => apiGetBytes(`/api/assets/${assetId}/content`),
};
