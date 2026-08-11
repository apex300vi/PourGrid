const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const gate=fs.readFileSync('auth-gate.js','utf8'),html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('auth.css','utf8'),sql=fs.readFileSync('supabase/migrations/202608110001_bar_lead_history.sql','utf8'),worker=fs.readFileSync('sw.js','utf8');

test('history loads through an authenticated location-scoped server API',()=>{
  assert.match(gate,/POURGRID_HISTORY_API=Object\.freeze/);
  assert.match(gate,/get_location_order_history/);
  assert.match(gate,/p_organization:context\.organizationId,p_location:context\.locationId/);
  assert.match(html,/window\.POURGRID_HISTORY_API\.list\(60\)/);
  assert.doesNotMatch(html,/dbFetch\("orders\?select=id,created_at,data&order=created_at\.desc&limit=60"\)/);
});

test('server history reader grants Bar Lead read-only access and rejects anonymous or cross-location calls',()=>{
  assert.match(sql,/auth\.uid\(\) is null or not public\.has_location_role/);
  assert.match(sql,/array\['administrator','manager','bar_lead','inventory_staff','read_only_viewer'\]/);
  assert.match(sql,/Location history access required/);
  assert.match(sql,/l\.id=p_location and l\.organization_id=p_organization/);
  assert.match(sql,/revoke all on function[\s\S]*from public,anon/);
  assert.match(sql,/grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(sql,/grant (?:insert|update|delete|all).*orders/i);
});

test('existing legacy records are read without rewriting or duplicating history',()=>{
  assert.match(sql,/from public\.orders o[\s\S]*join public\.legacy_order_references/);
  assert.doesNotMatch(sql,/insert into public\.orders|update public\.orders|delete from public\.orders|truncate/i);
  assert.match(sql,/r\.organization_id=p_organization/);
  assert.match(sql,/count\(\*\) from public\.organizations\)=1/);
  assert.match(sql,/count\(\*\) from public\.locations\)=1/);
});

test('History navigation, detail content, filters, loading, empty, and retry states remain available',()=>{
  assert.match(html,/\{id:"history",lbl:"History"\}/);
  assert.match(html,/Loading history\.\.\./);
  assert.match(html,/History unavailable/);
  assert.match(html,/Completed and submitted orders for this location will appear here/);
  assert.match(html,/\[\["insights","✨ Insights"\],\["orders","📋 Orders"\]\]/);
  assert.match(html,/entry\.date/);
  assert.match(html,/entry\.time/);
  assert.match(html,/entry\.items/);
  assert.match(html,/pgFinalPurchaseText/);
  assert.match(html,/← History/);
});

test('Bar Leads receive read-only History controls while managers retain operational corrections',()=>{
  assert.match(html,/function pgCanMutateHistory\(\)[\s\S]*capabilities\.approve/);
  assert.match(html,/if\(canMutateHistory\)ap\(hdr,btn\("delbtn","Delete"/);
  assert.match(html,/if\(canMutateHistory\)row\.onclick/);
  assert.match(html,/if\(!pgCanMutateHistory\(\)\)return/);
  assert.match(html,/canMutateHistory\?"tap to flag not delivered":"Submitted quantity"/);
});

test('mobile History and refreshed auth shell ship together',()=>{
  assert.match(css,/@media\(max-width:390px\)/);
  assert.match(html,/@media\(max-width:350px\)/);
  assert.match(worker,/pourgrid-shell-v8/);
  assert.doesNotMatch(worker,/orders|inventory|receiving|authorization data/i);
});
