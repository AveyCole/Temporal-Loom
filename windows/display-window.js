let outputWindow=null,stageFrameClock=window,stageFrameRequest;
const detachDisplay=$('detachDisplay'),displayFullscreen=$('displayFullscreen');

function isDisplayOpen(){
 return !!(outputWindow&&!outputWindow.closed&&outputWindow.presentStage);
}
function isDisplayVisible(){
 return isDisplayOpen()&&!outputWindow.document.hidden;
}
function queueStageFrame(){
 stageFrameClock=isDisplayVisible()?outputWindow:window;
 // Both windows drive the same engine. Its timing always uses the controls page's clock.
 stageFrameRequest=stageFrameClock.requestAnimationFrame(()=>frame(performance.now()));
}
function scheduleStageFrame(){
 if(isDisplayVisible())outputWindow.presentStage(canvas);
 queueStageFrame();
}
function updateStageFrameClock(){
 if(!stageFrameClock.closed)stageFrameClock.cancelAnimationFrame(stageFrameRequest);
 queueStageFrame();
 syncFragmentPlayers();
}
function setDisplayControls(detached){
 document.documentElement.classList.toggle('stage-detached',detached);
 detachDisplay.textContent=detached?'Reattach display':'Detach display';
 detachDisplay.disabled=false;
 displayFullscreen.hidden=!detached;
 $('fullscreen').hidden=detached;
 demos=[demo(0),demo(1),demo(2)];
 updateStageFrameClock();
}
function displayConnected(popup){
 if(popup===outputWindow)setDisplayControls(true);
}
function displayDisconnected(){
 outputWindow=null;
 setDisplayControls(false);
}
function toggleDisplayFullscreen(){
 window.chrome.webview.postMessage({action:'displayFullscreen'});
}
detachDisplay.onclick=()=>{
 if(isDisplayOpen()){
   window.chrome.webview.postMessage({action:'reattachDisplay'});
 }else{
   outputWindow=window.open('/display','TemporalLoomOutput','popup');
   if(outputWindow)detachDisplay.disabled=true;
 }
};
displayFullscreen.onclick=toggleDisplayFullscreen;
window.addEventListener('pagehide',()=>{if(outputWindow&&!outputWindow.closed)outputWindow.close();});
