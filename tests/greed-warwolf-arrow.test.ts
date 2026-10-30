import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../server/engine.js';
import { ITEM_CARDS } from '../shared/item-cards.js';
import { cards } from './fixtures.js';
import type { ItemCardId } from '../shared/types.js';

function room(){
  const r=E.createRoom('ABCDEF','p0','游星',{mode:'custom',attempts:3,itemCards:true});
  E.join(r,'p1','海马');E.join(r,'p2','游戏');
  r.players.forEach(p=>p.ready=true);E.startRound(r,[]);
  for(let i=0;i<3;i++)E.submitCard(r,'p'+i,cards[i],r.setupId);
  return r;
}
function grant(r:ReturnType<typeof room>,cardId:ItemCardId){
  const instanceId=crypto.randomUUID();
  r.entries[0].itemCards??=[];r.entries[0].itemCards.push({instanceId,cardId});
  return instanceId;
}
test('new card weights occupy the expected weighted draw ranges',()=>{
  let offset=0;
  for(const [id,weight] of [['greed-card',50],['warwolf-card',5],['moon-arrow-card',80]] as const){
    assert.equal(ITEM_CARDS[id].weight,weight);
    assert.equal(E.drawItemCard(offset),id);assert.equal(E.drawItemCard(offset+weight-1),id);
    offset+=weight;
  }
});
test('greed consumes one card and privately grants two independent instances',()=>{
  const r=room(),instanceId=grant(r,'greed-card');
  const before=r.entries.map(e=>({attempts:e.attempts,turns:e.turns,card:e.card}));
  E.useItemCard(r,'p0',instanceId,r.turnId);
  const hand=r.entries[0].itemCards!;
  assert.equal(hand.length,2);assert.equal(new Set(hand.map(c=>c.instanceId)).size,2);
  assert(hand.every(c=>c.instanceId!==instanceId&&ITEM_CARDS[c.cardId].weight>0));
  assert.deepEqual(E.view(r,'p1',new Set()).myItemCards,[]);
  assert(!JSON.stringify(E.view(r,'p1',new Set())).includes(hand[0].instanceId));
  assert.deepEqual(r.entries.map(e=>({attempts:e.attempts,turns:e.turns,card:e.card})),before);
  assert.equal(r.chat.at(-1)?.kind,'item-card');
  assert.throws(()=>E.useItemCard(r,'p0',instanceId,r.turnId),/不在你的手牌/);
});
test('warwolf stays private and cannot be consumed as an active card',()=>{
  const r=room(),instanceId=grant(r,'warwolf-card');
  assert.equal(ITEM_CARDS['warwolf-card'].timing,'passive');
  assert.throws(()=>E.useItemCard(r,'p0',instanceId,r.turnId),/无法在此时使用/);
  assert.equal(r.entries[0].itemCards?.[0].instanceId,instanceId);
  assert(!JSON.stringify(E.view(r,'p1',new Set())).includes(instanceId));
  E.finishRound(r);assert.deepEqual(r.entries[0].itemCards,[]);
});
test('arrow validates targets, refreshes, expires and preserves answers and attempts',()=>{
  const r=room(),instanceId=grant(r,'moon-arrow-card');
  for(const target of [undefined,'missing'])assert.throws(()=>E.useItemCard(r,'p0',instanceId,r.turnId,target),/请选择场上有卡牌/);
  assert.equal(r.entries[0].itemCards?.length,1);
  const before=r.entries.map(e=>({card:e.card,attempts:e.attempts,points:e.points}));
  E.useItemCard(r,'p0',instanceId,r.turnId,'p1');
  const first=r.visualEffects!.moonArrows!.p1;
  assert(first.endsAt>Date.now()+6000);assert.equal(Object.keys(r.visualEffects!.moonArrows!).length,1);
  E.useItemCard(r,'p0',grant(r,'moon-arrow-card'),r.turnId,'p1');
  assert.notEqual(first.id,r.visualEffects!.moonArrows!.p1.id);
  assert.deepEqual(r.entries.map(e=>({card:e.card,attempts:e.attempts,points:e.points})),before);
  assert.equal(E.view(r,'p0',new Set()).players[0].card,undefined);
  E.expireVisualEffects(r,Date.now()+6501);assert.equal(r.visualEffects!.moonArrows,undefined);
  E.useItemCard(r,'p0',grant(r,'moon-arrow-card'),r.turnId,'p0');
  assert(r.visualEffects!.moonArrows!.p0);
  E.finishRound(r);assert.deepEqual(r.visualEffects,{});
});
