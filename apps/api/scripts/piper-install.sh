#!/bin/sh
# Installs AuraStage's neural voice (Piper, MIT) and its multi-speaker voice models into /opt/piper, then measures every
# speaker's register so Voice DNA can be matched by evidence (piper-measure.mjs). Used by the API and generation-worker
# Dockerfiles, before the source is copied, so the download is cached between deploys.
# Voices: VCTK (British Isles accents) and LibriTTS-R (American English), both CC BY 4.0; CMU ARCTIC (Scottish, Canadian,
# Indian and American English speakers; free for any use); Northern English male (OpenSLR 83, CC BY-SA 4.0) — credited in docs.
set -eu
PIPER_VERSION=2023.11.14-2
VOICES=https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0
cd /opt
curl -fsSL --retry 3 "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_x86_64.tar.gz" | tar xz
mkdir -p /opt/piper/voices
cd /opt/piper/voices
for m in en/en_GB/vctk/medium/en_GB-vctk-medium en/en_US/libritts_r/medium/en_US-libritts_r-medium; do
  f=$(basename "$m")
  curl -fsSL --retry 3 -o "$f.onnx" "$VOICES/$m.onnx"
  curl -fsSL --retry 3 -o "$f.onnx.json" "$VOICES/$m.onnx.json"
done
# Accent voices are optional: if one can't be fetched the build carries on and characters with that accent use the
# default voice, saying so (voices.ts).
for m in en/en_US/arctic/medium/en_US-arctic-medium en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium; do
  f=$(basename "$m")
  if ! { curl -fsSL --retry 3 -o "$f.onnx" "$VOICES/$m.onnx" && curl -fsSL --retry 3 -o "$f.onnx.json" "$VOICES/$m.onnx.json"; }; then
    echo "accent voice $f not available — skipped"; rm -f "$f.onnx" "$f.onnx.json"
  fi
done
node /tmp/piper-measure.mjs /opt/piper
