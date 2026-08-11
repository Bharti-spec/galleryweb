// Compresses a video entirely inside the browser (using ffmpeg.wasm) so it
// fits under Cloudinary's free-plan size limit, instead of just rejecting
// the upload. Loaded lazily via dynamic import — most people never trigger
// this, so the ~30MB ffmpeg core is never downloaded unless it's needed.

import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";
import { fetchFile, toBlobURL } from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js";

let ffmpegInstance = null;
let loadingPromise = null;

async function getFFmpeg(onProgress) {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg();

    if (onProgress) {
      ffmpeg.on("progress", ({ progress }) => {
        if (typeof progress === "number" && progress >= 0) {
          onProgress(Math.min(100, Math.round(progress * 100)));
        }
      });
    }

    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadingPromise;
}

function parseDurationSeconds(logText) {
  const match = logText.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const [, h, m, s] = match;
  return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
}

/**
 * Compresses `file` down toward `maxBytes`, returning a new File on success.
 * `onStatus` is called with short human-readable progress strings.
 */
export async function compressVideoToLimit(file, maxBytes, onStatus) {
  onStatus && onStatus("Video load ho rahi hai…");
  const ffmpeg = await getFFmpeg((pct) => onStatus && onStatus(`Compress ho rahi hai… ${pct}%`));

  const inputExt = (file.name.match(/\.\w+$/) || [".mp4"])[0];
  const inputName = "input" + inputExt;
  const outputName = "output.mp4";

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // Quick probe pass just to read the video's duration from ffmpeg's own
  // log output — needed to calculate a bitrate that lands under the limit.
  let durationSeconds = null;
  const logHandler = ({ message }) => {
    if (durationSeconds == null) {
      const d = parseDurationSeconds(message);
      if (d) durationSeconds = d;
    }
  };
  ffmpeg.on("log", logHandler);
  try {
    await ffmpeg.exec(["-i", inputName]);
  } catch {
    // Expected — this "fails" because no output file was given, we only
    // wanted the metadata that gets logged along the way.
  }
  ffmpeg.off("log", logHandler);

  if (!durationSeconds || durationSeconds <= 0) {
    durationSeconds = 60; // safe fallback if we couldn't read it
  }

  // Leave a safety margin under the real limit, and reserve some of the
  // bitrate budget for audio.
  const audioBitrate = 96000; // 96 kbps
  const targetTotalBits = maxBytes * 8 * 0.9;
  let videoBitrate = Math.floor(targetTotalBits / durationSeconds) - audioBitrate;
  videoBitrate = Math.max(videoBitrate, 150000); // never go absurdly low

  onStatus && onStatus("Compress ho rahi hai…");

  await ffmpeg.exec([
    "-i",
    inputName,
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:v",
    "libx264",
    "-b:v",
    `${Math.round(videoBitrate / 1000)}k`,
    "-maxrate",
    `${Math.round((videoBitrate * 1.5) / 1000)}k`,
    "-bufsize",
    `${Math.round((videoBitrate * 2) / 1000)}k`,
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer], { type: "video/mp4" });
  const newName = file.name.replace(/\.\w+$/, "") + "-compressed.mp4";

  return new File([blob], newName, { type: "video/mp4" });
}
