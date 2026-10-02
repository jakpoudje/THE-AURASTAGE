#!/bin/sh
# Installs AuraStage's natural voice — Kokoro-82M (Apache-2.0) via kokoro-js (Apache-2.0) — into /opt/kokoro, downloads
# the model once and measures every English voice (kokoro-say.mjs --setup → voices.json). Used by the API and
# generation-worker Dockerfiles before the source is copied, so it stays cached between deploys.
# Never breaks the build: if anything fails, /opt/kokoro has no voices.json, the voice reports "not configured" and the
# Piper voice is used instead (say so in the logs).
set -u
mkdir -p /opt/kokoro && cd /opt/kokoro
cp /tmp/kokoro-say.mjs /opt/kokoro/kokoro-say.mjs
echo '{"name":"aurastage-kokoro","private":true,"type":"module"}' > package.json
if npm install --omit=dev --no-audit --no-fund kokoro-js@1.2.1 >/tmp/kokoro-npm.log 2>&1; then
  # CPU on Linux x64 only: drop the other platforms' and the GPU runtimes (about 450 MB).
  ORT=node_modules/onnxruntime-node/bin/napi-v3
  rm -rf "$ORT/darwin" "$ORT/win32" "$ORT/linux/arm64" "$ORT"/linux/x64/libonnxruntime_providers_cuda.so "$ORT"/linux/x64/libonnxruntime_providers_tensorrt.so
  if node kokoro-say.mjs --setup /opt/kokoro; then
    echo "kokoro voice installed"
  else
    echo "kokoro voice setup failed — the Piper voice will be used"; rm -f voices.json
  fi
else
  tail -20 /tmp/kokoro-npm.log; echo "kokoro install failed — the Piper voice will be used"; rm -f voices.json
fi
exit 0
