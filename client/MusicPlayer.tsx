import { useEffect, useRef, useState } from 'react';
import { Music2, Volume2, VolumeX } from 'lucide-react';
import type { RoomMusic } from '../shared/types';
import { PLAYABLE_MUSIC_TRACKS } from '../shared/music';

const MUSIC_ENABLED_KEY = 'ygo-guess-music-enabled';
const VOLUME = 0.18;

export function MusicPlayer({ music }: { music?: RoomMusic }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [enabled, setEnabled] = useState(() => localStorage.getItem(MUSIC_ENABLED_KEY) !== 'false');
  const [blocked, setBlocked] = useState(false);
  const track = PLAYABLE_MUSIC_TRACKS.find(item => item.neteaseId === music?.trackId);

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
    const next = !enabled;
    localStorage.setItem(MUSIC_ENABLED_KEY, String(next));
    setEnabled(next);
  };

  return <div className="music-player" role="group" aria-label="音乐功能">
    <audio ref={audio} preload="none" onError={() => setBlocked(true)} />
    <Music2 size={16} aria-hidden="true" />
    <span>{music && track ? `《${track.title}》` : '音乐卡'}</span>
    {blocked && enabled && <small>播放受限，可关闭后重新开启</small>}
    <button type="button" aria-pressed={enabled} aria-label={enabled ? '关闭音乐功能' : '开启音乐功能'} onClick={toggle}>
      {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}{enabled ? '音乐开启' : '音乐关闭'}
    </button>
  </div>;
}
