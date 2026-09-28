// Thin wrapper around the ffmpeg / ffprobe binaries (installed in the Docker image).
import { spawn } from "node:child_process";

export class CancelledError extends Error {
  constructor() {
    super("Cancelled by request");
  }
}

export interface RunOptions {
  /** Called with ffmpeg's out_time in seconds when `-progress pipe:1` is used. */
  onTime?: (seconds: number) => void;
  signal?: AbortSignal;
  stdout?: "capture" | "ignore";
}

export function run(cmd: string, args: string[], o: RunOptions = {}): Promise<{ stdout: Buffer; stderr: string }> {
  if (o.signal?.aborted) return Promise.reject(new CancelledError());
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    const abort = () => p.kill("SIGKILL");
    o.signal?.addEventListener("abort", abort, { once: true });
    p.stdout.on("data", (b: Buffer) => {
      if (o.onTime) {
        const m = /out_time_us=(\d+)/.exec(b.toString());
        if (m) o.onTime(Number(m[1]) / 1e6);
      }
      if (o.stdout !== "ignore") out.push(b);
    });
    p.stderr.on("data", (b: Buffer) => {
      err += b.toString();
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    p.on("error", reject);
    p.on("close", (code) => {
      o.signal?.removeEventListener("abort", abort);
      if (o.signal?.aborted) return reject(new CancelledError());
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else reject(new Error(`${cmd} exited with ${code}: ${err.split("\n").filter(Boolean).slice(-4).join(" | ")}`));
    });
  });
}

export const ffmpeg = (args: string[], o?: RunOptions) => run("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], o);
export const ffprobe = (args: string[]) => run("ffprobe", ["-v", "error", ...args]);
