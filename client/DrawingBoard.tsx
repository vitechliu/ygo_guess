import { useEffect, useRef, useState } from 'react';
import type { DrawingPoint, DrawingStroke, RoomView } from '../shared/types';
import type { Send } from './game';

const WIDTH=800;
const HEIGHT=500;

function distanceSquared(point:DrawingPoint,start:DrawingPoint,end:DrawingPoint):number {
  const dx=end[0]-start[0],dy=end[1]-start[1];
  if(dx===0&&dy===0)return (point[0]-start[0])**2+(point[1]-start[1])**2;
  const t=Math.max(0,Math.min(1,((point[0]-start[0])*dx+(point[1]-start[1])*dy)/(dx*dx+dy*dy)));
  return (point[0]-start[0]-t*dx)**2+(point[1]-start[1]-t*dy)**2;
}

// Ramer-Douglas-Peucker keeps corners while removing redundant pointer samples.
export function simplifyStroke(points:DrawingPoint[],tolerance=2):DrawingPoint[] {
  if(points.length<=2)return points;
  let farthest=0,index=0;
  for(let i=1;i<points.length-1;i++){
    const distance=distanceSquared(points[i],points[0],points.at(-1)!);
    if(distance>farthest){farthest=distance;index=i;}
  }
  if(farthest<=tolerance*tolerance)return [points[0],points.at(-1)!];
  return [...simplifyStroke(points.slice(0,index+1),tolerance).slice(0,-1),...simplifyStroke(points.slice(index),tolerance)];
}

function paint(context:CanvasRenderingContext2D,strokes:DrawingStroke[]){
  context.clearRect(0,0,WIDTH,HEIGHT);
  context.strokeStyle='#253047';context.fillStyle='#253047';context.lineWidth=5;context.lineCap='round';context.lineJoin='round';
  for(const stroke of strokes){
    const points=stroke.points;if(!points.length)continue;
    if(points.every(point=>point[0]===points[0][0]&&point[1]===points[0][1])){context.beginPath();context.arc(points[0][0],points[0][1],2.5,0,Math.PI*2);context.fill();continue;}
    context.beginPath();context.moveTo(points[0][0],points[0][1]);
    for(const point of points.slice(1))context.lineTo(point[0],point[1]);
    context.stroke();
  }
}

export function DrawingBoard({room,send,connected}:{room:RoomView;send:Send;connected:boolean}){
  const drawing=room.drawing;
  const canvas=useRef<HTMLCanvasElement>(null);
  const pending=useRef<DrawingPoint[]>([]);
  const lastSent=useRef<DrawingPoint|null>(null);
  const pointerId=useRef<number|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [busy,setBusy]=useState(false);
  const [warning,setWarning]=useState('');
  const drawer=drawing?.drawerId===room.selfId;
  useEffect(()=>{const context=canvas.current?.getContext('2d');if(context)paint(context,room.drawingStrokes??[]);},[room.drawingStrokes,drawing?.id]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[drawing?.id]);
  if(!drawing)return null;
  const point=(event:React.PointerEvent<HTMLCanvasElement>):DrawingPoint=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    return [Math.max(0,Math.min(WIDTH,Math.round((event.clientX-bounds.left)*WIDTH/bounds.width))),Math.max(0,Math.min(HEIGHT,Math.round((event.clientY-bounds.top)*HEIGHT/bounds.height)))];
  };
  const flush=()=>{
    if(timer.current){clearTimeout(timer.current);timer.current=null;}
    if(!pending.current.length||!connected)return;
    const points=lastSent.current?[lastSent.current,...pending.current]:pending.current;
    const reduced=simplifyStroke(points);
    const continuation=!!lastSent.current;
    lastSent.current=points.at(-1)!;
    pending.current=[];
    if(continuation)reduced.shift();
    if(reduced.length)void send({type:'drawing-stroke',drawingId:drawing.id,points:reduced,continuation}).then(()=>setWarning('')).catch(error=>setWarning(error instanceof Error?error.message:'笔画未同步，请重试'));
  };
  const schedule=()=>{if(!timer.current)timer.current=setTimeout(flush,80);};
  const end=(event:React.PointerEvent<HTMLCanvasElement>)=>{
    if(pointerId.current!==event.pointerId)return;
    pending.current.push(point(event));flush();pointerId.current=null;lastSent.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const userName=room.players.find(player=>player.id===drawing.userId)?.name??'使用者';
  const drawerName=room.players.find(player=>player.id===drawing.drawerId)?.name??'玩家';
  return <div className="drawing-overlay" role="dialog" aria-modal="true" aria-label="忘我卡画板">
    <div className="drawing-panel">
      <div className="drawing-heading"><div><strong>忘我卡 · 绘画提示</strong><span>{drawer?`请为 ${userName} 画出卡牌线索`:`${drawerName} 正在为 ${userName} 绘画`}</span></div>{drawer&&<button type="button" disabled={!connected||busy} onClick={async()=>{flush();setBusy(true);try{await send({type:'drawing-close',drawingId:drawing.id});}catch{}finally{setBusy(false);}}}>关闭画板</button>}</div>
      <canvas ref={canvas} width={WIDTH} height={HEIGHT} className={drawer&&connected?'drawing-canvas can-draw':'drawing-canvas'} aria-label="共享画板" onPointerDown={event=>{if(!drawer||!connected||pointerId.current!==null)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);pointerId.current=event.pointerId;pending.current=[point(event)];lastSent.current=null;schedule();}} onPointerMove={event=>{if(pointerId.current!==event.pointerId)return;const next=point(event);const previous=pending.current.at(-1)??lastSent.current;if(!previous||Math.hypot(next[0]-previous[0],next[1]-previous[1])>=2){pending.current.push(next);if(pending.current.length>=32)flush();else schedule();}}} onPointerUp={end} onPointerCancel={end}/>
      <p>{warning|| (drawer?'用一支笔画线，完成后点击“关闭画板”。':'画面会实时同步给房间里的所有人。')}</p>
    </div>
  </div>;
}
