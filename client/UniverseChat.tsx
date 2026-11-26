import {useEffect, useRef, useState} from 'react';
import type {RoomView} from '../shared/types';
import type {Send, User} from './game';
import {createPortal} from 'react-dom';
import {PlayerName} from './PlayerName';
import {readPinkToken} from './pink-auth';
import './pinkki-chat.js';

type Panel = HTMLElement & {
  configure(options: {
    room?: string; localReady: boolean; localCount?: number; maxLength: number;
    localSend?: (text: string) => Promise<void>; url?: string; identity?: string; token?: () => string | null;
  }): void;
  setLocal(messages: (RoomView['chat'][number] & {authorSlot?: string})[]): void;
};

export function UniverseChat({room,user,send,connected=false}:{
  room?: RoomView; user?: User|null; send?: Send; connected?: boolean;
}) {
  const mount=useRef<HTMLDivElement>(null);
  const panel=useRef<Panel|null>(null);
  const [element,setElement]=useState<Panel>();
  const [url,setUrl]=useState<string>();
  const pinkToken=user?.pink ? readPinkToken() : null;
  useEffect(()=>{
    const current=document.createElement('pinkki-chat-panel') as Panel;
    current.setAttribute('theme','dark');
    mount.current?.append(current);
    panel.current=current;
    setElement(current);
    const controller=new AbortController();
    fetch('/api/chat/config',{signal:controller.signal}).then(async response=>{
      if(response.ok)setUrl((await response.json()).url);
    }).catch(()=>{});
    return ()=>{
      controller.abort();
      current.remove();
      panel.current=null;
    };
  },[]);
  useEffect(()=>{
    panel.current?.configure({
      room:room?.chatChannel,
      localReady:connected,
      localCount:room?.players.filter(player=>player.online).length,
      maxLength:500,
      localSend:send ? text=>send({type:'chat',text}) : undefined,
      url,
      identity:pinkToken ? (user?.playerId+':'+user?.pink?.name) : undefined,
      token:pinkToken ? readPinkToken : undefined,
    });
    panel.current?.setLocal((room?.chat??[]).map(message=>({...message,
      authorSlot:message.playerId ? authorSlot(message) : undefined,
      source:message.source??'ygo',
      name:room?.players.find(player=>player.id===message.playerId)?.name??message.name,
    })));
  },[room,user?.playerId,user?.pink?.name,pinkToken,send,connected,url]);
  return <div className="universe-chat-slot" ref={mount}>
    {element&&room&&createPortal(room.chat.filter(message=>message.playerId&&!message.system).map(message=>{
      const playerId=message.playerId!;
      return <span key={authorSlot(message)} slot={authorSlot(message)}>
        <PlayerName playerId={playerId}>{room.players.find(player=>player.id===playerId)?.name??message.name}</PlayerName>
      </span>;
    }),element)}
  </div>;
}

function authorSlot(message: RoomView['chat'][number]) {
  return 'author-'+message.playerId+'-'+message.id;
}
