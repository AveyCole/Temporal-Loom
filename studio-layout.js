function installStudioLayout(){
 const main=document.querySelector('main'),workspace=main.querySelector('.workspace'),aside=main.querySelector('aside');
 const impulse=$('driver').closest('.rule'),sources=document.createElement('section');
 sources.className='studio-source-options';
 for(const child of [...aside.children]){
   if(child===impulse)continue;
   if(child.matches('.eyebrow,h2,p.muted'))child.remove();else sources.append(child);
 }
 impulse.querySelector('.eyebrow')?.remove();
 const tabs=document.createElement('nav');tabs.className='studio-tabs';tabs.setAttribute('aria-label','Studio controls');
 aside.prepend(tabs);
 const views=[];
 function addPanel(label,nodes){
   const panel=document.createElement('section');panel.className='studio-controls';panel.setAttribute('aria-label',label+' controls');
   panel.append(...nodes);
   const button=document.createElement('button');button.type='button';button.textContent=label;
   tabs.append(button);aside.append(panel);views.push({button,panel});
   button.onclick=()=>{
     for(const view of views){view.button.setAttribute('aria-pressed',String(view.button===button));view.panel.hidden=view.panel!==panel;}
   };
   return button;
 }
 const fileTransport=workspace.querySelector('.file-transport');
 fileTransport.setAttribute('aria-label','Playback and recording');
 $('recordClip').after($('micButton'));$('micButton').classList.remove('wide');
 $('stageWrap').after(fileTransport);
 const sourceTab=addPanel('Sources',[sources,workspace.querySelector('.find-controls'),$('searchTerms')]);
 addPanel('Motion',[impulse,$('audioResponse').closest('label'),$('tempoSummary').parentElement,workspace.querySelector('.control-grid')]);
 addPanel('Effects',[workspace.querySelector('.look-buttons'),$('mutateMorph'),$('effect').labels[0],$('effect'),$('rack')]);
 const deck=$('assets').closest('.rule');deck.classList.add('studio-deck');main.append(deck);
 workspace.querySelector('.foot')?.remove();
 $('vfTab').addEventListener('click',()=>sourceTab.click());
 sourceTab.click();
}
