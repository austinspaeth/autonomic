/* The celebration layer: a transparent, untouchable web view over the whole
 * app running tsParticles confetti (confetti.js.org), plus a hand-drawn
 * ribbon canvas for records, which the confetti bundle has no shape for.
 *
 * Each event has its own physics, so the kind of news reads across a room
 * with the sound off:
 *   return     random-direction bursts, every colour
 *   download   silver and white confetti drifting down like snow
 *   sale       "School Pride" in GOLD from both edges
 *   record     a big layered burst now and then, plus curling ribbons
 *
 * It is DECLARATIVE, not fire-and-forget: `setCelebrations(kinds)` says which
 * effects should be running, and each one runs for as long as it is listed.
 * The alerts store lists only the FRONT toast's kind, so one effect runs at
 * a time, for the card being read, and dismissing it hands over to the next
 * card's effect (stopping this one lets what is already in the air fall away).
 *
 * Two things that only bite on a real phone:
 *   - The confetti library is INLINED (confettiBundle.ts), never fetched. A
 *     CDN script that failed to load still let the page report ready, and
 *     every confetti() call then threw into the silent catch below.
 *   - The OS kills a web view's content process while the app sits in the
 *     background. The view goes blank, so termination remounts it, and the
 *     fresh page is told the current set the moment it reports ready.
 *   - Termination is not always REPORTED. So every return to the foreground
 *     asks the page to answer; no answer within ALIVE_MS remounts it.
 *
 * Toasts wait for the page (`whenCelebrationReady`): a toast whose confetti
 * cannot run yet is held until the page says ready, or READY_WAIT_MS at the
 * outside, so the two arrive together. The page only says ready once the
 * confetti library is actually defined; if it is not, the view is remounted.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { CONFETTI_JS } from './confettiBundle';

export type CelebrationKind = 'return' | 'download' | 'sale' | 'record';

let wanted: CelebrationKind[] = [];
const listeners = new Set<() => void>();

/* Whether the page is up with the library loaded, and who is waiting on it. */
let ready = false;
const waiting = new Set<() => void>();
const READY_WAIT_MS = 4000;
const ALIVE_MS = 1500;

function setReady(on: boolean) {
  ready = on;
  if (!on) return;
  const fns = [...waiting];
  waiting.clear();
  fns.forEach((fn) => fn());
}

/** Resolves once the confetti page is ready, or after READY_WAIT_MS regardless:
    a toast is never lost to a web view that will not come up. */
export function whenCelebrationReady(): Promise<void> {
  if (ready) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      waiting.delete(done);
      resolve();
    };
    const timer = setTimeout(done, READY_WAIT_MS);
    waiting.add(done);
  });
}

/** Run exactly these effects (and stop any others) until told otherwise. */
export function setCelebrations(kinds: CelebrationKind[]) {
  const next = [...new Set(kinds)].sort();
  if (next.join() === wanted.join()) return;
  wanted = next;
  listeners.forEach((fn) => fn());
}

const HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;width:100%;height:100%}
#ribbons{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}</style>
<script>${CONFETTI_JS}</script>
</head><body><canvas id="ribbons"></canvas><script>
var GOLD=['#FFD700','#FFC93C','#F5B700','#FFE680','#E6A800','#FFF4C2','#D4AF37'];
var SILVER=['#ffffff','#f4f5f7','#e3e5e8','#c0c0c0','#a8adb4','#d9dde3'];
var PARTY=['#ff3b30','#ff9500','#ffcc00','#34c759','#00c7be','#2563eb','#af52de','#ff2d55'];
function r(a,b){return Math.random()*(b-a)+a}
function c(o){try{return confetti(o)}catch(e){}}

/* Returning: a burst in every colour from a random spot, about once a second. */
function returning(){
  c({angle:r(55,125),spread:r(50,75),particleCount:Math.round(r(40,70)),origin:{x:r(.2,.8),y:r(.5,.7)},colors:PARTY,scalar:r(.9,1.15),ticks:220});
}

/* New install: silver and white snow, a flake or two every frame. */
function snow(){
  c({particleCount:1,startVelocity:0,ticks:Math.round(r(260,480)),origin:{x:Math.random(),y:Math.random()*.6-.2},
     colors:SILVER,shapes:['circle','square'],gravity:r(.4,.6),scalar:r(.5,1.15),drift:r(-.4,.4)});
}

/* Sale: School Pride in gold, from both edges. */
function sale(){
  c({particleCount:2,angle:60,spread:55,startVelocity:r(45,60),origin:{x:0,y:.7},colors:GOLD,shapes:['square','circle','star'],scalar:r(.9,1.3)});
  c({particleCount:2,angle:120,spread:55,startVelocity:r(45,60),origin:{x:1,y:.7},colors:GOLD,shapes:['square','circle','star'],scalar:r(.9,1.3)});
}

/* A record: the "realistic" layered burst, every few seconds, over ribbons. */
function burst(y){
  var o={origin:{y:y},colors:GOLD.concat(PARTY)};
  var s=[[.25,{spread:26,startVelocity:55}],[.2,{spread:60}],[.35,{spread:100,decay:.91,scalar:.8}],[.1,{spread:120,startVelocity:25,decay:.92,scalar:1.2}],[.1,{spread:120,startVelocity:45}]];
  s.forEach(function(p){c(Object.assign({},o,p[1],{particleCount:Math.floor(260*p[0])}))});
}

/* The one loop: each running effect emits on its own clock. Stopping an
   effect only stops the EMITTING; what is in the air finishes its fall. */
var ON={},LAST={},looping=false;
var EVERY={return:1100,record:3200};
function loop(now){
  var any=false;
  for(var k in ON){
    any=true;
    if(EVERY[k]){
      if(now-LAST[k]<EVERY[k])continue;
      LAST[k]=now;
    }
    if(k==='return')returning();
    else if(k==='download')snow();
    else if(k==='sale')sale();
    else if(k==='record')burst(r(.55,.75));
  }
  if(!any){looping=false;return}
  requestAnimationFrame(loop);
}
function start(k){
  ON[k]=true;LAST[k]=-1e9;
  if(k==='record')ribbonsOn(true);
  if(!looping){looping=true;requestAnimationFrame(loop)}
}
function stop(k){
  delete ON[k];
  if(k==='record')ribbonsOn(false);
}
window.sync=function(list){
  var want={};list.forEach(function(k){want[k]=1});
  Object.keys(ON).forEach(function(k){if(!want[k])stop(k)});
  list.forEach(function(k){if(!ON[k])start(k)});
};

/* Ribbons: long streamers falling and curling. Each is a strip of segments
   along a swaying path; its width follows cos(twist) so it seems to turn,
   and the back face is drawn lighter, which is what sells the curl. While
   they are on, one that falls off the bottom is replaced at the top; once
   off, the rest speed up and fall away. */
var cv=document.getElementById('ribbons'),ctx=cv.getContext('2d'),RB=[],rbOn=false,rbRun=false,RB_N=18;
function size(){var d=window.devicePixelRatio||1;cv.width=innerWidth*d;cv.height=innerHeight*d;ctx.setTransform(d,0,0,d,0,0)}
size();addEventListener('resize',size);
var RCOL=[['#FFD700','#FFF1A8'],['#2563eb','#8fb3ff'],['#ff2d55','#ff9fb4'],['#34c759','#a6efb8'],['#af52de','#dcb3f2'],['#ff9500','#ffd29a']];
function ribbon(spread){
  var col=RCOL[Math.floor(Math.random()*RCOL.length)];
  return {x:r(0,innerWidth),y:spread?r(-innerHeight*.9,-40):r(-260,-40),vy:r(1.6,3.2),sway:r(18,42),freq:r(.012,.03),
    phase:r(0,6.28),twist:r(0,6.28),spin:r(.05,.12),w:r(7,11),len:Math.round(r(16,26)),seg:r(7,10),front:col[0],back:col[1]};
}
function ribbonsOn(on){
  rbOn=on;
  if(!on)return;
  while(RB.length<RB_N)RB.push(ribbon(true));
  if(!rbRun){rbRun=true;requestAnimationFrame(tick)}
}
function tick(){
  ctx.clearRect(0,0,innerWidth,innerHeight);
  RB.forEach(function(b){
    b.y+=b.vy;b.phase+=.035;b.twist+=b.spin;
    var pts=[];
    for(var i=0;i<b.len;i++){
      var yy=b.y-i*b.seg;
      pts.push([b.x+Math.sin(b.phase+yy*b.freq)*b.sway, yy, Math.cos(b.twist+i*.32)]);
    }
    for(var i=0;i<pts.length-1;i++){
      var p=pts[i],q=pts[i+1],w1=b.w*p[2],w2=b.w*q[2];
      var dx=q[0]-p[0],dy=q[1]-p[1],L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;
      ctx.beginPath();
      ctx.moveTo(p[0]+nx*w1,p[1]+ny*w1);ctx.lineTo(q[0]+nx*w2,q[1]+ny*w2);
      ctx.lineTo(q[0]-nx*w2,q[1]-ny*w2);ctx.lineTo(p[0]-nx*w1,p[1]-ny*w1);ctx.closePath();
      ctx.globalAlpha=1-i/pts.length*.35;
      ctx.fillStyle=p[2]>=0?b.front:b.back;ctx.fill();
    }
  });
  ctx.globalAlpha=1;
  RB=RB.filter(function(b){return b.y-b.len*b.seg<innerHeight+40});
  if(rbOn){while(RB.length<RB_N)RB.push(ribbon(false))}
  else RB.forEach(function(b){b.vy*=1.02});
  if(!RB.length){rbRun=false;ctx.clearRect(0,0,innerWidth,innerHeight);return}
  requestAnimationFrame(tick);
}

function say(m){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(m)}
window.alive=function(){say(typeof confetti==='function'?'ready':'nolib')};
window.alive();
</script></body></html>`;

export function CelebrationLayer() {
  const web = useRef<WebView>(null);
  const [generation, setGeneration] = useState(0);
  const check = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);

  const push = () => {
    if (ready) web.current?.injectJavaScript(`window.sync && window.sync(${JSON.stringify(wanted)}); true;`);
  };

  /* The page is gone: wait for a fresh one to say ready, then tell it. */
  const restart = () => {
    if (check.current) clearTimeout(check.current);
    check.current = null;
    setReady(false);
    setGeneration((g) => g + 1);
  };

  useEffect(() => {
    listeners.add(push);
    /* Back in front: hold toasts until the page proves it is still alive. */
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      setReady(false);
      if (check.current) clearTimeout(check.current);
      check.current = setTimeout(restart, ALIVE_MS);
      web.current?.injectJavaScript('window.alive ? window.alive() : 0; true;');
    });
    return () => {
      listeners.delete(push);
      sub.remove();
      if (check.current) clearTimeout(check.current);
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <WebView
        key={generation}
        ref={web}
        source={{ html: HTML, baseUrl: 'https://autonomic.care/' }}
        originWhitelist={['*']}
        style={s.web}
        containerStyle={s.web}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        onContentProcessDidTerminate={restart}
        onRenderProcessGone={restart}
        onMessage={(e) => {
          const msg = e.nativeEvent.data;
          if (check.current) clearTimeout(check.current);
          check.current = null;
          if (msg === 'nolib') {
            // The inlined library did not define confetti(): try a fresh page
            // a few times rather than run a layer that can never draw.
            if (retries.current++ < 3) restart();
            return;
          }
          if (msg !== 'ready') return;
          retries.current = 0;
          setReady(true);
          push();
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
});
