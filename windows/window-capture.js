(function installWindowCapture(){
 const button=document.getElementById('captureWindow');
 let active=null;
 const youtube=document.getElementById('openYouTube');
 youtube.onclick=()=>{
   const query=document.getElementById('words').value.trim();
   const link=document.createElement('a');
   link.href=query?'https://www.youtube.com/results?search_query='+encodeURIComponent(query):'https://www.youtube.com/';
   link.target='_blank';link.rel='noopener';link.click();
   report('Play a video in the browser, then choose that browser window with Capture window.');
 };
 if(!navigator.mediaDevices?.getDisplayMedia){button.hidden=true;return;}
 function removeCapture(item){
   if(active!==item)return;
   active=null;
   for(const track of item.liveStream.getTracks())track.stop();
   const index=assets.indexOf(item);
   if(index>=0)removeFragment(index);
   else if(vf.studio?.assets.includes(item))vf.studio.assets=vf.studio.assets.filter(entry=>entry!==item);
   button.textContent='Capture window';
 }
 button.onclick=async()=>{
   if(active){removeCapture(active);return;}
   if(vf.active){report('Switch to Studio to add a live window.');return;}
   if(assets.length>=MAX_FRAGMENTS){report('Remove one fragment before adding a window.');return;}
   button.disabled=true;
   let stream;
   try{
     stream=await navigator.mediaDevices.getDisplayMedia({
       video:{displaySurface:'window',frameRate:{ideal:30,max:30}},audio:true,selfBrowserSurface:'exclude',monitorTypeSurfaces:'exclude'
     });
     if(vf.active||assets.length>=MAX_FRAGMENTS){for(const track of stream.getTracks())track.stop();return;}
     ++searchToken;$('excavate').disabled=false;
     const image=document.createElement('canvas');image.width=128;image.height=80;
     const paint=image.getContext('2d');paint.fillStyle='#243d32';paint.fillRect(0,0,128,80);
     paint.fillStyle='#d6fa82';paint.fillRect(18,15,92,3);paint.fillRect(18,62,92,3);
     paint.fillRect(18,15,3,50);paint.fillRect(107,15,3,50);
     const item={title:'Live window',date:'Screen share',source:'Local file',kind:'video',liveStream:stream,image:'',img:image,poster:thumbnail(image),resumeAt:0,
       onRelease(){if(active===item){active=null;button.textContent='Capture window';}}};
     stream.getVideoTracks()[0].addEventListener('ended',()=>removeCapture(item),{once:true});
     assets.push(item);active=item;showAssets();choose(assets.length-1);
     button.textContent='Stop window capture';report('Live window added. Images and video fragments can morph with it.');
   }catch(error){
     if(stream)for(const track of stream.getTracks())track.stop();
     report(error.name==='NotAllowedError'?'Window sharing cancelled.':'Could not capture the window. '+error.message);
   }finally{button.disabled=false;}
 };
 addEventListener('pagehide',()=>{if(active)for(const track of active.liveStream.getTracks())track.stop();});
})();
