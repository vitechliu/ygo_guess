import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {request as httpRequest} from 'node:http';import {randomUUID,createHash} from 'node:crypto';import {WebSocket} from 'ws';
import {EventEmitter} from 'node:events';
import {SqliteStore} from '../server/store.js';import {Hub,parseCommand} from '../server/hub.js';import {FileCache} from '../server/cache.js';import {Cards} from '../server/cards.js';import {createApp} from '../server/app.js';import {FixtureCards,cards,session} from './fixtures.js';import type {Command,ServerMessage,RoomView} from '../shared/types.js';
async function harness(){const dir=await mkdtemp(path.join(os.tmpdir(),'ygoguess-test-'));const store=new SqliteStore(path.join(dir,'test.sqlite'));const hub=new Hub(store,new FixtureCards(),1);await hub.init();return {dir,store,hub,async close(){await hub.close();await store.close();}};}
const cmd=(body:any)=>({...body,id:randomUUID()}) as Command;
async function started(h:Hub){await h.handle(session('a'),cmd({type:'create',settings:{mode:'random',rounds:2,attempts:3}}));const r=h.roomFor('a')!;await h.handle(session('b'),cmd({type:'join',code:r.code}));await h.handle(session('b'),cmd({type:'ready',ready:true}));await h.handle(session('a'),cmd({type:'start'}));return h.roomFor('a')!;}
test('drawing stream is live, private to the chosen drawer, and recoverable on reconnect',async()=>{
 const h=await harness();
 class Socket extends EventEmitter {
   readyState:number=WebSocket.OPEN;
   messages:ServerMessage[]=[];
   send(data:string){this.messages.push(JSON.parse(data) as ServerMessage);}
   close(){this.readyState=WebSocket.CLOSED;this.emit('close');}
 }
 try{
   const r=await started(h.hub);
   const a=new Socket(),b=new Socket();
   h.hub.attach(a as unknown as WebSocket,session('a'));
   h.hub.attach(b as unknown as WebSocket,session('b'));
   const item={instanceId:randomUUID(),cardId:'ecole-card' as const};r.entries[0].itemCards!.push(item);
   await h.hub.handle(session('a'),cmd({type:'use-item-card',instanceId:item.instanceId,turnId:r.turnId,targetPlayerId:'b'}));
   const drawing=h.hub.roomFor('a')!.drawing!;
   const stroke=cmd({type:'drawing-stroke',drawingId:drawing.id,points:[[10,20],[80,90]],continuation:false});
   assert.throws(()=>parseCommand({...stroke,points:[[900,20]]}),/格式/);
   a.emit('message',Buffer.from(JSON.stringify(stroke)));
   assert(a.messages.some(m=>m.type==='error'&&m.id===stroke.id));
   b.emit('message',Buffer.from(JSON.stringify(stroke)));
   assert(a.messages.some(m=>m.type==='drawing-stroke'&&m.drawingId===drawing.id));
   assert(b.messages.some(m=>m.type==='ack'&&m.id===stroke.id));
   b.close();
   const reconnected=new Socket();h.hub.attach(reconnected as unknown as WebSocket,session('b'));
   const snapshot=reconnected.messages.find(m=>m.type==='snapshot'&&m.room?.drawing?.id===drawing.id);
   assert.deepEqual(snapshot?.type==='snapshot'?snapshot.room?.drawingStrokes:undefined,[{points:[[10,20],[80,90]]}]);
   await assert.rejects(h.hub.handle(session('a'),cmd({type:'drawing-close',drawingId:drawing.id})),/只有绘画者/);
   await h.hub.handle(session('b'),cmd({type:'drawing-close',drawingId:drawing.id}));
   assert.equal(h.hub.roomFor('a')!.drawing,undefined);
   assert(reconnected.messages.some(m=>m.type==='snapshot'&&!m.room?.drawing));
   a.close();reconnected.close();
 }finally{await h.close();}
});
test('host skipping their own turn uses the normal notice, while skipping another player is forced',async()=>{
 const h=await harness();try{
  let r=await started(h.hub);
  await h.hub.handle(session('a'),cmd({type:'skip',turnId:r.turnId}));
  r=h.hub.roomFor('a')!;
  assert.equal(r.chat.at(-1)?.text,'a 的回合已跳过');
  assert.equal(r.turnPlayerId,'b');
  await h.hub.handle(session('a'),cmd({type:'skip',turnId:r.turnId}));
  r=h.hub.roomFor('a')!;
  assert.equal(r.chat.at(-1)?.text,'b 的回合已被强制跳过');
  await h.hub.handle(session('a'),cmd({type:'skip',turnId:r.turnId}));
  r=h.hub.roomFor('a')!;
  await h.hub.handle(session('b'),cmd({type:'skip',turnId:r.turnId}));
  assert.equal(h.hub.roomFor('a')!.chat.at(-1)?.text,'b 的回合已跳过');
 }finally{await h.close();}
});
test('item use is persisted once and rejects forged or stale turns',async()=>{
 const h=await harness();try{
  const r=await started(h.hub);const instance={instanceId:randomUUID(),cardId:'test-card' as const};r.entries[0].itemCards!.push(instance);const turn=r.turnId;
  assert.throws(()=>parseCommand({id:randomUUID(),type:'use-item-card',instanceId:'bad',turnId:turn}));
  await assert.rejects(h.hub.handle(session('b'),cmd({type:'use-item-card',instanceId:instance.instanceId,turnId:turn})),/轮到/);
  const use=cmd({type:'use-item-card',instanceId:instance.instanceId,turnId:turn});
  await h.hub.handle(session('a'),use);await h.hub.handle(session('a'),use);
  const saved=(await h.store.loadRooms()).find(room=>room.code===r.code)!;
  assert.equal(saved.entries[0].itemCards!.length,0);
  assert.equal(saved.chat.filter((message:{text:string;kind?:string})=>message.text==='a使用了测试卡'&&message.kind==='item-card').length,1);
  await assert.rejects(h.hub.handle(session('a'),cmd({type:'use-item-card',instanceId:instance.instanceId,turnId:turn})),/手牌/);
  await h.hub.handle(session('a'),cmd({type:'skip',turnId:turn}));
  await assert.rejects(h.hub.handle(session('a'),cmd({type:'use-item-card',instanceId:instance.instanceId,turnId:turn})),/回合/);
 }finally{await h.close();}
});
test('timed card effects survive storage and are removed by the room timer',async()=>{
 const h=await harness();try{
  const r=await started(h.hub);const instance={instanceId:randomUUID(),cardId:'mask-change-card' as const};r.entries[0].itemCards!.push(instance);
  await h.hub.handle(session('a'),cmd({type:'use-item-card',instanceId:instance.instanceId,turnId:r.turnId}));
  const saved=(await h.store.loadRooms()).find(room=>room.code===r.code)!;
  assert.equal(Object.keys(saved.visualEffects.masks.appearances).length,2);
  assert.equal(new Set(Object.values(saved.visualEffects.masks.appearances).map((hero:any)=>hero.id)).size,2);
  h.hub.roomFor('a')!.visualEffects!.masks!.endsAt=Date.now()-1;
  await new Promise(resolve=>setTimeout(resolve,1200));
  assert.equal(h.hub.roomFor('a')!.visualEffects?.masks,undefined);
  assert.equal((await h.store.loadRooms()).find(room=>room.code===r.code)?.visualEffects?.masks,undefined);
 }finally{await h.close();}
});
test('only the host can change lobby settings and changed rules require fresh readiness',async()=>{
 const h=await harness();try{
  await h.hub.handle(session('a'),cmd({type:'create',settings:{mode:'custom',rounds:2,attempts:3}}));const code=h.hub.roomFor('a')!.code;
  await h.hub.handle(session('b'),cmd({type:'join',code}));await h.hub.handle(session('b'),cmd({type:'ready',ready:true}));
  const changed=cmd({type:'update-settings',settings:{mode:'random',rounds:4,attempts:2}});
  await assert.rejects(h.hub.handle(session('b'),changed),/房主/);
  assert.throws(()=>parseCommand({id:randomUUID(),type:'update-settings',settings:{mode:'random',rounds:21,attempts:2}}));
  await h.hub.handle(session('a'),changed);let room=h.hub.roomFor('a')!;assert.deepEqual(room.settings,{mode:'random',rounds:4,attempts:2});assert.equal(room.players.find(p=>p.id==='b')!.ready,false);
  assert.deepEqual((await h.store.loadRooms()).find(r=>r.code===code)?.settings,room.settings);
  const notices=room.chat.filter(m=>m.text.includes('房主修改了规则')).length;await h.hub.handle(session('a'),changed);assert.equal(h.hub.roomFor('a')!.chat.filter(m=>m.text.includes('房主修改了规则')).length,notices);
  await assert.rejects(h.hub.handle(session('a'),cmd({type:'start'})),/准备/);
  await h.hub.handle(session('b'),cmd({type:'ready',ready:true}));await h.hub.handle(session('a'),cmd({type:'update-settings',settings:{mode:'custom',rounds:2,attempts:3}}));
  room=h.hub.roomFor('a')!;assert.equal(room.players.find(p=>p.id==='b')!.ready,false);
  await h.hub.handle(session('b'),cmd({type:'ready',ready:true}));await h.hub.handle(session('a'),cmd({type:'start'}));
  await assert.rejects(h.hub.handle(session('a'),cmd({type:'update-settings',settings:{mode:'random',rounds:4,attempts:2}})),/比赛开始后/);
 }finally{await h.close();}
});
test('host can shuffle the lobby repeatedly while readiness and persisted order stay intact',async()=>{
 const h=await harness();try{
  await h.hub.handle(session('a'),cmd({type:'create',settings:{mode:'custom',rounds:2,attempts:3}}));const code=h.hub.roomFor('a')!.code;
  await h.hub.handle(session('b'),cmd({type:'join',code}));await h.hub.handle(session('b'),cmd({type:'ready',ready:true}));
  await assert.rejects(h.hub.handle(session('b'),cmd({type:'shuffle'})),/房主/);
  const original=h.hub.roomFor('a')!.players.map(p=>p.seat);
  const first=cmd({type:'shuffle'});await h.hub.handle(session('a'),first);
  let r=h.hub.roomFor('a')!;assert.notDeepEqual(r.players.map(p=>p.seat),original);assert(r.players.find(p=>p.id==='b')!.ready);
  assert.equal((await h.store.loadRooms()).find(x=>x.code===code)?.players.find((p:{id:string;seat:number})=>p.id==='b')?.seat,r.players.find(p=>p.id==='b')?.seat);
  await h.hub.handle(session('a'),first);assert.equal(h.hub.roomFor('a')!.chat.filter(m=>m.text.startsWith('房主打乱了玩家顺序')).length,1);
  await h.hub.handle(session('a'),cmd({type:'shuffle'}));r=h.hub.roomFor('a')!;
  assert.deepEqual(r.players.map(p=>p.seat),original);assert.equal(r.chat.filter(m=>m.text.startsWith('房主打乱了玩家顺序')).length,2);
  await h.hub.handle(session('a'),cmd({type:'start'}));await assert.rejects(h.hub.handle(session('a'),cmd({type:'shuffle'})),/比赛开始后/);
 }finally{await h.close();}
});
test('server rejects nonhost start, wrong-turn guesses, forged permissions and malformed commands',async()=>{
 const h=await harness();try{const r=await started(h.hub);await assert.rejects(h.hub.handle(session('b'),cmd({type:'next'})),/房主/);await assert.rejects(h.hub.handle(session('b'),cmd({type:'guess',cardId:100,turnId:r.turnId})),/轮到/);await assert.rejects(h.hub.handle(session('b'),cmd({type:'admin-close',code:r.code})),/管理员/);assert.throws(()=>parseCommand({id:'x',type:'create',settings:{mode:'random',rounds:0,attempts:99}}));}finally{await h.close();}
});
test('giving up is turn-bound and host-only kick preserves settled room state',async()=>{
 const h=await harness();try{
  let r=await started(h.hub);const old=r.turnId;
  await assert.rejects(h.hub.handle(session('b'),cmd({type:'give-up',turnId:old})),/轮到/);
  await assert.rejects(h.hub.handle(session('b'),cmd({type:'kick',playerId:'a'})),/房主/);
  await assert.rejects(h.hub.handle(session('a'),cmd({type:'kick',playerId:'a'})),/不能移除自己/);
  await h.hub.handle(session('a'),cmd({type:'give-up',turnId:old}));r=h.hub.roomFor('a')!;
  assert.equal(r.entries[0].attempts,0);assert.equal(r.entries[0].status,'failed');assert.equal(r.turnPlayerId,'b');
  await assert.rejects(h.hub.handle(session('a'),cmd({type:'give-up',turnId:old})),/回合/);
  assert.equal((await h.store.loadRooms()).find(x=>x.code===r.code)?.entries[0].attempts,0);
  await h.hub.handle(session('a'),cmd({type:'kick',playerId:'b'}));r=h.hub.roomFor('a')!;
  assert.equal(r.phase,'match-end');assert.equal(r.players.find(p=>p.id==='b')?.left,true);
  assert(r.chat.some(m=>m.text==='b 被房主移出了房间'));
  assert.equal(h.hub.roomFor('b'),undefined);
  assert.equal((await h.store.loadRooms()).find(x=>x.code===r.code)?.players.find((p:{id:string;left:boolean})=>p.id==='b')?.left,true);
 }finally{await h.close();}
});
test('duplicate and concurrent requests consume one opportunity; stale commands cannot advance twice',async()=>{
 const h=await harness();try{let r=await started(h.hub);const original=r.turnId;const wrong=cards.find(c=>c.cid!==r.entries[0].card!.cid)!;const c=cmd({type:'guess',cardId:wrong.id,turnId:original});await Promise.all([h.hub.handle(session('a'),c),h.hub.handle(session('a'),c)]);r=h.hub.roomFor('a')!;assert.equal(r.entries[0].attempts,2);assert.equal(r.turnPlayerId,'b');
 await assert.rejects(h.hub.handle(session('a'),cmd({type:'skip',turnId:original})),/回合/);assert.equal(h.hub.roomFor('a')!.turnPlayerId,'b');
 const valid=r.turnId;const results=await Promise.allSettled([h.hub.handle(session('a'),cmd({type:'skip',turnId:valid})),h.hub.handle(session('a'),cmd({type:'skip',turnId:valid}))]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.hub.roomFor('a')!.turnPlayerId,'a');
 }finally{await h.close();}
});
test('SQLite restart preserves game, sessions, deduplication and scores',async()=>{
 const h=await harness();let r=await started(h.hub);const c=cmd({type:'guess',cardId:r.entries[0].card!.id,turnId:r.turnId});await h.hub.handle(session('a'),c);
 await h.store.putSession('hashed-token',session('a'));const filename=path.join(h.dir,'test.sqlite');await h.close();const store=new SqliteStore(filename),hub=new Hub(store,new FixtureCards());await hub.init();
 try{assert.equal(hub.roomFor('a')!.players[0].score,1000);assert.equal(hub.roomFor('a')!.chat.at(-1)?.kind,'guess-correct');assert.equal((await store.getSession('hashed-token'))!.playerId,'a');const before=hub.roomFor('a')!.version;await hub.handle(session('a'),c);assert.equal(hub.roomFor('a')!.version,before);assert.equal(hub.roomFor('a')!.turnPlayerId,'b');}finally{await hub.close();await store.close();}
});
test('storage failure leaves live state untouched',async()=>{
 const h=await harness();try{const r=await started(h.hub);const original=h.store.saveRoom.bind(h.store);h.store.saveRoom=async()=>{throw new Error('disk unavailable');};await assert.rejects(h.hub.handle(session('a'),cmd({type:'skip',turnId:r.turnId})),/disk/);assert.equal(h.hub.roomFor('a')!.turnId,r.turnId);h.store.saveRoom=original;}finally{await h.close();}
});
test('joining an invitation switches rooms only after the destination is valid and saves both rooms',async()=>{
 const h=await harness();try{
  await h.hub.handle(session('a'),cmd({type:'create',settings:{mode:'custom',rounds:2,attempts:3}}));const old=h.hub.roomFor('a')!.code;
  await h.hub.handle(session('b'),cmd({type:'create',settings:{mode:'custom',rounds:2,attempts:3}}));const next=h.hub.roomFor('b')!.code;
  await assert.rejects(h.hub.handle(session('a'),cmd({type:'join',code:'ZZZZZZ'})),/找不到/);
  assert.equal(h.hub.roomFor('a')?.code,old);
  const original=h.store.saveRooms.bind(h.store);h.store.saveRooms=async()=>{throw new Error('disk unavailable');};
  await assert.rejects(h.hub.handle(session('a'),cmd({type:'join',code:next})),/disk/);
  assert.equal(h.hub.roomFor('a')?.code,old);
  assert.equal((await h.store.loadRooms()).find(r=>r.code===old)?.phase,'lobby');
  h.store.saveRooms=original;
  await h.hub.handle(session('a'),cmd({type:'join',code:next}));
  assert.equal(h.hub.roomFor('a')?.code,next);
  assert.equal((await h.store.loadRooms()).find(r=>r.code===old)?.phase,'closed');
  assert.equal((await h.store.loadRooms()).find(r=>r.code===next)?.players.find((p:{id:string})=>p.id==='a')?.left,false);
 }finally{await h.close();}
});
test('a kicked player can rejoin the same match with their existing score',async()=>{
 const h=await harness();try{
  const r=await started(h.hub);r.players.find(p=>p.id==='b')!.score=250;
  await h.hub.handle(session('a'),cmd({type:'kick',playerId:'b'}));
  assert.equal(h.hub.roomFor('b'),undefined);
  await h.hub.handle(session('b'),cmd({type:'join',code:r.code}));
  const joined=h.hub.roomFor('b')!;
  assert.equal(joined.players.filter(p=>p.id==='b').length,1);
  assert.equal(joined.players.find(p=>p.id==='b')?.score,250);
  assert.equal(joined.players.find(p=>p.id==='b')?.left,false);
 }finally{await h.close();}
});
test('admin list has no card data, admin can transfer, remove and close',async()=>{
 const h=await harness();try{const r=await started(h.hub);const a=session('admin',true);const list=await h.hub.handle(a,cmd({type:'admin-list'}));assert(!JSON.stringify(list).includes('"card"'));assert(!JSON.stringify(list).includes('"cid"'));
 await h.hub.handle(a,cmd({type:'admin-skip',code:r.code,turnId:r.turnId}));assert.equal(h.hub.roomFor('a')!.turnPlayerId,'b');
 await h.hub.handle(a,cmd({type:'admin-kick',code:r.code,playerId:'b'}));assert.equal(h.hub.roomFor('a')!.phase,'match-end');await h.hub.handle(a,cmd({type:'admin-close',code:r.code}));assert.equal(h.hub.roomFor('a'),undefined);
 }finally{await h.close();}
});
test('file cache survives reopen and card API falls back to stale cached data',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ygoguess-cache-'));const cache=new FileCache(dir);await cache.set('card:100',{at:0,data:{id:100,cid:1000,text:{name:'缓存卡',types:'怪兽',desc:'text'}}},60);
 const original=global.fetch;global.fetch=async()=>{throw new Error('offline');};try{const c=await new Cards(new FileCache(dir)).card(100);assert.equal(c.name,'缓存卡');await assert.rejects(new Cards(cache).card(101),/暂时不可用/);}finally{global.fetch=original;}
 const configured=JSON.parse(await readFile('config/card-pool.json','utf8')) as number[];assert(configured.length>=8);assert.equal(new Set(configured).size,configured.length);
});
test('curated pool uses 100-card batches and remains available from cache',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ygoguess-pool-')),poolPath=path.join(dir,'pool.json'),ids=Array.from({length:101},(_,i)=>i+1);
 await writeFile(poolPath,JSON.stringify(ids));const cache=new FileCache(path.join(dir,'cache'));const original=global.fetch;let calls=0;
 try{
  global.fetch=async(url,init)=>{assert.equal(String(url),'https://ygocdb.com/api/v0/cardset');const batch=JSON.parse(String(init?.body)).ids as number[];assert(batch.length<=100);calls++;return new Response(JSON.stringify(Object.fromEntries(batch.map(id=>[id,{id,cid:id+1000,text:{name:'card '+id}}]))),{status:200});};
  const first=await new Cards(cache,poolPath).pool();assert.equal(first.length,101);assert.equal(calls,2);
  global.fetch=async()=>{throw new Error('offline');};const cached=await new Cards(cache,poolPath).pool();assert.equal(cached.length,101);
 }finally{global.fetch=original;await cache.close();}
});
test('real HTTP and WebSocket transport, origin guard, admin cookie and reconnect snapshots',async()=>{
 const h=await harness();await h.hub.close();const app=await createApp({store:h.store,cards:new FixtureCards(),adminKey:'test-secret',hostGraceMs:1});
 await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const port=(app.server.address() as any).port,base='http://127.0.0.1:'+port;
 const sockets:WebSocket[]=[];const connect=async(cookie:string)=>{const ws=new WebSocket('ws://127.0.0.1:'+port+'/ws',{headers:{Cookie:cookie,Origin:base}});sockets.push(ws);const messages:ServerMessage[]=[];ws.on('message',v=>messages.push(JSON.parse(v.toString())));await new Promise<void>((r,j)=>{ws.once('open',()=>r());ws.once('error',j);});const wait=async(predicate:(m:ServerMessage)=>boolean)=>{for(let i=0;i<200;i++){const found=messages.find(predicate);if(found)return found;await new Promise(r=>setTimeout(r,10));}throw new Error('WebSocket timed out');};return {ws,messages,wait};};
 try{
 const getGuest=async(name:string)=>{const res=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});return {cookie:res.headers.get('set-cookie')!.split(';')[0],session:(await res.json()).session};};
 const a=await getGuest('网络A'),b=await getGuest('网络B');const ca=await connect(a.cookie),cb=await connect(b.cookie);
 const proxied=new WebSocket('ws://127.0.0.1:'+port+'/ws',{headers:{Host:'ark.example:443',Origin:'https://ark.example',Cookie:a.cookie}});sockets.push(proxied);await new Promise<void>((resolve,reject)=>{proxied.once('open',()=>resolve());proxied.once('error',reject);});
 const create=cmd({type:'create',settings:{mode:'random',rounds:1,attempts:1}});ca.ws.send(JSON.stringify(create));await ca.wait(m=>m.type==='ack'&&m.id===create.id);
 const code=app.hub.roomFor(a.session.playerId)!.code;const join=cmd({type:'join',code});cb.ws.send(JSON.stringify(join));await cb.wait(m=>m.type==='ack'&&m.id===join.id);
 const ready=cmd({type:'ready',ready:true});cb.ws.send(JSON.stringify(ready));await cb.wait(m=>m.type==='ack'&&m.id===ready.id);
 const start=cmd({type:'start'});ca.ws.send(JSON.stringify(start));await ca.wait(m=>m.type==='ack'&&m.id===start.id);
 const snap=await ca.wait(m=>m.type==='snapshot'&&m.room?.phase==='guessing') as {room:RoomView};assert.equal(snap.room.players.find(p=>p.id===a.session.playerId)!.card,undefined);
 ca.ws.close();await new Promise(r=>setTimeout(r,40));const again=await connect(a.cookie);const fresh=await again.wait(m=>m.type==='snapshot'&&m.room?.phase==='guessing') as {room:RoomView};assert.equal(fresh.room.turnId,snap.room.turnId);
 const forbidden=await fetch(base+'/api/session',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:JSON.stringify({name:'bad'})});assert.equal(forbidden.status,403);
 const proxiedHealth=(origin:string)=>new Promise<number>((resolve,reject)=>{const request=httpRequest({host:'127.0.0.1',port,path:'/api/health',headers:{Host:'ark.example:443',Origin:origin}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode??0));});request.on('error',reject);request.end();});
 assert.equal(await proxiedHealth('https://ark.example'),200);
 assert.equal(await proxiedHealth('https://evil.example'),403);
 assert.equal((await fetch(base+'/admin/entry?key=wrong',{redirect:'manual'})).status,403);
 const admin=await fetch(base+'/admin/entry?key=test-secret',{redirect:'manual'});assert.equal(admin.status,303);assert.equal(admin.headers.get('location'),'/admin');assert.match(admin.headers.get('set-cookie')!,/HttpOnly/);
 const cad=await connect(admin.headers.get('set-cookie')!.split(';')[0]);const admins=await cad.wait(m=>m.type==='admin-rooms');assert(!JSON.stringify(admins).includes('"cid"'));
 const transfer=cmd({type:'admin-transfer',code,playerId:b.session.playerId});cad.ws.send(JSON.stringify(transfer));await cad.wait(m=>m.type==='ack'&&m.id===transfer.id);assert.equal(app.hub.roomFor(a.session.playerId)!.hostId,b.session.playerId);
 cb.ws.close();await new Promise(r=>setTimeout(r,40));await app.hub.transferOfflineHosts();await new Promise(r=>setTimeout(r,10));await app.hub.transferOfflineHosts();assert.equal(app.hub.roomFor(a.session.playerId)!.hostId,a.session.playerId);
 }finally{for(const ws of sockets)ws.terminate();await app.close();await h.store.close();}
});
