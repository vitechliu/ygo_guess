import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {WebSocket} from 'ws';
import {Hub,parseCommand} from '../server/hub.js';
import {SqliteStore} from '../server/store.js';
import * as E from '../server/engine.js';
import {FixtureCards,cards,session} from './fixtures.js';
import type {Command,ServerMessage} from '../shared/types.js';
const command=(body:Omit<Extract<Command,{type:'player-reaction'}>,'id'>):Command=>({...body,id:randomUUID()});
class Socket extends EventEmitter {
  readyState:number=WebSocket.OPEN;
  messages:ServerMessage[]=[];
  send(data:string){this.messages.push(JSON.parse(data));}
  close(){this.readyState=WebSocket.CLOSED;this.emit('close');}
}
function room(){
  const r=E.createRoom('ABCDEF','a','a',{mode:'random',attempts:3,itemCards:false});
  E.join(r,'b','b');r.players[1].ready=true;E.startRound(r,cards);return r;
}
test('reaction allowance resets each round and validates phase, sender, target and quantity',()=>{
  const r=room();
  assert(r.players.every(p=>p.reactionAllowance===100));
  for(const kind of ['flower','egg'] as const)E.sendPlayerReaction(r,'a','b',kind,1,r.setupId);
  assert.equal(r.players[0].reactionAllowance,98);
  const before=structuredClone(r);
  for(const [sender,target,kind,quantity,setup] of [
    ['a','a','flower',1,r.setupId],['a','missing','egg',1,r.setupId],['missing','b','egg',1,r.setupId],
    ['a','b','other',1,r.setupId],['a','b','egg',-1,r.setupId],['a','b','egg',100,r.setupId],['a','b','egg',1,'old'],
  ] as const)assert.throws(()=>E.sendPlayerReaction(r,sender,target,kind as 'egg',quantity as 1,setup));
  assert.deepEqual(r,before);
  E.join(r,'late','late');assert.throws(()=>E.sendPlayerReaction(r,'late','a','egg',1,r.setupId),/下一局/);
  r.phase='round-end';E.sendPlayerReaction(r,'a','late','flower',10,r.setupId);
  E.returnToLobby(r);assert.throws(()=>E.sendPlayerReaction(r,'a','b','egg',1,r.setupId),/尚未开始/);
  r.players.forEach(p=>p.ready=true);E.startRound(r,cards);
  assert(r.players.every(p=>p.reactionAllowance===100));
  delete r.players[0].reactionAllowance;
  assert.throws(()=>E.sendPlayerReaction(r,'a','b','egg',1,r.setupId),/额度不足/);
  assert.equal(E.view(r,'a',new Set()).players[0].reactionAllowance,undefined);
});
test('reaction command parser rejects unsupported quantities, kinds and missing round identity',()=>{
  const c={id:randomUUID(),type:'player-reaction',kind:'flower',quantity:10,targetPlayerId:'b',setupId:randomUUID()};
  assert.deepEqual(parseCommand(c),c);
  for(const patch of [{quantity:0},{quantity:2},{quantity:1.5},{quantity:'10'},{kind:'other'},{setupId:undefined}])assert.throws(()=>parseCommand({...c,...patch}));
});
test('reactions persist once, cannot overspend concurrently, stay in the room and never enter chat or replay',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'ygo-reactions-'));
  const store=new SqliteStore(path.join(dir,'test.sqlite'));
  let hub=new Hub(store,new FixtureCards());
  await hub.init();
  try{
    const r=room();hub.rooms.set(r.code,r);await store.saveRoom(r);
    const a=new Socket(),b=new Socket(),outsider=new Socket();
    hub.attach(a as unknown as WebSocket,session('a'));hub.attach(b as unknown as WebSocket,session('b'));hub.attach(outsider as unknown as WebSocket,session('outsider'));
    const chat=structuredClone(r.chat);
    const c=command({type:'player-reaction',kind:'flower',quantity:10,targetPlayerId:'b',setupId:r.setupId});
    await Promise.all([hub.handle(session('a'),c),hub.handle(session('a'),c)]);
    assert.equal(hub.roomFor('a')!.players[0].reactionAllowance,90);
    assert.equal(a.messages.filter(m=>m.type==='player-reaction').length,1);
    assert.equal(b.messages.filter(m=>m.type==='player-reaction').length,1);
    assert.equal(outsider.messages.filter(m=>m.type==='player-reaction').length,0);
    const results=await Promise.allSettled(Array.from({length:10},()=>hub.handle(session('a'),command({type:'player-reaction',kind:'egg',quantity:10,targetPlayerId:'b',setupId:r.setupId}))));
    assert.equal(results.filter(result=>result.status==='fulfilled').length,9);
    assert.equal(hub.roomFor('a')!.players[0].reactionAllowance,0);
    assert.deepEqual(hub.roomFor('a')!.chat,chat);
    assert.equal((await store.loadRooms())[0].players[0].reactionAllowance,0);
    await hub.close();hub=new Hub(store,new FixtureCards());await hub.init();
    const reconnected=new Socket();hub.attach(reconnected as unknown as WebSocket,session('a'));
    assert.equal(hub.roomFor('a')!.players[0].reactionAllowance,0);
    assert(!reconnected.messages.some(m=>m.type==='player-reaction'));
    await hub.handle(session('a'),c);
    assert(!reconnected.messages.some(m=>m.type==='player-reaction'));
    await assert.rejects(hub.handle(session('a'),command({type:'player-reaction',kind:'egg',quantity:1,targetPlayerId:'b',setupId:r.setupId})),/额度不足/);
  }finally{await hub.close();await store.close();await rm(dir,{recursive:true,force:true});}
});
