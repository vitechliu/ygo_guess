import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../server/engine.js';
import { cards } from './fixtures.js';

function room(count=3,attempts=3) {
  const r=E.createRoom('ABCDEF','p0','p0',{mode:'random',attempts,itemCards:false});
  for(let i=1;i<count;i++)E.join(r,'p'+i,'p'+i);
  r.players.forEach(p=>p.ready=true);
  E.startRound(r,cards);
  return r;
}
const wrongCard=(r:ReturnType<typeof room>)=>cards.find(card=>card.cid!==r.entries.find(e=>e.playerId===r.turnPlayerId)!.card!.cid)!;

test('the last survivor cannot skip or be force-skipped, with no side effects',()=>{
  const r=room(2);
  E.guess(r,'p0',r.entries[0].card!,r.turnId);
  r.entries[1].reversalTurnId=r.turnId;
  r.finalCountdown={activatedTurnId:'previous-turn',remainingTurns:2};
  const before=structuredClone(r);
  for(const [id,force] of [['p1',false],['p0',true],['admin',true]] as const){
    assert.throws(()=>E.skip(r,id,r.turnId,force),/仅剩一名.*不能跳过/);
    assert.deepEqual(r,before);
  }
  assert.equal(E.view(r,'p1',new Set()).canSkipTurn,false);
  assert.equal(E.view(r,'p0',new Set()).canSkipTurn,false);
});

test('three remaining attempts allow exactly three wrong guesses before settlement',()=>{
  const r=room(2);
  E.guess(r,'p0',r.entries[0].card!,r.turnId);
  for(let remaining=2;remaining>=0;remaining--){
    const turn=r.turnId;
    E.guess(r,'p1',wrongCard(r),turn);
    assert.equal(r.entries[1].attempts,remaining);
    assert.equal(r.entries[1].turns,Math.min(3,4-remaining));
    assert.equal(r.phase,remaining>0?'guessing':'round-end');
    if(remaining>0){
      assert.equal(r.turnPlayerId,'p1');
      assert.notEqual(r.turnId,turn);
      assert.throws(()=>E.skip(r,'p1',r.turnId),/不能跳过/);
      assert.throws(()=>E.guess(r,'p1',wrongCard(r),turn),/回合/);
    }
  }
  assert.equal(r.entries[1].status,'failed');
  assert.equal(r.entries[1].points,0);
  assert.equal(r.turnPlayerId,null);
  assert.equal(r.history.length,1);
  assert.equal(r.history[0].entries[1].attempts,0);
});

test('the final survivor can guess correctly early and keep normal turn-based scoring',()=>{
  const r=room(2);
  E.guess(r,'p0',r.entries[0].card!,r.turnId);
  E.guess(r,'p1',wrongCard(r),r.turnId);
  E.guess(r,'p1',r.entries[1].card!,r.turnId);
  assert.equal(r.phase,'round-end');
  assert.equal(r.entries[1].status,'solved');
  assert.equal(r.entries[1].attempts,1);
  assert.equal(r.players[1].score,500);
});

test('guess failures, giving up and leaving all enable the final-survivor restriction',()=>{
  const failed=room(3,1);
  E.guess(failed,'p0',wrongCard(failed),failed.turnId);
  assert.equal(E.canSkipTurn(failed),true);
  E.guess(failed,'p1',wrongCard(failed),failed.turnId);
  assert.equal(E.canSkipTurn(failed),false);

  const gaveUp=room();
  E.giveUp(gaveUp,'p0',gaveUp.turnId);
  E.giveUp(gaveUp,'p1',gaveUp.turnId);
  assert.equal(E.canSkipTurn(gaveUp),false);
  E.giveUp(gaveUp,'p2',gaveUp.turnId);
  assert.equal(gaveUp.phase,'round-end');

  const left=room();
  E.guess(left,'p0',left.entries[0].card!,left.turnId);
  E.leave(left,'p1',new Set(['p0','p2']));
  assert.equal(left.phase,'guessing');
  assert.equal(left.turnPlayerId,'p2');
  assert.equal(E.canSkipTurn(left),false);
  E.join(left,'p1','重新加入');
  E.join(left,'spectator','观战者');
  assert.equal(E.view(left,'spectator',new Set()).canSkipTurn,false);
  assert.throws(()=>E.skip(left,'p2',left.turnId),/不能跳过/);
});

test('offline survivors still count and multiple survivors retain unlimited skips',()=>{
  const r=room(2);
  assert.equal(E.view(r,'p0',new Set(['p0'])).canSkipTurn,true);
  for(let i=0;i<10;i++)E.skip(r,r.turnPlayerId!,r.turnId);
  assert.deepEqual(r.entries.map(e=>e.attempts),[3,3]);
  assert.equal(r.phase,'guessing');
});

test('reviving a second survivor restores skipping immediately',()=>{
  const r=room(2,1);
  E.guess(r,'p0',wrongCard(r),r.turnId);
  assert.equal(E.canSkipTurn(r),false);
  r.settings.itemCards=true;
  r.entries[1].itemCards=[{instanceId:'reborn',cardId:'reborn-card'}];
  E.useItemCard(r,'p1','reborn',r.turnId,'p0',new Set(['p0','p1']));
  assert.equal(E.view(r,'p1',new Set()).canSkipTurn,true);
  E.skip(r,'p1',r.turnId);
  assert.equal(r.turnPlayerId,'p0');
});
