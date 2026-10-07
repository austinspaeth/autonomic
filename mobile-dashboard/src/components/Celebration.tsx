/* The celebration layer: a transparent, untouchable web view over the whole
 * app running tsParticles confetti (confetti.js.org), plus a hand-drawn
 * ribbon canvas for records, which the confetti bundle has no shape for.
 *
 * Each event has its own physics, so the kind of news reads across a room
 * with the sound off:
 *   return     random-direction bursts, every colour, ~2s
 *   download   silver and white confetti drifting down for 5s
 *   sale       "School Pride" in GOLD from both edges for 10s
 *   record     a big layered burst plus curling ribbons
 *
 * Fire it from anywhere with `celebrate(kind)`; calls made before the page
 * has loaded are queued, never dropped.
 *
 * Two things that only bite on a real phone:
 *   - The confetti library is INLINED (confettiBundle.ts), never fetched. A
 *     CDN script that failed to load still let the page report ready, and
 *     every confetti() call then threw into the silent catch below.
 *   - The OS kills a web view's content process while the app sits in the
 *     background. The view goes blank but `ready` stayed true, so every later
 *     celebration was injected into a dead page. Termination now remounts it.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { CONFETTI_JS } from './confettiBundle';

export type CelebrationKind = 'return' | 'download' | 'sale' | 'record';

const listeners = new Set<(k: CelebrationKind) => void>();
export function celebrate(kind: CelebrationKind) {
  listeners.forEach((fn) => fn(kind));
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

/* Random direction: a handful of bursts in every colour. */
function returning(){
  for(var i=0;i<4;i++){(function(i){setTimeout(function(){
    c({angle:r(55,125),spread:r(50,75),particleCount:Math.round(r(45,85)),origin:{x:r(.2,.8),y:r(.5,.7)},colors:PARTY,scalar:r(.9,1.15),ticks:220});
  },i*260)})(i)}
}

/* New install: silver and white confetti drifting down like snow for five seconds. */
function snow(){
  var duration=5000,end=Date.now()+duration,skew=1;
  (function frame(){
    var left=end-Date.now(),ticks=Math.max(200,500*(left/duration));
    skew=Math.max(.8,skew-.001);
    c({particleCount:2,startVelocity:0,ticks:ticks,origin:{x:Math.random(),y:Math.random()*skew-.2},
       colors:SILVER,shapes:['circle','square'],gravity:r(.4,.6),scalar:r(.5,1.15),drift:r(-.4,.4)});
    if(left>0)requestAnimationFrame(frame);
  })();
}

/* School Pride in gold: both edges, ten seconds. */
function sale(){
  var end=Date.now()+10000;
  (function frame(){
    c({particleCount:3,angle:60,spread:55,startVelocity:r(45,60),origin:{x:0,y:.7},colors:GOLD,shapes:['square','circle','star'],scalar:r(.9,1.3)});
    c({particleCount:3,angle:120,spread:55,startVelocity:r(45,60),origin:{x:1,y:.7},colors:GOLD,shapes:['square','circle','star'],scalar:r(.9,1.3)});
    if(Date.now()<end)requestAnimationFrame(frame);
  })();
}

/* A record: the "realistic" layered burst, twice, plus ribbons. */
function record(){
  function burst(y){
    var o={origin:{y:y},colors:GOLD.concat(PARTY)};
    var s=[[.25,{spread:26,startVelocity:55}],[.2,{spread:60}],[.35,{spread:100,decay:.91,scalar:.8}],[.1,{spread:120,startVelocity:25,decay:.92,scalar:1.2}],[.1,{spread:120,startVelocity:45}]];
    s.forEach(function(p){c(Object.assign({},o,p[1],{particleCount:Math.floor(260*p[0])}))});
  }
  burst(.7); setTimeout(function(){burst(.55)},700); setTimeout(function(){burst(.75)},1500);
  ribbons(7000);
}

/* Ribbons: long streamers falling and curling. Each is a strip of segments
   along a swaying path; its width follows cos(twist) so it seems to turn,
   and the back face is drawn lighter, which is what sells the curl. */
var cv=document.getElementById('ribbons'),ctx=cv.getContext('2d'),RB=[],rbEnd=0,rbRun=false;
function size(){var d=window.devicePixelRatio||1;cv.width=innerWidth*d;cv.height=innerHeight*d;ctx.setTransform(d,0,0,d,0,0)}
size();addEventListener('resize',size);
var RCOL=[['#FFD700','#FFF1A8'],['#2563eb','#8fb3ff'],['#ff2d55','#ff9fb4'],['#34c759','#a6efb8'],['#af52de','#dcb3f2'],['#ff9500','#ffd29a']];
function ribbons(ms){
  rbEnd=Date.now()+ms;
  for(var i=0;i<18;i++){
    var col=RCOL[i%RCOL.length];
    RB.push({x:r(0,innerWidth),y:r(-innerHeight*.9,-40),vy:r(1.6,3.2),sway:r(18,42),freq:r(.012,.03),
      phase:r(0,6.28),twist:r(0,6.28),spin:r(.05,.12),w:r(7,11),len:Math.round(r(16,26)),seg:r(7,10),front:col[0],back:col[1]});
  }
  if(!rbRun){rbRun=true;requestAnimationFrame(tick)}
}
function tick(){
  ctx.clearRect(0,0,innerWidth,innerHeight);
  var now=Date.now(),fade=Math.max(0,Math.min(1,(rbEnd-now)/900+.15));
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
      ctx.globalAlpha=fade*(1-i/pts.length*.35);
      ctx.fillStyle=p[2]>=0?b.front:b.back;ctx.fill();
    }
  });
  ctx.globalAlpha=1;
  RB=RB.filter(function(b){return b.y-b.len*b.seg<innerHeight+40});
  if(now>rbEnd&&!RB.length){rbRun=false;ctx.clearRect(0,0,innerWidth,innerHeight);return}
  if(now>rbEnd){RB.forEach(function(b){b.vy*=1.02})}
  requestAnimationFrame(tick);
}

window.fire=function(k){
  if(k==='return')returning();
  else if(k==='download')snow();
  else if(k==='sale')sale();
  else if(k==='record')record();
};
window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('ready');
</script></body></html>`;

export function CelebrationLayer() {
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const queue = useRef<CelebrationKind[]>([]);
  const [generation, setGeneration] = useState(0);

  /* The page is gone: queue until a fresh one says ready. */
  const restart = () => {
    ready.current = false;
    setGeneration((g) => g + 1);
  };

  useEffect(() => {
    const fn = (k: CelebrationKind) => {
      if (!ready.current) {
        queue.current.push(k);
        return;
      }
      web.current?.injectJavaScript(`window.fire && window.fire(${JSON.stringify(k)}); true;`);
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
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
          if (e.nativeEvent.data !== 'ready') return;
          ready.current = true;
          queue.current.splice(0).forEach((k) => web.current?.injectJavaScript(`window.fire && window.fire(${JSON.stringify(k)}); true;`));
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
});
