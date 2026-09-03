'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const gate=fs.readFileSync('auth-gate.js','utf8'),fn=fs.readFileSync('netlify/functions/onboard-employee.mjs','utf8'),migration=fs.readFileSync('supabase/migrations/202608110008_manager_temporary_onboarding.sql','utf8'),repair=fs.readFileSync('supabase/migrations/202608120003_password_change_completion_repair.sql','utf8');
test('legacy onboarding uses a server-only Supabase admin client',()=>{assert.match(fn,/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);assert.match(fn,/admin\.auth\.admin\.createUser/);assert.doesNotMatch(gate,/SUPABASE_SERVICE_ROLE_KEY|service_role/)});
test('every legacy issuance generates an independent password',()=>{assert.match(fn,/randomBytes\(24\)/);assert.doesNotMatch(fn,/S@pph1re|password123/i)});
test('manager authorization precedes any legacy auth mutation',()=>{assert.ok(fn.indexOf('service_manager_can_onboard')<fn.indexOf('createUser'));assert.match(migration,/m\.role in \('administrator','manager'\)/)});
test('existing permanent passwords are never overwritten',()=>{assert.match(fn,/Existing permanent passwords cannot be replaced by onboarding/);assert.doesNotMatch(fn,/updateUserById\(existing\.id/)});
test('legacy credential UI is absent from the no-login client',()=>{assert.doesNotMatch(gate,/temporaryPassword|onboard-employee|navigator\.clipboard/);assert.match(fn,/cache-control':'no-store/)});
test('completed password records self-heal without rotation',()=>{assert.match(repair,/set required=false,temporary_password_hash=null/);assert.doesNotMatch(repair,/update auth\.users set encrypted_password/)});
