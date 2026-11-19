const deckStrip=$('assets');
const deckShuffle=$('shuffleDeck');
let deckDrag=null;

function selectDeckFragment(index){
 const asset=assets[index];
 if(asset.kind!=='video'){choose(index);return;}
 const player=videoPlayers.get(asset);
 if(player?.error)retireVideo(asset,player);
 a=index;b=(index+1)%assets.length;morph=0;manual=false;lastDrift=performance.now();
 syncFragmentPlayers();
}

function editDeckOrder(edit){
 const first=assets[a],second=assets[b],scroll=deckStrip.scrollLeft;
 edit();
 a=Math.max(0,assets.indexOf(first));b=second?assets.indexOf(second):(a+1)%assets.length;
 showAssets(0,true);
 deckStrip.scrollLeft=scroll;
}

function shuffleDeck(){
 if(assets.length<2)return;
 editDeckOrder(()=>{
   const original=assets.slice();
   for(let i=assets.length-1;i>0;i--){
     const j=Math.floor(Math.random()*(i+1));
     [assets[i],assets[j]]=[assets[j],assets[i]];
   }
   if(assets.every((asset,index)=>asset===original[index]))assets.push(assets.shift());
 });
 report('Fragment deck shuffled.');
}
deckShuffle.onclick=shuffleDeck;

function moveDeckFragment(asset,to,keyboard=false){
 const from=assets.indexOf(asset);
 if(from<0||from===to||to<0||to>=assets.length)return;
 editDeckOrder(()=>{
   assets.splice(from,1);assets.splice(to,0,asset);
 });
 if(keyboard){
   const handle=deckStrip.children[to].querySelector('.deck-handle');
   handle.focus({preventScroll:true});
   handle.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 report('Moved '+asset.title+' to position '+(to+1)+' of '+assets.length+'.');
}

function markDeckDrop(drag,cell,after){
 if(drag.target===cell&&drag.after===after)return;
 drag.target?.removeAttribute('data-drop');
 drag.target=cell;drag.after=after;
 if(cell)cell.dataset.drop=after?'after':'before';
}

function positionDeckDrop(drag,scroll=false){
 const bounds=deckStrip.getBoundingClientRect();
 const {x,y}=drag;
 if(x<bounds.left||x>=bounds.right||y<bounds.top||y>=bounds.bottom){
   markDeckDrop(drag,null,false);return false;
 }
 if(scroll){
   const edge=Math.min(56,bounds.width/4);
   if(x<bounds.left+edge)deckStrip.scrollLeft-=Math.ceil((bounds.left+edge-x)/4);
   if(x>bounds.right-edge)deckStrip.scrollLeft+=Math.ceil((x-bounds.right+edge)/4);
 }
 const under=document.elementFromPoint(x,y)?.closest('.deck-cell');
 const target=under?.parentElement===deckStrip?under:
   Array.from(deckStrip.children).find(cell=>cell.getBoundingClientRect().right>=x)||deckStrip.lastElementChild;
 if(target?.classList.contains('deck-cell')){
   const box=target.getBoundingClientRect();
   markDeckDrop(drag,target,x>box.left+box.width/2);
 }
 return true;
}

function updateDeckDrag(){
 const drag=deckDrag;
 if(!drag?.active)return;
 drag.frame=positionDeckDrop(drag,true)?requestAnimationFrame(updateDeckDrag):0;
}

function deckHandle(asset,cell){
 const handle=document.createElement('button');
 handle.type='button';handle.className='deck-handle';handle.textContent='⠿';
 handle.setAttribute('aria-label','Reorder '+asset.title+' with the left and right arrow keys');
 handle.title='Drag to reorder';
 handle.onkeydown=event=>{
   if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
   event.preventDefault();
   moveDeckFragment(asset,assets.indexOf(asset)+(event.key==='ArrowLeft'?-1:1),true);
 };
 handle.onpointerdown=event=>{
   if(!event.isPrimary||event.button!==0||assets.length<2||deckDrag)return;
   handle.setPointerCapture(event.pointerId);
   deckDrag={id:event.pointerId,startX:event.clientX,startY:event.clientY};
 };
 handle.onpointermove=event=>{
   const drag=deckDrag;
   if(drag?.id!==event.pointerId)return;
   drag.x=event.clientX;drag.y=event.clientY;
   if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>=5){
     drag.active=true;cell.classList.add('deck-dragging');updateDeckDrag();
   }else if(drag.active&&!drag.frame)updateDeckDrag();
 };
 function finish(event){
   const drag=deckDrag;
   if(drag?.id!==event.pointerId)return;
   if(drag.active&&event.type==='pointerup'){
     drag.x=event.clientX;drag.y=event.clientY;
     positionDeckDrop(drag);
   }
   deckDrag=null;cancelAnimationFrame(drag.frame);cell.classList.remove('deck-dragging');
   if(!drag.target)return;
   drag.target.removeAttribute('data-drop');
   if(event.type!=='pointerup'||drag.target.parentElement!==deckStrip)return;
   const from=assets.indexOf(asset),target=Array.prototype.indexOf.call(deckStrip.children,drag.target);
   const gap=target+Number(drag.after);
   moveDeckFragment(asset,gap-Number(from<gap));
 }
 handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=finish;
 return handle;
}
