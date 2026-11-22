import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/sso/return.js';
const stage='https://southerndotcom-website-git-feat-myop-ca0019-mohd-syaiful-nizam1.vercel.app';
function run(env,method='GET') {const old={...process.env};Object.assign(process.env,env);for(const k of ['VERCEL_ENV','MYOPS_API_ORIGIN'])if(!(k in env))delete process.env[k];const r={headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(x){this.body=x;return this},redirect(n,url){this.code=n;this.location=url;return this}};try{handler({method},r);return r}finally{process.env=old}}
test('Back to MYOPS uses exact environment allowlist and never clears cookies',()=>{
 let r=run({VERCEL_ENV:'production'});assert.equal(r.location,'https://www.myops.com.my/');assert.equal(r.headers['Set-Cookie'],undefined);
 r=run({VERCEL_ENV:'preview',MYOPS_API_ORIGIN:stage});assert.equal(r.location,stage+'/');assert.equal(r.headers['Set-Cookie'],undefined);
 for(const origin of ['https://evil.example','https://www.myops.com.my',''])assert.equal(run({VERCEL_ENV:'preview',MYOPS_API_ORIGIN:origin}).code,503);
 assert.equal(run({VERCEL_ENV:'production',MYOPS_API_ORIGIN:stage}).code,503);assert.equal(run({VERCEL_ENV:'production'},'POST').code,405);
});
