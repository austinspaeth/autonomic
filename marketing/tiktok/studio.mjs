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
// A new set is a new folder with a set.json; the studio lists every set, newest first.
// Exports: ~/Downloads/Slides Studio/<set id>/<NN creative>/slide-N.png, plus <NN creative>.mp4 (needs ffmpeg).
//
// No dependencies. Binds to 127.0.0.1 only.
import http from 'node:http';
import { readFile, writeFile, readdir, mkdir, unlink, rename, stat } from 'node:fs/promises';
import { join, extname, dirname, normalize, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);

const ROOT = dirname(fileURLToPath(import.meta.url));
const SETS = join(ROOT, 'sets');
// Exports are build output, so they land outside the repo: one folder per set (named by its date-led id),
// one subfolder per creative.
const EXPORTS = join(homedir(), 'Downloads', 'Slides Studio');
const argv = process.argv.slice(2);
const PORT = +(argv[argv.indexOf('--port') + 1] || 0) || 4747;
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.aif': 'audio/aiff', '.aiff': 'audio/aiff',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.css': 'text/css' };
const SET_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
const SLIDE_KEY = /^c\d+s\d+$/;
const EXT = /^(jpg|png|webp|heic)$/;
const AUDIO_EXT = /^(mp3|m4a|aac|wav|aif|aiff)$/;
const FADE = 0.3;   // seconds of crossfade between slides in the MP4

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
const exportName = (ci, creative, set) => `${String(+ci + (Math.max(1, +set?.numberFrom || 1) - 1)).padStart(2, '0')} ${String(creative.name || creative.id).replace(/[\/\\:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()}`;
// ffmpeg lives in Homebrew's prefix, which a launchd/IDE PATH often lacks.
async function which(bin) {
  for (const d of [...(process.env.PATH || '').split(':'), '/opt/homebrew/bin', '/usr/local/bin']) {
    const p = join(d, bin); if (await stat(p).then(s => s.isFile(), () => false)) return p;
  }
  return '';
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
    return send(res, 200, { version: String(Math.floor((await stat(join(SETS, m[1], 'set.json'))).mtimeMs)) });
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
  m = path.match(/^\/api\/sets\/([^/]+)\/audio\/(c\d+)$/);
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
    send(res, 200, await readFile(file), TYPES[extname(file).toLowerCase()] || 'application/octet-stream');
  } catch (e) {
    send(res, e.code === 'ENOENT' ? 404 : 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const link = `http://localhost:${PORT}/`;
  console.log(`Slides Studio → ${link}`);
  if (!argv.includes('--no-open')) exec(`open ${link}`);
});
