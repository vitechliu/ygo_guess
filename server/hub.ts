import { randomInt } from 'node:crypto';
import { WebSocket } from 'ws';
import { z } from 'zod';
import type { Command, Session, RoomState, ServerMessage, AdminRoom, Card } from '../shared/types.js';
import type { Store, Audit } from './store.js';
import type { CardProvider } from './cards.js';
import * as E from './engine.js';

const base={id:z.string().min(1).max(80)};
const code=z.string().regex(/^[A-Z2-9]{6}$/), playerId=z.string().max(64), turnId=z.string().uuid();
const settings=z.object({mode:z.enum(['custom','random']),rounds:z.number().int().min(1).max(20),attempts:z.number().int().min(1).max(10),itemCards:z.boolean().default(true)});
const schemas=[
  z.object({...base,type:z.literal('create'),settings}),
  z.object({...base,type:z.literal('update-settings'),settings}),
  z.object({...base,type:z.literal('join'),code}),
  z.object({...base,type:z.literal('ready'),ready:z.boolean()}),
  ...(['start','next','leave','again','admin-list','shuffle'] as const).map(type=>z.object({...base,type:z.literal(type)})),
  z.object({...base,type:z.literal('set-card'),cardId:z.number().int().positive().max(9999999999),setupId:z.string().uuid()}),
  z.object({...base,type:z.literal('guess'),cardId:z.number().int().positive().max(9999999999),turnId}),
  z.object({...base,type:z.literal('use-item-card'),instanceId:z.string().uuid(),turnId,targetPlayerId:playerId.optional()}),
  z.object({...base,type:z.literal('give-up'),turnId}),
  z.object({...base,type:z.literal('skip'),turnId}),
  z.object({...base,type:z.literal('kick'),playerId}),
  z.object({...base,type:z.literal('chat'),text:z.string().trim().min(1).max(500)}),
  z.object({...base,type:z.literal('admin-skip'),code,turnId}),
  ...(['admin-kick','admin-transfer'] as const).map(type=>z.object({...base,type:z.literal(type),code,playerId})),
  z.object({...base,type:z.literal('admin-close'),code})
];
export function parseCommand(raw:unknown):Command {
  for(const schema of schemas){const value=schema.safeParse(raw);if(value.success)return value.data as Command;}
  throw new E.GameError('操作格式不正确');
}
type Client={ws:WebSocket;session:Session;tokens:number;at:number};
export class Hub {
  rooms=new Map<string,RoomState>(); private clients=new Set<Client>(); private tail:Promise<unknown>=Promise.resolve();
  private away=new Map<string,number>(); private timer?:NodeJS.Timeout; private recent=new Map<string,number>();
  constructor(private store:Store,private cards:CardProvider,private hostGraceMs=30000){}
  async init(){for(const r of await this.store.loadRooms())this.rooms.set(r.code,r);this.timer=setInterval(()=>void this.enqueue(async()=>{await this.transferOfflineHosts();await this.expireVisualEffects();}).catch(()=>console.error('Room timer failed')),1000);this.timer.unref();}
  async close(){clearInterval(this.timer);for(const c of this.clients)c.ws.close(1001,'服务正在重启');await this.tail;}
  online(){return new Set([...this.clients].filter(c=>c.ws.readyState===WebSocket.OPEN).map(c=>c.session.playerId));}
  roomFor(id:string){return [...this.rooms.values()].find(r=>r.phase!=='closed'&&r.players.some(p=>p.id===id&&!p.left));}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.tail.then(fn,fn);this.tail=task.catch(()=>{});return task;}
  send(ws:WebSocket,message:ServerMessage){if(ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>1024*1024){ws.close(1013,'连接过慢，请重连');return;}ws.send(JSON.stringify(message));}}
  attach(ws:WebSocket,session:Session){
    const c={ws,session,tokens:30,at:Date.now()};this.clients.add(c);
    const hosted=this.roomFor(session.playerId);if(hosted?.hostId===session.playerId)this.away.delete(hosted.code);
    this.broadcast();
    ws.on('message',data=>{
      const now=Date.now();c.tokens=Math.min(30,c.tokens+(now-c.at)/1000*5);c.at=now;
      if(c.tokens<1){this.send(ws,{type:'error',message:'操作过于频繁，请稍候'});return;}c.tokens--;
      let command:Command;
      try{command=parseCommand(JSON.parse(data.toString()));}catch{this.send(ws,{type:'error',message:'操作格式不正确'});return;}
      void this.handle(session,command).then(result=>{if(result)this.send(ws,result);this.send(ws,{type:'ack',id:command.id});}).catch(error=>{
        if(!(error instanceof E.GameError))console.error('Command failed:',error instanceof Error?error.message:'unknown');
        this.send(ws,{type:'error',id:command.id,message:error instanceof E.GameError?error.message:'保存失败，请重试'});
      });
    });
    ws.on('close',()=>{this.clients.delete(c);this.broadcast();});
    ws.on('error',()=>{});
  }
  private adminRooms():AdminRoom[]{const online=this.online();return [...this.rooms.values()].filter(r=>r.phase!=='closed').map(r=>({code:r.code,phase:r.phase,round:r.round,hostId:r.hostId,turnId:r.turnId,turnPlayerId:r.turnPlayerId,players:E.members(r).map(p=>({id:p.id,name:p.name,online:online.has(p.id)}))}));}
  broadcast(){
    const online=this.online();
    for(const c of this.clients){
      if(c.session.expiresAt<=Date.now()){c.ws.close(1008,'会话已过期');continue;}
      const r=this.roomFor(c.session.playerId);
      this.send(c.ws,{type:'snapshot',room:r?E.view(r,c.session.playerId,online):null});
      if(c.session.admin)this.send(c.ws,{type:'admin-rooms',rooms:this.adminRooms()});
    }
  }
  private requireMember(session:Session){const r=this.roomFor(session.playerId);E.requireGame(r,'你尚未进入房间');return r;}
  private precheck(session:Session,c:Command){
    E.requireGame(session.expiresAt>Date.now(),'会话已过期，请刷新页面');
    if(c.type.startsWith('admin-'))E.requireGame(session.admin,'需要超级管理员权限');
    if(c.type==='guess'||c.type==='give-up'||c.type==='set-card'){
      const r=this.requireMember(session);
      if(c.type==='guess'||c.type==='give-up')E.validateTurn(r,session.playerId,c.turnId);
      else E.requireGame(r.phase==='setting'&&r.setupId===c.setupId&&r.entries.some(e=>e.playerId===session.playerId&&!e.submitted),'当前不能出题');
    }
  }
  async handle(session:Session,c:Command):Promise<ServerMessage|void>{
    // Fetch before the commit queue so a slow card API cannot block room chat.
    const key=session.playerId+':'+c.id;
    const existing=this.roomFor(session.playerId);
    if(this.recent.has(key)||existing?.processed.some(p=>p.key===key))return;
    this.precheck(session,c);
    let card:Card|undefined,pool:Card[]|undefined;
    if(c.type==='guess'||c.type==='set-card')card=await this.cards.card(c.cardId);
    if(c.type==='start'||c.type==='next'){
      const r=this.requireMember(session);
      E.requireGame(r.hostId===session.playerId,'只有房主可以执行此操作');
      if(r.settings.mode==='random')pool=await this.cards.pool();
    }
    return this.enqueue(async()=>{
      if(this.recent.has(key))return;
      this.precheck(session,c);
      if(c.type==='admin-list')return {type:'admin-rooms',rooms:this.adminRooms()};
      let r:RoomState;let audit:Audit|undefined;let previousRoom:RoomState|undefined;
      if(c.type==='create'){
        E.requireGame(!this.roomFor(session.playerId),'请先离开当前房间');
        let roomCode='';const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do{roomCode=Array.from({length:6},()=>chars[randomInt(chars.length)]).join('');}while(this.rooms.has(roomCode));
        r=E.createRoom(roomCode,session.playerId,session.name,c.settings);
        E.system(r,session.name+' 创建了房间');
      }else if(c.type==='join'){
        const found=this.rooms.get(c.code);E.requireGame(found&&found.phase!=='closed','找不到这个房间');
        const current=this.roomFor(session.playerId);
        if(current?.code===c.code)return;
        r=structuredClone(found);E.join(r,session.playerId,session.name);
        if(current){previousRoom=structuredClone(current);E.leave(previousRoom,session.playerId,this.online());previousRoom.version++;}
      }else{
        const found='code' in c?this.rooms.get(c.code):this.roomFor(session.playerId);
        E.requireGame(found&&found.phase!=='closed','房间不存在或已关闭');r=structuredClone(found);
        if(r.processed.some(p=>p.key===key))return;
        const host=()=>E.requireGame(r.hostId===session.playerId,'只有房主可以执行此操作');
        switch(c.type){
          case 'ready':E.requireGame(r.phase==='lobby','比赛开始后无需准备');r.players.find(p=>p.id===session.playerId)!.ready=c.ready;break;
          case 'update-settings':host();E.updateSettings(r,c.settings);break;
          case 'shuffle':host();E.shuffleSeats(r);break;
          case 'start':host();E.startRound(r,pool,true);break;
          case 'next':host();E.startRound(r,pool);break;
          case 'set-card':E.submitCard(r,session.playerId,card!,c.setupId);break;
          case 'guess':E.guess(r,session.playerId,card!,c.turnId);break;
          case 'use-item-card':E.useItemCard(r,session.playerId,c.instanceId,c.turnId,c.targetPlayerId,this.online());break;
          case 'give-up':E.giveUp(r,session.playerId,c.turnId);break;
          case 'skip':E.skip(r,session.playerId,c.turnId,r.hostId===session.playerId||session.admin);break;
          case 'kick':host();E.requireGame(c.playerId!==session.playerId,'房主不能移除自己');E.leave(r,c.playerId,this.online(),'房主');break;
          case 'leave':E.leave(r,session.playerId,this.online());break;
          case 'again':host();E.again(r);r.createdAt=Date.now();break;
          case 'chat':r.chat.push({id:c.id,name:session.name,text:c.text,time:Date.now()});r.chat=r.chat.slice(-100);break;
          case 'admin-skip':E.skip(r,session.playerId,c.turnId,true);break;
          case 'admin-kick':E.leave(r,c.playerId,this.online(),'管理员');break;
          case 'admin-transfer':E.requireGame(E.members(r).some(p=>p.id===c.playerId)&&this.online().has(c.playerId),'请选择在线的房间成员');r.hostId=c.playerId;E.system(r,'管理员已转移房主');break;
          case 'admin-close':r.phase='closed';r.turnId='';r.turnPlayerId=null;break;
        }
        if(c.type.startsWith('admin-'))audit={actor:session.playerId,action:c.type,target:r.code+('playerId'in c?':'+c.playerId:'')};
      }
      r.version++;r.processed.push({key,at:Date.now()});r.processed=r.processed.slice(-500);
      if(previousRoom)await this.store.saveRooms([previousRoom,r]);
      else await this.store.saveRoom(r,audit);
      if(previousRoom)this.rooms.set(previousRoom.code,previousRoom);
      this.rooms.set(r.code,r);this.recent.set(key,Date.now());
      if(this.recent.size>3000){for(const [k,at]of this.recent)if(at<Date.now()-3600000||this.recent.size>3000)this.recent.delete(k);}
      this.broadcast();
    });
  }
  async transferOfflineHosts(){
    const online=this.online();
    for(const old of this.rooms.values()){
      if(old.phase==='closed'||online.has(old.hostId)){this.away.delete(old.code);continue;}
      const since=this.away.get(old.code)??Date.now();this.away.set(old.code,since);
      if(Date.now()-since<this.hostGraceMs)continue;
      const successor=E.members(old).find(p=>online.has(p.id));
      if(!successor)continue;
      const r=structuredClone(old);r.hostId=successor.id;r.version++;E.system(r,'房主暂时离线，已由 '+successor.name+' 接任');
      await this.store.saveRoom(r);this.rooms.set(r.code,r);this.away.delete(r.code);this.broadcast();
    }
  }
  private async expireVisualEffects(){
    for(const old of this.rooms.values()){
      if(!old.visualEffects?.roaches&&!old.visualEffects?.masks&&!old.visualEffects?.lightning&&!old.visualEffects?.distortion&&!old.visualEffects?.fireballs&&!old.visualEffects?.faceDown)continue;
      const r=structuredClone(old);
      if(!E.expireVisualEffects(r))continue;
      r.version++;
      await this.store.saveRoom(r);
      this.rooms.set(r.code,r);
      this.broadcast();
    }
  }
}
