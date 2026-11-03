import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as E from '../server/engine.js';
import { Hub } from '../server/hub.js';
import { SqliteStore } from '../server/store.js';
import { cards, FixtureCards } from './fixtures.js';

function room(count=3) {
  const r=E.createRoom('ABCDEF','p0','p0',{mode:'random',attempts:3,itemCards:false});
  for(let i=1;i<count;i++)E.join(r,'p'+i,'p'+i);
  r.players.forEach(p=>p.ready=true);
  E.startRound(r,cards);
  return r;
}
const skip=(r:ReturnType<typeof room>)=>E.skip(r,r.turnPlayerId!,r.turnId);

test('turn cycle starts at one and advances only after a full rotation',()=>{
  const r=room();
  assert.equal(E.view(r,'p0',new Set()).turnCycle,1);
  skip(r);assert.equal(r.turnCycle,1);
  E.skip(r,'p0',r.turnId,true);assert.equal(r.turnCycle,1);
  skip(r);assert.equal(r.turnCycle,2);
  assert.equal(r.turnPlayerId,'p0');
  for(let i=0;i<3;i++)skip(r);
  assert.equal(r.turnCycle,3);
});

test('each new game resets the cycle and uses its rotated starting player',()=>{
  const r=room();
  for(let i=0;i<3;i++)skip(r);
  E.finishRound(r);E.returnToLobby(r);
  r.players.forEach(p=>p.ready=true);
  E.startRound(r,cards);
  assert.equal(r.round,2);
  assert.equal(r.turnPlayerId,'p1');assert.equal(r.turnCycle,1);
  skip(r);assert.equal(r.turnPlayerId,'p2');assert.equal(r.turnCycle,1);
  skip(r);assert.equal(r.turnPlayerId,'p0');assert.equal(r.turnCycle,1);
  skip(r);assert.equal(r.turnPlayerId,'p1');assert.equal(r.turnCycle,2);
});

test('finishing players and late spectators do not move the cycle boundary',()=>{
  const r=room();
  E.join(r,'late','观战玩家');
  E.guess(r,'p0',r.entries[0].card!,r.turnId);
  assert.equal(r.turnCycle,1);
  skip(r);skip(r);
  assert.equal(r.turnPlayerId,'p1');assert.equal(r.turnCycle,2);
  E.guess(r,'p1',r.entries[1].card!,r.turnId);
  assert.equal(r.turnPlayerId,'p2');assert.equal(r.turnCycle,2);
  E.guess(r,'p2',cards.find(card=>card.cid!==r.entries[2].card!.cid)!,r.turnId);
  assert.equal(r.turnPlayerId,'p2');assert.equal(r.turnCycle,3);
  E.guess(r,'p2',r.entries[2].card!,r.turnId);
  assert.equal(r.phase,'round-end');assert.equal(r.turnCycle,3);
});

test('leaving the game does not move the original cycle boundary',()=>{
  const r=room();
  E.leave(r,'p0',new Set(['p1','p2']));
  assert.equal(r.turnPlayerId,'p1');assert.equal(r.turnCycle,1);
  skip(r);assert.equal(r.turnCycle,1);
  skip(r);assert.equal(r.turnPlayerId,'p1');assert.equal(r.turnCycle,2);
});

test('prohibited turns count toward rotations without changing personal turn counts',()=>{
  const r=room(2);
  r.entries.forEach(e=>e.skipNextTurns=2);
  skip(r);
  assert.equal(r.turnPlayerId,'p1');assert.equal(r.turnCycle,3);
  assert.deepEqual(r.entries.map(e=>e.turns),[1,1]);
  skip(r);assert.equal(r.turnPlayerId,'p0');assert.equal(r.turnCycle,4);
});

test('turn cycle and its boundary survive storage and server restart',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'ygoguess-turn-cycle-'));
  const store=new SqliteStore(path.join(dir,'test.sqlite'));
  let hub:Hub|undefined;
  try{
    const r=room();
    E.guess(r,'p0',r.entries[0].card!,r.turnId);
    skip(r);skip(r);
    await store.saveRoom(r);
    hub=new Hub(store,new FixtureCards());await hub.init();
    const restored=hub.roomFor('p1')!;
    assert.equal(E.view(restored,'p1',new Set()).turnCycle,2);
    assert.equal(restored.turnCycleStartPlayerId,'p0');
    skip(restored);skip(restored);
    assert.equal(restored.turnCycle,3);
    await hub.close();hub=undefined;

    // Older snapshots have only personal turn counts to recover from.
    delete r.turnCycle;delete r.turnCycleStartPlayerId;
    await store.saveRoom(r);
    hub=new Hub(store,new FixtureCards());await hub.init();
    const legacy=hub.roomFor('p1')!;
    assert.equal(E.view(legacy,'p1',new Set()).turnCycle,2);
    skip(legacy);skip(legacy);assert.equal(legacy.turnCycle,3);
  }finally{
    await hub?.close();await store.close();await rm(dir,{recursive:true,force:true});
  }
});
