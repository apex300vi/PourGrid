const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','manifest.webmanifest'),'utf8'));

test('installed app prefers portrait-primary without making startup depend on it',()=>{
  assert.equal(manifest.orientation,'portrait-primary');
  assert.match(html,/orientation\.lock\("portrait-primary"\)/);
  assert.match(html,/\.catch\(function\(\)\{\}\)/);
  assert.doesNotMatch(html,/await orientation\.lock/);
});

test('phone landscape guard is limited to active Count and Review workflows',()=>{
  assert.match(html,/S\.screen!=="app"/);
  assert.match(html,/S\.bSub==="count"\|\|S\.bSub==="order"/);
  assert.match(html,/S\.mSub==="count"\|\|S\.mSub==="order"/);
  assert.match(html,/orientation: landscape[^\n]+max-width: 950px[^\n]+max-height: 500px/);
  assert.doesNotMatch(html,/S\.screen==="home"[^\n]+blocked/);
});

test('guard keeps workflow mounted, blocks hidden taps, and shows exact recovery copy',()=>{
  assert.match(html,/PourGrid stays upright while counting\.<\/strong><p>Rotate your phone back to portrait to continue\./);
  assert.match(html,/pointer-events:auto/);
  assert.doesNotMatch(html,/pgSyncOrientationGuard[\s\S]{0,1200}(?:render\(|location\.|ss\()/);
});

test('rotation preserves state and exact scroll without resize-observer feedback',()=>{
  assert.match(html,/pgOrientationScroll=\{x:pgOrientationPortraitScroll\.x,y:pgOrientationPortraitScroll\.y\}/);
  assert.match(html,/window\.addEventListener\("scroll"[^\n]+pgOrientationPortraitScroll/);
  assert.match(html,/window\.scrollTo\(restore\.x,restore\.y\)/);
  assert.match(html,/requestAnimationFrame\(pgSyncOrientationGuard\)/);
  assert.doesNotMatch(html,/ResizeObserver\([^)]*pgSyncOrientationGuard/);
});

test('unsupported APIs, desktop, tablet, and ordinary Safari remain usable',()=>{
  assert.match(html,/typeof orientation\.lock!=="function"\)return/);
  assert.match(html,/display-mode: standalone/);
  assert.match(html,/window\.navigator\.standalone===true/);
  assert.match(html,/window\.addEventListener\("orientationchange"/);
});
