import {useState,useEffect} from 'react';
import {Plus,Users,ArrowRight,Shuffle,Loader2,CircleHelp,Eye,MessageCircle,Sparkles,Trophy} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {RadioGroup,RadioGroupItem} from '@/components/ui/radio-group';
import type {Settings} from '../shared/types';
import {api,type User,type Send,type Action} from './game';
export function Home({user,setUser,send,connected}:{user:User|null;setUser:(u:User)=>void;send:Send;connected:boolean}){
 const initialCode=new URLSearchParams(location.search).get('room')??'';
 const [tab,setTab]=useState(initialCode?'join':'create'),[name,setName]=useState(user?.name??''),[code,setCode]=useState(initialCode.toUpperCase());
 const [settings,setSettings]=useState<Settings>({mode:'custom',rounds:3,attempts:3}),[busy,setBusy]=useState(false),[pendingAction,setPendingAction]=useState<Action|null>(null);
 useEffect(()=>{if(!pendingAction||!connected)return;setPendingAction(null);send(pendingAction).catch(()=>{}).finally(()=>setBusy(false));},[connected,pendingAction,send]);
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;setBusy(true);
  const action:Action=tab==='create'?{type:'create',settings}:{type:'join',code:code.trim().toUpperCase()};
  try{if(!user||user.name!==name.trim()){const result=await api<{session:User}>('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});setUser(result.session);setPendingAction(action);}else{await send(action);setBusy(false);}}catch(e){toast.error((e as Error).message);setBusy(false);}
 };
 return <main className="home"><div className="home-title"><span className="eyebrow"><span className="tiny-line"/> MULTIPLAYER CARD GAME</span><h1>入座，开一局。</h1><p>看得见别人的卡，猜不透自己的那张。</p></div>
 <div className="home-layout"><section className="panel entry-panel"><Tabs value={tab} onValueChange={setTab}><TabsList className="entry-tabs"><TabsTrigger value="create"><Plus size={17}/>创建房间</TabsTrigger><TabsTrigger value="join"><Users size={17}/>加入房间</TabsTrigger></TabsList><form onSubmit={submit} className="entry-form">
 <label className="field-label" htmlFor="nickname">你的昵称 <span>房间里的大家会这样称呼你</span></label><input id="nickname" className="text-input" value={name} onChange={e=>setName(e.target.value)} placeholder="起一个你喜欢的名字" maxLength={16} required autoComplete="nickname"/>
 <TabsContent value="create"><div className="field-label mode-label">选择玩法</div><RadioGroup value={settings.mode} onValueChange={v=>setSettings(s=>({...s,mode:v as Settings['mode']}))} className="mode-options">
 <label className={'mode-option '+(settings.mode==='custom'?'selected':'')}><RadioGroupItem value="custom" id="mode-custom"/><div className="mode-icon"><Users size={22}/></div><div><strong>好友出题</strong><p>每个人为下家挑选一张卡</p></div><span className="mode-tag">推荐</span></label>
 <label className={'mode-option '+(settings.mode==='random'?'selected':'')}><RadioGroupItem value="random" id="mode-random"/><div className="mode-icon"><Shuffle size={22}/></div><div><strong>随机分配</strong><p>从精选题库中抽取卡牌</p></div></label></RadioGroup>
 {settings.mode==='random'&&<p className="hint">从精选题库随机分配卡牌，同局不会重复。</p>}
 <div className="number-fields"><label>比赛局数<div className="number-wrap"><input aria-label="比赛局数" type="number" min={1} max={20} value={settings.rounds} onChange={e=>setSettings(s=>({...s,rounds:Number(e.target.value)}))}/><span>局</span></div></label><label>每局猜测机会<div className="number-wrap"><input aria-label="每局猜测机会" type="number" min={1} max={10} value={settings.attempts} onChange={e=>setSettings(s=>({...s,attempts:Number(e.target.value)}))}/><span>次 / 人</span></div></label></div></TabsContent>
 <TabsContent value="join"><label className="field-label" htmlFor="room-code">房间码</label><input id="room-code" className="text-input room-code-input" placeholder="输入6位房间码" value={code} maxLength={6} minLength={6} required={tab==='join'} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,''))}/><p className="hint">已经开赛的房间也可以加入，你将从下一局开始参赛。</p></TabsContent>
 <Button className="primary full start-button" type="submit" disabled={busy||!name.trim()}>{busy?<Loader2 className="spin" size={18}/>:tab==='create'?<Plus size={18}/>:<ArrowRight size={18}/>} {tab==='create'?'创建房间，邀请朋友':'加入牌桌'}<ArrowRight size={18} className="button-arrow"/></Button><p className="form-footnote"><Users size={14}/>2–8 人 <span>·</span> 无需注册 <span>·</span> 回合不限时</p>
 </form></Tabs></section>
 <aside className="how-to"><div className="guide-head"><CircleHelp size={19}/><h2>一张未知的卡，一桌熟悉的朋友。</h2></div><div className="rule-step"><span>01</span><div><h3>为别人选一张卡</h3><p>给下家出题。自己的卡是秘密，其他人的卡都能看见。</p></div><Eye size={21}/></div><div className="rule-step"><span>02</span><div><h3>在聊天里寻找线索</h3><p>“我是怪兽卡吗？”任何时候都可以交流；轮到你时，把问题问出来。</p></div><MessageCircle size={21}/></div><div className="rule-step"><span>03</span><div><h3>想好了，就猜一次</h3><p>搜索并选中答案。越少回合猜中，得分越高；也可以先跳过。</p></div><Sparkles size={21}/></div><div className="score-note"><Trophy size={24}/><div><strong>不拼手速，拼默契。</strong><p>所有人完成后结算，多局累计得分。</p></div></div></aside></div></main>;
}
