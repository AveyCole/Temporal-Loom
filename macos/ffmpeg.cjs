const {spawn}=require('node:child_process');
const ffmpeg=require('node:path').join(__dirname,'vendor','ffmpeg');
function runFFmpeg(args){return new Promise((resolve,reject)=>{const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-nostdin',...args],{stdio:['ignore','ignore','pipe']});let errors='';const timer=setTimeout(()=>child.kill(),120000);child.stderr.on('data',b=>{if(errors.length<8000)errors+=b;});child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error(errors.trim()||'Video conversion failed.'));});});}
async function toMP4(source,destination){await runFFmpeg(['-i',source,'-map','0:v:0','-map','0:a?','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-y',destination]);}
async function decodeAudio(source,destination){await runFFmpeg(['-i',source,'-vn','-map','0:a:0','-c:a','aac','-b:a','160k','-movflags','+faststart','-y',destination]);}
module.exports={runFFmpeg,toMP4,decodeAudio};
