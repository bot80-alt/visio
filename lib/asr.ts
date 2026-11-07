"use client";

import { progressTracker, transformers } from "./encoders";
import { ASR_MODEL_ID, MODEL_DTYPE } from "./model";

type Transcriber = (audio: Float32Array) => Promise<string>;
let asr: Promise<Transcriber> | null = null;

export function loadWhisper(onPct?: (pct: number) => void): Promise<Transcriber> {
  asr ??= (async () => {
    const { pipeline } = await transformers();
    const recognizer = await pipeline("automatic-speech-recognition", ASR_MODEL_ID, {
      dtype: MODEL_DTYPE,
      device: "wasm",
      progress_callback: progressTracker((p) => onPct?.(p)),
    });
    return async (audio: Float32Array) => {
      const out = (await recognizer(audio, { chunk_length_s: 30 })) as { text: string } | { text: string }[];
      const text = Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text;
      return text.replace(/\[(?:BLANK_AUDIO|MUSIC|NOISE)\]/gi, "").replace(/\s+/g, " ").trim();
    };
  })().catch((e) => {
    asr = null;
    throw e;
  });
  return asr;
}

const SAMPLE_RATE = 16000;

async function toMono16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(buf);
    const frames = Math.ceil(decoded.duration * SAMPLE_RATE);
    const offline = new OfflineAudioContext(1, Math.max(frames, 1), SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    ctx.close();
  }
}

export type Recording = {
  /** 0..1 input level, sampled on every animation frame. */
  level: () => number;
  stop: () => Promise<Float32Array>;
  cancel: () => void;
};

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start(100);

  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  };

  return {
    level() {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += ((s - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / samples.length) * 4);
    },
    stop() {
      return new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          release();
          try {
            resolve(await toMono16k(new Blob(chunks, { type: recorder.mimeType })));
          } catch (e) {
            reject(e);
          }
        };
        recorder.stop();
      });
    },
    cancel() {
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}
