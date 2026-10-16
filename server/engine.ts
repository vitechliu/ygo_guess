import { randomUUID, randomInt } from 'node:crypto';
import type { Card, RoomState, RoomView, Settings, Entry, ItemCardId, Chat, Command } from '../shared/types.js';
import { ITEM_CARDS } from '../shared/item-cards.js';
import { PLAYABLE_MUSIC_TRACKS, musicCandidates } from '../shared/music.js';
import { MASKED_HEROES } from '../shared/masked-heroes.js';
import { DRAGONMAIDS } from '../shared/dragonmaids.js';

export class GameError extends Error {}
export function requireGame(value: unknown, message: string): asserts value { if (!value) throw new GameError(message); }
export const members = (r: RoomState) => r.players.filter(p => !p.left).sort((a,b) => a.seat-b.seat);
const drawable=Object.values(ITEM_CARDS).filter(card=>card.weight>0&&(card.id!=='music-card'||PLAYABLE_MUSIC_TRACKS.length>0));
const totalWeight=drawable.reduce((sum,card)=>sum+card.weight,0);
const DISASTER_CARDS:ItemCardId[]=['cyclone-card','storm-card','meteor-card','fireball-card','outer-entity-card','ground-break-card','lightning-card'];
const DEBUG_CARDS:Card[]=[
  {id:89631139,cid:4007,name:'青眼白龙',types:'[怪兽|通常] 龙/光\n[★8] 3000/2500',description:'以高攻击力著称的传说之龙。任何对手都能粉碎，其破坏力不可估量。',image:'/debug-blue-eyes-card.webp'},
  {id:46986414,cid:4041,name:'黑魔术师',types:'[怪兽|通常] 魔法师/暗\n[★7] 2500/2100',description:'作为魔法师，攻击力·守备力都是最高级别。',image:'/debug-dark-magician-card.webp'},
];
export function drawItemCard(roll=randomInt(totalWeight)):ItemCardId {
  requireGame(Number.isInteger(roll)&&roll>=0&&roll<totalWeight,'道具卡抽取数值无效');
  for(const card of drawable){if(roll<card.weight)return card.id;roll-=card.weight;}
  throw new GameError('道具卡池未配置');
}
export function debugAction(r:RoomState,command:Extract<Command,{type:'debug'}>) {
  if(command.action==='start-solo'){
    requireGame(r.phase==='lobby'&&members(r).length===1,'单人测试只能在只有房主的等待房间开始');
    join(r,'debug-bot:'+r.code,'测试玩家');
    r.settings={...r.settings,mode:'random',itemCards:true};
    r.players.forEach(player=>player.ready=true);
    startRound(r,DEBUG_CARDS,true);
    return;
  }
  requireGame(r.phase==='guessing','请先进入猜卡阶段');
  if(command.action==='expire-effects'){r.visualEffects={};r.music=undefined;r.drawing=undefined;return;}
  if(command.action==='countdown-to-one'){
    requireGame(r.finalCountdown,'终焉倒计时尚未开始');
    r.finalCountdown.remainingTurns=1;
    return;
  }
  requireGame('playerId' in command,'请选择调试玩家');
  const e=r.entries.find(entry=>entry.playerId===command.playerId);
  requireGame(e&&e.status!=='left'&&members(r).some(player=>player.id===command.playerId),'请选择本局参赛的玩家');
  if(command.action==='grant-card'){
    requireGame(ITEM_CARDS[command.cardId],'道具卡不存在');
    if(command.makeTurn)requireGame(e.status==='playing'&&e.attempts>0,'只能切换到仍在猜卡的玩家');
    e.itemCards??=[];
    e.itemCards.push({instanceId:randomUUID(),cardId:command.cardId});
    if(command.makeTurn){
      r.turnPlayerId=e.playerId;r.turnId=randomUUID();e.turns=Math.max(1,e.turns);e.reversalTurnId=undefined;
    }
  }else if(command.action==='clear-hand')e.itemCards=[];
  else if(command.action==='set-turn'){
    requireGame(e.status==='playing'&&e.attempts>0,'只能切换到仍在猜卡的玩家');
    r.turnPlayerId=e.playerId;r.turnId=randomUUID();e.turns=Math.max(1,e.turns);e.reversalTurnId=undefined;
  }else if(command.action==='fail-by-guess'){
    requireGame(e.status==='playing'&&e.playerId!==r.turnPlayerId,'不能将当前回合玩家设为出局');
    e.status='failed';e.attempts=0;e.failedByGuess=true;e.points=0;
  }else if(command.action==='set-attempts'){
    requireGame(e.status==='playing'||e.status==='failed','只能调整仍在猜卡或已出局的玩家');
    e.status='playing';e.attempts=command.attempts;e.failedByGuess=false;
  }
}
export function expireVisualEffects(r:RoomState,now=Date.now()) {
  if(!r.visualEffects)return false;
  let changed=false;
  if(r.visualEffects.roaches&&r.visualEffects.roaches.endsAt<=now){delete r.visualEffects.roaches;changed=true;}
  if(r.visualEffects.masks&&r.visualEffects.masks.endsAt<=now){delete r.visualEffects.masks;changed=true;}
  if(r.visualEffects.dragonmaidOutfits){
    for(const [playerId,effect] of Object.entries(r.visualEffects.dragonmaidOutfits))if(effect.endsAt<=now){delete r.visualEffects.dragonmaidOutfits[playerId];changed=true;}
    if(!Object.keys(r.visualEffects.dragonmaidOutfits).length)delete r.visualEffects.dragonmaidOutfits;
  }
  if(r.visualEffects.lightning&&r.visualEffects.lightning.endsAt<=now){delete r.visualEffects.lightning;changed=true;}
  if(r.visualEffects.distortion&&r.visualEffects.distortion.endsAt<=now){delete r.visualEffects.distortion;changed=true;}
  if(r.visualEffects.flowers&&r.visualEffects.flowers.endsAt<=now){delete r.visualEffects.flowers;changed=true;}
  if(r.visualEffects.storm&&r.visualEffects.storm.endsAt<=now){delete r.visualEffects.storm;changed=true;}
  if(r.visualEffects.fireballs){
    for(const [playerId,effect] of Object.entries(r.visualEffects.fireballs))if(effect.endsAt<=now){delete r.visualEffects.fireballs[playerId];changed=true;}
    if(!Object.keys(r.visualEffects.fireballs).length)delete r.visualEffects.fireballs;
  }
  if(r.visualEffects.faceDown){
    for(const [playerId,effect] of Object.entries(r.visualEffects.faceDown))if(effect.endsAt<=now){delete r.visualEffects.faceDown[playerId];changed=true;}
    if(!Object.keys(r.visualEffects.faceDown).length)delete r.visualEffects.faceDown;
  }
  if(r.visualEffects.clownNames){
    for(const [playerId,effect] of Object.entries(r.visualEffects.clownNames))if(effect.endsAt<=now){delete r.visualEffects.clownNames[playerId];changed=true;}
    if(!Object.keys(r.visualEffects.clownNames).length)delete r.visualEffects.clownNames;
  }
  for(const key of ['cyclones','meteors','cracks'] as const){
    const effects=r.visualEffects[key];
    if(!effects)continue;
    for(const [playerId,effect] of Object.entries(effects))if(effect.endsAt<=now){delete effects[playerId];changed=true;}
    if(!Object.keys(effects).length)delete r.visualEffects[key];
  }
  return changed;
}
export function system(r: RoomState, text: string, kind?: Chat['kind'], recipientPlayerId?:string) { r.chat.push({id:randomUUID(),name:'房间消息',text,time:Date.now(),system:true,...(kind?{kind}:{}),...(recipientPlayerId?{recipientPlayerId}:{})}); r.chat=r.chat.slice(-100); }
export function createRoom(code: string, playerId: string, name: string, settings: Settings): RoomState {
  return {code,hostId:playerId,settings,phase:'lobby',round:0,players:[{id:playerId,name,seat:0,score:0,ready:false,left:false}],entries:[],turnPlayerId:null,turnId:'',setupId:'',version:0,chat:[],history:[],processed:[],createdAt:Date.now(),lastActivityAt:Date.now()};
}
export function join(r: RoomState, id: string, name: string) {
  requireGame(r.phase!=='closed','房间已关闭');
  requireGame(members(r).length<10,'房间已满（最多10人）');
  const previous=r.players.find(p=>p.id===id);
  requireGame(!previous||previous.left,'你已经在这个房间中');
  const seat=Math.max(-1,...r.players.map(p=>p.seat))+1;
  if(previous)Object.assign(previous,{name,seat,ready:false,left:false});
  else r.players.push({id,name,seat,score:0,ready:false,left:false});
  system(r,name+(previous?' 重新加入了房间':' 加入了房间')+(r.phase==='lobby'?'':'，将在下一局参赛'));
}
export function updateSettings(r:RoomState,settings:Settings) {
  requireGame(r.phase==='lobby','比赛开始后不能修改设置');
  if(r.settings.mode===settings.mode&&r.settings.rounds===settings.rounds&&r.settings.attempts===settings.attempts&&(r.settings.itemCards??true)===(settings.itemCards??true))return;
  r.settings=settings;
  for(const p of members(r))if(p.id!==r.hostId)p.ready=false;
  system(r,'房主修改了规则：'+(settings.mode==='custom'?'好友出题':'随机分配')+' · '+settings.rounds+' 局 · 每局 '+settings.attempts+' 次猜测 · 道具卡'+(settings.itemCards===false?'关闭':'开启')+'。请重新准备');
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
  r.round++; r.setupId=randomUUID(); r.turnPlayerId=null; r.turnId='';r.visualEffects={};r.finalCountdown=undefined;r.music=undefined;r.drawing=undefined;
  r.entries=ps.map(p=>({playerId:p.id,submitted:false,status:'playing',attempts:r.settings.attempts,turns:0,points:0,itemCards:[]}));
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
function activate(r: RoomState,e: Entry) {
  e.turns++; e.reversalTurnId=undefined; r.turnPlayerId=e.playerId; r.turnId=randomUUID();
  if(r.settings.itemCards!==false&&e.turns%3===0) {
    e.itemCards??=[];
    e.itemCards.push({instanceId:randomUUID(),cardId:drawItemCard()});
  }
}
export function validateTurn(r: RoomState, id: string, turnId: string, force=false) {
  requireGame(r.phase==='guessing'&&r.turnId===turnId,'回合已变化，请以最新状态为准');
  requireGame(force||r.turnPlayerId===id,'还没有轮到你');
}
export function useItemCard(r:RoomState,id:string,instanceId:string,turnId:string,targetPlayerId?:string,online=new Set<string>()) {
  validateTurn(r,id,turnId);
  requireGame(r.settings.itemCards!==false,'本房间未开启道具卡');
  const e=r.entries.find(e=>e.playerId===id);
  requireGame(e?.status==='playing','本局已结束');
  const index=e.itemCards?.findIndex(card=>card.instanceId===instanceId)??-1;
  requireGame(index>=0,'这张道具卡不在你的手牌中');
  const instance=e.itemCards![index];
  const card=ITEM_CARDS[instance.cardId];
  requireGame(card&&card.timing==='own-turn','道具卡无法在此时使用');
  const target=targetPlayerId?r.entries.find(entry=>entry.playerId===targetPlayerId):undefined;
  if(card.id==='prohibition-card'||card.id==='friendship-card')requireGame(target&&target.playerId!==id&&target.status==='playing'&&members(r).some(p=>p.id===targetPlayerId),'请选择仍在本局猜卡的其他玩家');
  else if(card.id==='snatch-card')requireGame(target&&target.playerId!==id&&target.status==='playing'&&target.attempts>=2&&members(r).some(p=>p.id===targetPlayerId),'请选择至少还有 2 次猜测机会的其他玩家');
  else if(card.id==='clown-card')requireGame(target&&target.playerId!==id&&target.status!=='left'&&members(r).some(p=>p.id===targetPlayerId),'请选择本局的其他玩家');
  else if(card.id==='fireball-card'||card.id==='god-rage-card'||card.id==='moon-book-card')requireGame(target&&target.playerId!==id&&target.status!=='left'&&target.card&&members(r).some(p=>p.id===targetPlayerId),'请选择场上有卡牌的其他玩家');
  else if(card.id==='cyclone-card'||card.id==='changeover-card')requireGame(target&&target.status!=='left'&&target.card&&members(r).some(p=>p.id===targetPlayerId),'请选择场上有卡牌的玩家');
  else if(card.id==='reborn-card')requireGame(target&&target.playerId!==id&&target.status==='failed'&&target.failedByGuess&&target.attempts===0&&members(r).some(p=>p.id===targetPlayerId)&&online.has(targetPlayerId!),'请选择在线且因猜测次数用完而失败的其他玩家');
  else if(card.id==='hint-card'||card.id==='ecole-card')requireGame(target&&target.playerId!==id&&target.status!=='left'&&members(r).some(p=>p.id===targetPlayerId)&&online.has(targetPlayerId!),'请选择在线的其他玩家');
  else requireGame(!targetPlayerId,'这张道具卡不需要指定玩家');
  if(card.id==='scanner-card')requireGame(e.card,'本局卡牌尚未设置');
  if(card.id==='countdown-card')requireGame(!r.finalCountdown,'终焉倒计时已经开始');
  if(card.id==='music-card')requireGame(PLAYABLE_MUSIC_TRACKS.length>0,'音乐曲库尚未配置可播放歌曲');
  e.itemCards!.splice(index,1);
  const name=r.players.find(p=>p.id===id)!.name;
  switch(card.id){
    case 'prohibition-card':
      target!.skipNextTurns=(target!.skipNextTurns??0)+1;
      system(r,name+'对 '+r.players.find(p=>p.id===targetPlayerId)!.name+' 使用了禁止卡，下次回合将被跳过','item-card');
      break;
    case 'maxx-c-card':
      r.visualEffects??={};
      r.visualEffects.roaches={id:randomUUID(),endsAt:Date.now()+180000};
      system(r,name+'使用了增殖卡，可爱蟑螂出现了（3 分钟）','item-card');
      break;
    case 'mask-change-card': {
      const available=[...MASKED_HEROES];
      const appearances:Record<string,(typeof MASKED_HEROES)[number]>={};
      for(const entry of r.entries.filter(entry=>entry.status!=='left'))appearances[entry.playerId]=available.splice(randomInt(available.length),1)[0];
      r.visualEffects??={};
      r.visualEffects.masks={id:randomUUID(),endsAt:Date.now()+60000,appearances};
      system(r,name+'使用了假面卡，场上的卡牌换上了假面英雄外观（1 分钟）','item-card');
      break;
    }
    case 'changeover-card': {
      const appearance=DRAGONMAIDS[randomInt(DRAGONMAIDS.length)];
      r.visualEffects??={};
      r.visualEffects.dragonmaidOutfits??={};
      r.visualEffects.dragonmaidOutfits[target!.playerId]={id:randomUUID(),endsAt:Date.now()+60000,appearance};
      system(r,name+'对 '+r.players.find(p=>p.id===targetPlayerId)!.name+' 使用了更衣卡，其卡牌变成了 '+appearance.name+'（1 分钟）','item-card');
      break;
    }
    case 'chance-card':
      e.attempts++;
      system(r,name+'使用了机会卡，剩余猜测机会增加 1 次','item-card');
      break;
    case 'lightning-card':
      r.visualEffects??={};
      r.visualEffects.lightning={id:randomUUID(),endsAt:Date.now()+180000};
      system(r,name+'使用了雷击卡，雷电将在页面随机出现（3 分钟）','item-card');
      break;
    case 'fireball-card':
      r.visualEffects??={};
      r.visualEffects.fireballs??={};
      r.visualEffects.fireballs[target!.playerId]={id:randomUUID(),endsAt:Date.now()+180000};
      system(r,name+'对 '+r.players.find(p=>p.id===targetPlayerId)!.name+' 使用了火球卡，卡图开始燃烧（3 分钟）','item-card');
      break;
    case 'outer-entity-card':
      r.visualEffects??={};
      r.visualEffects.distortion={id:randomUUID(),endsAt:Date.now()+300000};
      system(r,name+'使用了外神卡，场上卡图将间歇扭曲（5 分钟）','item-card');
      break;
    case 'god-rage-card':
      r.visualEffects??={};
      r.visualEffects.obscuredPlayerIds=[...new Set([...(r.visualEffects.obscuredPlayerIds??[]),target!.playerId])];
      system(r,name+'对 '+r.players.find(p=>p.id===targetPlayerId)!.name+' 使用了神愤卡，其卡名已被遮挡至本小局结束','item-card');
      break;
    case 'crossout-card':
      system(r,name+'使用了指名卡，请自行宣布本场禁用的名词或概念，由大家口头遵守','item-card');
      break;
    case 'scanner-card': {
      const length=Array.from(e.card!.name).filter(char=>!/\s/u.test(char)).length;
      system(r,name+'使用了扫描卡：自己的卡名去空格后共有 '+length+' 个字符','item-card');
      break;
    }
    case 'moon-book-card':
      r.visualEffects??={};
      r.visualEffects.faceDown??={};
      r.visualEffects.faceDown[target!.playerId]={id:randomUUID(),endsAt:Date.now()+180000};
      system(r,name+'对 '+r.players.find(p=>p.id===targetPlayerId)!.name+' 使用了月书卡，卡牌盖放 3 分钟','item-card');
      break;
    case 'reborn-card':
      target!.status='playing';target!.attempts=1;target!.failedByGuess=false;
      system(r,name+'对 '+r.players.find(p=>p.id===targetPlayerId)!.name+' 使用了苏生卡，恢复 1 次猜测机会','item-card');
      break;
    case 'void-card':
      system(r,name+'使用了虚无卡：本局提问不可提及“特殊召唤”，请大家口头遵守','item-card');
      break;
    case 'reversal-card':
      e.reversalTurnId=r.turnId;
      system(r,name+'使用了逆转卡：本回合可问 5 个问题；猜错或跳过将立即失去本局所有猜测机会','item-card');
      break;
    case 'puzzle-card':
      system(r,name+'使用了谜题卡：本回合可额外问 1 个问题，请大家口头遵守','item-card');
      break;
    case 'combo-card':
      system(r,name+'使用了连击卡：下次提问时，若所有人都回答“是”，可继续提问，直到有人回答“否”；请大家口头遵守','item-card');
      break;
    case 'hint-card':
      system(r,name+'对 '+r.players.find(p=>p.id===targetPlayerId)!.name+' 使用了提示卡，请对方给出 1 个提示','item-card');
      break;
    case 'stockings-card':
      system(r,name+'使用了丝袜卡：请场上玩家回答，场上有多少对丝袜？','item-card');
      break;
    case 'clown-card':
      r.visualEffects??={};
      r.visualEffects.clownNames??={};
      r.visualEffects.clownNames[target!.playerId]={id:randomUUID(),endsAt:Date.now()+300000};
      system(r,name+'对 '+r.players.find(p=>p.id===targetPlayerId)!.name+' 使用了小丑卡，昵称变成🤡（5 分钟）','item-card');
      break;
    case 'friendship-card':
      e.attempts++;target!.attempts++;
      system(r,name+'对 '+r.players.find(p=>p.id===targetPlayerId)!.name+' 使用了友情卡，两人猜测机会各增加 1 次','item-card');
      break;
    case 'unity-card': {
      const boosted=r.entries.filter(entry=>entry.status==='playing');
      for(const entry of boosted)entry.attempts++;
      system(r,name+'使用了团结卡，仍在猜卡的 '+boosted.length+' 名玩家各增加 1 次猜测机会','item-card');
      break;
    }
    case 'countdown-card':
      r.finalCountdown={remainingTurns:20,activatedTurnId:r.turnId};
      system(r,name+'使用了终焉卡：从下一个玩家回合开始，20 个玩家回合后本局结束','item-card');
      break;
    case 'snatch-card': {
      const stolen=target!.attempts-1;
      target!.attempts=1;e.attempts+=stolen;
      system(r,name+'对 '+r.players.find(p=>p.id===targetPlayerId)!.name+' 使用了抢夺卡，夺走了 '+stolen+' 次猜测机会','item-card');
      break;
    }
    case 'flower-card':
      r.visualEffects??={};
      r.visualEffects.flowers={id:randomUUID(),endsAt:Date.now()+180000};
      system(r,name+'使用了鲜花卡，鲜花女男爵现在来为场上助兴','item-card');
      break;
    case 'mind-eye-card': {
      const otherHands=members(r).filter(player=>player.id!==id).map(player=>{
        const hand=r.entries.find(entry=>entry.playerId===player.id)?.itemCards??[];
        return player.name+'：'+(hand.length?hand.map(item=>ITEM_CARDS[item.cardId]?.name??'未知道具卡').join('、'):'没有道具卡');
      });
      system(r,name+'使用了看透卡','item-card');
      system(r,'看透卡看到的手牌：'+otherHands.join('；'),'item-card',id);
      break;
    }
    case 'time-magic-card': {
      const heads=randomInt(2)===0;
      const previous=e.attempts;
      e.attempts=heads?e.attempts+1:Math.max(1,e.attempts-1);
      system(r,name+'使用了魔术卡，硬币是'+(heads?'正面，猜测机会增加 1 次':'反面，猜测机会'+(previous===1?'保持 1 次':'减少 1 次')),'item-card');
      break;
    }
    case 'cyclone-card':
      r.visualEffects??={};r.visualEffects.cyclones??={};
      r.visualEffects.cyclones[target!.playerId]={id:randomUUID(),endsAt:Date.now()+5000};
      system(r,name+'对 '+r.players.find(player=>player.id===targetPlayerId)!.name+' 的卡牌使用了旋风卡','item-card');
      break;
    case 'storm-card':
      r.visualEffects??={};r.visualEffects.storm={id:randomUUID(),endsAt:Date.now()+5000};
      system(r,name+'使用了风暴卡，场上所有卡牌开始翻转','item-card');
      break;
    case 'meteor-card': {
      const candidates=r.entries.filter(entry=>entry.status!=='left'&&entry.card&&members(r).some(player=>player.id===entry.playerId));
      requireGame(candidates.length>0,'场上没有可选的卡牌');
      const hit=candidates[randomInt(candidates.length)];
      r.visualEffects??={};r.visualEffects.meteors??={};
      r.visualEffects.meteors[hit.playerId]={id:randomUUID(),endsAt:Date.now()+9000};
      system(r,name+'使用了陨石卡，陨石落在 '+r.players.find(player=>player.id===hit.playerId)!.name+' 的卡牌上','item-card');
      break;
    }
    case 'ground-break-card': {
      const candidates=r.entries.filter(entry=>entry.status!=='left'&&entry.card&&members(r).some(player=>player.id===entry.playerId));
      requireGame(candidates.length>0,'场上没有可选的卡牌');
      const minimum=Math.min(...candidates.map(entry=>entry.attempts));
      const tied=candidates.filter(entry=>entry.attempts===minimum);
      const hit=tied[randomInt(tied.length)];
      r.visualEffects??={};r.visualEffects.cracks??={};
      r.visualEffects.cracks[hit.playerId]={id:randomUUID(),endsAt:Date.now()+300000};
      system(r,name+'使用了地碎卡，'+r.players.find(player=>player.id===hit.playerId)!.name+' 的卡牌出现了裂痕（5 分钟）','item-card');
      break;
    }
    case 'eclipse-book-card':
      r.visualEffects??={};r.visualEffects.faceDown??={};
      for(const entry of r.entries.filter(entry=>entry.status!=='left'&&entry.card))r.visualEffects.faceDown[entry.playerId]={id:randomUUID(),endsAt:Date.now()+60000};
      system(r,name+'使用了日书卡，场上所有卡牌盖放 1 分钟','item-card');
      break;
    case 'convulsion-card':
      for(const entry of r.entries.filter(entry=>entry.status!=='left')){
        entry.itemCards??=[];
        entry.itemCards.push({instanceId:randomUUID(),cardId:DISASTER_CARDS[randomInt(DISASTER_CARDS.length)]});
      }
      system(r,name+'使用了天变卡，场上每人获得一张随机灾难卡','item-card');
      break;
    case 'music-card': {
      const candidates=musicCandidates(PLAYABLE_MUSIC_TRACKS,r.music?.trackId);
      const track=candidates[randomInt(candidates.length)];
      r.music={activationId:randomUUID(),trackId:track.neteaseId};
      system(r,name+'使用了音乐卡，播放《'+track.title+'》','item-card');
      break;
    }
    case 'ecole-card':
      r.drawing={id:randomUUID(),userId:id,drawerId:targetPlayerId!};
      system(r,name+'使用了忘我卡，请 '+r.players.find(p=>p.id===targetPlayerId)!.name+' 画出卡牌线索','item-card');
      break;
    case 'test-card':system(r,name+'使用了测试卡','item-card');break;
  }
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
    if(e.reversalTurnId===r.turnId)e.attempts=0;
    if(e.attempts===0){e.status='failed';e.failedByGuess=true;}
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
  const e=r.entries.find(e=>e.playerId===r.turnPlayerId);
  if(e?.status==='playing'&&e.reversalTurnId===r.turnId){e.attempts=0;e.status='failed';e.failedByGuess=false;system(r,(r.players.find(p=>p.id===e.playerId)?.name??'玩家')+' 的逆转卡回合未猜中，本局机会已用完','item-card');}
  system(r,(r.players.find(p=>p.id===r.turnPlayerId)?.name??'当前玩家')+' 的回合已'+(force?'被强制':'')+'跳过');
  advance(r);
}
function advance(r:RoomState) {
  if(r.finalCountdown&&r.turnId!==r.finalCountdown.activatedTurnId){
    r.finalCountdown.remainingTurns--;
    if(r.finalCountdown.remainingTurns===0){system(r,'终焉卡倒计时结束，本局立即结束','item-card');finishRound(r);return;}
  }
  const current=r.entries.findIndex(e=>e.playerId===r.turnPlayerId);
  const pendingSkips=r.entries.reduce((count,e)=>count+(e.status==='playing'?(e.skipNextTurns??0):0),0);
  for(let step=1;step<=r.entries.length+pendingSkips;step++) {
    const e=r.entries[(current+step)%r.entries.length];
    if(e.status!=='playing')continue;
    if((e.skipNextTurns??0)>0){e.skipNextTurns=(e.skipNextTurns??0)-1;system(r,(r.players.find(p=>p.id===e.playerId)?.name??'玩家')+' 的回合被禁止卡跳过','item-card');continue;}
    activate(r,e);return;
  }
  finishRound(r);
}
export function finishRound(r:RoomState,early=false) {
  for(const e of r.entries){e.itemCards=[];e.skipNextTurns=0;}
  r.visualEffects={};
  r.music=undefined;
  r.drawing=undefined;
  r.finalCountdown=undefined;
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
  if(r.drawing&&(r.drawing.drawerId===id||r.drawing.userId===id))r.drawing=undefined;
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
  r.round=0;r.entries=[];r.history=[];r.phase='lobby';r.turnId='';r.setupId='';r.turnPlayerId=null;r.visualEffects={};r.finalCountdown=undefined;r.music=undefined;r.drawing=undefined;
  system(r,'新比赛已创建，请准备');
}
export function view(r:RoomState,selfId:string,online:Set<string>,debugEnabled=false):RoomView {
  const index=r.entries.findIndex(e=>e.playerId===selfId);
  const participant=index>=0&&r.entries[index].status!=='left'&&!r.players.find(p=>p.id===selfId)?.left;
  const reveal=r.phase==='round-end'||r.phase==='match-end';
  const next=participant?r.entries[(index+1)%r.entries.length]:undefined;
  return {code:r.code,hostId:r.hostId,settings:r.settings,phase:r.phase,round:r.round,turnPlayerId:r.turnPlayerId,turnId:r.turnId,setupId:r.setupId,version:r.version,selfId,
    players:r.players.map(p=>{
      const e=r.entries.find(e=>e.playerId===p.id);
      return {...p,name:(r.visualEffects?.clownNames?.[p.id]?.endsAt??0)>Date.now()?'🤡':p.name,online:online.has(p.id),waiting:r.phase!=='lobby'&&(!e||e.status==='left')&&!p.left,status:e?.status,attempts:e?.attempts??r.settings.attempts,turns:e?.turns??0,points:e?.points??0,submitted:e?.submitted??false,failedByGuess:e?.failedByGuess??false,
        ...(e?.card&&(reveal||(r.phase==='guessing'&&(!participant||p.id!==selfId||e.status==='solved')))?{card:e.card}:{})};
    }),
    chat:r.chat.filter(message=>!message.recipientPlayerId||message.recipientPlayerId===selfId),myItemCards:participant?(r.entries[index].itemCards??[]):[],visualEffects:r.visualEffects,reversalActive:participant&&r.turnPlayerId===selfId&&r.entries[index].reversalTurnId===r.turnId,finalCountdownRemainingTurns:r.finalCountdown?.remainingTurns,debugEnabled,music:r.music,drawing:r.drawing,
    ...(r.phase==='setting'&&participant?{nextPlayerName:r.players.find(p=>p.id===next?.playerId)?.name,mySubmittedCard:r.entries[index].submitted?next?.card:undefined}:{}),
    history:participant?r.history.map(result=>({round:result.round,entries:result.entries.map(({itemCards,...entry})=>entry)})):[]};
}
