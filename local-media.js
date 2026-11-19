$('images').onchange=async event=>{
 const token=++searchToken;
 $('excavate').disabled=false;
 const selected=event.target.files.length;
 const files=Array.from(event.target.files).slice(0,MAX_FRAGMENTS);
 event.target.value='';
 const items=files.flatMap(file=>{
   const video=file.type.startsWith('video/')||/\.(mp4|m4v|webm|mov|3gp)$/i.test(file.name);
   if(!video&&!file.type.startsWith('image/'))return [];
   return [{title:file.name,date:'Local file',source:'Local file',kind:video?'video':'image',image:URL.createObjectURL(file),file}];
 });
 if(!items.length){report('Choose a photo or a supported video file.');return;}
 const result=await loadImages(items,token);
 if(!result||token!==searchToken)return;
 if(result.loaded.length){assets=mergeTypeWithMedia(result.loaded);showAssets();}
 report('Loaded '+result.loaded.length+' local fragments.'+(result.failures?' '+result.failures+' could not be opened.':'')+(selected>MAX_FRAGMENTS?' Up to '+MAX_FRAGMENTS+' files can be loaded at once.':''));
};
