#!/usr/bin/env node
// Builds web-ready copies of the client selection photos.
//
//   client-selection/originals/  your full-resolution files (never modified,
//                                not committed, not deployed)
//   client-selection/photos/     compressed copies with identical filenames
//                                + manifest.json (committed and deployed)
//
// Usage: node client-selection/prepare-photos.js [--max 3000] [--quality 85] [--force]
//   --max      longest edge in pixels; larger photos are scaled down (default 3000)
//   --quality  JPEG quality 1-100 (default 85)
//   --force    rebuild every photo, not just new or changed ones
//
// Requires macOS (uses the built-in `sips` tool). Does not touch /images.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SRC = path.join(__dirname, "originals");
const OUT = path.join(__dirname, "photos");
const MANIFEST = path.join(OUT, "manifest.json");
const KEEP = new Set(["manifest.json", ".gitkeep"]);

const JPEG = new Set([".jpg", ".jpeg"]);
const PNG = new Set([".png"]);
const COPY_AS_IS = new Set([".webp", ".gif", ".avif"]);

function option(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = Number(process.argv[i + 1]);
  if (!Number.isFinite(value)) {
    console.error(`--${name} needs a number`);
    process.exit(1);
  }
  return value;
}

const MAX_EDGE = option("max", 3000);
const QUALITY = Math.min(100, Math.max(1, option("quality", 85)));
const FORCE = process.argv.includes("--force");

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sips(args) {
  return execFileSync("sips", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function dimensions(file) {
  const out = sips(["-g", "pixelWidth", "-g", "pixelHeight", file]);
  const width = Number((out.match(/pixelWidth:\s*(\d+)/) || [])[1]);
  const height = Number((out.match(/pixelHeight:\s*(\d+)/) || [])[1]);
  return { width, height };
}

function compress(src, dest, ext) {
  const { width, height } = dimensions(src);
  const resize = Math.max(width, height) > MAX_EDGE;
  const args = [];
  if (JPEG.has(ext)) args.push("-s", "format", "jpeg", "-s", "formatOptions", String(QUALITY));
  if (resize) args.push("-Z", String(MAX_EDGE));

  if (!args.length) {
    fs.copyFileSync(src, dest);
    return "copied (already web-sized)";
  }

  const tmp = path.join(OUT, `.tmp-${process.pid}${ext}`);
  try {
    sips([...args, src, "--out", tmp]);
    // Re-encoding a file that is already small can make it bigger; keep the original then.
    if (!resize && fs.statSync(tmp).size >= fs.statSync(src).size) {
      fs.copyFileSync(src, dest);
      return "copied (already optimised)";
    }
    fs.renameSync(tmp, dest);
    return resize ? `resized to ${MAX_EDGE}px & compressed` : "compressed";
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function main() {
  if (process.platform !== "darwin") {
    console.error("This script uses macOS's built-in `sips` tool, so it must be run on a Mac.");
    process.exit(1);
  }
  if (!fs.existsSync(SRC)) {
    console.error(`Originals folder not found: ${SRC}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const entries = fs
    .readdirSync(SRC)
    .filter((name) => !name.startsWith(".") && fs.statSync(path.join(SRC, name)).isFile())
    .sort(collator.compare);

  const usable = [];
  const skipped = [];
  entries.forEach((name) => {
    const ext = path.extname(name).toLowerCase();
    if (JPEG.has(ext) || PNG.has(ext) || COPY_AS_IS.has(ext)) usable.push(name);
    else skipped.push(name);
  });

  console.log(`Preparing ${usable.length} photo(s): longest edge ${MAX_EDGE}px, JPEG quality ${QUALITY}\n`);

  let srcTotal = 0;
  let outTotal = 0;
  let largest = { name: "", size: 0 };
  let failures = 0;

  usable.forEach((name) => {
    const src = path.join(SRC, name);
    const dest = path.join(OUT, name);
    const ext = path.extname(name).toLowerCase();
    const srcStat = fs.statSync(src);
    let status;

    try {
      if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= srcStat.mtimeMs) {
        status = "up to date";
      } else if (COPY_AS_IS.has(ext)) {
        fs.copyFileSync(src, dest);
        status = "copied (format not compressed)";
      } else {
        status = compress(src, dest, ext);
      }
    } catch (err) {
      failures++;
      console.log(`  ✗ ${name}: ${String(err.stderr || err.message).trim()}`);
      return;
    }

    const outSize = fs.statSync(dest).size;
    srcTotal += srcStat.size;
    outTotal += outSize;
    if (outSize > largest.size) largest = { name, size: outSize };
    console.log(`  ✓ ${name}  ${mb(srcStat.size)} → ${mb(outSize)}  (${status})`);
  });

  const wanted = new Set(usable);
  fs.readdirSync(OUT).forEach((name) => {
    if (!KEEP.has(name) && !name.startsWith(".tmp-") && !wanted.has(name)) {
      fs.unlinkSync(path.join(OUT, name));
      console.log(`  – removed ${name} (no longer in originals)`);
    }
  });

  const photos = usable.filter((name) => fs.existsSync(path.join(OUT, name)));
  fs.writeFileSync(MANIFEST, `${JSON.stringify({ generatedAt: new Date().toISOString(), photos }, null, 2)}\n`);

  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length} file(s) browsers can't display (export them as JPEG first):`);
    skipped.forEach((name) => console.log(`  ${name}`));
  }

  console.log(`\nDone: ${photos.length} photo(s), ${mb(srcTotal)} → ${mb(outTotal)}`);
  if (largest.name) console.log(`Largest file: ${largest.name} (${mb(largest.size)})`);
  if (largest.size > 20 * 1024 * 1024) {
    console.log("Warning: some files are still very large. Try a lower --max or --quality.");
  }
  console.log("Next: commit client-selection/photos/ and deploy.");
  if (failures) process.exit(1);
}

main();
