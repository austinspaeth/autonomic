/* Composer: the studio's video view. Clips in a row, overlays on top, one song underneath, one MP4 out.

   Loaded after studio.html's own script and shares its globals (SET, save, toast, esc, rich, lockup, I, LS…).
   A set's videos live beside its creatives in set.json:

     videos: [{ id, name, title, caption,
       clips:    [{ id, type: video|image, src, thumb, name, w, h, dur, audio, in, out, pos, zoom, volume, mute }],
       overlays: [{ id, type: text|sig|lockup|image, text[], from, to, whole, x, y, w, size, align, plate, src }],
       music:    { file, fileName, start, volume } }]

   The preview is the real thing at a smaller scale: a 1080x1920 stage, the active clip under the overlays.
   Export sends each overlay to the server as a transparent PNG (so the type is exactly what is on screen)
   and ffmpeg does the rest. Footage lives in sets/<id>/video/, which is gitignored. */
(() => {
const root = document.getElementById('composer');
const CP = { vi: LS.get('cpVideo', 0), sel: null, t: 0, playing: false, media: [], seg: null, music: null, last: 0, raf: 0, busy: false };
const uid = p => p + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 1296).toString(36);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const videos = () => SET.videos || (SET.videos = []);
const cur = () => videos()[CP.vi] || null;
// A clip's speed (0.5 to 4, 1 = as shot) changes how long it lasts in the video, never which part of the footage it uses.
const speedOf = c => c.type === 'image' ? 1 : clamp(+c.speed || 1, 0.5, 4);
const clipLen = c => c.type === 'image' ? clamp(+c.dur || 3, 0.5, 60) : Math.max(0.2, ((c.out ?? c.dur) - (c.in || 0)) / speedOf(c));
const segs = v => { let s = 0; return v.clips.map(c => { const g = { c, start: s, len: clipLen(c) }; s += g.len; return g; }); };
const total = v => v.clips.reduce((n, c) => n + clipLen(c), 0);
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const sec = t => (+t).toFixed(1) + 's';
const range = (o, T) => o.whole ? [0, T] : [clamp(+o.from || 0, 0, T), clamp(+o.to || 0, 0, T)];
const PLAY_I = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
const PAUSE_I = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5"/></svg>';
const ARROW = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="${d === 'l' ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'}"/></svg>`;
const OV_NAME = { text: 'Text', sig: 'POTSDad tag', lockup: 'App lockup', image: 'Image', gradient: 'Gradient' };
// A gradient darkens part of the frame so words read over busy footage: the slides' scrim, for video.
// `where` is bottom | top | both | all; `strength` 0-100; `tint` a hex colour (the slide ink by default).
const GRAD_WHERE = { bottom: 'Bottom', top: 'Top', both: 'Top and bottom', all: 'All over' };
function gradCSS(o) {
  const t = /^#[0-9a-f]{6}$/i.test(o.tint || '') ? o.tint : '#0b0f10', rgb = [1, 3, 5].map(i => parseInt(t.slice(i, i + 2), 16)).join(',');
  const k = clamp(+(o.strength ?? 70), 0, 100) / 100, c = a => `rgba(${rgb},${(a * k).toFixed(3)})`;
  const bottom = `linear-gradient(180deg,${c(0)} 38%,${c(.62)} 64%,${c(1)} 100%)`, top = `linear-gradient(0deg,${c(0)} 38%,${c(.62)} 64%,${c(1)} 100%)`;
  return o.where === 'all' ? c(.85) : o.where === 'top' ? top : o.where === 'both' ? `${bottom},${top}` : bottom;
}
const sigText = () => (SET.style && SET.style.signature) || 'POTSDad';

/* ---------- overlays as markup: the stage and the export draw the same thing ---------- */
function ovHTML(o) {
  const at = `left:${Math.round(o.x || 0)}px;top:${Math.round(o.y || 0)}px;`, k = +o.size || 1;
  if (o.type === 'gradient') return `<div class="cv cv-grad" data-o="${o.id}" style="background:${gradCSS(o)}"></div>`;
  if (o.type === 'sig') return `<div class="cv cv-sig" data-o="${o.id}" style="${at}--fit:${k}"><span class="sig">${esc(sigText())}</span></div>`;
  if (o.type === 'lockup') return `<div class="cv cv-lockup" data-o="${o.id}" style="${at}transform:scale(${k})">${lockup()}</div>`;
  if (o.type === 'image') return `<div class="cv cv-image" data-o="${o.id}" style="${at}width:${Math.round((o.w || 420) * k)}px"><img src="${esc(resolve(o.src))}" alt=""></div>`;
  return `<div class="cv cv-text${o.plate ? ' plate' : ''}" data-o="${o.id}" style="${at}width:${Math.round(o.w || 794)}px;text-align:${o.align === 'center' ? 'center' : 'left'};--ts:${k}">`
    + (o.text || []).map(t => `<div class="p">${rich(t)}</div>`).join('') + '</div>';
}
const ovLabel = o => o.type === 'gradient' ? `Gradient · ${GRAD_WHERE[o.where] || 'Bottom'}` : o.type === 'text' ? (o.text || []).join(' ').replace(/\*/g, '') || 'Text' : o.type === 'sig' ? sigText() : OV_NAME[o.type];

/* ---------- playback ---------- */
const elOf = c => CP.media[cur().clips.indexOf(c)];
function locate(t) { const S = segs(cur()); return S.find(s => t < s.start + s.len) || S[S.length - 1] || null; }
function seek(t) {
  const v = cur(); if (!v) return;
  CP.t = clamp(t, 0, total(v));
  const g = CP.seg = locate(CP.t);
  CP.media.forEach((el, i) => {
    const on = !!g && v.clips[i] === g.c;
    el.style.visibility = on ? 'visible' : 'hidden';
    if (!on && el.tagName === 'VIDEO' && !el.paused) el.pause();
  });
  if (g) {
    const el = elOf(g.c);
    if (el.tagName === 'VIDEO') {
      const want = (g.c.in || 0) + clamp(CP.t - g.start, 0, g.len) * speedOf(g.c);
      if (Math.abs(el.currentTime - want) > 0.03) el.currentTime = want;
      if (CP.playing) el.play().catch(() => {});
    }
  }
  syncMusic(true); paint();
}
function syncMusic(force) {
  const a = CP.music, v = cur(); if (!a || !v) return;
  const want = (+v.music.start || 0) + CP.t;
  if (!CP.playing) { if (!a.paused) a.pause(); return; }
  if (force || Math.abs(a.currentTime - want) > 0.35) a.currentTime = want;
  if (a.paused) a.play().catch(() => {});
}
function advance(g) {
  const v = cur(), S = segs(v), i = S.findIndex(s => s.c === g.c);
  if (i < 0 || i === S.length - 1) { pause(); CP.t = total(v); paint(); return; }
  seek(S[i + 1].start + 0.001); CP.raf = requestAnimationFrame(tick);
}
function tick(now) {
  if (!CP.playing) return;
  const dt = (now - CP.last) / 1000; CP.last = now;
  const g = CP.seg; if (!g) return pause();
  const el = elOf(g.c);
  if (el.tagName === 'VIDEO') {
    const local = (el.currentTime - (g.c.in || 0)) / speedOf(g.c);
    if (el.ended || local >= g.len - 0.015) return advance(g);
    if (!el.seeking && el.readyState >= 2) CP.t = g.start + clamp(local, 0, g.len);
  } else { CP.t += dt; if (CP.t >= g.start + g.len) return advance(g); }
  syncMusic(false); paint();
  CP.raf = requestAnimationFrame(tick);
}
function play() {
  const v = cur(); if (!v || !v.clips.length) return;
  if (CP.t >= total(v) - 0.05) CP.t = 0;
  CP.playing = true; CP.last = performance.now(); seek(CP.t);
  cancelAnimationFrame(CP.raf); CP.raf = requestAnimationFrame(tick);
}
function pause() {
  CP.playing = false; cancelAnimationFrame(CP.raf);
  CP.media.forEach(el => { if (el.tagName === 'VIDEO' && !el.paused) el.pause(); });
  if (CP.music && !CP.music.paused) CP.music.pause();
  paint();
}
// Everything that follows the clock: the playhead, the readout, which overlays are up.
function paint() {
  const v = cur(); if (!v) return;
  const T = total(v), head = root.querySelector('.tl-headline'), time = root.querySelector('.cp-time'), btn = root.querySelector('.cp-play');
  if (head) head.style.left = (T ? CP.t / T * 100 : 0) + '%';
  if (time) time.textContent = `${fmt(CP.t)} / ${fmt(T)}`;
  if (btn) btn.innerHTML = CP.playing ? PAUSE_I : PLAY_I;
  (v.overlays || []).forEach(o => {
    const el = root.querySelector(`.cp-ov [data-o="${o.id}"]`); if (!el) return;
    const [a, b] = range(o, T);
    // An overlay being edited stays up wherever the playhead is, or it could not be placed.
    el.classList.toggle('off', !(CP.t >= a && CP.t < b || (!CP.playing && CP.sel?.id === o.id) || (!T && !CP.playing)));
  });
}

/* ---------- stage ---------- */
function applyClip(el, c) {
  const pos = c.pos || '50% 50%';
  el.style.objectPosition = pos; el.style.transformOrigin = pos; el.style.transform = `scale(${clamp(+c.zoom || 1, 1, 3)})`;
  if (el.tagName === 'VIDEO') { el.muted = !!c.mute || !c.audio; el.volume = clamp(c.volume ?? 1, 0, 1); el.playbackRate = speedOf(c); }
}
function drawMedia() {
  const v = cur(), box = root.querySelector('.cp-media'); if (!box) return;
  CP.media = v.clips.map(c => {
    const el = document.createElement(c.type === 'image' ? 'img' : 'video');
    if (c.type !== 'image') { el.preload = 'auto'; el.playsInline = true; }
    el.src = resolve(c.src); applyClip(el, c); return el;
  });
  box.replaceChildren(...CP.media);
  root.querySelector('.cp-none').hidden = !!v.clips.length;
  if (CP.music) CP.music.pause();
  CP.music = v.music?.file ? new Audio(resolve(v.music.file)) : null;
  if (CP.music) CP.music.volume = clamp(v.music.volume ?? 0.6, 0, 1);
}
function drawOverlays() {
  const v = cur(), box = root.querySelector('.cp-ov'); if (!box) return;
  box.innerHTML = (v.overlays || []).map(ovHTML).join('');
  box.querySelectorAll('.cv').forEach(el => {
    const o = v.overlays.find(x => x.id === el.dataset.o);
    el.classList.toggle('sel', CP.sel?.id === o.id);
    el.onpointerdown = e => {
      e.preventDefault(); select('ov', o.id);
      const node = root.querySelector(`.cp-ov [data-o="${o.id}"]`), k = root.querySelector('.cp-stage').getBoundingClientRect().width / 1080;
      const sx = e.clientX, sy = e.clientY, ox = o.x || 0, oy = o.y || 0;
      node.setPointerCapture(e.pointerId);
      node.onpointermove = m => { o.x = Math.round(ox + (m.clientX - sx) / k); o.y = Math.round(oy + (m.clientY - sy) / k); node.style.left = o.x + 'px'; node.style.top = o.y + 'px'; };
      node.onpointerup = () => { node.onpointermove = node.onpointerup = null; save(); };
    };
  });
  paint();
}

/* ---------- timeline ---------- */
// Neighbouring clips wear different tints (the studio's own teal, amber, violet and blue), so a cut is visible at a glance.
const CLIP_TINTS = ['48,197,176', '242,180,90', '167,139,250', '72,140,220'];
function removeClip(c) {
  const v = cur(); if (!c || !confirm(`Remove “${c.name || 'this clip'}” from the video? The original on your Mac is not touched.`)) return;
  v.clips.splice(v.clips.indexOf(c), 1); if (CP.sel?.id === c.id) CP.sel = null;
  fetch(`/api/sets/${SET_ID}/clips/${v.id}/${c.id}`, { method: 'DELETE' }).catch(() => {});
  structure();
}
// A clip's block shows the part of the footage that is IN the video: frames read from its own start to its own end,
// each drawn where it falls along the block. A single poster frame showed the first second of the file whatever the
// trim said, so a clip set to 12s-16s still looked as if it began at the beginning.
const STRIPS = new Map(), STRIP_OF = new Map(), READERS = new Map();
let stripTimer = 0, stripRun = 0;
function reader(src) {
  if (!READERS.has(src)) READERS.set(src, new Promise((ok, fail) => {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true;
    v.onloadeddata = () => ok(v); v.onerror = () => fail(new Error('unreadable clip')); v.src = resolve(src);
  }));
  return READERS.get(src);
}
async function strip(c, W, H, run) {
  const a = c.in || 0, b = c.out ?? c.dur, key = [c.src, a, b, W].join('|');
  if (STRIPS.has(key)) return STRIPS.get(key);
  const v = await reader(c.src), fw = H * c.w / c.h, n = Math.max(1, Math.ceil(W / fw));
  const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
  const g = cv.getContext('2d'); g.scale(2, 2);
  for (let i = 0; i < n; i++) {
    if (run !== stripRun) return null;   // the trim moved on while this was being read
    const t = clamp(a + Math.min(1, (i + 0.5) * fw / W) * (b - a), 0, Math.max(0, c.dur - 0.05));
    await new Promise(ok => { v.onseeked = ok; v.currentTime = t; if (Math.abs(v.currentTime - t) < 0.001 && !v.seeking) ok(); });
    g.drawImage(v, i * fw, 0, fw, H);
  }
  const url = cv.toDataURL('image/jpeg', 0.72); STRIPS.set(key, url); return url;
}
function drawStrips() {
  clearTimeout(stripTimer); const run = ++stripRun;
  // Until the frames are read, a block keeps the strip it last wore rather than flashing back to the poster.
  root.querySelectorAll('.tl-clip').forEach(el => { const u = STRIP_OF.get(el.dataset.k); if (u) { el.style.backgroundImage = `url(${u})`; el.style.backgroundSize = '100% 100%'; } });
  stripTimer = setTimeout(async () => {
    const v = cur(); if (!v) return;
    for (const c of v.clips) {
      if (c.type === 'image') continue;
      const el = root.querySelector(`.tl-clip[data-k="${c.id}"]`); if (!el) continue;
      const W = Math.max(8, Math.round(el.clientWidth)), url = await strip(c, W, 74, run).catch(() => null);
      if (run !== stripRun) return;
      if (!url) continue;
      STRIP_OF.set(c.id, url);
      const now = root.querySelector(`.tl-clip[data-k="${c.id}"]`); if (now) { now.style.backgroundImage = `url(${url})`; now.style.backgroundSize = '100% 100%'; }
    }
  }, 220);
}
function drawTimeline() {
  const v = cur(), tl = root.querySelector('.tl-inner'); if (!tl) return;
  const T = total(v), pct = t => (T ? t / T * 100 : 0) + '%';
  const step = T > 90 ? 10 : T > 40 ? 5 : T > 12 ? 2 : 1;
  let ticks = ''; for (let t = 0; t < T; t += step) ticks += `<i style="left:${pct(t)}">${t}s</i>`;
  tl.innerHTML = `<div class="tl-ruler">${ticks}</div>
    <div class="tl-clips">${v.clips.map((c, i) => `<div class="tl-clip${CP.sel?.id === c.id ? ' sel' : ''}" draggable="true" data-k="${c.id}" title="${esc(c.name || '')}"
        style="--tint:${CLIP_TINTS[i % CLIP_TINTS.length]};width:${pct(clipLen(c))};${c.thumb || c.type === 'image' ? `background-image:url('${resolve(c.thumb || c.src)}')` : ''}"><b>${esc(c.name || 'Clip')} · ${c.type === 'image' ? sec(clipLen(c)) : `${sec(c.in || 0)} to ${sec(c.out ?? c.dur)}${speedOf(c) !== 1 ? ` · ${+speedOf(c).toFixed(2)}×` : ''}`}</b><button class="tl-x" title="Remove this clip">×</button></div>`).join('')}
      ${v.clips.length ? '' : '<div class="tl-add" data-act="clips">Drop video clips or photos here, or click to choose</div>'}</div>
    <div class="tl-ovs">${(v.overlays || []).map(o => { const [a, b] = range(o, T); return `<div class="tl-ov"><div class="tl-barx${CP.sel?.id === o.id ? ' sel' : ''}" data-o="${o.id}"
        style="left:${pct(a)};width:${pct(Math.max(0, b - a))}">${esc(ovLabel(o))}</div></div>`; }).join('')}</div>
    <div class="tl-headline"></div>`;
  const xToT = x => { const r = tl.getBoundingClientRect(); return clamp((x - r.left) / r.width, 0, 1) * T; };
  const ruler = tl.querySelector('.tl-ruler');
  ruler.onpointerdown = e => { ruler.setPointerCapture(e.pointerId); seek(xToT(e.clientX)); ruler.onpointermove = m => seek(xToT(m.clientX)); ruler.onpointerup = () => { ruler.onpointermove = ruler.onpointerup = null; }; };
  tl.querySelectorAll('.tl-clip').forEach(el => {
    const id = el.dataset.k;
    el.querySelector('.tl-x').onclick = e => { e.stopPropagation(); removeClip(v.clips.find(c => c.id === id)); };
    el.onclick = () => { const g = segs(v).find(s => s.c.id === id); select('clip', id); if (g && !(CP.t >= g.start && CP.t < g.start + g.len)) seek(g.start); };
    el.ondragstart = e => { e.dataTransfer.setData('text/x-clip', id); e.dataTransfer.effectAllowed = 'move'; };
    el.ondragover = e => { if ([...e.dataTransfer.types].includes('text/x-clip')) { e.preventDefault(); e.stopPropagation(); el.classList.add('over'); } };
    el.ondragleave = () => el.classList.remove('over');
    el.ondrop = e => {
      const from = e.dataTransfer.getData('text/x-clip'); if (!from) return;
      e.preventDefault(); e.stopPropagation();
      const a = v.clips.findIndex(c => c.id === from), moved = v.clips.splice(a, 1)[0];
      v.clips.splice(v.clips.findIndex(c => c.id === id), 0, moved); structure();
    };
  });
  tl.querySelectorAll('.tl-barx').forEach(el => {
    const o = v.overlays.find(x => x.id === el.dataset.o);
    el.onpointerdown = e => {
      e.preventDefault(); select('ov', o.id);
      const bar = tl.querySelector(`.tl-barx[data-o="${o.id}"]`), r = bar.getBoundingClientRect(), w = tl.getBoundingClientRect().width;
      const mode = e.clientX - r.left < 8 ? 'l' : r.right - e.clientX < 8 ? 'r' : 'm', [a0, b0] = range(o, T), sx = e.clientX;
      bar.setPointerCapture(e.pointerId);
      bar.onpointermove = m => {
        const d = (m.clientX - sx) / w * T; if (Math.abs(m.clientX - sx) < 2) return;
        let a = a0, b = b0;
        if (mode === 'l') a = clamp(a0 + d, 0, b0 - 0.3); else if (mode === 'r') b = clamp(b0 + d, a0 + 0.3, T);
        else { a = clamp(a0 + d, 0, T - (b0 - a0)); b = a + (b0 - a0); }
        delete o.whole; o.from = +a.toFixed(2); o.to = +b.toFixed(2);
        bar.style.left = pct(o.from); bar.style.width = pct(o.to - o.from); paint(); syncFields();
      };
      bar.onpointerup = () => { bar.onpointermove = bar.onpointerup = null; save(); };
    };
  });
  const add = tl.querySelector('[data-act="clips"]'); if (add) add.onclick = pickClips;
  drawStrips(); paint();
}

/* ---------- inspector ---------- */
const slider = (label, key, min, max, step, val, show) => `<label class="cp-f"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${key}">${show}</output></label>`;
function drawInspector() {
  const v = cur(), box = root.querySelector('.cp-insp'); if (!box) return;
  const T = total(v), c = CP.sel?.kind === 'clip' && v.clips.find(x => x.id === CP.sel.id), o = CP.sel?.kind === 'ov' && (v.overlays || []).find(x => x.id === CP.sel.id);
  let html = '';
  if (c) {
    const [px, py] = String(c.pos || '50% 50%').split(/\s+/).map(parseFloat), i = v.clips.indexOf(c);
    html += `<div class="cp-card" data-card="clip"><h3>${c.type === 'image' ? 'Photo' : 'Clip'} <span>${esc(c.name || '')}</span>
        <button class="ib" data-act="left" title="Move earlier" ${i ? '' : 'disabled'}>${ARROW('l')}</button><button class="ib" data-act="right" title="Move later" ${i < v.clips.length - 1 ? '' : 'disabled'}>${ARROW('r')}</button>
        <button class="ib" data-act="remove" title="Remove from the video">${TRASH}</button></h3>
      ${c.type === 'image' ? slider('Length', 'dur', 0.5, 15, 0.1, clipLen(c), sec(clipLen(c)))
        : slider('Start', 'in', 0, c.dur, 0.05, c.in || 0, sec(c.in || 0)) + slider('End', 'out', 0, c.dur, 0.05, c.out ?? c.dur, sec(c.out ?? c.dur))
          + slider('Speed', 'speed', 0.5, 4, 0.05, speedOf(c), speedOf(c).toFixed(2) + '×')}
      ${slider('X', 'px', 0, 100, 1, px || 0, Math.round(px || 0))}${slider('Y', 'py', 0, 100, 1, py || 0, Math.round(py || 0))}${slider('Zoom', 'zoom', 1, 3, 0.01, c.zoom || 1, (c.zoom || 1).toFixed(2))}
      ${c.type === 'image' ? '' : c.audio ? slider('Volume', 'volume', 0, 1, 0.01, c.mute ? 0 : c.volume ?? 1, Math.round((c.mute ? 0 : c.volume ?? 1) * 100) + '%') : '<div class="cp-hint">This clip has no sound of its own.</div>'}
      ${c.hdr ? '<div class="cp-warn">This clip is HDR and could not be converted, so its colours may look a little flat.</div>' : ''}</div>`;
  } else if (o) {
    const [a, b] = range(o, T), whole = !!o.whole;
    html += `<div class="cp-card" data-card="ov"><h3>${OV_NAME[o.type]} <span></span><button class="ib" data-act="remove" title="Remove">${TRASH}</button></h3>
      ${o.type === 'text' ? `<label class="cp-f top"><span>Words</span><textarea data-k="text" spellcheck="false">${esc((o.text || []).join('\n'))}</textarea></label>
        <div class="cp-hint" style="margin:6px 0 12px 82px">One paragraph per line. *Asterisks* make a phrase teal.</div>` : ''}
      <div class="cp-f"><span>Shown</span><div class="seg"><button data-act="whole" class="${whole ? 'on' : ''}">Whole video</button><button data-act="part" class="${whole ? '' : 'on'}">Part of it</button></div></div>
      ${whole ? '' : slider('From', 'from', 0, Math.max(T, 0.5), 0.05, a, sec(a)) + slider('Until', 'to', 0, Math.max(T, 0.5), 0.05, b, sec(b))}
      ${o.type === 'gradient' ? `<div class="cp-f"><span>Where</span><div class="seg">${Object.entries(GRAD_WHERE).map(([k, n]) => `<button data-act="g-${k}" class="${(o.where || 'bottom') === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
        ${slider('Strength', 'strength', 0, 100, 1, o.strength ?? 70, (o.strength ?? 70) + '%')}
        <label class="cp-f"><span>Colour</span><input type="color" data-k="tint" value="${esc(o.tint || '#0b0f10')}"></label>`
        : slider('Size', 'size', 0.4, 2.5, 0.01, o.size || 1, (o.size || 1).toFixed(2))}
      ${o.type === 'text' ? slider('Width', 'w', 300, 1000, 2, o.w || 794, Math.round(o.w || 794))
        + `<div class="cp-f"><span>Align</span><div class="seg"><button data-act="al" class="${o.align === 'center' ? '' : 'on'}">Left</button><button data-act="ac" class="${o.align === 'center' ? 'on' : ''}">Centre</button></div></div>
           <div class="cp-f"><span>Backing</span><div class="seg"><button data-act="p0" class="${o.plate ? '' : 'on'}">Shadow</button><button data-act="p1" class="${o.plate ? 'on' : ''}">Dark plate</button></div></div>` : ''}
      <div class="cp-hint">${o.type === 'gradient' ? 'It sits under your words and tag. Drag its bar in the timeline to set when it shows.' : 'Drag it on the video to place it. Drag its bar in the timeline to set when it shows.'}</div></div>`;
  }
  const m = v.music || {};
  html += `<div class="cp-card" data-card="video"><h3>Video <span></span><button class="ib" data-act="delvideo" title="Delete this video">${TRASH}</button></h3>
      <label class="cp-f"><span>Name</span><input type="text" data-k="name" value="${esc(v.name || '')}"></label>
      <label class="cp-f"><span>Title</span><input type="text" data-k="title" value="${esc(v.title || '')}" placeholder="Bold line above the caption"></label>
      <label class="cp-f top"><span>Caption</span><textarea data-k="caption" style="min-height:66px">${esc(v.caption || '')}</textarea></label></div>
    <div class="cp-card" data-card="music"><h3>Song <span>${esc(m.fileName || '')}</span>${m.file ? `<button class="ib" data-act="unsong" title="Remove song">${TRASH}</button>` : ''}</h3>
      ${m.file ? slider('Start at', 'start', 0, 240, 1, m.start || 0, (m.start || 0) + 's') + slider('Volume', 'mvol', 0, 1, 0.01, m.volume ?? 0.6, Math.round((m.volume ?? 0.6) * 100) + '%')
        : '<div class="s-song" data-act="song" style="margin-top:0"><b>Drop the song here</b> or click to choose. It plays under the whole video, beneath each clip\'s own sound.</div>'}</div>`;
  box.innerHTML = html;
  wireInspector(box, v, c, o);
}
// Sliders update the model and the one thing they change; the inspector itself is not rebuilt mid-drag.
function syncFields() {
  const v = cur(), o = CP.sel?.kind === 'ov' && (v.overlays || []).find(x => x.id === CP.sel.id); if (!o || o.whole) return;
  for (const k of ['from', 'to']) { const i = root.querySelector(`[data-card="ov"] [data-k="${k}"]`), out = root.querySelector(`[data-card="ov"] [data-o="${k}"]`); if (i) i.value = o[k]; if (out) out.textContent = sec(o[k]); }
}
function wireInspector(box, v, c, o) {
  const out = (card, k, text) => { const n = box.querySelector(`[data-card="${card}"] [data-o="${k}"]`); if (n) n.textContent = text; };
  const on = (card, fn) => box.querySelectorAll(`[data-card="${card}"] [data-k]`).forEach(i => i.oninput = () => { fn(i.dataset.k, i.type === 'range' ? +i.value : i.value, i); save(); });
  const act = (card, fn) => box.querySelectorAll(`[data-card="${card}"] [data-act]`).forEach(b => b.onclick = () => fn(b.dataset.act));
  if (c) {
    on('clip', (k, val, input) => {
      const g = () => segs(v).find(s => s.c === c);
      if (k === 'in') { c.in = +Math.min(val, (c.out ?? c.dur) - 0.2).toFixed(2); input.value = c.in; out('clip', k, sec(c.in)); drawTimeline(); seek(g().start); }
      else if (k === 'out') { c.out = +Math.max(val, (c.in || 0) + 0.2).toFixed(2); input.value = c.out; out('clip', k, sec(c.out)); drawTimeline(); seek(g().start + g().len - 0.04); }
      else if (k === 'dur') { c.dur = val; out('clip', k, sec(val)); drawTimeline(); }
      else if (k === 'speed') { if (val === 1) delete c.speed; else c.speed = val; out('clip', k, val.toFixed(2) + '×'); applyClip(elOf(c), c); drawTimeline(); seek(g().start); }
      else if (k === 'volume') { c.volume = val; c.mute = val === 0; if (!c.mute) delete c.mute; out('clip', k, Math.round(val * 100) + '%'); applyClip(elOf(c), c); }
      else {
        const [px, py] = String(c.pos || '50% 50%').split(/\s+/).map(parseFloat);
        if (k === 'zoom') { if (val > 1) c.zoom = val; else delete c.zoom; out('clip', k, val.toFixed(2)); }
        else { c.pos = k === 'px' ? `${val}% ${py || 0}%` : `${px || 0}% ${val}%`; out('clip', k, Math.round(val)); }
        applyClip(elOf(c), c);
      }
    });
    act('clip', a => {
      const i = v.clips.indexOf(c);
      if (a === 'remove') return removeClip(c);
      else { const j = a === 'left' ? i - 1 : i + 1; if (j < 0 || j >= v.clips.length) return; v.clips.splice(i, 1); v.clips.splice(j, 0, c); }
      structure();
    });
  }
  if (o) {
    const T = total(v);
    on('ov', (k, val) => {
      if (k === 'text') { o.text = val.split('\n').map(s => s.trim()).filter(Boolean); drawOverlays(); drawTimeline(); return; }
      if (k === 'from') { o.from = +Math.min(val, (o.to ?? T) - 0.3).toFixed(2); out('ov', k, sec(o.from)); drawTimeline(); seek(o.from); return; }
      if (k === 'to') { o.to = +Math.max(val, (o.from || 0) + 0.3).toFixed(2); out('ov', k, sec(o.to)); drawTimeline(); seek(Math.max(0, o.to - 0.05)); return; }
      if (k === 'tint') { o.tint = val; drawOverlays(); return; }
      if (k === 'strength') { o.strength = val; out('ov', k, val + '%'); drawOverlays(); return; }
      o[k] = val; out('ov', k, k === 'w' ? Math.round(val) : val.toFixed(2)); drawOverlays();
    });
    act('ov', a => {
      if (a === 'remove') {
        v.overlays.splice(v.overlays.indexOf(o), 1); CP.sel = null;
        if (o.clip) fetch(`/api/sets/${SET_ID}/clips/${v.id}/${o.clip}`, { method: 'DELETE' }).catch(() => {});
      }
      else if (a === 'whole') { o.whole = true; }
      else if (a === 'part') { delete o.whole; o.from = +clamp(CP.t, 0, Math.max(0, T - 0.5)).toFixed(2); o.to = +Math.min(T || 3, o.from + 3).toFixed(2); }
      else if (a.startsWith('g-')) o.where = a.slice(2);
      else if (a === 'al') delete o.align; else if (a === 'ac') o.align = 'center';
      else if (a === 'p0') delete o.plate; else if (a === 'p1') o.plate = true;
      save(); drawOverlays(); drawTimeline(); drawInspector();
    });
  }
  on('video', (k, val) => { v[k] = val; if (k === 'name') { const tab = root.querySelector('.cp-tab.on'); if (tab) tab.textContent = val || 'Untitled'; } });
  act('video', async a => {
    if (a !== 'delvideo' || !confirm(`Delete “${v.name || 'this video'}” and its imported clips? The footage on your Mac is not touched.`)) return;
    pause();
    for (const c of v.clips) await fetch(`/api/sets/${SET_ID}/clips/${v.id}/${c.id}`, { method: 'DELETE' }).catch(() => {});
    if (v.music?.file) await fetch(`/api/sets/${SET_ID}/audio/${v.id}`, { method: 'DELETE' }).catch(() => {});
    videos().splice(CP.vi, 1); CP.vi = Math.max(0, CP.vi - 1); CP.sel = null; CP.t = 0; save(); renderComposer();
  });
  on('music', (k, val) => {
    const m = v.music;
    if (k === 'start') { if (val) m.start = val; else delete m.start; out('music', k, val + 's'); syncMusic(true); }
    else { m.volume = val; out('music', 'mvol', Math.round(val * 100) + '%'); if (CP.music) CP.music.volume = clamp(val, 0, 1); }
  });
  act('music', async a => {
    if (a === 'song') return pickFiles('audio/*,.mp3,.m4a,.wav,.aif,.aiff', false, f => takeSong(f[0]));
    if (a === 'unsong') { pause(); await fetch(`/api/sets/${SET_ID}/audio/${v.id}`, { method: 'DELETE' }).catch(() => {}); delete v.music; save(); drawMedia(); seek(CP.t); drawInspector(); }
  });
  const drop = box.querySelector('[data-act="song"]');
  if (drop) {
    drop.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('drag'); root.classList.remove('dragging'); takeSong(e.dataTransfer.files[0]); });
  }
}
function select(kind, id) {
  if (CP.sel?.kind === kind && CP.sel.id === id) return;
  CP.sel = { kind, id };
  root.querySelectorAll('.cv, .tl-barx, .tl-clip').forEach(n => n.classList.toggle('sel', (n.dataset.o || n.dataset.k) === id));
  drawInspector(); paint();
}
// The clip list changed shape (added, removed, reordered): rebuild what depends on it and stay where we were.
function structure() { const t = CP.t; pause(); save(); drawMedia(); drawOverlays(); drawTimeline(); drawInspector(); seek(Math.min(t, total(cur()))); }

/* ---------- files ---------- */
function pickFiles(accept, multiple, then) {
  const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple;
  i.onchange = () => { if (i.files.length) then([...i.files]); }; i.click();
}
const pickClips = () => pickFiles('video/*,image/*,.mov,.mp4,.m4v,.heic', true, takeClips);
const isVideoFile = f => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm|mkv|avi)$/i.test(f.name);
const isImageFile = f => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name);
async function upload(v, file) {
  let body = file, ext = (file.name.split('.').pop() || '').toLowerCase();
  // Photos are downsized and turned upright in the page, as slides do; HEIC goes up as it is and the server converts it.
  if (!isVideoFile(file)) { try { ({ blob: body, ext } = await prepare(file)); } catch { ext = 'heic'; } }
  const r = await fetch(`/api/sets/${SET_ID}/clips/${v.id}?ext=${ext}`, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'server said ' + r.status);
  return j;
}
// Dragging out of the Photos app hands a browser a small preview JPEG, never the video (or the full photo) itself.
// It looks like a successful drop, so it is caught here and the two routes that do work are named.
const PHOTOS_DRAG = 'Photos only gave the browser a small preview of that, not the real file. Click <b>Add clips</b> and choose <b>Photos</b> in the sidebar of the file window, or export it from Photos and drag it in from Finder.';
async function isPreview(f) {
  if (isVideoFile(f)) return false;
  try { const b = await createImageBitmap(f); return Math.max(b.width, b.height) < 900; } catch { return false; }
}
async function takeClips(files) {
  const v = cur(); if (!v || CP.busy) return;
  files = files.filter(f => isVideoFile(f) || isImageFile(f));
  if (!files.length) return toast('Drop video clips or photos', 4000);
  const real = [];
  for (const f of files) if (!await isPreview(f)) real.push(f);
  if (real.length < files.length) { toast(PHOTOS_DRAG, 15000); if (!real.length) return; }
  files = real;
  CP.busy = true;
  try {
    for (const [i, f] of files.entries()) {
      toast(`Importing ${files.length > 1 ? `${i + 1} of ${files.length}: ` : ''}<b>${esc(f.name)}</b>… a long clip can take a minute.`, 600000);
      const j = await upload(v, f), name = f.name.replace(/\.[^.]+$/, '');
      v.clips.push(j.type === 'image' ? { ...j, name, dur: 3 } : { ...j, name, in: 0, out: j.dur });
      CP.sel = { kind: 'clip', id: j.id };
      structure();
    }
    toast(`Added ${files.length} ${files.length > 1 ? 'clips' : 'clip'}`);
  } catch (e) { toast('Could not import that: ' + esc(e.message), 9000); }
  finally { CP.busy = false; }
}
async function takeSong(file) {
  const v = cur(); if (!file || !v) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!/^(mp3|m4a|aac|wav|aif|aiff)$/.test(ext)) return toast('Use an MP3, M4A, WAV or AIFF file');
  toast('Uploading song…', 20000);
  const r = await fetch(`/api/sets/${SET_ID}/audio/${v.id}?ext=${ext}`, { method: 'POST', body: file });
  if (!r.ok) return toast('Could not save the song (' + r.status + ')');
  v.music = { file: (await r.json()).src, fileName: file.name, volume: v.music?.volume ?? 0.6 };
  save(); drawMedia(); seek(CP.t); drawInspector(); toast('Song added. It plays under the whole video.');
}
function addOverlay(type) {
  const v = cur(), T = total(v), id = uid('o'); v.overlays = v.overlays || [];
  const from = +clamp(CP.t, 0, Math.max(0, T - 0.5)).toFixed(2), part = { from, to: +Math.min(T || 3, from + 3).toFixed(2) };
  // A gradient goes to the front of the list, which is the bottom of the stack: under every word and tag.
  if (type === 'gradient') v.overlays.unshift({ id, type, whole: true, where: 'bottom', strength: 70 });
  else if (type === 'sig') v.overlays.push({ id, type, whole: true, x: 86, y: 380, size: 1 });
  else if (type === 'lockup') v.overlays.push({ id, type, ...(T ? { from: +Math.max(0, T - 3).toFixed(2), to: +T.toFixed(2) } : { whole: true }), x: 86, y: 1130, size: 1 });
  else if (type === 'text') v.overlays.push({ id, type, text: ['Your words here'], ...part, x: 86, y: 820, w: 794, size: 1 });
  CP.sel = { kind: 'ov', id }; save(); drawOverlays(); drawTimeline(); drawInspector();
  if (type === 'text') root.querySelector('[data-card="ov"] textarea')?.select();
}
function addImageOverlay() {
  pickFiles('image/*', false, async files => {
    const v = cur();
    try {
      toast('Adding image…', 20000);
      const j = await upload(v, files[0]); v.overlays = v.overlays || [];
      const id = uid('o'); v.overlays.push({ id, type: 'image', src: j.src, clip: j.id, whole: true, x: 86, y: 380, w: Math.min(420, j.w), size: 1 });
      CP.sel = { kind: 'ov', id }; save(); drawOverlays(); drawTimeline(); drawInspector(); toast('Image added');
    } catch (e) { toast('Could not add that image: ' + esc(e.message), 7000); }
  });
}

/* ---------- export ---------- */
async function layerPNG(o) {
  const stage = document.getElementById('stage'), wrap = document.createElement('div');
  wrap.className = 'slide cp-export'; wrap.innerHTML = ovHTML(o);
  stage.replaceChildren(wrap);
  await Promise.all([...wrap.querySelectorAll('img')].map(i => i.decode().catch(() => {})));
  try {
    const canvas = await html2canvas(wrap, { width: 1080, height: 1920, scale: 1, useCORS: true, backgroundColor: null, logging: false, scrollX: 0, scrollY: 0, windowWidth: 1080, windowHeight: 1920 });
    return await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('empty canvas')), 'image/png'));
  } finally { stage.replaceChildren(); }
}
async function exportVideo() {
  const v = cur(); if (!v || CP.busy) return;
  if (!v.clips.length) return toast('Add a clip first');
  if (!window.html2canvas) return toast('html2canvas did not load (offline?), so the overlays cannot be drawn.', 7000);
  CP.busy = true; pause();
  try {
    const T = total(v), layers = (v.overlays || []).map(o => ({ o, r: range(o, T) })).filter(l => l.r[1] - l.r[0] >= 0.1);
    await document.fonts.ready; await flushSave();
    for (const [i, l] of layers.entries()) {
      toast(`Drawing overlay ${i + 1} of ${layers.length}…`, 60000);
      const r = await fetch(`/api/sets/${SET_ID}/compose/${v.id}/layer/${i}`, { method: 'POST', body: await layerPNG(l.o) });
      if (!r.ok) throw new Error('could not store an overlay (' + r.status + ')');
    }
    toast(`Rendering <b>${esc(v.name || 'video')}</b> (${fmt(T)})… this takes about as long as the video is.`, 1800000);
    const r = await fetch(`/api/sets/${SET_ID}/compose/${v.id}?reveal=1`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ layers: layers.map(l => ({ from: l.r[0], to: l.r[1] })) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'render failed (' + r.status + ')');
    toast(`Saved to <b>${esc(j.path.replace(/^.*\/com~apple~CloudDocs\//, 'iCloud Drive/'))}</b>` + (j.song ? '' : '<br>No song on this one: drop one on the Song card.'), 9000);
  } catch (e) { toast('Export failed: ' + esc(e.message), 12000); }
  finally { CP.busy = false; }
}

/* ---------- the view ---------- */
function newVideo() {
  const vs = videos(), id = uid('v');
  vs.push({ id, name: `Video ${vs.length + 1}`, title: '', caption: '', clips: [], overlays: [{ id: uid('o'), type: 'sig', whole: true, x: 86, y: 380, size: 1 }] });
  CP.vi = vs.length - 1; CP.sel = null; CP.t = 0; LS.set('cpVideo', CP.vi); save(); renderComposer();
}
function renderComposer(keep) {
  if (!document.body.classList.contains('view-composer') || !SET) return;
  pause();
  const vs = videos(); CP.vi = clamp(CP.vi, 0, Math.max(0, vs.length - 1));
  const v = cur();
  if (!keep) { CP.sel = null; CP.t = 0; }
  root.innerHTML = `<header class="hero"><div class="h-k">${esc(fmtDate(SET.created))} · ${esc(SET.name)}</div><h1>Composer</h1>
      <p>Join clips and photos into one video, put your tag and words on top, and lay a song under all of it.</p></header>`
    + (vs.length ? `<div class="cp-tabs">${vs.map((x, i) => `<button class="cp-tab${i === CP.vi ? ' on' : ''}" data-vi="${i}">${esc(x.name || 'Untitled')}</button>`).join('')}
      <button class="ghost" data-act="new">New video</button></div>` : '')
    + (v ? `<div class="cp-body">
      <div class="cp-left"><div class="cp-stage-box"><div class="slide cp-stage"><div class="cp-media"></div>
          <div class="cp-none">Drop video clips or photos here to start</div><div class="cp-ov"></div><div class="guides"><div class="g-safe"></div></div></div>
          <div class="cp-drop">Drop to add to the video</div></div>
        <div class="cp-transport"><button class="cp-play" title="Play or pause (space)">${PLAY_I}</button><span class="cp-time"></span>
          <label class="sw${document.body.classList.contains('guides-on') ? ' on' : ''}" data-act="guides"><i></i>Safe zones</label></div></div>
      <div class="cp-insp"></div></div>
    <div class="cp-tl"><div class="tl-bar"><button class="ghost" data-act="clips">${I.image}Add clips</button><button class="ghost" data-act="text">Add text</button>
        <button class="ghost" data-act="sig">Add ${esc(sigText())} tag</button><button class="ghost" data-act="lockup">Add app lockup</button><button class="ghost" data-act="image">Add image</button><button class="ghost" data-act="gradient">Add gradient</button>
        <span class="spacer"></span><button class="cta" data-act="export">${I.download}Export video</button></div>
      <div class="tl-inner"></div><div class="tl-note">Click a clip to set where it starts and ends, and to frame it. Drag clips to reorder them. Space plays and pauses.<br>
        Bringing footage from the Photos app: use Add clips and choose Photos in the file window's sidebar. Dragging straight out of Photos only hands over a small preview.</div></div>`
    : `<div class="cp-empty"><b>No videos in this set yet</b>A video is a row of clips with your tag, your words and one song. Footage you add is copied into the set's video folder, which stays out of git.
        <button class="cta" data-act="new">New video</button></div>`);
  root.querySelectorAll('.cp-tab').forEach(b => b.onclick = () => { CP.vi = +b.dataset.vi; LS.set('cpVideo', CP.vi); renderComposer(); });
  const acts = { new: newVideo, clips: pickClips, text: () => addOverlay('text'), sig: () => addOverlay('sig'), lockup: () => addOverlay('lockup'), image: addImageOverlay, gradient: () => addOverlay('gradient'), export: exportVideo,
    guides: () => document.getElementById('swGuides').click() };
  root.querySelectorAll('.cp-tabs [data-act], .tl-bar [data-act], .cp-empty [data-act], .cp-transport [data-act]').forEach(b => b.onclick = e => { e.preventDefault(); acts[b.dataset.act](); if (b.dataset.act === 'guides') b.classList.toggle('on', document.body.classList.contains('guides-on')); });
  if (!v) return;
  root.querySelector('.cp-play').onclick = () => CP.playing ? pause() : play();
  root.querySelector('.cp-stage').onpointerdown = e => { if (!e.target.closest('.cv') && CP.sel) { CP.sel = null; drawOverlays(); drawTimeline(); drawInspector(); } };
  drawMedia(); drawOverlays(); drawTimeline(); drawInspector(); seek(Math.min(CP.t, total(v)));
}
// Files dropped anywhere on the view join the video (a song dropped on the Song card is taken there instead).
const dragsFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
root.addEventListener('dragover', e => { if (dragsFiles(e)) { e.preventDefault(); root.classList.add('dragging'); } });
root.addEventListener('dragleave', e => { if (!root.contains(e.relatedTarget)) root.classList.remove('dragging'); });
root.addEventListener('drop', e => {
  if (!dragsFiles(e)) return;
  e.preventDefault(); root.classList.remove('dragging');
  const files = [...e.dataTransfer.files], song = files.find(f => f.type.startsWith('audio/'));
  if (song && files.length === 1) return takeSong(song);
  if (cur()) takeClips(files);
});
window.addEventListener('resize', () => { if (document.body.classList.contains('view-composer')) { drawStrips(); paint(); } });

window.renderComposer = renderComposer;
window.pauseComposer = pause;
window.composerKey = e => {
  if (e.key === ' ') { e.preventDefault(); CP.playing ? pause() : play(); }
  else if ((e.key === 'Backspace' || e.key === 'Delete') && CP.sel?.kind === 'ov') root.querySelector(`[data-card="${CP.sel.kind}"] [data-act="remove"]`)?.click();
  else if (e.key === 'ArrowLeft') seek(CP.t - (e.shiftKey ? 1 : 0.1));
  else if (e.key === 'ArrowRight') seek(CP.t + (e.shiftKey ? 1 : 0.1));
};
renderComposer();
})();
