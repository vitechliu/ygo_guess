import {PlayerName} from './PlayerName';
import type { RoomView } from '../shared/types';

export function DrawingProgress({room}:{room:RoomView}) {
  const players=room.players.filter(player=>!player.left&&!player.waiting).sort((a,b)=>a.seat-b.seat);
  return <section className="drawing-progress" aria-label="绘画完成状态" aria-live="polite">
    <ul>{players.map(player=><li key={player.id} className={player.drawingSubmitted?'completed':''}>
      <span className="drawing-player-name"><PlayerName playerId={player.id}>{player.name}</PlayerName>{player.id===room.selfId?'（你）':''}</span>
      <span className="drawing-player-status">{player.drawingSubmitted?'已完成绘画':'正在绘画'}</span>
    </li>)}</ul>
    <div className="drawing-progress-count">已完成 {room.drawingProgress?.completed??0} / {room.drawingProgress?.total??players.length} 人</div>
  </section>;
}
