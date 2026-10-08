/* The Codes view: access codes are listed from the server, created through
   CODE_CREATE with exactly what the form holds, and a refusal is said beside
   the button rather than swallowed.

   Runs against the BUILT page, like the other master tests. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const PAGE = new URL('../build/master/index.html', import.meta.url).pathname;
if (!fs.existsSync(PAGE)) { console.error('No built page — run `npm run build` first.'); process.exit(1); }
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = [b64u({alg:'RS256'}), b64u({email:'austinspaeth@msn.com', exp: Math.floor(Date.now()/1000)+3600}), 'sig'].join('.');
const dom = new JSDOM(fs.readFileSync(PAGE,'utf8'), { url:'https://autonomic.care/master/', runScripts:'dangerously', pretendToBeVisual:true });
const { window } = dom;
window.scrollTo = () => {}; window.Element.prototype.scrollIntoView = () => {};
const created = [];
let refuse = false;
window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target']||'').split('.').pop();
  const reply = (o) => Promise.resolve({ ok:true, status:200, text:()=>Promise.resolve(JSON.stringify(o)) });
  if (target==='InitiateAuth') return reply({Session:'s1',ChallengeName:'CUSTOM_CHALLENGE',ChallengeParameters:{USERNAME:'austinspaeth@msn.com'}});
  if (target==='RespondToAuthChallenge') return reply({AuthenticationResult:{IdToken:idToken,AccessToken:'at',RefreshToken:'rt'}});
  if (body.action==='LOAD') return reply({ entries:[], events:[], settings:{currency:'$'}, ui:{view:'overview'} });
  if (body.action==='PINGS') return reply({ open:[], sub:[], act:[], hrv:[] });
  if (body.action==='CODES') return reply({ foreverDays: 999, rows: [
    { code:'FRIEND2026', days:999, note:'Sam', createdAt:new Date(Date.now()-864e5).toISOString(), used:true, redeemedAt:new Date().toISOString(), redeemedPlatform:'I', redeemedVersion:'1.31.0' },
    { code:'K7WQM2XD', days:30, note:'', createdAt:new Date(Date.now()-2*864e5).toISOString(), used:false, redeemedAt:null, redeemedPlatform:null, redeemedVersion:null } ] });
  if (body.action==='CODE_CREATE') {
    created.push(body.payload);
    if (refuse) return reply({ ok:false, error:'That code already exists.' });
    return reply({ ok:true, code:{ code:'NEWCODE22', days:body.payload.days, note:body.payload.note, createdAt:new Date().toISOString(), used:false, redeemedAt:null, redeemedPlatform:null, redeemedVersion:null } });
  }
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

[...window.document.querySelectorAll('.tab')].find(t=>t.dataset.view==='codes').click();
await new Promise(r=>setTimeout(r,300));
const text = () => $('cdTable').textContent;
ok('the view is showing', !$('view-codes').classList.contains('hidden'), 'hidden');
ok('no filter bar over a list of codes', $('filterbar').classList.contains('hidden'), 'filter bar visible');
ok('lists both codes', $('cdTable').querySelectorAll('tbody tr').length===2, text());
ok('999 days reads as Forever', /FRIEND2026\s*Forever/.test(text()), text());
ok('a timed code reads in days', /K7WQM2XD\s*30 days/.test(text()), text());
const rowOf = (c) => [...$('cdTable').querySelectorAll('tbody tr')].find(tr=>tr.textContent.startsWith(c)).textContent;
ok('a redeemed code reads Used, with where', /Used/.test(rowOf('FRIEND2026')) && /iOS 1\.31\.0/.test(rowOf('FRIEND2026')), rowOf('FRIEND2026'));
ok('an unredeemed code reads Unused', /Unused/.test(rowOf('K7WQM2XD')), rowOf('K7WQM2XD'));
ok('tiles count codes, used and unused', /1 forever · 1 timed/.test($('cdTiles').textContent) && /Used\s*1/.test($('cdTiles').textContent) && /Unused\s*1/.test($('cdTiles').textContent), $('cdTiles').textContent);

// a preset fills the days field; create sends what the form holds
$('cdPresets').querySelector('[data-days="60"]').click();
ok('preset sets the days', $('cdDays').value==='60', $('cdDays').value);
$('cdNote').value='Alex';
$('cdCreate').click();
await new Promise(r=>setTimeout(r,200));
ok('CODE_CREATE carries days, note and an empty code', created.length===1 && created[0].days===60 && created[0].note==='Alex' && created[0].code==='', JSON.stringify(created));
ok('the new code is on top of the list', $('cdTable').querySelector('tbody tr').textContent.startsWith('NEWCODE22'), text());
ok('and is announced', /Created NEWCODE22 · 60 days/.test($('cdStatus').textContent), $('cdStatus').textContent);
ok('the form is cleared for the next one', $('cdNote').value==='', $('cdNote').value);

// out-of-range days never reach the server
$('cdDays').value='0'; $('cdCreate').click();
await new Promise(r=>setTimeout(r,100));
ok('zero days is refused in the page', created.length===1 && /1 to 999/.test($('cdStatus').textContent), $('cdStatus').textContent);

// a server refusal is shown, and nothing is added
refuse = true;
$('cdDays').value='30'; $('cdCode').value='friend2026'; $('cdCreate').click();
await new Promise(r=>setTimeout(r,200));
ok('a refusal is said beside the button', /already exists/.test($('cdStatus').textContent), $('cdStatus').textContent);
ok('and adds no row', $('cdTable').querySelectorAll('tbody tr').length===3, text());
ok('there is no delete or edit control', !/delete|revoke|edit/i.test($('cdTable').innerHTML), 'found one');
ok('no page errors', errors.length===0, errors.join(' | '));

console.log(out.join('\n'));
const failed = out.filter(l=>l.includes('FAIL')).length;
console.log(`\n${out.length-failed}/${out.length} passed`);
process.exit(failed?1:0);
