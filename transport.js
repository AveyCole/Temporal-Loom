const fileAudio=$('audio');
const loopOption=$('loopFile');
loopOption.checked=localStorage.getItem('loopFile')==='1';
fileAudio.loop=loopOption.checked;
loopOption.onchange=()=>{
 fileAudio.loop=loopOption.checked;
 localStorage.setItem('loopFile',loopOption.checked?'1':'0');
};
function syncAudioTransport(){
 const loaded=Boolean(fileAudio.srcObject||fileAudio.getAttribute('src'))&&(!fileAudio.error||canDecodeLoadedAudio());
 $('playFile').disabled=!loaded||!fileAudio.paused;
 $('stopFile').disabled=!loaded||(fileAudio.paused&&(fileAudio.srcObject||!fileAudio.currentTime));
}
for(const event of ['loadstart','loadedmetadata','play','pause','ended','emptied','seeked','error']){
 fileAudio.addEventListener(event,syncAudioTransport);
}
$('playFile').onclick=async()=>{
 try{await playLoadedAudio();}
 catch(error){report(error.message||'Could not play this file. Try loading an MP3 or WAV.');}
 syncAudioTransport();
};
$('stopFile').onclick=()=>{
 fileAudio.pause();
 if(fileAudio.readyState>0&&!fileAudio.srcObject)fileAudio.currentTime=0;
 syncAudioTransport();
};
syncAudioTransport();
