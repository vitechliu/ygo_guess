import {useState,useEffect,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider} from 'next-themes';
import {toast} from 'sonner';
import {Layers3,Shield,WifiOff,Loader2,RefreshCw,Crown,X,SkipForward,ArrowRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Toaster} from '@/components/ui/sonner';
import {api,useGame,phaseNames,type User,type Send,type Action} from './game';
import {Home} from './Home';
import {Room,Confirm,type Confirmation} from './Room';
import {UpdateNotes} from './UpdateNotes';
import type {AdminRoom} from '../shared/types';
import {version as gameVersion} from '../package.json';
import './style.css';
function App(){
 const [user,setUser]=useState<User|null>(null),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[adminPage,setAdminPage]=useState(location.pathname==='/admin');
 const [invitedCode,setInvitedCode]=useState(()=>new URLSearchParams(location.search).get('room')?.toUpperCase()??'');
 const [switching,setSwitching]=useState(false);
 const game=useGame(user);
 useEffect(()=>{api<{session:User|null}>('/api/session').then(v=>setUser(v.session)).catch(e=>setError(e.message)).finally(()=>setLoaded(true));},[]);
 useEffect(()=>{if(invitedCode&&game.room?.code===invitedCode){setInvitedCode('');history.replaceState(null,'','/');}},[invitedCode,game.room?.code]);
 const act=useCallback(async(a:Action)=>{try{await game.send(a);}catch(e){toast.error((e as Error).message);throw e;}},[game.send]);
 const dismissInvite=()=>{setInvitedCode('');history.replaceState(null,'','/');};
 const switchRoom=async()=>{setSwitching(true);try{await act({type:'join',code:invitedCode});}catch{}finally{setSwitching(false);}};
 return <div className="app-shell"><header className="topbar"><a href="/" className="wordmark" onClick={e=>{e.preventDefault();setAdminPage(false);dismissInvite();}}><span className="brand-icon"><Layers3 size={21}/></span><span>YGO<span className="brand-accent">GUESS</span><small>游戏王猜卡</small></span></a><div className="header-right"><span className="edition">和朋友一起，猜出那张卡</span>{user&&<span className="identity"><span className="avatar mini">{user.name.slice(0,1)}</span>{user.name}</span>}{user?.admin&&<Button variant="ghost" onClick={()=>setAdminPage(!adminPage)}><Shield size={16}/>{adminPage?'返回游戏':'管理房间'}</Button>}<UpdateNotes version={gameVersion}/></div></header>
 {loaded&&user&&!game.connected&&<div className="connection-banner" role="status"><WifiOff size={16}/>连接正在恢复，房间和猜测机会会保留。</div>}
 {!loaded?<main className="loading-screen"><Loader2 className="spin"/>正在连接牌桌…</main>:error?<main className="loading-screen"><p>{error}</p><Button onClick={()=>location.reload()}>重新连接</Button></main>:adminPage&&user?.admin?<Admin rooms={game.adminRooms} send={act} connected={game.connected}/>:game.room&&invitedCode&&game.room.code!==invitedCode?<main className="invite-switch"><section className="panel invite-switch-card"><span className="eyebrow">ROOM INVITATION</span><h1>朋友邀请你加入 {invitedCode}</h1><p>你目前还在房间 {game.room.code}。加入新房间后，你会退出原房间；原房间已获得的积分保留，未完成的本局记为 0 分。</p><div className="invite-switch-actions"><Button className="primary" disabled={!game.connected||switching} onClick={()=>void switchRoom()}>{switching?<Loader2 className="spin" size={17}/>:<ArrowRight size={17}/>}加入新房间</Button><Button variant="outline" onClick={dismissInvite}>留在原房间</Button></div></section></main>:game.room?<Room room={game.room} user={user!} send={act} connected={game.connected}/>:<Home user={user} setUser={setUser} send={act} connected={game.connected}/>}
 <footer className="site-footer"><span>YgoGuess <span className="footer-sep">/</span> 好问题，让答案近一点</span><a href="https://ygocdb.com/api" target="_blank" rel="noreferrer">卡牌数据与图片由百鸽提供 ↗</a></footer><Toaster position="top-center" richColors/></div>;
}
function Admin({rooms,send,connected}:{rooms:AdminRoom[];send:Send;connected:boolean}){
 const [confirm,setConfirm]=useState<Confirmation|null>(null);const run=(a:Action)=>{void send(a).catch(()=>{});};
 return <main className="admin-page"><div className="eyebrow">ROOM MANAGEMENT</div><div className="admin-title"><h1><Shield/>房间管理</h1><Button variant="outline" disabled={!connected} onClick={()=>run({type:'admin-list'})}><RefreshCw size={16}/>刷新</Button></div><p className="muted">可以处理房间状态和成员。管理视图不显示任何题目答案。</p>{!rooms.length?<div className="empty-admin"><Layers3 size={36}/><h2>还没有进行中的房间</h2><p>玩家创建房间后会出现在这里。</p></div>:<div className="admin-grid">{rooms.map(r=><section className="panel admin-room" key={r.code}><div className="admin-room-heading"><h2>{r.code}</h2><span className="phase-tag">{phaseNames[r.phase]}</span></div><p className="muted">第 {r.round||1} 局 · {r.players.length} 人</p>{r.players.map(p=><div className="admin-player" key={p.id}><span className="avatar mini">{p.name.slice(0,1)}</span><strong>{p.name}{p.id===r.hostId&&<Crown size={14}/>}</strong><span className="small-label">{p.online?'在线':'离线'}</span><Button variant="ghost" size="sm" disabled={!p.online||p.id===r.hostId||!connected} onClick={()=>run({type:'admin-transfer',code:r.code,playerId:p.id})}>设为房主</Button><Button variant="ghost" size="sm" disabled={!connected} onClick={()=>setConfirm({title:'移除 '+p.name+'？',description:'该玩家将退出本场，未完成的本局记为0分。',run:()=>run({type:'admin-kick',code:r.code,playerId:p.id})})}><X size={15}/></Button></div>)}<div className="admin-controls"><Button variant="outline" disabled={r.phase!=='guessing'||!connected} onClick={()=>run({type:'admin-skip',code:r.code,turnId:r.turnId})}><SkipForward size={16}/>强制跳过回合</Button><Button variant="ghost" className="danger-text" disabled={!connected} onClick={()=>setConfirm({title:'解散 '+r.code+'？',description:'所有玩家将返回首页，当前比赛停止。',run:()=>run({type:'admin-close',code:r.code})})}>解散房间</Button></div></section>)}</div>}<Confirm action={confirm} onClose={()=>setConfirm(null)}/></main>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}><App/></ThemeProvider>);
