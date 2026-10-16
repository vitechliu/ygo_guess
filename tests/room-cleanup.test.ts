import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';
import { Hub } from '../server/hub.js';
import { SqliteStore } from '../server/store.js';
import * as E from '../server/engine.js';
import type { Command, RoomState, ServerMessage } from '../shared/types.js';
import { FixtureCards, session } from './fixtures.js';

const HOUR=60*60*1000;
const cmd=(body:object)=>({...body,id:randomUUID()}) as Command;
class Socket extends EventEmitter {
  readyState:number=WebSocket.OPEN;
  messages:ServerMessage[]=[];
  send(data:string){this.messages.push(JSON.parse(data));}
  close(){this.readyState=WebSocket.CLOSED;this.emit('close');}
}
function room(code:string,at:number):RoomState {
  const r=E.createRoom(code,code,code,{mode:'random',attempts:3});
  r.createdAt=at;r.lastActivityAt=at;
  return r;
}
async function harness(){
  const dir=await mkdtemp(path.join(os.tmpdir(),'ygo-cleanup-'));
  const filename=path.join(dir,'test.sqlite');
  const store=new SqliteStore(filename);
  const hub=new Hub(store,new FixtureCards());
  return {store,hub,filename,async close(){await hub.close();await store.close();await rm(dir,{recursive:true,force:true});}};
}

test('cleanup evicts all idle members, deletes closed rooms, and preserves fresh rooms and durable records',async()=>{
  const h=await harness();
  try{
    await h.hub.init();
    const now=Date.now();
    const idle=room('ABCDEF',now-3*HOUR);
    E.join(idle,'guest','Guest');
    idle.phase='guessing';
    idle.history=[{round:1,entries:[{playerId:idle.hostId,submitted:true,status:'solved',attempts:2,turns:1,points:1000}]}];
    const fresh=room('BCDEFG',now+HOUR);
    const closed=room('CDEFGH',now);closed.phase='closed';
    await h.store.saveRooms([idle,fresh,closed]);
    await h.store.putSession('cookie',session(idle.hostId));
    for(const r of [idle,fresh,closed])h.hub.rooms.set(r.code,r);
    const a=new Socket(),b=new Socket(),c=new Socket();
    h.hub.attach(a as unknown as WebSocket,session(idle.hostId));
    h.hub.attach(b as unknown as WebSocket,session('guest'));
    h.hub.attach(c as unknown as WebSocket,session(fresh.hostId));
    await h.hub.cleanupRooms();
    for(const socket of [a,b]){
      assert.deepEqual(socket.messages.at(-1),{type:'snapshot',room:null});
      assert.equal(socket.readyState,WebSocket.OPEN);
    }
    assert.equal(h.hub.roomFor('guest'),undefined);
    assert.equal(h.hub.roomFor(idle.hostId),undefined);
    assert.equal(h.hub.roomFor(fresh.hostId)?.code,fresh.code);
    assert.deepEqual([...h.hub.rooms.keys()],[fresh.code]);
    assert.deepEqual((await h.store.loadRooms()).map(r=>r.code),[fresh.code]);
    assert.equal((await h.store.getSession('cookie'))?.playerId,idle.hostId);
    const db=new DatabaseSync(h.filename);
    try{assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cg_results').get()!.n,1);}finally{db.close();}
    await assert.rejects(h.hub.handle(session('guest'),cmd({type:'join',code:idle.code})),/找不到/);
    await assert.rejects(h.hub.handle(session(idle.hostId),cmd({type:'chat',text:'stale'})),/不存在/);
    await h.hub.handle(session('guest'),cmd({type:'create',settings:{mode:'random',attempts:3}}));
    assert(h.hub.roomFor('guest'));
  }finally{await h.close();}
});

test('startup cleans legacy rooms using user activity and does not count system notices',async()=>{
  const h=await harness();
  try{
    const now=Date.now();
    const stale=room('ABCDEF',now-4*HOUR);delete stale.lastActivityAt;
    stale.chat=[{id:'system',name:'system',text:'host transferred',time:now,system:true}];
    const recentCommand=room('BCDEFG',now-4*HOUR);delete recentCommand.lastActivityAt;
    recentCommand.processed=[{key:'command',at:now}];
    const recentChat=room('CDEFGH',now-4*HOUR);delete recentChat.lastActivityAt;
    recentChat.chat=[{id:'chat',name:'Guest',text:'hello',time:now}];
    const closed=room('DEFGHJ',now);closed.phase='closed';
    await h.store.saveRooms([stale,recentCommand,recentChat,closed]);
    await h.hub.init();
    assert.deepEqual([...h.hub.rooms.keys()],[recentCommand.code,recentChat.code]);
    assert.deepEqual((await h.store.loadRooms()).map(r=>r.code),[recentCommand.code,recentChat.code]);
  }finally{await h.close();}
});

test('hourly timer honors the exact three-hour threshold and stops on close',async t=>{
  t.mock.timers.enable({apis:['Date','setInterval'],now:Date.now()});
  const h=await harness();
  let closed=false;
  try{
    const now=Date.now();
    const expired=room('ABCDEF',now-2*HOUR);
    const fresh=room('BCDEFG',now-2*HOUR+1);
    await h.store.saveRooms([expired,fresh]);
    await h.hub.init();
    assert.equal(h.hub.rooms.size,2);
    t.mock.timers.tick(HOUR-1);
    await h.hub.handle({...session('admin'),admin:true},cmd({type:'admin-list'}));
    assert.equal(h.hub.rooms.size,2);
    t.mock.timers.tick(1);
    await h.hub.handle({...session('admin'),admin:true},cmd({type:'admin-list'}));
    assert.deepEqual([...h.hub.rooms.keys()],[fresh.code]);
    await h.hub.close();closed=true;
    t.mock.timers.tick(4*HOUR);
    await h.hub.handle({...session('admin'),admin:true},cmd({type:'admin-list'}));
    assert.equal(h.hub.rooms.size,1);
  }finally{if(!closed)await h.hub.close();await h.store.close();await rm(path.dirname(h.filename),{recursive:true,force:true});}
});

test('successful commands persist activity, rejected and repeated commands do not refresh it',async()=>{
  const h=await harness();
  try{
    await h.hub.init();
    const r=room('ABCDEF',Date.now()-4*HOUR);
    h.hub.rooms.set(r.code,r);await h.store.saveRoom(r);
    await assert.rejects(h.hub.handle(session(r.hostId),cmd({type:'next'})),/至少需要2名玩家/);
    assert.equal(h.hub.roomFor(r.hostId)?.lastActivityAt,r.lastActivityAt);
    const chat=cmd({type:'chat',text:'hello'});
    await h.hub.handle(session(r.hostId),chat);
    const active=h.hub.roomFor(r.hostId)!;
    assert(active.lastActivityAt!>r.lastActivityAt!);
    assert.equal((await h.store.loadRooms())[0].lastActivityAt,active.lastActivityAt);
    active.lastActivityAt=Date.now()-4*HOUR;
    await h.hub.handle(session(r.hostId),chat);
    assert(active.lastActivityAt<Date.now()-3*HOUR);
    await h.hub.cleanupRooms();
    assert.equal(h.hub.rooms.size,0);
  }finally{await h.close();}
});

test('drawing activity protects an idle room and is persisted before shutdown',async()=>{
  const h=await harness();
  try{
    await h.hub.init();
    const r=room('ABCDEF',Date.now()-4*HOUR);
    r.phase='guessing';r.drawing={id:randomUUID(),userId:r.hostId,drawerId:r.hostId};
    h.hub.rooms.set(r.code,r);await h.store.saveRoom(r);
    const socket=new Socket();h.hub.attach(socket as unknown as WebSocket,session(r.hostId));
    socket.emit('message',Buffer.from(JSON.stringify(cmd({type:'drawing-stroke',drawingId:r.drawing.id,points:[[10,20]],continuation:false}))));
    await h.hub.cleanupRooms();
    assert.equal(h.hub.roomFor(r.hostId)?.code,r.code);
    assert(socket.messages.some(m=>m.type==='ack'));
    await h.hub.close();
    const saved=(await h.store.loadRooms())[0];
    assert(saved.lastActivityAt!>r.lastActivityAt!);
  }finally{await h.close();}
});

test('failed database deletion preserves rooms and clients, and the next cleanup can retry',async t=>{
  const h=await harness();
  try{
    await h.hub.init();
    const r=room('ABCDEF',Date.now()-4*HOUR);
    h.hub.rooms.set(r.code,r);await h.store.saveRoom(r);
    const socket=new Socket();h.hub.attach(socket as unknown as WebSocket,session(r.hostId));
    const failing=t.mock.method(h.store,'deleteRooms',async()=>{throw new Error('database unavailable');});
    await assert.rejects(h.hub.cleanupRooms(),/database unavailable/);
    assert.equal(h.hub.roomFor(r.hostId)?.code,r.code);
    assert.equal((await h.store.loadRooms()).length,1);
    const latest=socket.messages.at(-1);
    assert(latest?.type==='snapshot'&&latest.room);
    failing.mock.restore();
    await h.hub.cleanupRooms();
    assert.equal(h.hub.rooms.size,0);
    assert.deepEqual(socket.messages.at(-1),{type:'snapshot',room:null});
  }finally{await h.close();}
});
