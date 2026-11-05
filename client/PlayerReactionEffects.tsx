import {useEffect,useRef} from 'react';
import type {PlayerReaction,RoomView} from '../shared/types';
import {PLAYER_REACTION_EVENT} from './reaction-events';
import {AUDIO_ENABLED_KEY,AUDIO_SETTINGS_EVENT} from './audio-settings';
import {ReactionPlayer} from './reaction-player';

export function PlayerReactionEffects({room}:{room:RoomView}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const current=useRef(room),instance=useRef<ReactionPlayer|null>(null);
  current.current=room;
  useEffect(()=>{
    const player=new ReactionPlayer(canvas.current!,room.selfId);
    instance.current=player;
    const receive=(event:Event)=>{
      const reaction=(event as CustomEvent<PlayerReaction>).detail,latest=current.current;
      if(reaction.setupId===latest.setupId&&latest.phase!=='lobby'&&latest.phase!=='closed')void player.play(reaction);
    };
    const audioChanged=()=>{player.mute();player.unlock();};
    const storageChanged=(event:StorageEvent)=>{if(event.key===AUDIO_ENABLED_KEY||event.key===null)audioChanged();};
    const visibility=()=>{if(document.hidden)player.clear();};
    window.addEventListener(PLAYER_REACTION_EVENT,receive);
    window.addEventListener(AUDIO_SETTINGS_EVENT,audioChanged);
    window.addEventListener('storage',storageChanged);
    document.addEventListener('pointerdown',player.unlock,{capture:true});
    document.addEventListener('keydown',player.unlock,{capture:true});
    document.addEventListener('visibilitychange',visibility);
    return ()=>{
      window.removeEventListener(PLAYER_REACTION_EVENT,receive);
      window.removeEventListener(AUDIO_SETTINGS_EVENT,audioChanged);
      window.removeEventListener('storage',storageChanged);
      document.removeEventListener('pointerdown',player.unlock,{capture:true});
      document.removeEventListener('keydown',player.unlock,{capture:true});
      document.removeEventListener('visibilitychange',visibility);
      instance.current=null;player.dispose();
    };
  },[room.code,room.selfId]);
  // Keep audio unlocked by lobby interactions across rounds, while discarding old timelines.
  useEffect(()=>{instance.current?.clear();},[room.setupId,room.phase==='lobby'||room.phase==='closed']);
  return <canvas ref={canvas} className="player-reaction-canvas" aria-hidden="true" data-active="0"/>;
}
