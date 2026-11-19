const organicVariants=[
 'Murmuration','Capillary Rise','Pollen Burst','Magnetic Lace','Coquina Weathering',
 'Bioluminescent Wake','Gossamer Tear','Mantle Convection','Lichen Colonies','Anemone Grip',
 'Moonpool Caustics','Isobar Slip','Chitin Molt','Turbidity Front','Ferrofluid Crown',
 'Vein Graft','Fungal Inversion','Glacial Creep','Echolocation','Tidal Biofilm'
];

const organicVariantShader=`
 }else if(style==10){
   // A flock turns in loose formation. Its wake bends the picture along its heading.
   vec2 shear=vec2(0.);float wings=0.;
   for(int i=0;i<4;i++){
     vec2 id=hash(vec2(float(i),41.));
     vec2 center=(id-.5)*norm+vec2(sin(t*.49+id.x*8.),cos(t*.61+id.y*8.))*.19;
     vec2 d=rot(x-center,t*.31+id.x*6.28);
     float flight=exp(-dot(d*vec2(1.8,6.),d*vec2(1.8,6.)))*sin(d.x*33.+d.y*9.-t*2.4);
     wings+=flight;
     shear+=rot(vec2(d.x*.24,flight*.16),-t*.31-id.x*6.28);
   }
   warp=shear+flow*.19;edge=abs(wings)*.4;field=wings*.27+(x.y+flow.x)*.24;
 }else if(style==11){
   // Narrow channels fill at different rates, then spread sideways into neighbors.
   float comb=(x.x+flow.x*.16)*24.;vec2 id=hash(vec2(floor(comb),65.));
   float tube=1.-abs(fract(comb)*2.-1.);
   float front=x.y+.64-p*(1.1+id.x*.59)+.12*sin(t+id.y*13.);
   float wet=exp(-abs(front)*(4.+id.y*12.));
   warp=vec2((tube-.5)*wet*.105,wet*(.16+id.x*.23))+flow*.19;
   field=-front*.86+(tube-.5)*.22;edge=wet*tube;
   pigment=vec3(.07,.105,-.045)*wet;
 }else if(style==12){
   // An expanding plume peels away into individually seeded dust grains.
   vec2 center=(hash(vec2(24.,9.))-.5)*norm*.65;
   vec2 d=x-center;float r=length(d),angle=atan(d.y,d.x);
   vec2 spores=vec2(angle*10.,r*24.-p*18.-t*.72);
   vec2 id=hash(floor(spores));
   float dotSize=length((fract(spores)-.2-id*.6)*vec2(1.,1.5));
   float dust=(1.-smoothstep(.11,.28,dotSize))*exp(-abs(r-p*.83)*2.9);
   warp=d/max(.13,r)*(dust*.2-.14*exp(-r*3.))+flow*.23;
   field=(p*.75-r)*.76+dust*.58+(id.x-.5)*.12;edge=dust;
   pigment=vec3(.19,.12,-.01)*dust;
 }else if(style==13){
   // Opposing magnetic poles stretch the textures into shared lines of force.
   vec2 pole=rot(vec2(.23+hash(vec2(3.,9.)).x*.12,.05),t*.23+seed*.01);
   vec2 u=x-pole,v=x+pole;
   vec2 vector=u/(dot(u,u)+.032)-v/(dot(v,v)+.032);
   float turn=atan(u.y,u.x)-atan(v.y,v.x);
   float lines=pow(.5+.5*cos(turn*8.+log(1.+length(vector))*4.-t*.63),6.);
   warp=vector/(2.+length(vector))*.25+flow*.12;
   field=sin(turn*2.-t*.6)*.29+lines*.22+detail*.13;edge=lines;
   pigment=vec3(-.07,.065,.19)*lines;
 }else if(style==14){
   // Soluble pockets expand beneath the surface and leave rings around the pits.
   vec2 stone=q*1.65+flow*.8;
   vec3 c=cellular(stone,0.);
   float radius=.13+.36*p+.095*sin(t*.47+c.z*9.);
   float pits=radius-c.x;
   float lip=exp(-28.*abs(pits));
   warp=vec2(cos(c.z*6.28),sin(c.z*6.28))*(max(0.,pits)*.53+lip*.032)+flow*.21;
   field=pits*1.17+detail*.38;edge=lip;
   pigment=vec3(.09,.045,-.035)*(lip-.32*step(0.,pits));
 }else if(style==15){
   // Moving organisms leave crescent wakes that light up at each sound pulse.
   vec2 d=x;float wake=0.;vec2 push=vec2(0.);
   for(int i=0;i<3;i++){
     vec2 id=hash(vec2(float(i),81.));
     float a=t*.73+id.x*12.;
     vec2 v=rot(d-(id-.5)*norm*.53-vec2(cos(a),sin(a))*.21,-a);
     float curve=abs(length(v+vec2(.09,0.))-.19);
     float trail=exp(-24.*curve)*smoothstep(-.06,.17,-v.x);
     wake+=trail;push+=rot(vec2(v.y,-v.x),a)*trail*.56;
   }
   warp=push+flow*.14;field=(wake-.31)*.72+detail*.22;edge=wake;
   pigment=vec3(-.04,.27,.19)*wake*(.5+react*.55);
 }else if(style==16){
   // Counter-pulling sheets tear along an irregular seam, leaving stretched silk strands.
   vec2 silk=rot(x,seed*.018+.23*sin(t*.34));
   float split=silk.x+fbm(vec2(silk.y*5.,t*.42))*.45-.22;
   float strain=exp(-abs(split)*6.);
   float fiber=pow(.5+.5*sin((silk.y+flow.y*.22)*79.+t*.8),13.);
   warp=rot(vec2((2./(1.+exp(-split*18.))-1.)*.27*strain,sin(silk.y*13.)*.10*strain),-seed*.018-.23*sin(t*.34));
   field=split*.92+(fiber-.25)*strain*.38;edge=strain*fiber;
   pigment=vec3(.17,.12,.21)*edge;
 }else if(style==17){
   // Wide convection rolls carry the layers in opposing directions above and below a midline.
   vec2 current=rot(x,.31+flow.x*.6);
   float xx=current.x*8.+t*.57+seed*.11,yy=current.y*9.+t*.33;
   float cold=cos(xx)*cos(yy),heat=sin(xx)*sin(yy);
   warp=vec2(sin(xx)*cos(yy),-cos(xx)*sin(yy))*.33+flow*.09;
   field=heat*.43-cold*.17+detail*.15;edge=pow(abs(cold),3.);
   pigment=mix(vec3(-.09,.035,.18),vec3(.19,.045,-.085),.5+.5*heat)*edge;
 }else if(style==18){
   // Neighboring colonies invade in overlapping discs and feather at their perimeter.
   vec2 lichen=q*1.4+flow*.56;
   vec2 tile=floor(lichen),f=fract(lichen);
   float wall=3.,roughness=noise(lichen*9.)*.14;vec2 root=vec2(0.);
   for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
     vec2 k=vec2(float(i),float(j)),id=hash(tile+k);
     vec2 d=k+.13+id*.74-f;
     float phase=.08+.48*p+.19*id.y+.055*sin(t*.76+id.x*7.);
     float colony=length(d)-phase+roughness;
     if(colony<wall){wall=colony;root=d;}
   }
   edge=exp(-16.*abs(wall));warp=root*(edge*.26+max(0.,-wall)*.29)+flow*.18;
   field=-wall*1.28+detail*.23;
   pigment=vec3(.06,.14,-.03)*edge;
 }else if(style==19){
   // Uneven tentacles rotate and lengthen before gripping the two surfaces.
   vec2 d=x+(hash(vec2(39.,39.))-.5)*.48;
   float r=length(d),a=atan(d.y,d.x);
   float grip=pow(.5+.5*cos(a*9.+r*10.+sin(r*13.-t)*1.4-t*.73),5.);
   float reach=exp(-abs(r-(.16+.56*p))*4.3);
   warp=rot(d,a*.2+1.57)*grip*reach*.56-d*reach*.22+flow*.14;
   field=(grip-.35)*reach*.75+(p-r)*.31;edge=reach*grip;
   pigment=vec3(.19,.015,.095)*edge;
 }else if(style==20){
   // Three crossing wave trains focus into moving pools of light.
   vec2 a=rot(x,t*.11+seed*.009)*21.;
   float u=sin(a.x+t*1.2),v=sin(a.y-t*1.7),w=sin((a.x+a.y)*.67+t*.94);
   float focus=pow(.5+.5*(u*v*w),6.);
   warp=vec2(cos(a.x+t*1.2)*v,cos(a.y-t*1.7)*u)*.15+flow*.14;
   field=(u+v+w)*.11+focus*.35+detail*.10;edge=focus;
   pigment=vec3(.19,.21,.16)*focus;
 }else if(style==21){
   // Barometric contours slide at different rates around a wandering pressure center.
   vec2 d=x-vec2(sin(t*.34+seed*.03),cos(t*.21))*.25;
   float pressure=length(d*vec2(1.4,.68))+fbm(q*.75+wind)*.72;
   float line=pressure*28.-t*.9+p*5.;
   float fold=sin(line)*.66+sin(line*.48)*.34;
   warp=(vec2(d.y,-d.x)*fold*.49+vec2(fold,-fold*.21)*.11)+flow*.17;
   field=(.68-pressure)*.74+fold*.21;edge=pow(1.-abs(fold),5.);
   pigment=vec3(-.02,.095,.12)*edge;
 }else if(style==22){
   // Staggered plates lift and roll back from one edge as the new surface grows in.
   vec2 grid=rot(x,.29+flow.x*.34)*vec2(9.,11.);
   grid.x+=.5*mod(floor(grid.y),2.);
   vec2 tile=floor(grid),f=fract(grid)-.5;
   float lift=p*1.65-(hash(tile+21.).x*.81+.24*f.y);
   float peel=sin(3.14*clamp(lift,0.,1.));
   float shell=1.-smoothstep(.43,.61,length(f*vec2(1.2,.8)));
   warp=rot(vec2(f.x*.22,-peel*.25+f.y*peel*.12),-.29)*shell+flow*.12;
   field=(lift-.55)*shell*.72+detail*.25;edge=peel*(1.-shell);
   pigment=vec3(.115,.062,-.045)*shell*peel;
 }else if(style==23){
   // A sediment current undercuts its head and leaves hanging jets behind it.
   float head=x.y+.6-p*1.24+fbm(vec2(x.x*4.2-t*.6,t*.33))* .38;
   float drag=exp(-head*head*24.);
   float jets=fbm(vec2(x.x*15.+flow.x*2.,x.y*3.-t*.88));
   warp=vec2(drag*(.19+jets*.27),-.42*drag*(jets-.42))+flow*.26;
   field=-head*.82+(jets-.47)*drag*.79;edge=drag*jets;
   pigment=vec3(.11,.035,-.06)*edge;
 }else if(style==24){
   // A moving magnetic crown throws thin spikes that fork as they leave the surface.
   vec2 d=x-(hash(vec2(45.,2.))-.5)*norm*.43;
   float r=length(d),a=atan(d.y,d.x);
   float thorn=pow(.5+.5*cos(a*14.+r*3.-t*.92+sin(a*5.+t)*.37),10.);
   float crown=.12+p*.5+thorn*(.17+.16*react)+fbm(q*2.)*.12;
   float boundary=exp(-21.*abs(r-crown));
   warp=d/max(r,.06)*boundary*(.08+thorn*.19)+flow*.20;
   field=(crown-r)*.91+thorn*.19;edge=boundary;
   pigment=vec3(.21,.045,.24)*thorn*boundary-vec3(.04)*boundary;
 }else if(style==25){
   // Splitting channels graft narrow patches of the next image onto thicker stems.
   vec2 graft=rot(x,.63+seed*.012);
   float spine=graft.x+.16*sin(graft.y*8.+t*.76)+flow.x*.28;
   float ribs=abs(sin(spine*16.));
   float branch=abs(sin(spine*39.+graft.y*19.+sin(graft.y*11.)*2.));
   float vessels=exp(-ribs*10.)+.64*exp(-branch*15.)*(1.-ribs);
   warp=rot(vec2((ribs-.5)*.12, vessels*.25),-.63-seed*.012)+flow*.18;
   field=vessels*.69+detail*.32-.28;edge=vessels;
   pigment=vec3(.15,.025,.075)*edge;
 }else if(style==26){
   // Small basins turn inside out like opening caps, with the image's tone picking the first folds.
   vec2 caps=q*1.13+flow*.62;
   vec2 id=hash(floor(caps));vec2 d=fract(caps)-.24-id*.52;
   float r=length(d),fold=sin((r+.18*detail)*12.-t*.72+id.x*7.);
   vec2 inverted=rot(d,fold*(.5+2.*p))*(1.-.68*r);
   warp=(inverted-d)*.52+flow*.20;
   field=fold*.32+detail*.45+(.35-r)*.42;edge=pow(1.-abs(fold),4.);
   pigment=vec3(.10,.09,-.06)*edge;
 }else if(style==27){
   // Glacial strata shear under sustained pressure and widen around grinding ridges.
   vec2 ice=rot(x,.71+seed*.006);
   float ridges=ice.y+fbm(vec2(ice.x*3.8,t*.16))* .37;
   float crest=sin(ridges*27.-t*.45+flow.y*3.);
   float crack=exp(-abs(ice.x+.21*sin(ridges*12.))*7.);
   warp=rot(vec2(crest*.24+crack*.14,crack*(ice.y-.32)*.43),-.71-seed*.006);
   field=crest*.13+crack*.44+detail*.27+ice.x*.42;edge=crack*pow(1.-abs(crest),5.);
   pigment=vec3(-.085,.13,.21)*edge;
 }else if(style==28){
   // Three reflected chirps cross and lift image edges into short-lived relief.
   float returnWave=0.;vec2 push=vec2(0.);
   for(int i=0;i<3;i++){
     vec2 id=hash(vec2(float(i),74.));
     vec2 d=x-(id-.5)*norm*.97;
     float r=length(d),wave=sin(r*(30.+id.x*14.)-t*(1.7+id.y)+float(i)*1.73);
     float echo=exp(-r*2.5)*wave;
     push+=d/max(r,.08)*echo*.11;returnWave+=echo;
   }
   warp=push+flow*.13;
   field=returnWave*.44+detail*.36;edge=pow(min(1.,abs(returnWave)),3.);
   pigment=vec3(-.035,.16,.07)*edge;
 }else if(style==29){
   // Stringy biofilm stretches along an oscillating waterline and snaps into bubbles.
   float tide=x.y+.57-p*1.11+.13*sin(x.x*8.+t*.82)+.095*sin(x.x*14.-t*.53);
   float meniscus=exp(-abs(tide)*10.);
   vec3 c=cellular(vec2(q.x*3.8+t*.38,tide*18.)+flow*.82,t*.38);
   float bubble=exp(-24.*abs(c.x-.27-.13*react));
   warp=vec2(sin(x.x*7.+t*.63)*.23,meniscus*(c.x-.46)*.37)+flow*.21;
   field=-tide*.81+(bubble-.46)*meniscus*.41;edge=meniscus*bubble;
   pigment=vec3(.04,.17,.14)*edge;
`;

const organicFract=value=>value-Math.floor(value);
function organicVariantField(style,x,y,p,t,seed,out){
 const {sin,cos,abs,sqrt,atan2,floor,exp,pow}=Math;
 const fract=organicFract;
 const xx=x-.18*sin(seed+t*.23),yy=y-.16*cos(seed*.7-t*.18);
 let r,angle,v,k,field,dx,dy;
 switch(style){
   case 10:
     v=sin(xx*24.+yy*7.-t*2.)*exp(-yy*yy*18.);k=sin(y*15.+t)*cos(x*7.);
     field=v*.36;dx=k*.08;dy=v*.18;break;
   case 11:
     k=1.-abs(fract((xx+.018*sin(yy*18.))*23.)*2.-1.);v=yy+.57-p*(.9+sin(floor(xx*23.)+seed)*.31);
     field=-v*.83;dx=(k-.5)*.08;dy=exp(-abs(v)*9.)*.29;break;
   case 12:
     r=sqrt(xx*xx+yy*yy);angle=atan2(yy,xx);
     v=exp(-abs(r-p*.78)*4.)*pow(.5+.5*sin(r*83.-t*3.)*cos(angle*37.+seed),6.);
     field=(p*.72-r)*.65+v*.54;dx=xx*v*.37;dy=yy*v*.37;break;
   case 13:
     angle=atan2(yy,xx-.24)-atan2(yy,xx+.24);v=cos(angle*8.-t);
     field=sin(angle*2.+t)*.31+v*.17;dx=sin(angle)*v*.19;dy=cos(angle)*v*.19;break;
   case 14:
     r=sqrt(pow(fract(xx*11.)-.5,2)+pow(fract(yy*11.)-.5,2));v=.14+p*.33+.06*sin(floor(xx*11.)*5.+t)-r;
     field=v*1.13;dx=exp(-abs(v)*21.)*.12;dy=-dx*sin(yy*8.);break;
   case 15:
     r=sqrt(pow(xx+.13*cos(t),2)+pow(yy-.19*sin(t),2));v=exp(-abs(r-.23)*24.)*(.5+.5*sin(t-xx*8.));
     field=(v-.22)*.63;dx=yy*v*.7;dy=-xx*v*.7;break;
   case 16:
     v=xx+.21*sin(yy*7.+t*.78);k=exp(-abs(v)*7.);
     field=v*.78+pow(.5+.5*cos(yy*79.+seed),9.)*k*.25;dx=k*(2./(1.+exp(-16.*v))-1.)*.27;dy=k*sin(yy*13.)*.09;break;
   case 17:
     v=xx*8.+t*.57;k=yy*9.+t*.33;
     field=sin(v)*sin(k)*.45;dx=sin(v)*cos(k)*.31;dy=-cos(v)*sin(k)*.31;break;
   case 18:
     v=fract(xx*5.)-.5;k=fract(yy*5.)-.5;
     r=sqrt(v*v+k*k);angle=.15+.46*p+.08*sin(floor(xx*5.)*8.+floor(yy*5.)*3.+t);
     field=(angle-r)*1.1;dx=v*exp(-abs(field)*14.)*.31;dy=k*exp(-abs(field)*14.)*.31;break;
   case 19:
     r=sqrt(xx*xx+yy*yy);angle=atan2(yy,xx);
     v=pow(.5+.5*cos(angle*9.+r*10.-t),5.)*exp(-abs(r-.15-p*.5)*5.);
     field=v*.67-r*.26;dx=-yy*v*.63;dy=xx*v*.63;break;
   case 20:
     v=sin(xx*22.+t*1.2);k=sin(yy*20.-t*1.7);
     field=(v+k+sin((xx+yy)*15.+t))*.13;dx=cos(xx*22.+t*1.2)*k*.15;dy=cos(yy*20.-t*1.7)*v*.15;break;
   case 21:
     r=sqrt(xx*xx*1.7+yy*yy*.48);v=sin((r+.11*cos(x*5.+seed))*26.-t*1.4);
     field=(.5-r)*.7+v*.22;dx=v*(.11+yy*.37);dy=-v*xx*.37;break;
   case 22:
     k=floor(yy*10.);v=fract(xx*9.+.5*(k%2))-.5;r=fract(yy*10.)-.5;
     angle=sin(floor(xx*9.)*9.+k*5.+seed);field=(p*1.8+.4*angle-r*.23-.85)*(1.-abs(v));
     dx=v*.18;dy=-sin(Math.PI*Math.min(1,Math.max(0,field+.5)))*.23*(1.-abs(v));break;
   case 23:
     v=yy+.59-p*1.22+.17*sin(xx*8.-t*.71);k=exp(-v*v*22.);
     field=-v*.82+k*sin(xx*29.+t*1.3)*.31;dx=k*.26;dy=k*cos(xx*29.+t*1.3)*.19;break;
   case 24:
     r=sqrt(xx*xx+yy*yy);angle=atan2(yy,xx);
     v=pow(.5+.5*cos(angle*14.+r*3.-t+.33*sin(angle*5.)),9.);
     k=.13+p*.5+v*.24-r;field=k*.95;dx=xx*v*exp(-abs(k)*17.);dy=yy*v*exp(-abs(k)*17.);break;
   case 25:
     v=xx+.17*sin(yy*8.+t*.75);k=exp(-abs(sin(v*16.))*9.)+.6*exp(-abs(sin(v*38.+yy*19.))*14.);
     field=k*.73-.25;dx=sin(v*16.)*.075;dy=k*.25;break;
   case 26:
     v=fract(xx*4.)-.5;k=fract(yy*4.)-.5;r=sqrt(v*v+k*k);
     angle=sin(r*15.-t+floor(xx*4.)*3.)*(.7+2.*p);field=angle*.23-r*.26;
     dx=(cos(angle)*v-sin(angle)*k-v)*.47;dy=(sin(angle)*v+cos(angle)*k-k)*.47;break;
   case 27:
     v=yy+.31*xx+.1*cos(xx*6.+seed-t*.23);k=sin(v*27.-t*.45);r=exp(-abs(xx+.21*sin(v*12.))*7.);
     field=k*.15+r*.41+xx*.39;dx=k*.23+r*.13;dy=r*(yy-.29)*.39;break;
   case 28:
     r=sqrt(pow(xx-.23,2)+yy*yy);v=sin(r*36.-t*2.)*exp(-r*2.5);
     r=sqrt(pow(xx+.29,2)+pow(yy-.18,2));k=cos(r*41.-t*2.5)*exp(-r*2.4);
     field=(v+k)*.4;dx=v*.13;dy=k*.13;break;
   case 29:
     v=yy+.55-p*1.1+.16*sin(xx*8.+t)+.08*sin(xx*14.-t*.53);k=exp(-abs(v)*10.);
     r=1.-abs(fract(xx*19.+t*.4)*2.-1.);field=-v*.78+(r-.45)*k*.45;dx=sin(xx*7.+t*.63)*.21;dy=(r-.48)*k*.27;break;
 }
 out[0]=field;out[1]=dx;out[2]=dy;
}
