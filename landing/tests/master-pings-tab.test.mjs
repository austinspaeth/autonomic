/* The Pings tab — the counter with nothing done to it — plus the two things
   that had to survive the trial/wall collapse: a legacy settings record must
   migrate off the old seven-day trial, and the Compare platform option must be
   gone from the filter bar.

   Runs against the BUILT page, like the other master tests, because the view
   only exists once the route has inlined body.html and the scripts in order. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const PAGE = new URL('../build/master/index.html', import.meta.url).pathname;
if (!fs.existsSync(PAGE)) { console.error('No built page — run `npm run build` first.'); process.exit(1); }
const pad = (n) => (n < 10 ? '0' + n : '' + n);
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const T = (b) => { const d = new Date(); d.setDate(d.getDate() - b); return iso(d); };
const cd = (c) => c.slice(5,7)+c.slice(8,10)+c.slice(2,4);
const openRows = [
  { day: T(1), total: 5, cohorts: [
      { key: cd(T(10))+'I', cohortDate: cd(T(10)), cohort: T(10), platform: 'I', method: null, count: 3 },
      { key: cd(T(1))+'A',  cohortDate: cd(T(1)),  cohort: T(1),  platform: 'A', method: null, count: 2 } ] },
  { day: T(0), total: 4, cohorts: [
      { key: cd(T(0))+'I', cohortDate: cd(T(0)), cohort: T(0), platform: 'I', method: null, count: 4 } ] },
];
const subRows = [{ day: T(0), total: 1, cohorts: [{ key: cd(T(10))+'I', cohortDate: cd(T(10)), cohort: T(10), platform: 'I', method: null, count: 1 }] }];
const actRows = [{ day: T(0), total: 2, cohorts: [{ key: cd(T(0))+'IB', cohortDate: cd(T(0)), cohort: T(0), platform: 'I', method: 'B', count: 2 }] }];
/* The daily reading route. It carries NO sensor letter — once a day could only
   ever name whichever reading came first — so its rows must render a dash in
   the Sensor column rather than inventing one. */
const hrvRows = [{ day: T(0), total: 3, cohorts: [{ key: cd(T(10))+'I', cohortDate: cd(T(10)), cohort: T(10), platform: 'I', method: null, count: 3 }] }];
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = [b64u({alg:'RS256'}), b64u({email:'austinspaeth@msn.com', exp: Math.floor(Date.now()/1000)+3600}), 'sig'].join('.');
const dom = new JSDOM(fs.readFileSync(PAGE,'utf8'), { url:'https://autonomic.care/master/', runScripts:'dangerously', pretendToBeVisual:true });
const { window } = dom;
window.scrollTo = () => {}; window.Element.prototype.scrollIntoView = () => {};
window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target']||'').split('.').pop();
  const reply = (o) => Promise.resolve({ ok:true, status:200, text:()=>Promise.resolve(JSON.stringify(o)) });
  if (target==='InitiateAuth') return reply({Session:'s1',ChallengeName:'CUSTOM_CHALLENGE',ChallengeParameters:{USERNAME:'austinspaeth@msn.com'}});
  if (target==='RespondToAuthChallenge') return reply({AuthenticationResult:{IdToken:idToken,AccessToken:'at',RefreshToken:'rt'}});
  // A LEGACY settings record: the old two-boundary build's 7-day trial.
  if (body.action==='LOAD') return reply({ entries:[{date:T(4),platform:'ios',downloads:20,impressions:1000,pageViews:100,sales:1}], events:[], settings:{trialDays:7,wallDays:14,currency:'$'}, ui:{view:'overview'} });
  if (body.action==='PINGS') return reply({ open:openRows, sub:subRows, act:actRows, hrv:hrvRows });
  return reply({ok:true});
};
const errors=[]; window.addEventListener('error',(e)=>errors.push(String(e.error||e.message)));
await new Promise(r=>window.addEventListener('load',r));
await new Promise(r=>setTimeout(r,200));
const $ = (id)=>window.document.getElementById(id);
$('gateEmail').value='austinspaeth@msn.com'; $('gateSubmit').click();
await new Promise(r=>setTimeout(r,150));
[...$('gateCodeRow').querySelectorAll('input')].forEach((el,i)=>{el.value='1234'[i];el.dispatchEvent(new window.Event('input',{bubbles:true}));});
await new Promise(r=>setTimeout(r,400));
const out=[];
const ok=(n,c,d)=>out.push((c?'  ok    ':'  FAIL  ')+n+(c?'':'   <- '+d));
// migration
ok('legacy trialDays:7 migrated to 14', /14/.test($('fTrial').value), $('fTrial').value);
ok('obsolete wallDays field is gone from the DOM', $('fWall')===null, 'fWall still present');
ok('Compare button removed', window.document.querySelector('#fPlatform [data-v="compare"]')===null, 'still there');
// pings tab
const tab=[...window.document.querySelectorAll('.tab')].find(t=>t.dataset.view==='pings');
ok('Pings tab exists and is last', !!tab && [...window.document.querySelectorAll('.tab')].pop()===tab, 'missing/not last');
tab.click();
await new Promise(r=>setTimeout(r,400));
const table=$('pgRawTable');
const rows=table.querySelectorAll('tbody tr');
// 2 open rows on T-1 + 1 open on T-0 + 1 subscribe + 1 activation + 1 reading
ok('pings table renders one row per stored cohort key', rows.length===6, String(rows.length));
const txt=table.textContent;
ok('shows all four routes', /Open/.test(txt)&&/Subscribe/.test(txt)&&/Activation/.test(txt)&&/Reading/.test(txt), txt.slice(0,160));
ok('names the sensor on an activation row', /Chest strap/.test(txt), txt.slice(0,200));
ok('shows the raw cohort key', new RegExp(cd(T(0))+'IB').test(txt), txt.slice(0,200));
ok('ages the D10 open ping correctly', /D9|D10/.test(txt), txt.slice(0,200));
const tiles=$('pgRawTiles').textContent;
ok('tiles count open pings', /9/.test(tiles), tiles.slice(0,160));
// route filter
const btn=[...$('pgRawKind').querySelectorAll('button')].find(b=>b.dataset.v==='act');
btn.click(); await new Promise(r=>setTimeout(r,250));
ok('route filter narrows to activations', $('pgRawTable').querySelectorAll('tbody tr').length===1, String($('pgRawTable').querySelectorAll('tbody tr').length));
const hrvBtn=[...$('pgRawKind').querySelectorAll('button')].find(b=>b.dataset.v==='hrv');
hrvBtn.click(); await new Promise(r=>setTimeout(r,250));
const hrvTxt=$('pgRawTable').textContent;
ok('route filter narrows to readings', $('pgRawTable').querySelectorAll('tbody tr').length===1, String($('pgRawTable').querySelectorAll('tbody tr').length));
ok('a reading row names no sensor', /Reading/.test(hrvTxt)&&!/Chest strap/.test(hrvTxt), hrvTxt.slice(0,200));
ok('no page errors', errors.length===0, errors.join(' | '));
out.forEach(l=>console.log(l));
const fails=out.filter(l=>l.startsWith('  FAIL')).length;
console.log('\n'+(out.length-fails)+'/'+out.length+' passed');
process.exit(fails?1:0);
