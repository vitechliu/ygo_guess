import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../server/engine.js';
import { cards } from './fixtures.js';

function setup(n=3){
  const r=E.createRoom('ABCDEF','p0','p0',{mode:'custom',attempts:3,initialDrawing:true,itemCards:false});
  for(let i=1;i<n;i++)E.join(r,'p'+i,'p'+i);
  r.players.forEach(p=>p.ready=true);
  E.startRound(r,[],true);
  for(let i=0;i<n;i++)E.submitCard(r,'p'+i,cards[i],r.setupId);
  return r;
}

test('initial drawing is custom-only, changes readiness, and defaults off',()=>{
  assert.throws(()=>E.createRoom('ABCDEF','a','a',{mode:'random',attempts:3,initialDrawing:true}),/仅支持好友出题/);
  const r=E.createRoom('ABCDEF','a','a',{mode:'custom',attempts:3});
  E.join(r,'b','b');r.players[1].ready=true;
  E.updateSettings(r,{...r.settings,initialDrawing:true});
  assert.equal(r.players[1].ready,false);
  assert.throws(()=>E.updateSettings(r,{...r.settings,mode:'random'}),/仅支持好友出题/);
  E.updateSettings(r,{...r.settings,initialDrawing:false});r.players[1].ready=true;
  E.startRound(r,[],true);E.submitCard(r,'a',cards[0],r.setupId);E.submitCard(r,'b',cards[1],r.setupId);
  assert.equal(r.phase,'guessing');assert.equal(r.initialDrawings,undefined);
});

test('draw for predecessor privately, wait for everyone, then share artwork without answers',()=>{
  const r=setup();
  assert.equal(r.phase,'drawing');assert.equal(r.turnPlayerId,null);assert.equal(r.turnId,'');
  assert(r.entries.every(e=>e.turns===0));
  const first=r.initialDrawings![0];
  assert.equal(first.drawerId,'p0');assert.equal(first.userId,'p2');
  const v=E.view(r,'p0',new Set());
  assert.equal(v.initialDrawingCard?.cid,r.entries[2].card?.cid);
  assert.equal(v.players.filter(p=>p.card).length,0);
  assert.equal(v.initialDrawings,undefined);
  assert.equal(v.initialDrawingCard?.cid===r.entries[0].card?.cid,false);
  assert.throws(()=>E.addInitialDrawingStroke(r,'p1',first.id,[[10,20]],false),/不能绘画/);
  assert.throws(()=>E.completeInitialDrawing(r,'p1',first.id),/不能提交/);
  E.addInitialDrawingStroke(r,'p0',first.id,[[10,20]],false);
  E.addInitialDrawingStroke(r,'p0',first.id,[[30,40]],true);
  assert.deepEqual(E.view(r,'p0',new Set()).drawingStrokes,[{points:[[10,20],[30,40]]}]);
  E.completeInitialDrawing(r,'p0',first.id);
  assert.equal(r.phase,'drawing');assert.equal(E.view(r,'p0',new Set()).drawing,undefined);
  assert.throws(()=>E.addInitialDrawingStroke(r,'p0',first.id,[[40,50]],true),/不能绘画/);
  assert.throws(()=>E.completeInitialDrawing(r,'p0',first.id),/不能提交/);
  for(const d of r.initialDrawings!.slice(1))E.completeInitialDrawing(r,d.drawerId,d.id);
  assert.equal(r.phase,'guessing');assert.equal(r.entries[0].turns,1);
  for(const id of ['p0','p1','p2']){
    const view=E.view(r,id,new Set());
    assert.equal(view.initialDrawings?.length,3);
    assert.deepEqual(view.initialDrawings?.[0].strokes,first.strokes);
    assert.equal(view.initialDrawingCard,undefined);
    assert.equal(view.players.find(p=>p.id===id)?.card,undefined);
  }
  E.finishRound(r);E.startRound(r);
  assert.equal(r.initialDrawings,undefined);assert.equal(r.phase,'setting');
});

test('drawing spectators cannot draw and departures cannot block the phase',()=>{
  const r=setup(4);E.join(r,'late','late');
  const spectator=E.view(r,'late',new Set());
  assert.equal(spectator.drawing,undefined);assert.equal(spectator.initialDrawingCard,undefined);
  E.leave(r,'p0',new Set());
  assert.equal(r.initialDrawings?.some(d=>d.userId==='p0'),false);
  assert(r.initialDrawings?.find(d=>d.drawerId==='p0')?.submitted);
  for(const d of r.initialDrawings!.filter(d=>!d.submitted))E.completeInitialDrawing(r,d.drawerId,d.id);
  assert.equal(r.phase,'guessing');assert.notEqual(r.turnPlayerId,'p0');
  const two=setup(2);E.leave(two,'p1',new Set());assert.equal(two.phase,'round-end');
});

test('initial drawings enforce stroke and point limits',()=>{
  const r=setup();const d=r.initialDrawings![0];
  assert.throws(()=>E.addInitialDrawingStroke(r,'p0',d.id,[[1,2]],true),/笔画已失效/);
  d.strokes=Array.from({length:500},()=>({points:[[1,2]]}));
  assert.throws(()=>E.addInitialDrawingStroke(r,'p0',d.id,[[1,2]],false),/笔画上限/);
  d.strokes=[{points:Array.from({length:12000},()=>[1,2])}];
  assert.throws(()=>E.addInitialDrawingStroke(r,'p0',d.id,[[1,2]],true),/笔画上限/);
});
