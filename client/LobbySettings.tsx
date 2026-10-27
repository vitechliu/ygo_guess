import {useEffect,useState} from 'react';
import {Settings2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {RadioGroup,RadioGroupItem} from '@/components/ui/radio-group';
import type {RoomView,Settings} from '../shared/types';
import type {Send} from './game';

export function LobbySettings({room,host,send,connected}:{room:RoomView;host:boolean;send:Send;connected:boolean}){
  const [draft,setDraft]=useState<Settings>(()=>({...room.settings}));
  const [saving,setSaving]=useState(false);
  useEffect(()=>setDraft({...room.settings}),[room.code,room.settings.mode,room.settings.attempts,room.settings.itemCards,room.settings.initialDrawing]);
  const changed=(draft.initialDrawing??false)!==(room.settings.initialDrawing??false)||draft.mode!==room.settings.mode||draft.attempts!==room.settings.attempts||(draft.itemCards??true)!==(room.settings.itemCards??true);
  const valid=Number.isInteger(draft.attempts)&&draft.attempts>=1&&draft.attempts<=10;
  const save=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!changed||!valid||saving||!connected)return;
    setSaving(true);
    try{await send({type:'update-settings',settings:draft});}catch{}finally{setSaving(false);}
  };
  return <section className="lobby-settings" aria-label="本场规则">
    <div className="lobby-settings-head"><h2><Settings2 size={18}/>本场规则</h2><p>{host?'开局前可以修改；保存后其他玩家需重新准备':'房主可在开局前调整规则'}</p></div>
    {host?<form onSubmit={save} className="lobby-settings-form">
      <fieldset disabled={!connected||saving}>
        <div className="lobby-mode-field"><span>游戏模式</span><RadioGroup value={draft.mode} onValueChange={mode=>setDraft(s=>({...s,mode:mode as Settings['mode'],initialDrawing:mode==='custom'&&!!s.initialDrawing}))} className="lobby-mode-options">
          <label className={draft.mode==='custom'?'selected':''}><RadioGroupItem value="custom" id="lobby-mode-custom"/>好友出题</label>
          <label className={draft.mode==='random'?'selected':''}><RadioGroupItem value="random" id="lobby-mode-random"/>随机分配</label>
        </RadioGroup></div>
        <label className="item-cards-setting"><span>初始画猜</span><input aria-label="初始画猜" type="checkbox" disabled={draft.mode!=='custom'} checked={draft.initialDrawing??false} onChange={e=>setDraft(s=>({...s,initialDrawing:e.target.checked}))}/><small>仅好友出题：为下家出题 → 为上家绘画 → 开始猜测</small></label>
        <label>每局猜测机会<input aria-label="房间每局猜测机会" type="number" min={1} max={10} required value={draft.attempts} onChange={e=>setDraft(s=>({...s,attempts:e.target.value===''?0:Number(e.target.value)}))}/></label>
        <label className="item-cards-setting"><span>开启道具卡</span><input aria-label="开启道具卡" type="checkbox" checked={draft.itemCards??true} onChange={e=>setDraft(s=>({...s,itemCards:e.target.checked}))}/><small>每局第 3、6、9……次轮到自己时各抽 1 张</small></label>
      </fieldset>
      <Button type="submit" variant="outline" disabled={!changed||!valid||saving||!connected}>{saving?'保存中…':'保存设置'}</Button>
    </form>:<div className="lobby-settings-summary"><span>{room.settings.mode==='custom'?'好友出题':'随机分配'}</span>{room.settings.initialDrawing&&<span>初始画猜</span>}<span>不限局数</span><span>每局 {room.settings.attempts} 次猜测</span><span>道具卡{room.settings.itemCards===false?'关闭':'开启'}</span></div>}
  </section>;
}
