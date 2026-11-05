import {createContext,useContext,useRef,useState,type ReactNode} from 'react';
import {toast} from 'sonner';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuItem} from '@/components/ui/dropdown-menu';
import type {RoomView} from '../shared/types';
import type {Send} from './game';

import {PlayerReactionEffects} from './PlayerReactionEffects';

const ReactionContext=createContext<{room:RoomView;send:Send;connected:boolean}|null>(null);
export function PlayerReactions({room,send,connected,children}:{room:RoomView;send:Send;connected:boolean;children:ReactNode}) {
  return <ReactionContext.Provider value={{room,send,connected}}>{children}<PlayerReactionEffects room={room}/></ReactionContext.Provider>;
}


export function PlayerName({playerId,children}:{playerId:string;children:ReactNode}) {
  const context=useContext(ReactionContext);
  const [busy,setBusy]=useState(false);
  const pending=useRef(false);
  if(!context)return <>{children}</>;
  const {room,send,connected}=context;
  const target=room.players.find(p=>p.id===playerId);
  const self=room.players.find(p=>p.id===room.selfId);
  if(playerId===room.selfId||!target||target.left)return <>{children}</>;
  const allowance=self?.reactionAllowance??0;
  const enabled=connected&&!busy&&room.phase!=='lobby'&&room.phase!=='closed'&&!self?.waiting;
  const react=async(kind:'flower'|'egg',quantity:1|10)=>{
    if(pending.current)return;
    pending.current=true;setBusy(true);
    try{await send({type:'player-reaction',kind,quantity,targetPlayerId:playerId,setupId:room.setupId});}
    catch(error){toast.error(error instanceof Error?error.message:'互动失败，请重试');}
    finally{pending.current=false;setBusy(false);}
  };
  return <DropdownMenu><DropdownMenuTrigger className="player-reaction-trigger" aria-label={'与 '+target.name+' 互动'}>{children}</DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="player-reaction-menu">
      <DropdownMenuLabel>互动额度：{allowance} / 100</DropdownMenuLabel>
      <p className="reaction-help">每个消耗 1 点，每局开始恢复 100 点</p>
      <DropdownMenuSeparator/>
      {(['flower','egg'] as const).map(kind=><div key={kind}>
        <DropdownMenuLabel>{kind==='flower'?'🌷 送花':'🥚 砸蛋'}</DropdownMenuLabel>
        {([1,10] as const).map(quantity=><DropdownMenuItem key={quantity} aria-label={(kind==='flower'?'送花':'砸蛋')+' x'+quantity} disabled={!enabled||allowance<quantity} onSelect={()=>void react(kind,quantity)}>
          {kind==='flower'?'送花':'砸蛋'} x{quantity}<span className="reaction-cost">{quantity} 点</span>
        </DropdownMenuItem>)}
      </div>)}
      {room.phase==='lobby'&&<p className="reaction-help">开局后可使用</p>}
      {self?.waiting&&<p className="reaction-help">下一局开局领取额度</p>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
