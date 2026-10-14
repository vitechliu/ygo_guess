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
  return <section className="item-hand" aria-label="我的道具卡">
    <div className="item-hand-heading"><h2>我的道具卡 <span>{room.myItemCards.length}</span></h2><p>每局前 5 次个人回合各抽 1 张 · 仅自己回合使用 · 使用后消耗</p></div>
    {room.myItemCards.length?<div className="item-hand-list">{room.myItemCards.map(instance=>{
      const card=ITEM_CARDS[instance.cardId];
      if(!card)return null;
      return <article className={'item-card item-card-'+card.category} key={instance.instanceId}>
        <div className="item-card-title"><strong>{card.name}</strong><small>{card.category==='spell'?'魔法卡':card.category==='trap'?'陷阱卡':'怪兽卡'}</small></div>
        <img src={card.image} alt={card.name+'卡图'}/>
        <p>{card.description}</p>
        {card.id==='prohibition-card'&&<select aria-label={'禁止卡目标 '+instance.instanceId} value={targets[instance.instanceId]??''} disabled={!ownTurn||!connected||busy} onChange={event=>setTargets(current=>({...current,[instance.instanceId]:event.target.value}))}><option value="">选择其他玩家</option>{eligible.map(player=><option key={player.id} value={player.id}>{player.name}</option>)}</select>}
        <button type="button" disabled={!ownTurn||!connected||busy||(card.id==='prohibition-card'&&!eligible.some(player=>player.id===targets[instance.instanceId]))} onClick={async()=>{setBusy(true);try{await send({type:'use-item-card',instanceId:instance.instanceId,turnId:room.turnId,...(card.id==='prohibition-card'?{targetPlayerId:targets[instance.instanceId]}:{})});}catch{}finally{setBusy(false);}}}>{ownTurn?'使用道具卡':'等待自己的回合'}</button>
      </article>;
    })}</div>:<p className="item-hand-empty">本局还没有道具卡</p>}
  </section>;
}
