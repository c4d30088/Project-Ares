// Joins the recorded clips into the launch video with ffmpeg (brew install ffmpeg): short
// crossfades between clips, the owner's music track under it, H.264 + AAC for Reddit.
// The music is cut to the video's length from its end, so the song finishes on the end card;
// a short fade-in hides the cut at the start. Run on its own (frames already recorded):
//   node scripts/video/assemble.mjs [--preview]
import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Crossfade between clips, seconds. */
const XFADE = 0.4;
/** Fade in from black at the start, seconds. */
const FADE_IN = 0.5;
/** Music fade-in at the cut, seconds. */
const MUSIC_FADE_IN = 1.0;

const probe = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

export async function assemble({ framesDir, fps, preview, clips }) {
  const musicDir = "video/music";
  const music = existsSync(musicDir) ? readdirSync(musicDir).find((f) => /\.(mp3|wav|m4a|aac|flac)$/i.test(f)) : undefined;
  const out = preview ? "video/project-ares-playtest-preview.mp4" : "video/project-ares-playtest.mp4";

  const inputs = [];
  for (const c of clips) inputs.push("-framerate", String(fps), "-i", `${framesDir}/${c.name}/%05d.jpg`);

  // Video: chain xfades; each offset is where the next clip starts overlapping.
  const filters = [];
  let label = "[0:v]";
  let offset = 0;
  for (let i = 1; i < clips.length; i++) {
    offset += clips[i - 1].seconds - XFADE;
    const outLabel = i === clips.length - 1 ? "[vx]" : `[v${i}]`;
    filters.push(`${label}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}${outLabel}`);
    label = outLabel;
  }
  const total = clips.reduce((s, c) => s + c.seconds, 0) - XFADE * (clips.length - 1);
  filters.push(`${clips.length > 1 ? "[vx]" : "[0:v]"}fade=t=in:st=0:d=${FADE_IN},scale=in_range=full:out_range=limited,format=yuv420p[v]`);

  const audio = [];
  if (music) {
    const path = `${musicDir}/${music}`;
    const start = Math.max(0, probe(path) - total);
    inputs.push("-i", path);
    filters.push(
      `[${clips.length}:a]atrim=start=${start.toFixed(3)}:duration=${total.toFixed(3)},asetpts=PTS-STARTPTS,` +
        `afade=t=in:st=0:d=${MUSIC_FADE_IN},afade=t=out:st=${(total - 0.4).toFixed(3)}:d=0.4[a]`,
    );
    audio.push("-map", "[a]", "-c:a", "aac", "-b:a", "192k");
    console.log(`Music: ${music}, from ${start.toFixed(1)} s to its end`);
  } else {
    console.log("No music in video/music/: the video is silent.");
  }

  execFileSync(
    "ffmpeg",
    [
      "-y", "-v", "error", ...inputs,
      "-filter_complex", filters.join(";"),
      "-map", "[v]", ...audio,
      "-c:v", "libx264", "-preset", preview ? "veryfast" : "slow", "-crf", preview ? "26" : "18",
      "-r", String(fps), "-t", total.toFixed(3), "-movflags", "+faststart",
      out,
    ],
    { stdio: "inherit" },
  );
  console.log(`Saved ${out} (${total.toFixed(1)} s)`);
}

// Run directly: assemble frames that are already recorded.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { clips } = await import("./shots.mjs");
  const preview = process.argv.includes("--preview");
  await assemble({ framesDir: preview ? "video/frames-preview" : "video/frames", fps: preview ? 15 : 30, preview, clips });
}
