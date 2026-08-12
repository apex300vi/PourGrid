import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';

const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const normalize=value=>String(value||'').trim().toLowerCase();
const temporaryPassword=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';return [...randomBytes(24)].map(value=>alphabet[value%alphabet.length]).join('')};
async function findUserByEmail(admin,email){for(let page=1;page<=20;page++){const {data,error}=await admin.auth.admin.listUsers({page,perPage:100});if(error)throw error;const user=data.users.find(item=>normalize(item.email)===email);if(user)return user;if(data.users.length<100)return null}throw new Error('User directory limit exceeded')}

export default async request=>{
  if(request.method!=='POST')return json(405,{error:'POST required'});
  const supabaseUrl=process.env.SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!supabaseUrl||!serviceKey)return json(503,{error:'Employee onboarding is not configured'});
  const token=String(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return json(401,{error:'Authentication required'});
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await admin.auth.getUser(token),actor=verified.data?.user;
  if(verified.error||!actor)return json(401,{error:'Authentication required'});
  let input;try{input=await request.json()}catch{return json(400,{error:'Valid JSON required'})}
  const email=normalize(input.email),organizationId=String(input.organizationId||''),locationId=String(input.locationId||''),role=String(input.role||'bar_lead');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(400,{error:'Valid employee email required'});
  if(!organizationId||!locationId||!['bar_lead','inventory_staff','read_only_viewer'].includes(role))return json(400,{error:'Valid organization, location, and role required'});
  try{
    const allowed=await admin.rpc('service_manager_can_onboard',{p_actor:actor.id,p_organization:organizationId,p_location:locationId});if(allowed.error||allowed.data!==true)return json(403,{error:'Manager access required'});
    const existing=await findUserByEmail(admin,email);
    if(existing){
      const membership=await admin.from('memberships').select('id').eq('organization_id',organizationId).eq('user_id',existing.id).maybeSingle();if(membership.error)throw membership.error;
      if(membership.data){const issued=await admin.rpc('service_issue_member_temporary_password',{p_actor:actor.id,p_organization:organizationId,p_location:locationId,p_email:email});if(issued.error)throw issued.error;return json(200,{email,temporaryPassword:issued.data,existingUser:true})}
      return json(409,{error:'This email already has a PourGrid account. Existing permanent passwords cannot be replaced by onboarding.'});
    }
    const password=temporaryPassword();
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw created.error;
    const onboarded=await admin.rpc('service_onboard_employee',{p_actor:actor.id,p_organization:organizationId,p_location:locationId,p_user:created.data.user.id,p_email:email,p_role:role});
    if(onboarded.error){await admin.auth.admin.deleteUser(created.data.user.id);throw onboarded.error}
    return json(201,{email,temporaryPassword:password,existingUser:false});
  }catch(error){return json(403,{error:String(error?.message||'Employee onboarding failed').slice(0,240)})}
};

export const config={path:'/api/onboard-employee'};
