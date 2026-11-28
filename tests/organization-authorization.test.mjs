import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationEntitled} from '../api/rental/authorization.js';
import read from '../api/rental/data.js';
import write from '../api/rental/write.js';
import organizations from '../api/rental/organizations.js';
import session from '../api/sso/session.js';
import redeem from '../api/sso/redeem.js';
const user='user-a', org='org-a';
const grant={user_id:user,organization_id:org,product_slug:'opsrental'};
const sub={organization_id:org,personal_user_id:null,product_slug:'opsrental',status:'active',current_period_end:'2027-01-01T00:00:00Z'};
const now=Date.parse('2026-01-01T00:00:00Z');
const lookup=(g=[grant],s=[sub],l=[])=>async (table,filters)=>({myops_app_grants:g,myops_subscriptions:s,myops_lifetime_entitlements:l,myops_organizations:[]}[table]);
test('organization entitlement binds grant and unexpired subscription to the selected organization',async()=>{
 assert.equal(await organizationEntitled(lookup(),user,org,now),true);
 assert.equal(await organizationEntitled(lookup([], [sub]),user,org,now),false);
 assert.equal(await organizationEntitled(lookup([{...grant,organization_id:'other'}]),user,org,now),false);
 assert.equal(await organizationEntitled(lookup([grant],[{...sub,organization_id:'other'}]),user,org,now),false);
 assert.equal(await organizationEntitled(lookup([grant],[{...sub,current_period_end:'2025-01-01'}]),user,org,now),false);
 assert.equal(await organizationEntitled(lookup([grant],[{...sub,status:'expired'}]),user,org,now),false);
 assert.equal(await organizationEntitled(lookup([grant],[{...sub,personal_user_id:'other'}]),user,org,now),false);
 assert.equal(await organizationEntitled(lookup([grant],[{...sub,product_slug:'other',is_complete_bundle:true}]),user,org,now),true);
 assert.equal(await organizationEntitled(lookup([],[],[{user_id:user,status:'active',scope:'all_apps'}]),user,org,now),true);
 assert.equal(await organizationEntitled(lookup([],[],[{user_id:'other',status:'active',scope:'all_apps'}]),user,org,now),false);
 assert.equal(await organizationEntitled(lookup([],[],[{user_id:user,status:'active',scope:'all_apps',revoked_at:'2025-01-01'}]),user,org,now),false);
});
test('access disable blocks every current service-role and session route before fetching',async()=>{
 const old=process.env.MYOPS_RENTAL_ACCESS_DISABLED;const oldFetch=globalThis.fetch;let calls=0;
 process.env.MYOPS_RENTAL_ACCESS_DISABLED='true';globalThis.fetch=async()=>{calls++;throw Error('unexpected')};
 const res=()=>({setHeader(){},status(n){this.code=n;return this},json(){return this}});
 try{for(const handler of [read,write,organizations,session,redeem]){let r=res();await handler({method:'GET',headers:{}},r);assert.equal(r.code,503)}assert.equal(calls,0)}
 finally{if(old===undefined)delete process.env.MYOPS_RENTAL_ACCESS_DISABLED;else process.env.MYOPS_RENTAL_ACCESS_DISABLED=old;globalThis.fetch=oldFetch}
});

test('personal subscription applies only to its owner organization and stays fail-closed',async()=>{
 const personal={personal_user_id:user,organization_id:null,product_slug:'opsrental',status:'active',current_period_end:'2027-01-01'};
 const check=(entry,owner=user)=>organizationEntitled(async(t,f)=>t==='myops_subscriptions'?(f.personal_user_id?[entry]:[]):t==='myops_organizations'?[{id:org,owner_user_id:owner}]:[],user,org,now);
 assert.equal(await check(personal),true);assert.equal(await check(personal,'other'),false);
 assert.equal(await check({...personal,personal_user_id:'other'}),false);
 assert.equal(await check({...personal,status:'canceled'}),false);
 assert.equal(await check({...personal,current_period_end:'2025-01-01'}),false);
 assert.equal(await check({...personal,product_slug:'other'}),false);
});
