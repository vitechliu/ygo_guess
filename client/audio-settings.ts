// Reuse the existing music preference so previously muted pages stay muted.
export const AUDIO_ENABLED_KEY='ygo-guess-music-enabled';
export const AUDIO_SETTINGS_EVENT='ygo-audio-settings';
let fallbackEnabled=true;

export function audioEnabled():boolean {
  try{return localStorage.getItem(AUDIO_ENABLED_KEY)!=='false';}catch{return fallbackEnabled;}
}
export function setAudioEnabled(enabled:boolean):void {
  fallbackEnabled=enabled;
  try{localStorage.setItem(AUDIO_ENABLED_KEY,String(enabled));}catch{}
  window.dispatchEvent(new Event(AUDIO_SETTINGS_EVENT));
}
