(() => {
 const mount=()=> {
  const main=document.querySelector('.main-content');
  if(!main)return;
  const section=document.createElement('section');
  section.className='card';
  section.id='rental-documents-panel';
  section.style.cssText='margin:24px;padding:22px;max-width:100%;overflow:auto';
  section.innerHTML='<h2>Private documents</h2><p>Upload documents linked to a property or tenancy. PDF, PNG, JPG or TXT; maximum 3 MB.</p><form id="rental-document-form"><label>Property or tenancy <select id="rental-document-lease" required></select></label> <label>File <input id="rental-document-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required></label> <button type="submit">Upload document</button></form><progress id="rental-document-progress" max="100" value="0" hidden></progress><p id="rental-document-message" role="status" aria-live="polite"></p><div id="rental-document-list"></div>';
  main.insertBefore(section,main.querySelector('footer'));
  const form=section.querySelector('form'),select=section.querySelector('#rental-document-lease'),file=section.querySelector('#rental-document-file'),message=section.querySelector('#rental-document-message'),progress=section.querySelector('progress'),list=section.querySelector('#rental-document-list');
  const endpoint='/api/rental/documents';
  function org(){return typeof rentalOrganizationId==='string'?rentalOrganizationId:null;}
  function url(action,extra=''){return endpoint+'?organization_id='+encodeURIComponent(org())+'&action='+action+extra;}
  async function request(path,options={}){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});const data=await r.json();if(!r.ok)throw Error(data.error||'Document operation failed');return data;}
  function status(text){message.textContent=text;}
  async function refresh(){
   if(!org())return;
   select.replaceChildren();
   for(const property of data.properties){const opt=document.createElement('option');opt.value='property:'+property.id;opt.textContent='Property: '+property.name;select.append(opt);}
   for(const lease of data.tenancies){const opt=document.createElement('option');opt.value='lease:'+lease.id;opt.textContent='Tenancy: '+propertyName(lease.propertyId)+' — '+lease.tenant;select.append(opt);}
   try{
    const result=await request(url('list'));list.replaceChildren();
    if(!result.items.length){list.textContent='No documents uploaded.';return;}
    for(const item of result.items){
     const line=document.createElement('div');line.style.cssText='display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0';
     const name=document.createElement('span');name.textContent=item.filename+' — '+(item.property_id ? propertyName(item.property_id) : 'Tenancy: '+propertyName(data.tenancies.find(t=>t.id===item.lease_id)?.propertyId));
     line.append(name);
     for(const action of ['View','Download','Delete']){
      const button=document.createElement('button');button.type='button';button.textContent=action;
      button.addEventListener('click',async()=>{
       try{
        if(action==='Delete'){
         if(!confirm('Delete '+item.filename+' permanently?'))return;
         await request(url('delete','&id='+encodeURIComponent(item.id)),{method:'DELETE',headers:{'Content-Type':'application/json'}});status('Document deleted.');await refresh();return;
        }
        if(action==='View'){
         const preview=window.open('about:blank','_blank');
         if(!preview)throw Error('Allow pop-ups to view documents');
         let result; try { result==await request(url('signed-url','&id='+encodeURIComponent(item.id))); } catch (err) { preview.close(); throw err; }
         preview.opener=null;preview.location.replace(result.url);return;
        }
        const r=await fetch(url('download','&id='+encodeURIComponent(item.id)),{credentials:'same-origin',cache:'no-store'});
        if(!r.ok)throw Error('Download denied');
        const blob=await r.blob(),link=document.createElement('a'),objectURL=URL.createObjectURL(blob);
        link.href=objectURL;link.download=item.filename;link.click();setTimeout(()=>URL.revokeObjectURL(objectURL),10000);
       }catch(e){status(e.message);}
      });line.append(button);
     }list.append(line);
    }
   }catch(e){status(e.message);}
  }
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(!org())return status('Organization unavailable');
   const f=file.files[0];if(!f||f.size>3*1024*1024)return status('Choose a file up to 3 MB');
   if(!['application/pdf','image/png','image/jpeg','text/plain'].includes(f.type))return status('Unsupported file type');
   const button=form.querySelector('button');button.disabled=true;progress.hidden=false;progress.value=0;
   try{
    const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Read failed'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(f);});
    const [kind,id]=select.value.split(':');
    await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST',url('upload'));xhr.setRequestHeader('Content-Type','application/json');xhr.upload.onprogress=e=>{if(e.lengthComputable)progress.value=Math.round(e.loaded/e.total*100);};xhr.onerror=()=>reject(Error('Upload connection failed'));xhr.onload=()=>{let result={};try{result=JSON.parse(xhr.responseText);}catch{} if(xhr.status>=200&&xhr.status<300)resolve(result);else reject(Error(result.error||'Upload failed'));};xhr.send(JSON.stringify({[kind==='lease'?'lease_id':'property_id']:id,filename:f.name,mime_type:f.type,content_base64:base64}));});
    progress.value=100;file.value='';status('Document uploaded successfully.');await refresh();
   }catch(e){status(e.message);}finally{button.disabled=false;setTimeout(()=>{progress.hidden=true;},1500);}
  });
  document.addEventListener('rental-data-ready',refresh);
  const watcher=setInterval(()=>{if(org() && data.properties.length + data.tenancies.length > 0){clearInterval(watcher);refresh();}},500);
  setTimeout(()=>clearInterval(watcher),30000);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();