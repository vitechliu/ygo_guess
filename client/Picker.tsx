import { useState,useEffect,useRef } from 'react';
import { Check,Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty } from '@/components/ui/combobox';
import type { Card } from '../shared/types';
import { api } from './game';
export function CardPicker({label,button,onSubmit,disabled}:{label:string;button:string;onSubmit:(card:Card)=>Promise<void>;disabled:boolean}){
 const [query,setQuery]=useState(''),[cards,setCards]=useState<Card[]>([]),[selected,setSelected]=useState<Card|null>(null),[next,setNext]=useState(0),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const version=useRef(0);
 useEffect(()=>{
  const v=++version.current;if(!query.trim()){setCards([]);setNext(0);setError('');setLoading(false);return;}
  const controller=new AbortController();setLoading(true);setError('');
  const timer=setTimeout(()=>{api<{cards:Card[];next:number}>('/api/cards/search?q='+encodeURIComponent(query.trim()),{signal:controller.signal}).then(r=>{if(v===version.current){setCards(r.cards);setNext(r.next);}}).catch(e=>{if(!controller.signal.aborted&&v===version.current)setError(e.message);}).finally(()=>{if(v===version.current)setLoading(false);});},300);
  return()=>{clearTimeout(timer);controller.abort();};
 },[query]);
 const more=async()=>{const v=version.current;setLoading(true);try{const r=await api<{cards:Card[];next:number}>('/api/cards/search?q='+encodeURIComponent(query.trim())+'&start='+next);if(v===version.current){setCards(old=>[...new Map([...old,...r.cards].map(c=>[c.cid,c])).values()]);setNext(r.next);}}catch(e){if(v===version.current)setError((e as Error).message);}finally{if(v===version.current)setLoading(false);}};
 const submit=async()=>{if(!selected)return;setBusy(true);try{await onSubmit(selected);}catch{}finally{setBusy(false);}};
 return <div className="picker"><label className="small-label">{label}</label><div className="picker-row">
  <Combobox items={cards} value={selected} onValueChange={v=>{setSelected(v);if(v)setQuery(v.name);}} inputValue={query} onInputValueChange={(v,details)=>{setQuery(v);if(details.reason==='input-change'||details.reason==='clear-press')setSelected(null);}} itemToStringLabel={c=>c.name} isItemEqualToValue={(a,b)=>a.cid===b.cid} filter={null}>
   <ComboboxInput aria-label={label} placeholder="输入卡名，搜索并选择…" className="search-input" disabled={disabled||busy} showClear/>
   <ComboboxContent className="search-popup"><div className="search-hint">{loading?'正在搜索…':error||'选择准确的卡牌名称'}</div><ComboboxEmpty>{query.trim()?'没有匹配结果':'输入卡名开始搜索'}</ComboboxEmpty><ComboboxList>{(card:Card)=><ComboboxItem key={card.cid} value={card} className="search-option"><img src={card.image.replace('!half','!thumb')} alt="" width={30} height={43}/><span><strong>{card.name}</strong><small>{card.types.split('\n')[0]}</small></span></ComboboxItem>}</ComboboxList>{next>0&&<button className="load-more" disabled={loading} onMouseDown={e=>e.preventDefault()} onClick={()=>void more()}>加载更多</button>}</ComboboxContent>
  </Combobox><Button className="primary" disabled={!selected||disabled||busy||query!==selected.name} onClick={()=>void submit()}>{busy?<Loader2 className="spin" size={16}/>:<Check size={16}/>} {button}</Button></div>{error&&<p className="error-text">{error}，修改关键词可重试。</p>}</div>;
}
