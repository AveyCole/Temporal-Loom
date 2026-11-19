const organicStyles=['Ink Bloom','Cell Fusion','Mycelial Drift','Viscous Flow','Soft Fracture','Phase Refraction',
 'Molten Lens','Kelp Fold','Migrating Filaments','Sediment Erosion',...organicVariants];
let organicSeed=Math.random()*4096;
let organicRenderer;
const organicVertex=`
attribute vec2 vertex;
varying vec2 uv;
void main(){uv=vertex*.5+.5;gl_Position=vec4(vertex,0.,1.);}
`;
const organicFragment=`
precision highp float;
varying vec2 uv;
uniform sampler2D outgoing,incoming;
uniform vec2 cropA,cropB,screen;
uniform float progress,clock,seed,strength,level,pulse;
uniform int style;
vec2 hash(vec2 p){
 return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)))+seed)*43758.5453);
}
float noise(vec2 p){
 vec2 cell=floor(p),f=fract(p);
 f=f*f*(3.-2.*f);
 return mix(mix(hash(cell).x,hash(cell+vec2(1,0)).x,f.x),
            mix(hash(cell+vec2(0,1)).x,hash(cell+vec2(1,1)).x,f.x),f.y);
}
vec2 rot(vec2 v,float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c)*v;}
float fbm(vec2 p){
 float v=0.,a=.52;
 for(int octave=0;octave<4;octave++){v+=a*noise(p);p=rot(p,1.25)*2.09+7.2;a*=.50;}
 return v;
}
vec2 mirror(vec2 p){return 1.-abs(mod(p,2.)-1.);}
vec3 sampleA(vec2 p){return texture2D(outgoing,mirror(.5+(p-.5)*cropA)).rgb;}
vec3 sampleB(vec2 p){return texture2D(incoming,mirror(.5+(p-.5)*cropB)).rgb;}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 cellular(vec2 p,float t){
 vec2 cell=floor(p),f=fract(p);
 float near=9.,second=9.,id=0.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
   vec2 k=vec2(float(x),float(y)),h=hash(cell+k);
   vec2 feature=.5+.39*sin(6.28318*h+t*vec2(.62,-.44));
   vec2 d=k+feature-f;
   float q=dot(d,d);
   if(q<near){second=near;near=q;id=h.x;}else second=min(second,q);
 }
 return vec3(sqrt(near),sqrt(second)-sqrt(near),id);
}
vec2 vortex(vec2 p,vec2 center,float angle,float radius){
 vec2 d=p-center;
 return center+rot(d,angle*exp(-dot(d,d)/radius));
}
void main(){
 float p=progress,t=clock;
 float phase=sin(p*3.14159265),react=min(1.6,level*.9+pulse*.85);
 float intensity=strength*(phase+.16*react)*(1.+.45*react);
 vec2 norm=vec2(screen.x/screen.y,1.);
 vec2 x=(uv-.5)*norm;
 vec2 q=x*3.8;
 vec2 wind=vec2(t*.13,-t*.09);
 vec2 flow=vec2(fbm(q+wind+12.),fbm(q-wind-17.))-.46;
 vec2 warp=flow*.52;
 float field=0.,edge=0.;
 vec3 pigment=vec3(0.);
 vec3 baseA=sampleA(uv),baseB=sampleB(uv);
 float detail=lum(baseB)-lum(baseA);
 if(style==0){
   vec2 curl=q+flow*2.7+wind;
   float pigment=fbm(curl+vec2(fbm(curl*1.3),fbm(curl*1.2+9.))*1.8);
   field=(pigment-.45)*1.65+detail*.26;
   edge=1.-smoothstep(.025,.14,abs(p-.5+field));
   warp+=vec2(fbm(curl*1.7),fbm(curl*1.7+20.))*.33-.16;
 }else if(style==1){
   vec3 c=cellular(q*1.5+flow*.93,t+p*2.);
   float membrane=exp(-22.*c.y);
   field=(.39-c.x)*1.18+(c.z-.5)*.45+detail*.21;
   edge=membrane;
   warp=flow*.61+vec2(sin(c.x*11.+t),cos(c.y*8.-t))*membrane*.065;
 }else if(style==2){
   vec2 branches=q+flow*2.5;
   float fibers=abs(sin((branches.x+fbm(branches*1.8)*3.2)*5.3));
   float twigs=pow(1.-fibers,3.);
   field=(twigs-.35)*.56+(fbm(branches+wind)-.5)*.9+detail*.31;
   edge=twigs;
   warp=flow*.75+vec2(sin(branches.y*2.2+t),cos(branches.x*2.2+t))*.064;
 }else if(style==3){
   vec2 site=hash(vec2(3.,7.))-.5;
   vec2 d=vortex(x,site*.61+vec2(sin(t*.6),cos(t*.4))*.16,3.1*intensity,.22);
   d=vortex(d,-site*.73+vec2(cos(t*.42),sin(t*.55))*.23,-3.7*intensity,.17);
   warp=(d-x)/max(.18,intensity)+flow*.25;
   field=(fbm(d*5.5+wind)-.48)*1.35+detail*.27;
   edge=.1+abs(noise(d*7.)-.5)*.5;
 }else if(style==4){
   vec3 c=cellular(q*2.2+flow*1.15,t*.62);
   float seam=1.-smoothstep(.015,.16,c.y);
   field=(c.z-.5)*.7+(.38-c.x)*.42+detail*.32;
   edge=seam;
   warp=rot(flow,6.28318*c.z)*.76+vec2(c.x-.32,c.y-.2)*.13;
 }else if(style==5){
   vec2 lens=q+flow*3.3;
   float wave=sin(length(lens+flow*1.2)*6.+t*1.3+fbm(lens*2.1)*5.);
   field=wave*.28+(fbm(lens+wind)-.5)*.69+detail*.28;
   edge=pow(.5+.5*wave,4.);
   warp=rot(flow,wave*2.7+t*.3)*.65;
 }else if(style==6){
   // Moving lenses grow and slump as their fields overlap.
   vec2 pull=vec2(0.);
   float melt=0.;
   for(int i=0;i<5;i++){
     vec2 id=hash(vec2(float(i),11.));
     vec2 center=(id-.5)*norm*.9+.18*sin(t*.57+id*9.);
     vec2 d=x-center;
     float r=.026+.051*id.x+.035*phase;
     float influence=r/(r+dot(d,d));
     pull-=d*pow(influence,2.)*(1.6+sin(t*.8+id.y*8.));
     melt+=pow(influence,2.);
   }
   warp=pull+flow*.21;
   edge=sin(melt*18.)*.5+.5;
   field=(melt-.55)*.72+detail*.3;
 }else if(style==7){
   // Stretch and tuck alternating pleats along an irregular moving spine.
   vec2 tissue=rot(x,.43+sin(t*.47)*.41);
   float spine=tissue.x+sin(tissue.y*7.+t*.82)*.18+flow.x*.43;
   float pleat=spine*19.+fbm(q*1.4+wind)*4.;
   float ridge=2./(1.+exp(-sin(pleat)*5.2))-1.;
   warp=rot(vec2(ridge*.13,cos(pleat)*.17),-.43)+flow*.29;
   edge=pow(1.-abs(ridge),4.);
   field=ridge*.23+detail*.33+flow.y*.60;
 }else if(style==8){
   // Advect the surface twice to carry thin ribbons around the moving field.
   vec2 d=q+wind;
   for(int i=0;i<3;i++){
     vec2 v=vec2(cos(d.y*1.9+t*.64),sin(d.x*1.6-t*.55));
     d+=v*.38+flow*.74;
   }
   float ribbon=sin((d.x+fbm(d*1.3)*1.7)*14.+d.y*2.);
   warp=(d-q-wind)*.14;
   edge=pow(.5+.5*ribbon,9.);
   field=ribbon*.17+flow.x*.8+detail*.27;
 }else if(style==9){
   // The source images' local brightness gradients steer the erosion.
   vec2 offset=vec2(.008,0.);
   float dx=lum(sampleA(uv+offset))-lum(sampleA(uv-offset));
   float dy=lum(sampleB(uv+offset.yx))-lum(sampleB(uv-offset.yx));
   vec2 slope=vec2(dx,dy);
   float bed=fbm(q*1.5+flow+wind);
   float layers=sin(bed*27.+detail*3.+p*9.-t*.8);
   warp=flow*.46+vec2(-dy,dx)*(.36+.50*bed);
   edge=smoothstep(.014,.26,length(slope))*(.5+.5*layers);
   field=detail*.45+(bed-.45)*.82+layers*.11;
${organicVariantShader}
 }
 vec2 bend=warp/norm*intensity;
 vec2 drift=vec2(-flow.y,flow.x)/norm*intensity*.23;
 vec3 a=sampleA(uv+bend*(.6+p)+drift);
 vec3 b=sampleB(uv-bend*(1.6-p)+drift);
 float blend=smoothstep(0.,1.,clamp(p+field*intensity,0.,1.));
 vec3 outputColor=mix(a,b,blend);
 // Pull the two textures apart at their shared boundaries and let them bleed back together.
 float seam=clamp(edge*phase*intensity*.32,0.,.35);
 vec3 bleed=vec3(sampleA(uv+bend*1.8).r,mix(a.g,b.g,.5),sampleB(uv-bend*1.9).b);
 outputColor=mix(outputColor,bleed,seam);
 gl_FragColor=vec4(outputColor+pigment*phase*intensity,1.);
}
`;

function createOrganicRenderer(){
 const surface=document.createElement('canvas');
 const gl=surface.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
 if(!gl)return null;
 function compile(type,source){
   const shader=gl.createShader(type);
   gl.shaderSource(shader,source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
   return shader;
 }
 const program=gl.createProgram();
 const vertex=compile(gl.VERTEX_SHADER,organicVertex);
 const fragment=compile(gl.FRAGMENT_SHADER,organicFragment.replace('precision highp float;',gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision?'precision highp float;':'precision mediump float;'));
 gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
 gl.deleteShader(vertex);gl.deleteShader(fragment);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);
 const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
 const pos=gl.getAttribLocation(program,'vertex');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
 gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
 const names=['outgoing','incoming','cropA','cropB','screen','progress','clock','seed','strength','level','pulse','style'];
 const u=Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(program,name)]));
 const stages=[0,1].map(index=>{
   const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);
   for(const [key,value] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,key,value);
   return {texture,buffer:document.createElement('canvas')};
 });
 gl.uniform1i(u.outgoing,0);gl.uniform1i(u.incoming,1);
 function upload(index,image){
   const slot=stages[index];
   const video=image.tagName==='VIDEO',mutable=image.tagName==='CANVAS'&&!image.dataset.morphStatic;
   const width=image.videoWidth||image.naturalWidth||image.width,height=image.videoHeight||image.naturalHeight||image.height;
   if(!width||!height)return null;
   if(slot.source!==image || mutable || (video&&slot.frame!==image.currentTime)){
     const ratio=Math.min(1,1440/Math.max(width,height));
     let pixels=image;
     if(ratio<1){
       slot.buffer.width=Math.max(1,Math.round(width*ratio));slot.buffer.height=Math.max(1,Math.round(height*ratio));
       slot.buffer.getContext('2d').drawImage(image,0,0,slot.buffer.width,slot.buffer.height);pixels=slot.buffer;
     }
     gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,slot.texture);
     gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
     slot.source=image;slot.frame=video?image.currentTime:-1;
   }
   return width/height;
 }
 return {draw(index,first,second,p,time,motion,key){
   if(gl.isContextLost())return false;
   const a=upload(0,first),b=upload(1,second);
   if(!a||!b)return false;
   const w=canvas.width,h=canvas.height,aspect=w/h,ratio=Math.min(1,1000/Math.max(w,h));
   const width=Math.max(1,Math.round(w*ratio)),height=Math.max(1,Math.round(h*ratio));
   if(surface.width!==width||surface.height!==height){surface.width=width;surface.height=height;gl.viewport(0,0,width,height);}
   gl.uniform2f(u.cropA,Math.min(1,aspect/a),Math.min(1,a/aspect));
   gl.uniform2f(u.cropB,Math.min(1,aspect/b),Math.min(1,b/aspect));
   gl.uniform2f(u.screen,width,height);
   gl.uniform1f(u.progress,p);gl.uniform1f(u.clock,time);gl.uniform1f(u.seed,key);
   gl.uniform1f(u.strength,Number($('warp').value));gl.uniform1f(u.level,motion.level||0);gl.uniform1f(u.pulse,motion.pulse||0);
   gl.uniform1i(u.style,index);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
   ctx.drawImage(surface,0,0,w,h);
   return true;
 }};
}
function createOrganicFallback(){
 const make=()=>document.createElement('canvas').getContext('2d',{willReadFrequently:true});
 const a=make(),b=make(),out=make();
 function pixels(g,source,w,h){
   const iw=source.videoWidth||source.naturalWidth||source.width,ih=source.videoHeight||source.naturalHeight||source.height;
   if(!iw||!ih)return null;
   if(g.canvas.width!==w||g.canvas.height!==h){g.canvas.width=w;g.canvas.height=h;}
   g.fillStyle='#07100c';g.fillRect(0,0,w,h);
   const scale=Math.max(w/iw,h/ih);
   g.drawImage(source,(w-iw*scale)/2,(h-ih*scale)/2,iw*scale,ih*scale);
   return g.getImageData(0,0,w,h).data;
 }
 function reflect(n){return 1-Math.abs(((n%2+2)%2)-1);}
 return {draw(index,first,second,p,t,motion,seed){
   const ratio=Math.min(1,224/Math.max(canvas.width,canvas.height));
   const w=Math.max(1,Math.round(canvas.width*ratio)),h=Math.max(1,Math.round(canvas.height*ratio));
   const x=pixels(a,first,w,h),y=pixels(b,second,w,h);
   if(!x||!y)return false;
   if(out.canvas.width!==w||out.canvas.height!==h){out.canvas.width=w;out.canvas.height=h;}
   const output=out.createImageData(w,h),d=output.data;
   const strength=Number($('warp').value)*(Math.sin(Math.PI*p)+.26*(motion.level+motion.pulse));
   const s=seed*.022,v=t*.66,variant=[0,0,0];
   for(let j=0;j<h;j++)for(let i=0;i<w;i++){
     const u=i/Math.max(1,w-1),z=j/Math.max(1,h-1);
     if(index>=10)organicVariantField(index,u-.5,z-.5,p,t,s,variant);
     else{
       const qx=u*7+1.5*Math.sin(z*9+v+s),qy=z*7+1.5*Math.cos(u*9-v-s);
       const waves=Math.sin(qx+qy+v+s)*Math.cos(qy*1.4-v),fold=Math.sin(qx*(index+1)*.63+Math.sin(qy*2-v));
       variant[0]=waves*.32+fold*.23;
       variant[1]=waves*.11+fold*.05;
       variant[2]=Math.sin(qx-qy+v)*.12+fold*.035;
     }
     const dx=variant[1]*strength,dy=variant[2]*strength;
     const at=(xx,yy)=>(Math.round(reflect(yy)*(h-1))*w+Math.round(reflect(xx)*(w-1)))*4;
     const ai=at(u+dx,z+dy),bi=at(u-dx,z-dy);
     const detail=(y[bi+1]-x[ai+1])/255;
     const mask=Math.max(0,Math.min(1,p+(variant[0]+detail*.22)*strength));
     const blend=mask*mask*(3-2*mask),pos=(j*w+i)*4;
     for(let c=0;c<3;c++)d[pos+c]=x[ai+c]+(y[bi+c]-x[ai+c])*blend;
     d[pos+3]=255;
   }
   out.putImageData(output,0,0);
   ctx.drawImage(out.canvas,0,0,canvas.width,canvas.height);
   return true;
 }};
}

function drawOrganicMorph(first,second,p,time,motion){
 const index=organicStyles.indexOf($('effect').value);
 if(index<0)return false;
 if(!organicRenderer){
   try{organicRenderer=createOrganicRenderer();}catch(error){console.warn('Organic morph renderer:',error);}
   organicRenderer??=createOrganicFallback();
 }
 const seed=(organicSeed+a*73.13+b*239.67)%4096;
 if(organicRenderer.draw(index,first,second,p,time,motion,seed))return true;
 organicRenderer=createOrganicFallback();
 return organicRenderer.draw(index,first,second,p,time,motion,seed);
}
function mutateMorph(){
 if(!organicStyles.includes($('effect').value)){
   $('effect').value=pick(organicStyles);
   if(!$('warp').valueAsNumber)$('warp').value=.65;
   if(!rack.state.fxRate)rack.restore({...rack.save(),fxRate:1});
   updateOutputs();markDefault(false);
 }
 organicSeed=Math.random()*4096;
 rack.clearHistory();
 report('New variation · '+$('effect').value);
}

