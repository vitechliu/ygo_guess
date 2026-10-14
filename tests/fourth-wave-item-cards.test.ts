import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../server/engine.js';
import { ITEM_CARDS } from '../shared/item-cards.js';
import { cards } from './fixtures.js';
import type { ItemCardId, RoomState } from '../shared/types.js';

function room():RoomState {
  const r=E.createRoom('ABCDEF','p0','p0',{mode:'custom',rounds:2,attempts:3,itemCards:true});
  E.join(r,'p1','p1');E.join(r,'p2','p2');
  r.players.forEach(player=>player.ready=true);
  E.startRound(r,[],true);
  for(let i=0;i<3;i++)E.submitCard(r,'p'+i,cards[i],r.setupId);
  return r;
}
function use(r:RoomState,cardId:ItemCardId,targetPlayerId?:string){
  const instanceId=cardId+'-'+Math.random();
  r.entries[0].itemCards??=[];
  r.entries[0].itemCards.push({instanceId,cardId});
  E.useItemCard(r,'p0',instanceId,r.turnId,targetPlayerId);
}

test('new card weights and compact art are registered',()=>{
  const weights:Record<string,number>={
    'flower-card':100,'mind-eye-card':50,'time-magic-card':150,'cyclone-card':150,
    'storm-card':50,'meteor-card':20,'ground-break-card':100,'eclipse-book-card':20,'convulsion-card':20,
  };
  for(const [id,weight] of Object.entries(weights)){
    assert.equal(ITEM_CARDS[id as ItemCardId].weight,weight);
    assert.match(ITEM_CARDS[id as ItemCardId].image,/\.webp$/);
  }
});

test('mind eye announces use publicly but reveals other hands only to its user',()=>{
  const r=room();
  r.entries[1].itemCards=[{instanceId:'one',cardId:'chance-card'},{instanceId:'two',cardId:'fireball-card'}];
  r.entries[2].itemCards=[];
  use(r,'mind-eye-card');
  const own=E.view(r,'p0',new Set());
  const other=E.view(r,'p1',new Set());
  assert(own.chat.some(message=>message.text.includes('p1：机会卡、火球卡')&&message.text.includes('p2：没有道具卡')));
  assert(other.chat.some(message=>message.text==='p0使用了看透卡'));
  assert(!other.chat.some(message=>message.text.includes('机会卡、火球卡')));
  assert.deepEqual(other.myItemCards,r.entries[1].itemCards);
  r.history.push({round:1,entries:structuredClone(r.entries)});
  assert.equal(E.view(r,'p1',new Set()).history[0].entries[0].itemCards,undefined);
});

test('time magic coin changes attempts without eliminating the user',()=>{
  const r=room();
  r.entries[0].attempts=1;
  for(let i=0;i<20;i++){
    use(r,'time-magic-card');
    assert(r.entries[0].attempts>=1);
    assert.equal(r.entries[0].status,'playing');
    assert.match(r.chat.at(-1)!.text,/硬币是(正面|反面)/);
    r.entries[0].attempts=1;
  }
});

test('flower, flip, meteor and crack effects target and expire',()=>{
  const r=room();
  use(r,'flower-card');
  assert.equal((r.visualEffects?.flowers?.endsAt??0)>Date.now(),true);
  assert.throws(()=>use(r,'cyclone-card','missing'),/请选择场上有卡牌/);
  use(r,'cyclone-card','p0');
  assert(r.visualEffects?.cyclones?.p0);
  use(r,'storm-card');
  assert(r.visualEffects?.storm);
  use(r,'meteor-card');
  assert.equal(Object.keys(r.visualEffects?.meteors??{}).length,1);
  r.entries[1].attempts=1;r.entries[2].attempts=2;
  use(r,'ground-break-card');
  assert(r.visualEffects?.cracks?.p1);
  assert.equal(E.expireVisualEffects(r,Date.now()+300001),true);
  assert.equal(r.visualEffects?.flowers,undefined);
  assert.equal(r.visualEffects?.storm,undefined);
  assert.equal(r.visualEffects?.cyclones,undefined);
  assert.equal(r.visualEffects?.meteors,undefined);
  assert.equal(r.visualEffects?.cracks,undefined);
});

test('eclipse book covers every card and convulsion grants one allowed disaster per player',()=>{
  const r=room();
  use(r,'eclipse-book-card');
  assert.deepEqual(Object.keys(r.visualEffects?.faceDown??{}).sort(),['p0','p1','p2']);
  const before=r.entries.map(entry=>entry.itemCards?.length??0);
  use(r,'convulsion-card');
  const allowed=new Set(['cyclone-card','storm-card','meteor-card','fireball-card','outer-entity-card','ground-break-card','lightning-card']);
  r.entries.forEach((entry,index)=>{
    assert.equal(entry.itemCards!.length,before[index]+1);
    assert(allowed.has(entry.itemCards!.at(-1)!.cardId));
  });
  assert.equal(E.expireVisualEffects(r,Date.now()+60001),true);
  assert.equal(r.visualEffects?.faceDown,undefined);
});
