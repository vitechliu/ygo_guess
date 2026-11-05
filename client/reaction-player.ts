import type {PlayerReaction} from '../shared/types';
import {audioEnabled} from './audio-settings';

type Point={x:number;y:number};
type Sprite={x:number;y:number;width:number;height:number;displayWidth:number;displayHeight:number};
type Animation={width:number;height:number;fps:number;duration:number;originX:number;originY:number;scale:number;columns:number;frames:number};
type Manifest={sprites:Record<string,Sprite>;animations:Record<string,Animation>;audio:Record<string,string>};
type Pose=Point&{scale?:number;rotation?:number;alpha?:number};
type Actor={begin:number;life:number;pose:(time:number)=>Pose;sprite?:string|((time:number)=>string);animation?:string};
type Effect={reaction:PlayerReaction;start:number;actors:Actor[];sounds:{time:number;name:string;played?:boolean}[];duration:number;from:Point;to:Point};
const ROOT='/player-reactions/';
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const images=new Map<string,Promise<HTMLImageElement>>();
let manifestPromise:Promise<Manifest>|undefined;
function manifest():Promise<Manifest> {
  return manifestPromise??=fetch(ROOT+'manifest.json').then(response=>{
    if(!response.ok)throw Error('Reaction manifest unavailable');
    return response.json() as Promise<Manifest>;
  }).catch(error=>{manifestPromise=undefined;throw error;});
}
function image(name:string):Promise<HTMLImageElement> {
  let pending=images.get(name);
  if(!pending){
    pending=new Promise<HTMLImageElement>((resolve,reject)=>{
      const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Reaction image unavailable'));img.src=ROOT+name+'.webp';
    }).catch(error=>{images.delete(name);throw error;});
    images.set(name,pending);
  }
  return pending;
}
const pair=(name:string)=>name+(Math.random()<.5?'01':'02');
const variants=(r:PlayerReaction)=>r.quantity===1?[]:r.kind==='flower'?['roseburst-play','cup-play1','cup-play2']:['eggburst-play','shoehit-play'];

// One canvas, at most six concurrent timelines and four voices. No idle animation loop.
export class ReactionPlayer {
  private effects:Effect[]=[];
  private pending=0;
  private generation=0;
  private disposed=false;
  private frame=0;
  private data?:Manifest;
  private loaded=new Map<string,HTMLImageElement>();
  private audio?:AudioContext;
  private buffers=new Map<string,Promise<AudioBuffer|undefined>>();
  private voices=new Set<AudioBufferSourceNode>();
  private seen=new Set<string>();
  constructor(private canvas:HTMLCanvasElement,private selfId:string){}
  unlock=()=>{
    if(this.disposed||!audioEnabled())return;
    try{
      this.audio??=new AudioContext();
      if(this.audio.state==='suspended')void this.audio.resume().catch(()=>{});
    }catch{/* Audio is optional; visual playback remains available. */}
  };
  mute=()=>{
    if(!audioEnabled())for(const voice of this.voices)voice.stop();
  };
  private async buffer(name:string):Promise<AudioBuffer|undefined> {
    if(!this.audio||!this.data?.audio[name])return;
    let pending=this.buffers.get(name);
    if(!pending){
      const audio=this.audio;
      pending=fetch(ROOT+this.data.audio[name]).then(response=>{
        if(!response.ok)throw Error('Reaction audio unavailable');
        return response.arrayBuffer();
      }).then(bytes=>audio.decodeAudioData(bytes)).catch(()=>{this.buffers.delete(name);return undefined;});
      this.buffers.set(name,pending);
    }
    return pending;
  }
  private sound(name:string):void {
    if(!audioEnabled()||this.audio?.state!=='running'||this.voices.size>=4)return;
    // A late download must not play an old cue after its visual has ended.
    const started=performance.now(),generation=this.generation;
    void this.buffer(name).then(buffer=>{
      if(!buffer||this.disposed||document.hidden||generation!==this.generation||performance.now()-started>250||!audioEnabled()||this.voices.size>=4||this.audio?.state!=='running')return;
      const voice=this.audio.createBufferSource(),gain=this.audio.createGain();gain.gain.value=.25;
      voice.buffer=buffer;voice.connect(gain);gain.connect(this.audio.destination);
      voice.onended=()=>{this.voices.delete(voice);voice.disconnect();gain.disconnect();};
      this.voices.add(voice);voice.start();
    });
  }
  async play(reaction:PlayerReaction):Promise<void> {
    if(this.disposed||document.hidden||this.pending>=6||this.seen.has(reaction.id))return;
    this.seen.add(reaction.id);if(this.seen.size>100)this.seen.delete(this.seen.values().next().value!);
    this.pending++;
    const generation=this.generation;
    try{
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const names=['sprites',...(reduced?[]:variants(reaction))];
      const [data,loaded]=await Promise.all([manifest(),Promise.all(names.map(async name=>[name,await image(name)] as const))]);
      if(this.disposed||document.hidden||generation!==this.generation)return;
      this.data=data;for(const [name,img] of loaded)this.loaded.set(name,img);
      const from=this.anchor(reaction.senderPlayerId,false),to=this.anchor(reaction.targetPlayerId,true);
      if(!from||!to)return;
      const effect:Effect={reaction,start:performance.now(),from,to,actors:[],sounds:[],duration:0};
      this.plan(effect,reduced);
      // Preload only the sounds used by this timeline; never block visuals on audio.
      if(audioEnabled())for(const cue of effect.sounds)void this.buffer(cue.name);
      if(this.effects.length>=6)this.effects.shift();
      this.effects.push(effect);
      this.canvas.dataset.active=String(this.effects.length);
      if(!this.frame)this.frame=requestAnimationFrame(this.draw);
    }catch{/* A missing cosmetic asset must not interrupt the game or command acknowledgements. */}
    finally{this.pending--;}
  }
  private anchor(id:string,target:boolean):Point|undefined {
    const card=document.querySelector<HTMLElement>('[data-testid="player-'+CSS.escape(id)+'"]');
    const element=card?.querySelector(target?'.card-frame':'.avatar');
    if(!element)return;
    const rect=element.getBoundingClientRect();
    return {x:Math.max(24,Math.min(innerWidth-24,rect.x+rect.width/2)),y:Math.max(48,Math.min(innerHeight-48,rect.y+rect.height/2))};
  }
  private plan(e:Effect,reduced:boolean):void {
    const {from,to}=e,own=e.reaction.senderPlayerId===this.selfId;
    const sprite=(name:Actor['sprite'],begin:number,life:number,pose:Actor['pose'])=>e.actors.push({sprite:name,begin,life,pose});
    const sound=(time:number,name:string)=>e.sounds.push({time,name});
    const animation=(name:string,begin:number,point:Point,scale=1,rotation=0,life?:number)=>{
      const a=this.data!.animations[name];
      e.actors.push({animation:name,begin,life:life??a.duration,pose:()=>({...point,scale,rotation})});
      return a.duration;
    };
    const move=(name:string,begin:number,time:number,a:Point,b:Point,options:{scale0?:number;scale1?:number;rotation0?:number;rotation1?:number;alpha?:number;fade?:number}={})=>{
      const {scale0=1,scale1=1,rotation0=0,rotation1=rotation0,alpha=1,fade=0}=options;
      sprite(name,begin,time+fade,t=>{
        const p=clamp(t/time);
        return {x:lerp(a.x,b.x,p),y:lerp(a.y,b.y,p),scale:lerp(scale0,scale1,p),rotation:lerp(rotation0,rotation1,p),alpha:alpha*(t>time&&fade?1-clamp((t-time)/fade):1)};
      });
    };
    if(reduced){
      sprite(e.reaction.kind==='flower'?'pubchat_anim_flower3':'pubchat_anim_egg3',0,.7,t=>({...to,alpha:1-clamp((t-.4)/.3)}));e.duration=.7;return;
    }
    if(e.reaction.quantity===1){
      const egg=e.reaction.kind==='egg',tip=egg?'pubchat_tip_egg':'pubchat_tip_flower';
      const prep=own?0:egg?.8:.7,flight=egg&&own?.5:.4;
      if(prep)sprite(tip,0,prep,t=>({...from,alpha:clamp(t/.4)}));
      const angle=90-Math.atan2(-(to.y-from.y),to.x-from.x)*180/Math.PI;
      move(tip,prep,flight,from,to,{scale1:.5,rotation0:egg?0:-angle,rotation1:egg?-360:-angle,fade:.1});
      const hit=prep+flight+.1;sound(0,pair('Flying'));sound(hit,pair(egg?'Egg':'Flowers'));
      if(egg){
        for(let i=0;i<3;i++){
          const hold=i===2?.2:0,fade=i===2?.4:.1;
          sprite('pubchat_anim_egg'+(i+1),hit+i*.1,.1+hold+fade,t=>({...to,alpha:t<.1?clamp(t/.1):1-clamp((t-.1-hold)/fade)}));
        }
        e.duration=hit+.9;
      }else{
        const fade=own?.1:.4,total=1.1+fade,parentAlpha=(t:number)=>t<.3?clamp(t/.3):1-clamp((t-1.1)/fade);
        sprite(t=>'pubchat_anim_flower'+(t<.4?1:t<.5?2:3),hit,total,t=>({...to,alpha:parentAlpha(t)}));
        for(const star of [{x:-25,y:-36,delay:0},{x:31,y:-25,delay:own?.2:.1},{x:-11,y:5,delay:own?.3:.2}]){
          const begin=hit+.5+star.delay;
          sprite('pubchat_anim_star',begin,.4,t=>({x:to.x+star.x,y:to.y+star.y,alpha:(t<.3?clamp(t/.3):1-clamp((t-.3)/.1))*parentAlpha(t+begin-hit)}));
        }
        e.duration=hit+total;
      }
      return;
    }
    const randomPoint=(p:Point)=>({x:p.x-45+Math.random()*90,y:p.y-55+Math.random()*110});
    const time=Math.max(.3,Math.min(1.1,Math.hypot(to.x-from.x,to.y-from.y)/(e.reaction.kind==='flower'?800:1000)));
    if(e.reaction.kind==='flower'){
      for(let i=0;i<10;i++){
        const a=randomPoint(from),b=randomPoint(to),scale=.8+Math.random()*.2,sent=i*.21;
        move('pubchat_fly_flower',sent,time/3,a,b,{scale0:scale,scale1:scale});
        animation('roseburst-play',sent+time/3,b,scale,Math.random()*360);
      }
      const sent=2.2,hit=sent+time,offset={x:to.x+55,y:to.y-55};
      animation('cup-play1',sent,to,1,0,time);
      move('pubchat_jiuhu',sent,time,from,offset,{scale0:0});
      e.duration=hit+animation('cup-play2',hit,to);
      sound(0,'renghuahuanhu');sound(sent,'Jiubei1');sound(hit,'ganbeiqingzhu');
    }else{
      for(let i=0;i<7;i++){
        const a=randomPoint(from),b=randomPoint(to),scale=.8+Math.random()*.2,sent=i*.12,hit=sent+time/3;
        move('pubchat_shoot_egg',sent,time/3,a,b,{scale0:scale,scale1:scale});
        animation('eggburst-play',hit,b,scale);sound(hit,pair('Egg'));
      }
      const sent=.94,hit=sent+time,turns=Math.max(1,Math.floor(time/.3));
      for(const [delay,alpha] of [[.06,148/255],[.12,51/255]])move('pubchat_shoe_shader',sent+delay,time-delay,from,to,{scale0:0,rotation1:-turns*360,alpha});
      move('pubchat_shoe',sent,time,from,to,{scale0:0,rotation1:-turns*360});
      e.duration=hit+animation('shoehit-play',hit,to);sound(sent,'Tuoxie1');sound(hit,'Tuoxie2');
    }
  }
  private draw=(now:number)=>{
    this.frame=0;
    if(this.disposed)return;
    const ctx=this.canvas.getContext('2d');if(!ctx)return;
    const dpr=Math.min(devicePixelRatio||1,1.5),width=Math.round(innerWidth*dpr),height=Math.round(innerHeight*dpr);
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,innerWidth,innerHeight);
    this.effects=this.effects.filter(e=>(now-e.start)/1000<e.duration);
    for(const e of this.effects){
      const elapsed=(now-e.start)/1000,to=this.anchor(e.reaction.targetPlayerId,true);
      if(!to)continue;
      // Follow the receiver during scrolling, resizing, and layout changes.
      const dx=to.x-e.to.x,dy=to.y-e.to.y;
      for(const cue of e.sounds)if(!cue.played&&elapsed>=cue.time){cue.played=true;if(elapsed-cue.time<.25)this.sound(cue.name);}
      for(const actor of e.actors){
        const t=elapsed-actor.begin;if(t<0||t>=actor.life)continue;
        const pose=actor.pose(t);if((pose.alpha??1)<=0)continue;
        ctx.save();ctx.translate(pose.x+dx,pose.y+dy);ctx.rotate(-(pose.rotation??0)*Math.PI/180);
        const scale=(pose.scale??1)*(innerWidth<=520?.65:.8);ctx.scale(scale,scale);ctx.globalAlpha=clamp(pose.alpha??1);
        if(actor.animation){
          const data=this.data!.animations[actor.animation],img=this.loaded.get(actor.animation)!;
          const frame=Math.min(data.frames-1,Math.floor(Math.min(t,data.duration)*data.fps));
          ctx.drawImage(img,frame%data.columns*data.width,Math.floor(frame/data.columns)*data.height,data.width,data.height,-data.originX/data.scale,-data.originY/data.scale,data.width/data.scale,data.height/data.scale);
        }else{
          const name=typeof actor.sprite==='function'?actor.sprite(t):actor.sprite!;
          const data=this.data!.sprites[name];
          ctx.drawImage(this.loaded.get('sprites')!,data.x,data.y,data.width,data.height,-data.displayWidth/2,-data.displayHeight/2,data.displayWidth,data.displayHeight);
        }
        ctx.restore();
      }
    }
    this.canvas.dataset.active=String(this.effects.length);
    if(this.effects.length)this.frame=requestAnimationFrame(this.draw);
  };
  clear=()=>{
    this.generation++;this.effects=[];cancelAnimationFrame(this.frame);this.frame=0;
    this.canvas.getContext('2d')?.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.canvas.dataset.active='0';for(const voice of this.voices)voice.stop();
  };
  dispose=()=>{
    this.disposed=true;this.clear();if(this.audio)void this.audio.close().catch(()=>{});
  };
}
