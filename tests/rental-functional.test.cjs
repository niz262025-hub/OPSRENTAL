const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8'),script=fs.readFileSync('app.js','utf8');
const org='123e4567-e89b-42d3-a456-426614174001';
const property='123e4567-e89b-42d3-a456-426614174002';
const lease='123e4567-e89b-42d3-a456-426614174003';
const payment='123e4567-e89b-42d3-a456-426614174004';
const ticket='123e4567-e89b-42d3-a456-426614174005';
function seed(){return {properties:[{id:property,name:'UAT',address:'Synthetic',unit_label:'JB',parking_spaces:1}],leases:[{id:lease,property_id:property,monthly_rent:100.25,start_date:'2026-01-01',status:'active'}],payments:[],tickets:[{id:ticket,lease_id:lease,title:'Leak',description:'Tap',status:'open',created_at:'2026-11-18'}]};}
async function fixture(records=seed()){
 const dom=new JSDOM(html,{url:'https://fixture.invalid',runScripts:'outside-only'});
 dom.window.HTMLDialogElement.prototype.close=function(){};
 dom.window.HTMLDialogElement.prototype.showModal=function(){};
 dom.window.scrollTo=()=>{};
 const calls=[];
 dom.window.fetch=async (url,options={})=>{
  const u=new URL(url,'https://fixture.invalid');
  calls.push({url:u.pathname+u.search,method:options.method||'GET'});
  if(u.pathname==='/api/rental/organizations')return {ok:true,json:async()=>({organizations:[{organization_id:org,role:'owner'}]})};
  if(u.pathname==='/api/rental/data')return {ok:true,json:async()=>({items:records[u.searchParams.get('resource')]||[]})};
  if(u.pathname==='/api/rental/write'){
   const resource=u.searchParams.get('resource'),body=JSON.parse(options.body);
   if(options.method==='POST'){const id='123e4567-e89b-42d3-a456-426614174099';records[resource].push({id,...body});}
   else {const item=records[resource].find(x=>x.id===u.searchParams.get('id'));Object.assign(item,body);}
   return {ok:true,json:async()=>({item:body})};
  }
  throw Error('Unexpected URL '+url);
 };
 dom.window.eval(script);
 await new Promise(resolve=>setTimeout(resolve,35));
 return {dom,calls,records};
}
test('rent retains cents and server data populates dashboard',async()=>{
 const {dom,calls}=await fixture();try{
  assert.equal(dom.window.money(100.25),'$100.25');
  assert.match(dom.window.document.querySelector('#rent-total').textContent,/100\.25/);
  assert.equal(calls.filter(x=>x.url.startsWith('/api/rental/data')).length,4);
 }finally{dom.window.close();}
});
test('scheduled monthly rent is visible before a stored payment',async()=>{
 const {dom}=await fixture();try{
  assert.equal(dom.window.document.querySelectorAll('#payments-table tr').length,1);
  dom.window.document.querySelector('#notifications-button').click();
  assert.match(dom.window.document.querySelector('.toast').textContent,/outstanding/);
 }finally{dom.window.close();}
});
test('scheduled payment cannot be marked paid without creating server record',async()=>{
 const {dom,calls}=await fixture();try{
  dom.window.document.querySelector('[data-mark-paid]').click();
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(calls.filter(x=>x.method!=='GET').length,0);
  assert.match(dom.window.document.querySelector('.toast').textContent,/Create a payment record first/);
 }finally{dom.window.close();}
});
test('property form persists through API and escapes markup',async()=>{
 const {dom,calls,records}=await fixture();try{
  const form=dom.window.document.querySelector('#property-form');
  for(const [name,value] of Object.entries({name:'<img src=x onerror=alert(1)>',address:'Synthetic',city:'JB',units:'2'}))form.elements.namedItem(name).value=value;
  form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(calls.filter(x=>x.method==='POST').length,1);
  assert.equal(records.properties.length,2);
  assert.equal(dom.window.document.querySelectorAll('#properties-table img').length,0);
 }finally{dom.window.close();}
});
test('maintenance status updates through API',async()=>{
 const {dom,calls,records}=await fixture();try{
  const select=dom.window.document.querySelector('[data-ticket-status]');
  select.value='Resolved';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(records.tickets[0].status,'resolved');
  assert.equal(calls.filter(x=>x.method==='PATCH').length,1);
 }finally{dom.window.close();}
});
test('browser localStorage is ignored and empty remote portfolios remain empty',async()=>{
 const records={properties:[],leases:[],payments:[],tickets:[]};
 const {dom}=await fixture(records);try{
  dom.window.localStorage.setItem('haven-rental-data-v1','{bad');
  assert.equal(dom.window.document.querySelectorAll('#properties-table tr').length,0);
  assert.equal(dom.window.document.querySelectorAll('#payments-table tr').length,0);
 }finally{dom.window.close();}
});
