import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import type { AdminRoom, Command, RoomView, ServerMessage, Session } from '../shared/types';
export type User=Pick<Session,'playerId'|'name'|'admin'>;
export type Action = Command extends infer C ? C extends Command ? Omit<C,'id'> : never : never;
export type Send=(action:Action)=>Promise<void>;
export const phaseNames:Record<string,string>={lobby:'等待准备',setting:'出题阶段',guessing:'猜卡进行中','round-end':'本局结算','match-end':'比赛结束',closed:'已关闭'};
const uid=()=>globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
export async function api<T>(url:string,init?:RequestInit):Promise<T>{const res=await fetch(url,init);const body=await res.json();if(!res.ok)throw new Error(body.message??'连接失败，请重试');return body;}
export function useGame(user:User|null){
  const [room,setRoom]=useState<RoomView|null>(null),[adminRooms,setAdminRooms]=useState<AdminRoom[]>([]),[connected,setConnected]=useState(false);
  const [connectedIdentity,setConnectedIdentity]=useState('');
  const identity=user?user.playerId+':'+user.name+':'+user.admin:'';
  const socket=useRef<WebSocket|null>(null),pending=useRef(new Map<string,{resolve:()=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>());
  useEffect(()=>{
    if(!user)return;
    let disposed=false,retry:ReturnType<typeof setTimeout>,delay=600;
    const connect=()=>{
      const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');socket.current=ws;
      ws.onopen=()=>{delay=600;setConnectedIdentity(identity);setConnected(true);};
      ws.onmessage=e=>{
        const m=JSON.parse(e.data) as ServerMessage;
        if(m.type==='snapshot')setRoom(m.room);
        else if(m.type==='drawing-stroke')setRoom(current=>{
          if(!current?.drawing||current.drawing.id!==m.drawingId)return current;
          const strokes=current.drawingStrokes??[];
          if(m.continuation&&strokes.length){
            const last=strokes.at(-1)!;
            return {...current,drawingStrokes:[...strokes.slice(0,-1),{points:[...last.points,...m.points]}]};
          }
          return {...current,drawingStrokes:[...strokes,{points:m.points}]};
        });
        else if(m.type==='admin-rooms')setAdminRooms(m.rooms);
        else if(m.type==='ack'||m.type==='error'){
          const p=m.id?pending.current.get(m.id):undefined;
          if(p){clearTimeout(p.timer);pending.current.delete(m.id!);m.type==='ack'?p.resolve():p.reject(new Error(m.message));}
          else if(m.type==='error')toast.error(m.message);
        }
      };
      ws.onclose=()=>{if(disposed)return;setConnected(false);for(const p of pending.current.values()){clearTimeout(p.timer);p.reject(new Error('连接中断，正在恢复；请确认最新状态'));}pending.current.clear();retry=setTimeout(connect,delay);delay=Math.min(delay*1.7,8000);};
      ws.onerror=()=>{};
    };connect();
    return()=>{disposed=true;clearTimeout(retry);socket.current?.close();for(const p of pending.current.values()){clearTimeout(p.timer);p.reject(new Error('连接已更新'));}pending.current.clear();setConnected(false);};
  },[user?.playerId,user?.admin,user?.name]);
  const send=useCallback((action:Action)=>new Promise<void>((resolve,reject)=>{
    if(socket.current?.readyState!==WebSocket.OPEN){reject(new Error('正在连接房间，请稍候'));return;}
    const id=uid(),timer=setTimeout(()=>{pending.current.delete(id);reject(new Error('操作响应超时，请检查房间最新状态'));},18000);
    pending.current.set(id,{resolve,reject,timer});socket.current.send(JSON.stringify({...action,id}));
  }),[]);
  return {room,adminRooms,connected:connected&&connectedIdentity===identity,send};
}
