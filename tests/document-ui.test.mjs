import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('document UI opens signed view and reports upload progress and failure',async()=>{
 const dom=new JSDOM('<main class="main-content"><footer></footer></main>',{url:'https://rental.example',runScripts:'outside-only'}),w=dom.window;
 w.rentalOrganizationId='org';w.data={properties:[{id:'p',name:'Synthetic'}],tenancies:[]};w.propertyName=()=> 'Synthetic';
 let previewUrl=null, xhr; w.open=()=>({opener:null,location:{replace(url){previewUrl=url;}},close(){}});
 w.fetch=async url=>({ok:true,json:async()=>url.includes('signed-url')?{url:'https://storage.example/signed'}:{items:[{id:'doc',filename:'test.pdf',property_id:'p',state:'ready'}]}});
 w.FileReader=class{readAsDataURL(){this.result='data:application/pdf;base64,JVBERi0=';this.onload();}};
 w.XMLHttpRequest=class{constructor(){xhr=this;this.upload={};}open(){}setRequestHeader(){}send(){}};
 w.eval(await readFile(new URL('../rental-documents.js',import.meta.url),'utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.document.dispatchEvent(new w.Event('rental-data-ready'));await new Promise(r=>setTimeout(r,0));
 const buttons=[...w.document.querySelectorAll('#rental-document-list button')];assert.equal(buttons.length,3);buttons[0].click();await new Promise(r=>setTimeout(r,0));assert.equal(previewUrl,'/api/rental/documents?organization_id=org&action=view&id=doc');
 const file=w.document.querySelector('#rental-document-file');Object.defineProperty(file,'files',{value:[{name:'test.pdf',size:10,type:'application/pdf'}]});
 w.document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));xhr.upload.onprogress({lengthComputable:true,loaded:1,total:2});assert.equal(w.document.querySelector('progress').value,50);
 xhr.status=503;xhr.responseText='not json';xhr.onload();await new Promise(r=>setTimeout(r,0));assert.match(w.document.querySelector('#rental-document-message').textContent,/Upload failed/);dom.window.close();
});
