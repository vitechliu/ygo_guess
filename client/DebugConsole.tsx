import { useState } from 'react';
import { toast } from 'sonner';
import { ITEM_CARDS } from '../shared/item-cards';
import type { ItemCardId, RoomView } from '../shared/types';
import type { Action, Send } from './game';

export function DebugConsole({room,send,connected}:{room:RoomView;send:Send;connected:boolean}) {
  const [cardId,setCardId]=useState<ItemCardId>('test-card');
  const [playerId,setPlayerId]=useState(room.selfId);
  const [attempts,setAttempts]=useState(3);
  const [busy,setBusy]=useState(false);
  if(!room.debugEnabled)return null;
  const players=room.players.filter(player=>!player.left&&!player.waiting);
  const selected=players.find(player=>player.id===playerId)??players[0];
  const card=ITEM_CARDS[cardId];
  const run=async(action:Action,message:string)=>{
    setBusy(true);
    try{await send(action);toast.success(message);}catch(error){toast.error(error instanceof Error?error.message:'调试操作失败');}
    finally{setBusy(false);}
  };
  const disabled=!connected||busy;
  return <details className="debug-console">
    <summary>道具卡调试控制台 <span>仅本地开发 · 房主可见</span></summary>
    <div className="debug-console-body">
      {room.phase==='lobby'?<div className="debug-console-row"><p>单人测试会加入一个测试玩家，自动分配两张测试题卡并开启道具卡。</p><button type="button" disabled={disabled||room.players.filter(player=>!player.left).length!==1} onClick={()=>void run({type:'debug',action:'start-solo'},'测试局已开始')}>一键开始单人测试局</button></div>:
      room.phase==='guessing'?<>
        <div className="debug-console-row">
          <label>测试玩家<select value={selected?.id??''} onChange={event=>setPlayerId(event.target.value)}>{players.map(player=><option key={player.id} value={player.id}>{player.name}{player.id===room.selfId?'（我）':''} · {player.attempts} 次机会</option>)}</select></label>
          <label>指定道具卡<select value={cardId} onChange={event=>setCardId(event.target.value as ItemCardId)}>{Object.values(ITEM_CARDS).map(item=><option key={item.id} value={item.id}>{item.name} · 权重 {item.weight}</option>)}</select></label>
        </div>
        <div className="debug-console-preview"><img src={card.image} alt=""/><p><strong>{card.name}</strong><br/>{card.description}</p></div>
        <div className="debug-console-actions">
          <button type="button" disabled={disabled||!selected} onClick={()=>void run({type:'debug',action:'grant-card',playerId:selected.id,cardId},'已把 '+card.name+' 发给 '+selected.name)}>发卡</button>
          <button type="button" disabled={disabled||!selected||selected.status!=='playing'} onClick={()=>void run({type:'debug',action:'grant-card',playerId:selected.id,cardId,makeTurn:true},'已发卡并切换回合')}>发卡并切到他的回合</button>
          <button type="button" disabled={disabled||!selected||selected.status!=='playing'} onClick={()=>void run({type:'debug',action:'set-turn',playerId:selected.id},'已切换回合')}>切换到他的回合</button>
          <button type="button" disabled={disabled||!selected} onClick={()=>void run({type:'debug',action:'clear-hand',playerId:selected.id},'已清空手牌')}>清空他的手牌</button>
        </div>
        <div className="debug-console-row">
          <label>剩余猜测机会<input type="number" min={1} max={20} value={attempts} onChange={event=>setAttempts(Number(event.target.value))}/></label>
          <button type="button" disabled={disabled||!selected||attempts<1||attempts>20||selected.status==='solved'} onClick={()=>void run({type:'debug',action:'set-attempts',playerId:selected.id,attempts},'已设置猜测机会')}>设置次数并恢复参赛</button>
          <button type="button" disabled={disabled||!selected||selected.status!=='playing'||selected.id===room.turnPlayerId} onClick={()=>void run({type:'debug',action:'fail-by-guess',playerId:selected.id},'已模拟猜错出局')}>模拟猜错出局</button>
        </div>
        <div className="debug-console-actions">
          <button type="button" disabled={disabled} onClick={()=>void run({type:'debug',action:'expire-effects'},'已清除卡牌视觉效果')}>清除卡牌视觉效果</button>
          <button type="button" disabled={disabled||room.finalCountdownRemainingTurns===undefined} onClick={()=>void run({type:'debug',action:'countdown-to-one'},'倒计时已设为剩余 1 回合')}>终焉倒计时设为 1</button>
        </div>
      </>:<p>进入猜卡阶段后，可在这里指定发卡和调整测试状态。</p>}
    </div>
  </details>;
}
