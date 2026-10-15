import { useState } from 'react';
import { ITEM_CARDS } from '../shared/item-cards';
import type { RoomView } from '../shared/types';
import type { Send } from './game';

export function ItemHand({room,send,connected}:{room:RoomView;send:Send;connected:boolean}) {
  const [busy,setBusy]=useState(false);
  const [targets,setTargets]=useState<Record<string,string>>({});
  if(room.settings.itemCards===false||room.phase!=='guessing')return null;
  const ownTurn=room.turnPlayerId===room.selfId;
  const eligible=room.players.filter(p=>p.id!==room.selfId&&!p.left&&!p.waiting&&p.status==='playing');
  const cardsOnTable=room.players.filter(p=>p.id!==room.selfId&&!p.left&&!p.waiting&&p.card);
  const revivable=room.players.filter(p=>p.id!==room.selfId&&!p.left&&!p.waiting&&p.online&&p.status==='failed'&&p.failedByGuess&&p.attempts===0);
  const onlinePlayers=room.players.filter(p=>p.id!==room.selfId&&!p.left&&!p.waiting&&p.online);
  const snatchable=eligible.filter(p=>p.attempts>=2);
  const anyOtherPlayer=room.players.filter(p=>p.id!==room.selfId&&!p.left&&!p.waiting);
  const anyCard=room.players.filter(p=>!p.left&&!p.waiting&&(p.card||p.id===room.selfId));
  return <section className="item-hand" aria-label="我的道具卡">
    <div className="item-hand-heading"><h2>我的道具卡 <span>{room.myItemCards.length}</span></h2><p>每局第 3、6、9……次轮到自己时各抽 1 张 · 仅自己回合使用 · 使用后消耗</p></div>
    {room.myItemCards.length?<div className="item-hand-list">{room.myItemCards.map(instance=>{
      const card=ITEM_CARDS[instance.cardId];
      if(!card)return null;
  const needsTarget=card.id==='prohibition-card'||card.id==='fireball-card'||card.id==='god-rage-card'||card.id==='moon-book-card'||card.id==='reborn-card'||card.id==='hint-card'||card.id==='ecole-card'||card.id==='clown-card'||card.id==='friendship-card'||card.id==='snatch-card'||card.id==='cyclone-card'||card.id==='changeover-card';
  const choices=card.id==='prohibition-card'||card.id==='friendship-card'?eligible:card.id==='reborn-card'?revivable:card.id==='hint-card'||card.id==='ecole-card'?onlinePlayers:card.id==='snatch-card'?snatchable:card.id==='clown-card'?anyOtherPlayer:card.id==='cyclone-card'||card.id==='changeover-card'?anyCard:cardsOnTable;
      return <article className={'item-card item-card-'+card.category} key={instance.instanceId}>
        <div className="item-card-title"><strong>{card.name}</strong><small>{card.category==='spell'?'魔法卡':card.category==='trap'?'陷阱卡':card.category==='xyz'?'超量怪兽':card.category==='synchro'?'同调怪兽':'怪兽卡'}</small></div>
        <img src={card.image} alt={card.name+'卡图'}/>
        <p>{card.description}</p>
  {needsTarget&&<select aria-label={card.name+'目标 '+instance.instanceId} value={targets[instance.instanceId]??''} disabled={!ownTurn||!connected||busy} onChange={event=>setTargets(current=>({...current,[instance.instanceId]:event.target.value}))}><option value="">{card.id==='cyclone-card'||card.id==='changeover-card'?'选择场上卡牌':'选择其他玩家'}</option>{choices.map(player=><option key={player.id} value={player.id}>{player.name}{player.id===room.selfId?'（我）':''}</option>)}</select>}
        <button type="button" disabled={!ownTurn||!connected||busy||(needsTarget&&!choices.some(player=>player.id===targets[instance.instanceId]))||(card.id==='countdown-card'&&room.finalCountdownRemainingTurns!==undefined)} onClick={async()=>{setBusy(true);try{await send({type:'use-item-card',instanceId:instance.instanceId,turnId:room.turnId,...(needsTarget?{targetPlayerId:targets[instance.instanceId]}:{})});}catch{}finally{setBusy(false);}}}>{card.id==='countdown-card'&&room.finalCountdownRemainingTurns!==undefined?'倒计时已开始':ownTurn?'使用道具卡':'等待自己的回合'}</button>
      </article>;
    })}</div>:<p className="item-hand-empty">本局还没有道具卡</p>}
  </section>;
}
