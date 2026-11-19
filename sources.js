let resolveFolder=null;
function folderPicked(items,message){
 if(resolveFolder){resolveFolder({items,message});resolveFolder=null;}
}
async function gatherDirect(){
 clearSearchTerms();
 const token=++searchToken,source=$('source').value,target=chooseMediaTarget(),media=mediaMode();
 if(!target){report('The deck is full of type fragments. Remove one to make room.');return;}
 $('excavate').disabled=true;
 try{
   let items;
   if(source==='folder'){
     report('Choose a folder to search for '+mediaModes[media]+'. Subfolders are included.');
     const result=await new Promise(resolve=>{resolveFolder=resolve;Mic.folder(media);});
     if(token!==searchToken)return;
     if(!result.items.length){report(result.message);return;}
     items=result.items;
   }else{
     let input=$('site').value.trim();
     if(!input)throw Error('Enter a website address.');
     if(!/^[a-z][a-z0-9+.-]*:/i.test(input))input='https://'+input;
     const u=new URL(input);
     if(u.protocol!=='https:'||u.username||u.password)throw Error('Enter a public HTTPS page or media URL.');
     $('site').value=u.href;
     report('Looking for '+mediaModes[media]+' on '+u.hostname+'…');
     const response=await fetch('/website?'+new URLSearchParams({url:u.href,media}),{signal:AbortSignal.timeout(30000)});
     if(!response.ok)throw Error('Could not read that address. Try a public HTTPS page or a direct link for your selected media type.');
     items=await response.json();
   }
   items=items.filter(item=>mediaMatches(item,media));
   if(!items.length)throw Error('No compatible '+mediaModes[media]+' found.');
   const result=await collectFragments([{items:mixMedia(items)}],token,target,media,progressiveDeck());
   if(!result||token!==searchToken)return;
   report(fragmentResultText(result.loaded.length,target,result.issue));
 }catch(e){if(token===searchToken)report(e.message);}
 finally{if(token===searchToken)$('excavate').disabled=false;}
}
const archiveGather=$('excavate').onclick;
$('excavate').onclick=()=>{
 const source=$('source').value;
 if(source==='camera')return toggleCameraCapture();
 return ['website','folder'].includes(source)?gatherDirect():archiveGather();
};
$('source').onchange=()=>{
 syncAbstractSearch();
 const mode=$('source').value,live=mode==='website',folder=mode==='folder',camera=mode==='camera';
 showCameraSource(camera);
 $('siteField').hidden=!(live||mode==='wayback-site');
 $('siteField').querySelector('label').textContent=live?'Live webpage or media URL':'Original website or media URL';
 $('siteField').querySelector('p').textContent=live?'Looks for media links and embeds on the page, or accepts a direct file link.':'Searches Wayback captures under this address.';
 if(!camera)$('excavate').textContent=folder?'Choose media folder':live?'Gather website media':'Excavate fragments';
 $('dateNote').textContent=camera?'Capture a still, a live feed, or a video clip.':folder?'Searches the folder and its subfolders.':live?'Live websites use the current page.':
   ['nasa','peertube','commons-video','ia-video'].includes(mode)?'This video catalog searches across all dates.':'Archive searches use the selected date and radius.';
};
function validLiveReference(item){
 if(item.source!=='Website'||typeof item.title!=='string'||typeof item.date!=='string'||typeof item.link!=='string')return false;
 try{const url=new URL(item.link);return url.protocol==='https:'&&!url.username&&!url.password&&typeof item.image==='string'&&item.image.startsWith('/web-image?')&&new URL(item.image,location.origin).searchParams.get('url')===item.link;}catch{return false;}
}
