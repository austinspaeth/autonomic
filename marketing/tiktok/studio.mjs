#!/usr/bin/env node
// Slides Studio: serves studio.html and writes edits back into the repo.
//
//   node marketing/tiktok/studio.mjs            # opens http://localhost:4747
//   node marketing/tiktok/studio.mjs --port 5000 --no-open
//
// Each creative set is a folder under sets/:
//   sets/<YYYY-MM-DD-name>/set.json   name, created, numberFrom (the first creative's number, continuing from the last set), notes, account, style {type: warm|bold|editorial, signature}, creatives (each with an optional music brief)
//   sets/<YYYY-MM-DD-name>/img/       photos placed in the studio (c1s2.jpg = creative 1, slide 2)
//   sets/<YYYY-MM-DD-name>/audio/     songs dropped on a creative's Sound card (c1.mp3), used for its MP4. Gitignored:
//                                     the repo is public and these are usually licensed tracks.
//   per slide, `video` (optional) tells you the slide wants footage rather than a still.
//   sets/<YYYY-MM-DD-name>/video/     clips imported in the Composer (v<video>-k<clip>.mp4 + a thumbnail). Gitignored:
//                                     footage is large, and the repo is public.
// A new set is a new folder with a set.json; the studio lists every set, newest first.
// Exports: iCloud Drive/Slides Studio/<set id>/<NN creative>/slide-N.png, plus <NN creative>.mp4 (needs ffmpeg).
//          Composer videos land in iCloud Drive/Slides Studio/<set id>/Videos/<name>.mp4.
//
// No dependencies. Binds to 127.0.0.1 only.
import http from 'node:http';
import { readFile, writeFile, readdir, mkdir, unlink, rename, stat, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, extname, dirname, normalize, sep } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);

const ROOT = dirname(fileURLToPath(import.meta.url));
const SETS = join(ROOT, 'sets');
// Exports are build output, so they land outside the repo: one folder per set (named by its date-led id),
// one subfolder per creative.
const EXPORTS = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Slides Studio');
const argv = process.argv.slice(2);
const PORT = +(argv[argv.indexOf('--port') + 1] || 0) || 4747;
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.aif': 'audio/aiff', '.aiff': 'audio/aiff',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.css': 'text/css' };
const SET_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
const SLIDE_KEY = /^c\d+s\d+$/;
const EXT = /^(jpg|png|webp|heic)$/;
const AUDIO_EXT = /^(mp3|m4a|aac|wav|aif|aiff)$/;
const FADE = 0.3;   // seconds of crossfade between slides in the MP4
const VIDEO_ID = /^v[a-z0-9]{1,14}$/, CLIP_ID = /^k[a-z0-9]{1,14}$/;
const CLIP_VIDEO = /^(mp4|mov|m4v|webm|mkv|avi)$/, CLIP_IMAGE = /^(jpg|jpeg|png|webp|heic|heif)$/;
const LAYERS = join(tmpdir(), 'slides-studio');   // overlay PNGs for a Composer export, rendered by the page

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body == null ? '' : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = req => new Promise((ok, fail) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', fail);
});
const writeAtomic = async (file, data) => { await writeFile(file + '.tmp', data); await rename(file + '.tmp', file); };

// "01 POV you stood up": the folder (and MP4) name for a creative's exports.
// Creative numbers run on across sets: a set's `numberFrom` is the number its first creative wears (default 1),
// so set two starts where set one stopped. Files inside the set (c1s2.jpg, c1.mp3) keep their per-set index.
// A creative that carries its own `number` wears that instead: it is how one moved to a later set keeps the number it was made with.
const cleanName = s => String(s).replace(/[\/\\:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
const exportName = (ci, creative, set) => `${String(+creative.number || +ci + (Math.max(1, +set?.numberFrom || 1) - 1)).padStart(2, '0')} ${cleanName(creative.name || creative.id)}`;
// ffmpeg lives in Homebrew's prefix, which a launchd/IDE PATH often lacks.
async function which(bin) {
  for (const d of [...(process.env.PATH || '').split(':'), '/opt/homebrew/bin', '/usr/local/bin']) {
    const p = join(d, bin); if (await stat(p).then(s => s.isFile(), () => false)) return p;
  }
  return '';
}

// An Unsplash link of either kind, as a URL that returns the image itself at a size worth keeping.
// A photo PAGE (unsplash.com/photos/<slug>-<id>) goes through its download endpoint; an image link
// has its width raised, since the one "Copy image address" hands over is sized for the page it sat on.
function remoteImageURL(raw) {
  const u = new URL(raw.trim());
  if (u.protocol !== 'https:') return null;
  if (/^(images|plus)\.unsplash\.com$/.test(u.hostname)) {
    u.searchParams.set('w', '2560'); u.searchParams.set('q', '85'); u.searchParams.set('fm', 'jpg');
    return u.href;
  }
  if (/^(www\.)?unsplash\.com$/.test(u.hostname)) {
    const id = (u.pathname.match(/^\/photos\/([^/]+)/) || [])[1];
    return id ? `https://unsplash.com/photos/${id.slice(-11)}/download?force=true&w=2560` : null;
  }
  return null;
}

// What a media file holds, as the Composer needs it: its displayed size (rotation applied), length, sound, and whether it is HDR.
async function probe(file) {
  const { stdout } = await execFileP(await which('ffprobe') || 'ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]);
  const j = JSON.parse(stdout), v = (j.streams || []).find(s => s.codec_type === 'video');
  if (!v) return { w: 0, h: 0, dur: 0, audio: false, hdr: false };
  const turn = Math.abs(+((v.side_data_list || []).find(d => d.rotation != null)?.rotation ?? v.tags?.rotate ?? 0)) % 180 === 90;
  return { w: turn ? v.height : v.width, h: turn ? v.width : v.height, dur: +j.format?.duration || +v.duration || 0,
    audio: (j.streams || []).some(s => s.codec_type === 'audio'), hdr: /^(arib-std-b67|smpte2084)$/.test(v.color_transfer || '') };
}

async function listSets() {
  const out = [];
  for (const d of await readdir(SETS, { withFileTypes: true }).catch(() => [])) {
    if (!d.isDirectory() || !SET_ID.test(d.name)) continue;
    try {
      const s = JSON.parse(await readFile(join(SETS, d.name, 'set.json'), 'utf8'));
      const creatives = s.creatives || [];
      out.push({ id: d.name, name: s.name || d.name, created: s.created || '', notes: s.notes || '',
        creatives: creatives.length, slides: creatives.reduce((n, c) => n + (c.slides || []).length, 0) });
    } catch { /* a folder without a readable set.json is not a set */ }
  }
  return out.sort((a, b) => String(b.created).localeCompare(String(a.created)) || a.id.localeCompare(b.id));
}

async function removeImages(id, key) {
  const dir = join(SETS, id, 'img');
  for (const f of await readdir(dir).catch(() => [])) if (f.startsWith(key + '.')) await unlink(join(dir, f)).catch(() => {});
}

async function api(req, res, path, url) {
  if (path === '/api/sets' && req.method === 'GET') return send(res, 200, await listSets());

  let m = path.match(/^\/api\/sets\/([^/]+)$/);
  if (m && SET_ID.test(m[1])) {
    const file = join(SETS, m[1], 'set.json');
    // The file's mtime is its version. A save must name the version it was based on, so a tab
    // holding an older copy (or an edit made on disk meanwhile) can never be silently overwritten.
    const version = async () => String(Math.floor((await stat(file)).mtimeMs));
    if (req.method === 'GET') {
      res.setHeader('x-version', await version());
      return send(res, 200, await readFile(file, 'utf8'));
    }
    if (req.method === 'PUT') {
      const current = await version();
      if (req.headers['x-version'] !== current) return send(res, 409, { error: 'stale', version: current });
      const set = JSON.parse((await readBody(req)).toString('utf8'));
      if (!Array.isArray(set.creatives)) return send(res, 400, { error: 'set.creatives must be an array' });
      await writeAtomic(file, JSON.stringify(set, null, 2) + '\n');
      return send(res, 200, { ok: true, version: await version() });
    }
  }

  m = path.match(/^\/api\/sets\/([^/]+)\/version$/);
  if (m && SET_ID.test(m[1]) && req.method === 'GET') {
    // `code` is the studio's own files: a page that sees it change reloads itself, so an open tab never keeps drawing with old code.
    const code = Math.max(...await Promise.all(['studio.html', 'composer.js', 'composer.css'].map(f => stat(join(ROOT, f)).then(t => Math.floor(t.mtimeMs), () => 0))));
    return send(res, 200, { version: String(Math.floor((await stat(join(SETS, m[1], 'set.json'))).mtimeMs)), code: String(code) });
  }

  // An image fetched by link, for the studio's "paste a link" button: the browser cannot read a
  // cross-origin image into a canvas without CORS, and an Unsplash PAGE link is not an image at all.
  // The client downsizes and stores what comes back exactly as it does a dropped file.
  if (path === '/api/remote' && req.method === 'GET') {
    let target;
    try { target = remoteImageURL(url.searchParams.get('url') || ''); } catch { return send(res, 400, { error: 'not a link' }); }
    if (!target) return send(res, 400, { error: 'only Unsplash links are fetched' });
    const r = await fetch(target, { redirect: 'follow' });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return send(res, 502, { error: `that link did not return an image (${r.status})` });
    return send(res, 200, Buffer.from(await r.arrayBuffer()), type);
  }

  m = path.match(/^\/api\/sets\/([^/]+)\/export\/(c(\d+)s(\d+))$/);
  if (m && SET_ID.test(m[1]) && req.method === 'POST') {
    const [, id, , ci, si] = m;
    const set = JSON.parse(await readFile(join(SETS, id, 'set.json'), 'utf8'));
    const creative = set.creatives?.[ci - 1];
    if (!creative) return send(res, 404, { error: 'no such creative' });
    const setDir = join(EXPORTS, id), dir = join(setDir, exportName(ci, creative, set));
    await mkdir(dir, { recursive: true });
    const file = join(dir, `slide-${si}.png`);
    await writeAtomic(file, await readBody(req));
    const reveal = url.searchParams.get('reveal');
    if (reveal === 'set' || reveal === 'creative') exec(`open "${reveal === 'set' ? setDir : dir}"`);
    return send(res, 200, { path: file });
  }

  // A creative's song: one file per creative, replaced on each upload.
  m = path.match(/^\/api\/sets\/([^/]+)\/audio\/(c\d+|v[a-z0-9]{1,14})$/);
  if (m && SET_ID.test(m[1])) {
    const [, id, key] = m, dir = join(SETS, id, 'audio');
    const clear = async () => { for (const f of await readdir(dir).catch(() => [])) if (f.startsWith(key + '.')) await unlink(join(dir, f)).catch(() => {}); };
    if (req.method === 'POST') {
      const ext = (url.searchParams.get('ext') || '').toLowerCase();
      if (!AUDIO_EXT.test(ext)) return send(res, 400, { error: 'bad ext' });
      const data = await readBody(req);
      await mkdir(dir, { recursive: true }); await clear();
      await writeAtomic(join(dir, `${key}.${ext}`), data);
      return send(res, 200, { src: `audio/${key}.${ext}` });
    }
    if (req.method === 'DELETE') { await clear(); return send(res, 204); }
  }

  // The MP4 for one creative, built from the slide PNGs the client has just exported.
  m = path.match(/^\/api\/sets\/([^/]+)\/video\/c(\d+)$/);
  if (m && SET_ID.test(m[1]) && req.method === 'POST') {
    const [, id, ci] = m;
    const set = JSON.parse(await readFile(join(SETS, id, 'set.json'), 'utf8'));
    const creative = set.creatives?.[ci - 1];
    if (!creative) return send(res, 404, { error: 'no such creative' });
    const ffmpeg = await which('ffmpeg');
    if (!ffmpeg) return send(res, 501, { error: 'ffmpeg is not installed (brew install ffmpeg)' });
    const { durations } = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const n = (creative.slides || []).length;
    const secs = Array.from({ length: n }, (_, i) => Math.max(1.5, Math.min(8, +durations?.[i] || 2.5)));
    const dir = join(EXPORTS, id, exportName(ci, creative, set));
    const out = join(dir, `${exportName(ci, creative, set)}.mp4`);
    const args = ['-y', '-loglevel', 'error'];
    // Each still is held for its own duration plus the fade it overlaps into the next, so the
    // n-th crossfade starts at the sum of the durations before it and the film runs sum(durations).
    secs.forEach((d, i) => args.push('-loop', '1', '-framerate', '30', '-t', String(d + (i < n - 1 ? FADE : 0)), '-i', join(dir, `slide-${i + 1}.png`)));
    const total = secs.reduce((a, b) => a + b, 0);
    const music = creative.music || {};
    const song = music.file ? join(SETS, id, music.file) : '';
    const hasSong = song && await stat(song).then(() => true, () => false);
    if (hasSong) args.push('-ss', String(Math.max(0, +music.start || 0)), '-i', song);
    let f = secs.map((_, i) => `[${i}:v]scale=1080:1920,setsar=1,format=yuv420p[v${i}]`).join(';'), last = 'v0', t = 0;
    for (let i = 1; i < n; i++) {
      t += secs[i - 1];
      f += `;[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${t.toFixed(3)}[x${i}]`;
      last = `x${i}`;
    }
    if (hasSong) f += `;[${n}:a]atrim=0:${total},afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, total - 1.2)}:d=1.2,asetpts=PTS-STARTPTS[a]`;
    args.push('-filter_complex', f, '-map', `[${last}]`);
    if (hasSong) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
    args.push('-t', String(total), '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out);
    try { await execFileP(ffmpeg, args); }
    catch (e) { return send(res, 500, { error: String(e.stderr || e.message).trim().split('\n').pop() }); }
    const reveal = url.searchParams.get('reveal');
    if (reveal === 'set' || reveal === 'creative') exec(`open "${reveal === 'set' ? join(EXPORTS, id) : dir}"`);
    return send(res, 200, { path: out, seconds: +total.toFixed(1), song: !!hasSong });
  }


  // ---- Composer: clips in, a finished video out ----
  // A clip dropped on the Composer. Footage is normalised once, here, so the page and the export
  // both work from the same file: upright, 30 fps, SDR H.264, long edge 1920 at most. Photos become JPEGs.
  m = path.match(/^\/api\/sets\/([^/]+)\/clips\/([^/]+)$/);
  if (m && SET_ID.test(m[1]) && VIDEO_ID.test(m[2]) && req.method === 'POST') {
    const [, id, vid] = m, ext = (url.searchParams.get('ext') || '').toLowerCase();
    const isVideo = CLIP_VIDEO.test(ext), isImage = CLIP_IMAGE.test(ext);
    if (!isVideo && !isImage) return send(res, 400, { error: 'not a video or an image' });
    const dir = join(SETS, id, 'video'), kid = 'k' + Date.now().toString(36), stem = `${vid}-${kid}`;
    await mkdir(dir, { recursive: true });
    const tmp = join(dir, `.upload-${kid}.${ext}`), mid = join(dir, `.sdr-${kid}.mov`);
    try {
      await pipeline(req, createWriteStream(tmp));
      if (isImage) {
        const out = join(dir, `${stem}.${ext === 'png' ? 'png' : 'jpg'}`);
        if (/^(heic|heif|webp)$/.test(ext)) await execFileP('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', '-Z', '2560', tmp, '--out', out]);
        else await rename(tmp, out);
        const p = await probe(out);
        return send(res, 200, { id: kid, type: 'image', src: `video/${stem}.${ext === 'png' ? 'png' : 'jpg'}`, w: p.w, h: p.h });
      }
      const ffmpeg = await which('ffmpeg');
      if (!ffmpeg) return send(res, 501, { error: 'ffmpeg is not installed (brew install ffmpeg)' });
      let src = tmp, hdr = false;
      const first = await probe(tmp);
      if (!first.w) return send(res, 400, { error: 'that file has no video in it' });
      // iPhone footage is usually HDR (HLG). This ffmpeg cannot tone-map it, AVFoundation can: an H.264
      // export preset comes back SDR. If that fails the clip is still imported, flagged, a little flat.
      if (first.hdr) {
        try { await execFileP('/usr/bin/avconvert', ['--preset', 'Preset3840x2160', '--source', tmp, '--output', mid, '--replace']); src = mid; }
        catch { hdr = true; }
      }
      const out = join(dir, `${stem}.mp4`);
      await execFileP(ffmpeg, ['-y', '-loglevel', 'error', '-i', src, '-map', '0:v:0', '-map', '0:a:0?',
        '-vf', "scale=w='if(gt(iw,ih),trunc(min(1920,iw)/2)*2,-2)':h='if(gt(iw,ih),-2,trunc(min(1920,ih)/2)*2)',fps=30,format=yuv420p",
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-g', '15', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart', out], { maxBuffer: 1 << 26 });
      const p = await probe(out);
      await execFileP(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(Math.min(0.5, p.dur / 2)), '-i', out, '-frames:v', '1', '-vf', 'scale=-2:200', join(dir, `${stem}.jpg`)]).catch(() => {});
      return send(res, 200, { id: kid, type: 'video', src: `video/${stem}.mp4`, thumb: `video/${stem}.jpg`, w: p.w, h: p.h, dur: +p.dur.toFixed(3), audio: p.audio, ...(hdr ? { hdr: true } : {}) });
    } catch (e) {
      return send(res, 500, { error: String(e.stderr || e.message).trim().split('\n').pop() });
    } finally { await unlink(tmp).catch(() => {}); await unlink(mid).catch(() => {}); }
  }
  m = path.match(/^\/api\/sets\/([^/]+)\/clips\/([^/]+)\/([^/]+)$/);
  if (m && SET_ID.test(m[1]) && VIDEO_ID.test(m[2]) && CLIP_ID.test(m[3]) && req.method === 'DELETE') {
    const dir = join(SETS, m[1], 'video');
    for (const f of await readdir(dir).catch(() => [])) if (f.startsWith(`${m[2]}-${m[3]}.`)) await unlink(join(dir, f)).catch(() => {});
    return send(res, 204);
  }

  // One overlay, drawn by the page as a transparent 1080x1920 PNG so the type is the studio's own.
  m = path.match(/^\/api\/sets\/([^/]+)\/compose\/([^/]+)\/layer\/(\d+)$/);
  if (m && SET_ID.test(m[1]) && VIDEO_ID.test(m[2]) && req.method === 'POST') {
    const dir = join(LAYERS, m[1], m[2]);
    if (m[3] === '0') await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `layer-${m[3]}.png`), await readBody(req));
    return send(res, 200, { ok: true });
  }

  // The finished video: clips trimmed, framed and joined, overlays faded on and off at their times,
  // each clip's own sound at its own level with the song underneath.
  m = path.match(/^\/api\/sets\/([^/]+)\/compose\/([^/]+)$/);
  if (m && SET_ID.test(m[1]) && VIDEO_ID.test(m[2]) && req.method === 'POST') {
    const [, id, vid] = m;
    const set = JSON.parse(await readFile(join(SETS, id, 'set.json'), 'utf8'));
    const video = (set.videos || []).find(v => v.id === vid);
    if (!video) return send(res, 404, { error: 'no such video' });
    const ffmpeg = await which('ffmpeg');
    if (!ffmpeg) return send(res, 501, { error: 'ffmpeg is not installed (brew install ffmpeg)' });
    const { layers = [] } = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const clips = (video.clips || []).filter(c => c.src);
    if (!clips.length) return send(res, 400, { error: 'add a clip first' });
    const num = (v, d) => Number.isFinite(+v) ? +v : d, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    // Speed (0.5 to 4) shortens or stretches a clip in the video; the footage it draws on is still in..out.
    const speeds = clips.map(c => c.type === 'image' ? 1 : clamp(num(c.speed, 1), 0.5, 4));
    const lens = clips.map((c, i) => c.type === 'image' ? clamp(num(c.dur, 3), 0.5, 60) : Math.max(0.2, (num(c.out, c.dur) - num(c.in, 0)) / speeds[i]));
    const total = lens.reduce((a, b) => a + b, 0), T = total.toFixed(3);
    const args = ['-y', '-loglevel', 'error'], f = [];
    clips.forEach((c, i) => {
      const file = join(SETS, id, c.src);
      if (c.type === 'image') args.push('-loop', '1', '-framerate', '30', '-t', (lens[i] + 1).toFixed(3), '-i', file);
      else args.push('-ss', num(c.in, 0).toFixed(3), '-t', (lens[i] * speeds[i] + 0.5).toFixed(3), '-i', file);
      // Cover the 1080x1920 frame, then zoom and slide exactly as the page's object-position does.
      const [px, py] = String(c.pos || '50% 50%').split(/\s+/).map(v => clamp(parseFloat(v), 0, 100) / 100), zoom = clamp(num(c.zoom, 1), 1, 3);
      const k = Math.max(1080 / c.w, 1920 / c.h) * zoom, even = v => Math.ceil(v / 2) * 2;
      const W = Math.max(1080, even(c.w * k)), H = Math.max(1920, even(c.h * k));
      f.push(`[${i}:v]scale=${W}:${H},crop=1080:1920:${Math.round((W - 1080) * (px || 0))}:${Math.round((H - 1920) * (py || 0))},setsar=1,setpts=(PTS-STARTPTS)/${speeds[i]},fps=30,format=yuv420p,` +
        `tpad=stop_mode=clone:stop_duration=1,trim=0:${lens[i].toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
      const vol = c.mute ? 0 : clamp(num(c.volume, 1), 0, 2);
      f.push((c.type !== 'image' && c.audio && vol > 0 ? `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atempo=${speeds[i]},volume=${vol},apad,` : 'anullsrc=r=48000:cl=stereo,aformat=sample_fmts=fltp,')
        + `atrim=0:${lens[i].toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
    });
    f.push(clips.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${clips.length}:v=1:a=1[cv][ca]`);
    let last = 'cv', n = clips.length;
    const dir = join(LAYERS, id, vid), F = 0.25;
    for (const [j, l] of layers.entries()) {
      const from = clamp(num(l.from, 0), 0, total), to = clamp(num(l.to, total), 0, total);
      if (to - from < 0.1) continue;
      args.push('-loop', '1', '-framerate', '30', '-t', T, '-i', join(dir, `layer-${j}.png`));
      const fades = (from > 0.05 ? `,fade=t=in:st=${from.toFixed(3)}:d=${F}:alpha=1` : '') + (to < total - 0.05 ? `,fade=t=out:st=${(to - F).toFixed(3)}:d=${F}:alpha=1` : '');
      f.push(`[${n}:v]format=rgba${fades}[o${j}]`, `[${last}][o${j}]overlay=0:0:enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'[c${j}]`);
      last = `c${j}`; n++;
    }
    const music = video.music || {}, song = music.file ? join(SETS, id, music.file) : '';
    const hasSong = !!song && await stat(song).then(() => true, () => false);
    let audio = 'ca';
    if (hasSong) {
      args.push('-ss', String(Math.max(0, num(music.start, 0))), '-i', song);
      f.push(`[${n}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${clamp(num(music.volume, 0.6), 0, 2)},atrim=0:${T},afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(3)}:d=1.2,asetpts=PTS-STARTPTS[mu]`,
        '[ca][mu]amix=inputs=2:duration=first:normalize=0[mix]');
      audio = 'mix';
    }
    const outDir = join(EXPORTS, id, 'Videos'), out = join(outDir, `${cleanName(video.name || vid)}.mp4`);
    await mkdir(outDir, { recursive: true });
    args.push('-filter_complex', f.join(';'), '-map', `[${last}]`, '-map', `[${audio}]`, '-t', T, '-r', '30',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out);
    try { await execFileP(ffmpeg, args, { maxBuffer: 1 << 26 }); }
    catch (e) { return send(res, 500, { error: String(e.stderr || e.message).trim().split('\n').pop() }); }
    if (url.searchParams.get('reveal')) exec(`open -R "${out}"`);
    return send(res, 200, { path: out, seconds: +total.toFixed(1), song: hasSong });
  }

  m = path.match(/^\/api\/sets\/([^/]+)\/img\/([^/]+)$/);
  if (m && SET_ID.test(m[1]) && SLIDE_KEY.test(m[2])) {
    const [, id, key] = m;
    if (req.method === 'POST') {
      const ext = url.searchParams.get('ext') || 'jpg';
      if (!EXT.test(ext)) return send(res, 400, { error: 'bad ext' });
      const data = await readBody(req);
      await mkdir(join(SETS, id, 'img'), { recursive: true });
      await removeImages(id, key);
      if (ext === 'heic') {
        // HEIC straight from Photos: convert to a 2560px JPEG with macOS's own sips.
        const tmp = join(SETS, id, 'img', `${key}.upload.heic`);
        await writeFile(tmp, data);
        try { await execFileP('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', '-Z', '2560', tmp, '--out', join(SETS, id, 'img', `${key}.jpg`)]); }
        finally { await unlink(tmp).catch(() => {}); }
        return send(res, 200, { src: `img/${key}.jpg` });
      }
      await writeAtomic(join(SETS, id, 'img', `${key}.${ext}`), data);
      return send(res, 200, { src: `img/${key}.${ext}` });
    }
    if (req.method === 'DELETE') { await removeImages(id, key); return send(res, 204); }
  }
  return send(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  try {
    if (path.startsWith('/api/')) return await api(req, res, path, url);
    const file = normalize(join(ROOT, path === '/' ? 'studio.html' : path));
    if (!file.startsWith(ROOT + sep)) return send(res, 403, 'forbidden', 'text/plain');
    const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
    // Footage and songs are served in ranges: a <video> cannot seek through a file it was handed whole.
    if (/^(video|audio)\//.test(type)) {
      const size = (await stat(file)).size, r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      const start = r && r[1] ? +r[1] : r && r[2] ? Math.max(0, size - +r[2]) : 0, end = r && r[1] && r[2] ? Math.min(+r[2], size - 1) : size - 1;
      if (start > end || start >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
      res.writeHead(r ? 206 : 200, { 'content-type': type, 'content-length': end - start + 1, 'accept-ranges': 'bytes', 'cache-control': 'no-store',
        ...(r ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) });
      return createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
    }
    send(res, 200, await readFile(file), type);
  } catch (e) {
    send(res, e.code === 'ENOENT' ? 404 : 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const link = `http://localhost:${PORT}/`;
  console.log(`Slides Studio → ${link}`);
  if (!argv.includes('--no-open')) exec(`open ${link}`);
});
