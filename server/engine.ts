import { randomUUID, randomInt } from 'node:crypto';
import type { Card, RoomState, RoomView, Settings, Entry } from '../shared/types.js';

export class GameError extends Error {}
export function requireGame(value: unknown, message: string): asserts value { if (!value) throw new GameError(message); }
export const members = (r: RoomState) => r.players.filter(p => !p.left).sort((a,b) => a.seat-b.seat);
export function system(r: RoomState, text: string, kind?: 'guess-correct' | 'guess-wrong') { r.chat.push({id:randomUUID(),name:'房间消息',text,time:Date.now(),system:true,...(kind?{kind}:{})}); r.chat=r.chat.slice(-100); }
export function createRoom(code: string, playerId: string, name: string, settings: Settings): RoomState {
  return {code,hostId:playerId,settings,phase:'lobby',round:0,players:[{id:playerId,name,seat:0,score:0,ready:false,left:false}],entries:[],turnPlayerId:null,turnId:'',setupId:'',version:0,chat:[],history:[],processed:[],createdAt:Date.now()};
}
export function join(r: RoomState, id: string, name: string) {
  requireGame(r.phase!=='closed','房间已关闭');
  requireGame(members(r).length<8,'房间已满（最多8人）');
  requireGame(!r.players.some(p=>p.id===id),'你已参加过这个房间，请等待新比赛或创建新房间');
  r.players.push({id,name,seat:Math.max(-1,...r.players.map(p=>p.seat))+1,score:0,ready:false,left:false});
  system(r,name+' 加入了房间'+(r.phase==='lobby'?'':'，将在下一局参赛'));
}
export function updateSettings(r:RoomState,settings:Settings) {
  requireGame(r.phase==='lobby','比赛开始后不能修改设置');
  if(r.settings.mode===settings.mode&&r.settings.rounds===settings.rounds&&r.settings.attempts===settings.attempts)return;
  r.settings=settings;
  for(const p of members(r))if(p.id!==r.hostId)p.ready=false;
  system(r,'房主修改了规则：'+(settings.mode==='custom'?'好友出题':'随机分配')+' · '+settings.rounds+' 局 · 每局 '+settings.attempts+' 次猜测。请重新准备');
}
export function shuffleSeats(r:RoomState) {
  requireGame(r.phase==='lobby','比赛开始后不能打乱顺序');
  const ordered=members(r);
  requireGame(ordered.length>=2,'至少需要2名玩家才能打乱顺序');
  let shuffled=[...ordered];
  do {
    shuffled=[...ordered];
    for(let i=shuffled.length-1;i>0;i--){const j=randomInt(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  } while(shuffled.every((p,i)=>p.id===ordered[i].id));
  shuffled.forEach((p,i)=>p.seat=i);
  system(r,'房主打乱了玩家顺序：'+shuffled.map(p=>p.name).join(' → '));
}
export function startRound(r: RoomState, pool: Card[] = [], first = false) {
  const ps=members(r);
  requireGame(ps.length>=2,'至少需要2名玩家');
  if(first) {
    requireGame(r.phase==='lobby','比赛已开始');
    requireGame(ps.every(p=>p.id===r.hostId||p.ready),'等待所有非房主玩家准备');
  } else requireGame(r.phase==='round-end','当前不能进入下一局');
  if(r.settings.mode==='random') requireGame(new Set(pool.map(c=>c.cid)).size>=ps.length,'精选题库未配置或有效卡牌不足，请配置题库或使用出题模式');
  r.round++; r.setupId=randomUUID(); r.turnPlayerId=null; r.turnId='';
  r.entries=ps.map(p=>({playerId:p.id,submitted:false,status:'playing',attempts:r.settings.attempts,turns:0,points:0}));
  if(r.settings.mode==='random') {
    const candidates=[...new Map(pool.map(c=>[c.cid,c])).values()];
    for(const e of r.entries) { const index=randomInt(candidates.length); e.card=candidates.splice(index,1)[0]; e.submitted=true; }
    beginGuessing(r);
  } else r.phase='setting';
  system(r,'第 '+r.round+' 局开始'+(r.phase==='setting'?'，请为下家选卡':''));
}
export function submitCard(r: RoomState, id: string, card: Card, setupId: string) {
  requireGame(r.phase==='setting'&&r.setupId===setupId,'出题阶段已变化，请刷新状态');
  const index=r.entries.findIndex(e=>e.playerId===id);
  requireGame(index>=0,'你将在下一局参赛');
  requireGame(!r.entries[index].submitted,'本局出题已提交');
  r.entries[(index+1)%r.entries.length].card=card;
  r.entries[index].submitted=true;
  if(r.entries.every(e=>e.submitted)) { beginGuessing(r); system(r,'所有人已出题，猜卡开始'); }
}
function beginGuessing(r: RoomState) {
  r.phase='guessing'; const entry=r.entries[(r.round-1)%r.entries.length];
  activate(r,entry);
}
function activate(r: RoomState,e: Entry) { e.turns++; r.turnPlayerId=e.playerId; r.turnId=randomUUID(); }
export function validateTurn(r: RoomState, id: string, turnId: string, force=false) {
  requireGame(r.phase==='guessing'&&r.turnId===turnId,'回合已变化，请以最新状态为准');
  requireGame(force||r.turnPlayerId===id,'还没有轮到你');
}
export function guess(r: RoomState,id: string,card: Card,turnId: string) {
  validateTurn(r,id,turnId);
  const e=r.entries.find(e=>e.playerId===id)!;
  requireGame(e.status==='playing'&&e.attempts>0,'本局已结束');
  e.attempts--;
  if(e.card?.cid===card.cid) {
    e.status='solved'; e.points=Math.max(1,Math.round(1000/e.turns));
    r.players.find(p=>p.id===id)!.score+=e.points;
    system(r,r.players.find(p=>p.id===id)!.name+' 猜对了卡牌「'+e.card!.name+'」，获得 '+e.points+' 分','guess-correct');
  } else {
    if(e.attempts===0)e.status='failed';
    system(r,r.players.find(p=>p.id===id)!.name+' 猜测了「'+card.name+'」，未猜中'+(e.attempts===0?'，本局机会已用完':''),'guess-wrong');
  }
  advance(r);
}
export function giveUp(r:RoomState,id:string,turnId:string) {
  validateTurn(r,id,turnId);
  const e=r.entries.find(e=>e.playerId===id)!;
  requireGame(e.status==='playing'&&e.attempts>0,'本局已结束');
  e.attempts=0; e.status='failed'; e.points=0;
  system(r,r.players.find(p=>p.id===id)!.name+' 放弃了本局猜题，剩余猜测机会已清零');
  advance(r);
}
export function skip(r:RoomState,id:string,turnId:string,force=false) {
  validateTurn(r,id,turnId,force);
  system(r,(r.players.find(p=>p.id===r.turnPlayerId)?.name??'当前玩家')+' 的回合已'+(force?'被强制':'')+'跳过');
  advance(r);
}
function advance(r:RoomState) {
  const current=r.entries.findIndex(e=>e.playerId===r.turnPlayerId);
  for(let step=1;step<=r.entries.length;step++) {
    const e=r.entries[(current+step)%r.entries.length];
    if(e.status==='playing') { activate(r,e); return; }
  }
  finishRound(r);
}
export function finishRound(r:RoomState,early=false) {
  if(r.round>0&&!r.history.some(h=>h.round===r.round)) {
    for(const e of r.entries) if(e.status==='playing')e.status='failed';
    r.history.push({round:r.round,entries:structuredClone(r.entries)});
  }
  r.turnPlayerId=null; r.turnId='';
  r.phase=early||r.round>=r.settings.rounds?'match-end':'round-end';
  system(r,r.phase==='match-end'?'比赛结束，查看总排行榜':'本局结束，等待房主开始下一局');
}
export function leave(r:RoomState,id:string,online:Set<string>,removedBy?:'房主'|'管理员') {
  const p=r.players.find(p=>p.id===id&&!p.left);
  requireGame(p,'该玩家已离开'); p.left=true;
  const e=r.entries.find(e=>e.playerId===id);
  if(e?.status==='playing') { e.status='left'; e.points=0; }
  system(r,p.name+(removedBy?' 被'+removedBy+'移出了房间':' 离开了房间'));
  const remaining=members(r);
  if(!remaining.length) { r.phase='closed'; r.turnPlayerId=null; r.turnId=''; return; }
  if(r.hostId===id) r.hostId=(remaining.find(p=>online.has(p.id))??remaining[0]).id;
  if(r.phase==='setting'&&e) {
    const eligible=r.entries.filter(e=>e.status!=='left');
    if(eligible.length<2) { finishRound(r,true); return; }
    r.entries=eligible.map(e=>({...e,card:undefined,submitted:false}));
    r.setupId=randomUUID(); system(r,'成员发生变化，请重新为下家出题');
  } else if(r.phase==='guessing') {
    if(r.entries.filter(entry=>remaining.some(p=>p.id===entry.playerId)).length<2)finishRound(r,true);
    else if(r.turnPlayerId===id)advance(r);
  } else if(r.phase==='round-end'&&remaining.length<2)r.phase='match-end';
}
export function again(r:RoomState) {
  requireGame(r.phase==='match-end','比赛尚未结束');
  r.players=members(r).map((p,i)=>({...p,score:0,ready:false,seat:i}));
  r.round=0;r.entries=[];r.history=[];r.phase='lobby';r.turnId='';r.setupId='';r.turnPlayerId=null;
  system(r,'新比赛已创建，请准备');
}
export function view(r:RoomState,selfId:string,online:Set<string>):RoomView {
  const index=r.entries.findIndex(e=>e.playerId===selfId);
  const participant=index>=0&&!r.players.find(p=>p.id===selfId)?.left;
  const reveal=r.phase==='round-end'||r.phase==='match-end';
  const next=participant?r.entries[(index+1)%r.entries.length]:undefined;
  return {code:r.code,hostId:r.hostId,settings:r.settings,phase:r.phase,round:r.round,turnPlayerId:r.turnPlayerId,turnId:r.turnId,setupId:r.setupId,version:r.version,selfId,
    players:r.players.map(p=>{
      const e=r.entries.find(e=>e.playerId===p.id);
      return {...p,online:online.has(p.id),waiting:r.phase!=='lobby'&&!e&&!p.left,status:e?.status,attempts:e?.attempts??r.settings.attempts,turns:e?.turns??0,points:e?.points??0,submitted:e?.submitted??false,
        ...(e?.card&&(reveal||(r.phase==='guessing'&&(!participant||p.id!==selfId||e.status==='solved')))?{card:e.card}:{})};
    }),
    chat:r.chat,
    ...(r.phase==='setting'&&participant?{nextPlayerName:r.players.find(p=>p.id===next?.playerId)?.name,mySubmittedCard:r.entries[index].submitted?next?.card:undefined}:{}),
    history:participant?r.history:[]};
}
