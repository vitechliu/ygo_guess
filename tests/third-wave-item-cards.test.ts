import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../server/engine.js';
import { cards } from './fixtures.js';
import type { ItemCardId, RoomState } from '../shared/types.js';

function room(attempts=3): RoomState {
  const r=E.createRoom('ABCDEF','p0','p0',{mode:'custom',rounds:2,attempts,itemCards:true});
  E.join(r,'p1','p1');
  E.join(r,'p2','p2');
  r.players.forEach(player=>player.ready=true);
  E.startRound(r,[],true);
  for(let i=0;i<3;i++)E.submitCard(r,'p'+i,cards[i],r.setupId);
  return r;
}

function addCard(r:RoomState,cardId:ItemCardId) {
  const instanceId=cardId+'-'+r.entries[0].itemCards!.length;
  r.entries[0].itemCards!.push({instanceId,cardId});
  return instanceId;
}

test('clown nickname appears in player views for five minutes and then expires',()=>{
  const r=room();
  const card=addCard(r,'clown-card');
  assert.throws(()=>E.useItemCard(r,'p0',card,r.turnId,'p0'),/请选择/);
  E.useItemCard(r,'p0',card,r.turnId,'p1');
  assert.equal(r.players[1].name,'p1');
  assert.equal(E.view(r,'p2',new Set()).players[1].name,'🤡');
  assert.equal(r.chat.at(-1)?.kind,'item-card');
  assert.equal(E.expireVisualEffects(r,Date.now()+300001),true);
  assert.equal(E.view(r,'p2',new Set()).players[1].name,'p1');
});

test('friendship and unity add attempts only to active players',()=>{
  const r=room();
  r.entries[2].status='failed';r.entries[2].attempts=0;
  const friendship=addCard(r,'friendship-card');
  assert.throws(()=>E.useItemCard(r,'p0',friendship,r.turnId,'p2'),/请选择/);
  assert(r.entries[0].itemCards!.some(card=>card.instanceId===friendship));
  E.useItemCard(r,'p0',friendship,r.turnId,'p1');
  assert.deepEqual(r.entries.map(entry=>entry.attempts),[4,4,0]);
  const unity=addCard(r,'unity-card');
  E.useItemCard(r,'p0',unity,r.turnId);
  assert.deepEqual(r.entries.map(entry=>entry.attempts),[5,5,0]);
  assert.equal(r.entries[2].status,'failed');
});

test('snatch takes all but one attempt and rejects targets with fewer than two',()=>{
  const r=room(5);
  r.entries[1].attempts=4;
  r.entries[2].attempts=1;
  const card=addCard(r,'snatch-card');
  assert.throws(()=>E.useItemCard(r,'p0',card,r.turnId,'p2'),/至少还有 2 次/);
  assert.throws(()=>E.useItemCard(r,'p0',card,r.turnId,'p0'),/至少还有 2 次/);
  assert(r.entries[0].itemCards!.some(item=>item.instanceId===card));
  E.useItemCard(r,'p0',card,r.turnId,'p1');
  assert.equal(r.entries[0].attempts,8);
  assert.equal(r.entries[1].attempts,1);
  assert.match(r.chat.at(-1)!.text,/夺走了 3 次/);
});

test('countdown starts after the using turn and ends the small round after 20 completed player turns',()=>{
  const r=room();
  const card=addCard(r,'countdown-card');
  E.useItemCard(r,'p0',card,r.turnId);
  assert.equal(r.finalCountdown?.remainingTurns,20);
  assert.equal(E.view(r,'p1',new Set()).finalCountdownRemainingTurns,20);
  const duplicate=addCard(r,'countdown-card');
  assert.throws(()=>E.useItemCard(r,'p0',duplicate,r.turnId),/已经开始/);
  assert(r.entries[0].itemCards!.some(item=>item.instanceId===duplicate));
  E.skip(r,'p0',r.turnId);
  assert.equal(r.finalCountdown?.remainingTurns,20);
  for(let i=0;i<19;i++)E.skip(r,r.turnPlayerId!,r.turnId);
  assert.equal(r.phase,'guessing');
  assert.equal(r.finalCountdown?.remainingTurns,1);
  E.skip(r,r.turnPlayerId!,r.turnId);
  assert.equal(r.phase,'round-end');
  assert.equal(r.finalCountdown,undefined);
  assert.equal(r.history.length,1);
  assert(r.chat.some(message=>message.kind==='item-card'&&message.text.includes('倒计时结束')));
  E.startRound(r);
  assert.equal(r.finalCountdown,undefined);
});
