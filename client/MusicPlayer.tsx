import { useEffect, useRef, useState } from 'react';
import { Music2, Volume2, VolumeX } from 'lucide-react';
import type { RoomMusic } from '../shared/types';
import { PLAYABLE_MUSIC_TRACKS } from '../shared/music';

import {AUDIO_ENABLED_KEY,AUDIO_SETTINGS_EVENT,audioEnabled,setAudioEnabled} from './audio-settings';
const VOLUME = 0.18;

export function MusicPlayer({ music }: { music?: RoomMusic }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [enabled, setEnabled] = useState(audioEnabled);
  const [blocked, setBlocked] = useState(false);
  const track = PLAYABLE_MUSIC_TRACKS.find(item => item.neteaseId === music?.trackId);

  useEffect(() => {
    const sync=()=>setEnabled(audioEnabled());
    const storageChanged=(event:StorageEvent)=>{if(event.key===AUDIO_ENABLED_KEY||event.key===null)sync();};
    window.addEventListener(AUDIO_SETTINGS_EVENT,sync);
    window.addEventListener('storage',storageChanged);
    return ()=>{window.removeEventListener(AUDIO_SETTINGS_EVENT,sync);window.removeEventListener('storage',storageChanged);};
  },[]);

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    player.volume = VOLUME;
    if (!enabled || !music || !track) {
      player.pause();
      player.removeAttribute('src');
      player.load();
      setBlocked(false);
      return;
    }
    player.src = `https://music.163.com/song/media/outer/url?id=${track.neteaseId}.mp3`;
    player.load();
    setBlocked(false);
    void player.play().catch(() => setBlocked(true));
    return () => player.pause();
  }, [enabled, music?.activationId, track?.neteaseId]);

  const toggle = () => {
    setAudioEnabled(!enabled);
  };

  return <div className="music-player" role="group" aria-label="音乐 / 音效">
    <audio ref={audio} preload="none" onError={() => setBlocked(true)} />
    <Music2 size={16} aria-hidden="true" />
    <span>{music && track ? `《${track.title}》` : '音乐 / 音效'}</span>
    {blocked && enabled && <small>播放受限，可关闭后重新开启</small>}
    <button type="button" aria-pressed={enabled} aria-label={enabled ? '关闭音乐 / 音效' : '开启音乐 / 音效'} onClick={toggle}>
      {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}{enabled ? '声音开启' : '声音关闭'}
    </button>
  </div>;
}
