import test from 'node:test';import assert from 'node:assert/strict';
import * as E from '../server/engine.js';import {cards} from './fixtures.js';
function room(n=3,mode:'custom'|'random'='custom',rounds=3,attempts=3){const r=E.createRoom('ABCDEF','p0','p0',{mode,rounds,attempts});for(let i=1;i<n;i++)E.join(r,'p'+i,'p'+i);r.players.forEach(p=>p.ready=true);return r;}
function setup(r:ReturnType<typeof room>){E.startRound(r,[],true);for(let i=0;i<r.entries.length;i++)E.submitCard(r,'p'+i,cards[i],r.setupId);}
test('item cards are private, limited to five personal turns and consumed only on own turn',()=>{
 const r=room(2);setup(r);
 const first=r.entries[0].itemCards![0];
 first.cardId='test-card';
 assert.equal(first.cardId,'test-card');
 assert.deepEqual(E.view(r,'p0',new Set()).myItemCards,[first]);
 assert.deepEqual(E.view(r,'p1',new Set()).myItemCards,[]);
 assert(!JSON.stringify(E.view(r,'p1',new Set())).includes(first.instanceId));
 assert.throws(()=>E.useItemCard(r,'p1',first.instanceId,r.turnId),/轮到/);
 E.useItemCard(r,'p0',first.instanceId,r.turnId);
 assert.equal(r.chat.at(-1)?.text,'p0使用了测试卡');
 assert.equal(r.chat.at(-1)?.kind,'item-card');
 assert.equal(r.entries[0].itemCards!.length,0);
 assert.throws(()=>E.useItemCard(r,'p0',first.instanceId,r.turnId),/手牌/);
 for(let i=0;i<12;i++)E.skip(r,r.turnPlayerId!,r.turnId);
 assert.equal(r.entries[0].turns,7);
 assert.equal(r.entries[0].itemCards!.length,4);
 assert.equal(r.entries[1].itemCards!.length,5);
 E.finishRound(r);
 assert(r.entries.every(e=>e.itemCards?.length===0));
});
test('item card weights select only enabled cards at their exact boundaries',()=>{
 assert.equal(E.drawItemCard(0),'prohibition-card');
 assert.equal(E.drawItemCard(99),'prohibition-card');
 assert.equal(E.drawItemCard(100),'maxx-c-card');
 assert.equal(E.drawItemCard(119),'maxx-c-card');
 assert.equal(E.drawItemCard(120),'mask-change-card');
 assert.equal(E.drawItemCard(169),'mask-change-card');
 assert.throws(()=>E.drawItemCard(170),/抽取/);
});
test('prohibition skips the selected player next turn without counting a turn',()=>{
 const r=room(3);setup(r);
 const first=r.entries[0].itemCards![0];first.cardId='prohibition-card';
 assert.throws(()=>E.useItemCard(r,'p0',first.instanceId,r.turnId),/请选择/);
 assert.throws(()=>E.useItemCard(r,'p0',first.instanceId,r.turnId,'p0'),/请选择/);
 E.useItemCard(r,'p0',first.instanceId,r.turnId,'p1');
 assert.equal(r.chat.at(-1)?.kind,'item-card');
 assert.equal(r.entries[1].skipNextTurns,1);
 const turn=r.turnId;E.skip(r,'p0',turn);
 assert.equal(r.turnPlayerId,'p2');assert.equal(r.entries[1].turns,0);
 assert.equal(r.entries[1].skipNextTurns,0);
 assert(r.chat.some(message=>message.text==='p1 的回合被禁止卡跳过'&&message.kind==='item-card'));
 E.skip(r,'p2',r.turnId);E.skip(r,'p0',r.turnId);
 assert.equal(r.turnPlayerId,'p1');assert.equal(r.entries[1].turns,1);
});
test('stacked prohibitions cannot end an active round when every next turn is skipped',()=>{
 const r=room(2);setup(r);
 r.entries[0].skipNextTurns=1;r.entries[1].skipNextTurns=2;
 E.skip(r,'p0',r.turnId);
 assert.equal(r.phase,'guessing');
 assert.equal(r.turnPlayerId,'p0');
 assert.equal(r.entries[0].skipNextTurns,0);
 assert.equal(r.entries[1].skipNextTurns,0);
 assert.equal(r.entries[0].turns,2);
 E.skip(r,'p0',r.turnId);
 assert.equal(r.turnPlayerId,'p1');
 assert.equal(r.entries[1].skipNextTurns,0);
});
test('timed visual effects preserve answers and mask each player differently',()=>{
 const r=room(3);setup(r);const original=r.entries.map(e=>e.card?.cid);
 const maxx=r.entries[0].itemCards![0];maxx.cardId='maxx-c-card';
 E.useItemCard(r,'p0',maxx.instanceId,r.turnId);
 assert.equal(r.chat.at(-1)?.kind,'item-card');
 assert(r.visualEffects?.roaches);
 assert(r.visualEffects.roaches.endsAt>Date.now()+179000);
 const mask={instanceId:'mask-instance',cardId:'mask-change-card' as const};r.entries[0].itemCards!.push(mask);
 E.useItemCard(r,'p0',mask.instanceId,r.turnId);
 assert.equal(r.chat.at(-1)?.kind,'item-card');
 const appearances=Object.values(r.visualEffects!.masks!.appearances);
 assert.equal(appearances.length,3);assert.equal(new Set(appearances.map(a=>a.id)).size,3);
 assert.deepEqual(r.entries.map(e=>e.card?.cid),original);
 assert.equal(E.view(r,'p0',new Set()).players[0].card,undefined);
 assert(E.view(r,'p0',new Set()).visualEffects?.masks?.appearances.p0);
 E.expireVisualEffects(r,Date.now()+180001);
 assert.equal(r.visualEffects?.roaches,undefined);assert.equal(r.visualEffects?.masks,undefined);
});
test('disabled item cards never enter the hand',()=>{
 const r=room(2);r.settings.itemCards=false;setup(r);
 assert(r.entries.every(e=>e.itemCards?.length===0));
 assert.throws(()=>E.useItemCard(r,'p0','fake',r.turnId),/未开启/);
});
test('readiness, minimum size, curated empty pool and unique allocation',()=>{
 const r=room(1);assert.throws(()=>E.startRound(r,[],true),/至少/);
 E.join(r,'p1','p1');assert.throws(()=>E.startRound(r,[],true),/准备/);
 const random=room(8,'random');assert.throws(()=>E.startRound(random,[],true),/题库/);assert.equal(random.round,0);E.startRound(random,cards,true);assert.equal(new Set(random.entries.map(e=>e.card?.cid)).size,8);
});
test('lobby shuffles change seat order and drive both card assignment and turns',()=>{
 assert.throws(()=>E.shuffleSeats(room(1)),/至少/);
 const r=room(4);const before=E.members(r).map(p=>p.id);
 E.shuffleSeats(r);const after=E.members(r).map(p=>p.id);
 assert.notDeepEqual(after,before);assert.deepEqual([...after].sort(),[...before].sort());
 assert.deepEqual(E.members(r).map(p=>p.seat),[0,1,2,3]);assert(r.players.every(p=>p.ready));
 assert.equal(r.chat.at(-1)?.text,'房主打乱了玩家顺序：'+E.members(r).map(p=>p.name).join(' → '));
 E.startRound(r,[],true);assert.deepEqual(r.entries.map(e=>e.playerId),after);
 for(let i=0;i<r.entries.length;i++)E.submitCard(r,after[i],cards[i],r.setupId);
 assert.equal(r.entries[1].card?.cid,cards[0].cid);assert.equal(r.turnPlayerId,after[0]);
 assert.throws(()=>E.shuffleSeats(r),/比赛开始后/);
 const random=room(3,'random');E.shuffleSeats(random);const randomOrder=E.members(random).map(p=>p.id);
 E.startRound(random,cards,true);assert.deepEqual(random.entries.map(e=>e.playerId),randomOrder);
});
test('cyclic assignment, own answer privacy and waiting spectator card visibility',()=>{
 const r=room();setup(r);assert.equal(r.entries[0].card?.cid,cards[2].cid);
 for(let i=0;i<3;i++){const v=E.view(r,'p'+i,new Set());assert.equal(v.players[i].card,undefined);assert.equal(v.players.filter(p=>p.card).length,2);assert.equal(v.mySubmittedCard,undefined);assert(!JSON.stringify(v).includes('"cid":'+r.entries[i].card!.cid));}
 E.join(r,'late','late');const v=E.view(r,'late',new Set());assert.equal(v.players.filter(p=>p.card).length,3);assert.deepEqual(v.history,[]);assert.equal(v.players.find(p=>p.id==='late')!.waiting,true);assert.equal(v.players.find(p=>p.id==='late')!.card,undefined);
 E.finishRound(r);assert.equal(E.view(r,'late',new Set()).players.filter(p=>p.card).length,3);
 E.startRound(r);assert.equal(E.view(r,'late',new Set()).players.filter(p=>p.card).length,0);
});
test('unlimited skips, wrong guesses, stale turns and final remaining player',()=>{
 const r=room(2,'custom',1,2);setup(r);
 const first=r.turnId;E.skip(r,'p0',first);assert.equal(r.entries[0].attempts,2);assert.equal(r.turnPlayerId,'p1');
 assert.throws(()=>E.guess(r,'p0',cards[1],first),/回合/);
 E.guess(r,'p1',cards[0],r.turnId);assert.equal(r.entries[1].points,1000);assert.equal(r.turnPlayerId,'p0');assert.equal(r.entries[0].turns,2);
 assert.equal(E.view(r,'p1',new Set()).players[1].card?.cid,cards[0].cid);
 assert.equal(E.view(r,'p0',new Set()).players[0].card,undefined);
 assert.equal(r.chat.at(-1)?.kind,'guess-correct');assert.equal(r.chat.at(-1)?.text,'p1 猜对了卡牌「'+cards[0].name+'」，获得 1000 分');
 E.guess(r,'p0',cards[9],r.turnId);assert.equal(r.entries[0].attempts,1);assert.equal(r.turnPlayerId,'p0');assert.equal(r.entries[0].turns,3);
 assert.equal(r.chat.at(-1)?.kind,'guess-wrong');assert.match(r.chat.at(-1)!.text,/未猜中/);
 E.guess(r,'p0',cards[9],r.turnId);assert.equal(r.phase,'match-end');assert.equal(r.players[0].score,0);assert.equal(r.history.length,1);assert(E.view(r,'p0',new Set()).players.every(p=>p.card));
});
test('giving up consumes all remaining attempts and removes the player from this round',()=>{
 const r=room();setup(r);const old=r.turnId;
 E.giveUp(r,'p0',old);
 assert.equal(r.entries[0].attempts,0);assert.equal(r.entries[0].status,'failed');assert.equal(r.entries[0].points,0);
 assert.equal(r.turnPlayerId,'p1');assert.match(r.chat.at(-1)!.text,/p0 放弃了本局猜题/);
 assert.throws(()=>E.giveUp(r,'p0',old),/回合/);
 E.skip(r,'p1',r.turnId);E.skip(r,'p2',r.turnId);assert.equal(r.turnPlayerId,'p1');
});
test('fewer own turns produce higher points and host advances to rotated starter',()=>{
 const r=room(2);setup(r);E.skip(r,'p0',r.turnId);E.guess(r,'p1',cards[0],r.turnId);E.guess(r,'p0',cards[1],r.turnId);
 assert.equal(r.players[0].score,500);assert.equal(r.phase,'round-end');E.join(r,'late','late');E.startRound(r);assert.equal(r.entries.length,3);
 for(let i=0;i<3;i++)E.submitCard(r,r.entries[i].playerId,cards[i],r.setupId);
 assert.equal(r.turnPlayerId,'p1');assert.equal(r.players.find(p=>p.id==='late')!.score,0);
});
test('departures during setup reset the ring and invalidate previous setup id',()=>{
 const r=room();E.startRound(r,[],true);const old=r.setupId;E.submitCard(r,'p0',cards[0],old);E.leave(r,'p1',new Set(['p0','p2']));assert.equal(r.entries.length,2);assert(r.entries.every(e=>!e.card&&!e.submitted));assert.notEqual(r.setupId,old);assert.throws(()=>E.submitCard(r,'p2',cards[1],old));
 E.leave(r,'p0',new Set(['p2']));assert.equal(r.phase,'match-end');assert.equal(r.hostId,'p2');
});
test('departure of waiting newcomer does not reset current setup',()=>{
 const r=room();E.startRound(r,[],true);E.submitCard(r,'p0',cards[0],r.setupId);const previous=r.setupId;E.join(r,'late','late');E.leave(r,'late',new Set());assert.equal(r.setupId,previous);assert.equal(r.entries[0].submitted,true);
});
test('a departed player can rejoin with the same identity and keep their score',()=>{
 const r=room();r.players[1].score=500;E.startRound(r,[],true);
 for(let i=0;i<3;i++)E.submitCard(r,'p'+i,cards[i],r.setupId);
 E.leave(r,'p1',new Set(['p0','p2']));
 E.join(r,'p1','renamed');
 assert.equal(r.players.filter(p=>p.id==='p1').length,1);
 assert.equal(r.players[1].score,500);
 assert.equal(r.players[1].name,'renamed');
 assert.equal(r.entries.find(e=>e.playerId==='p1')?.status,'left');
 assert.equal(E.view(r,'p1',new Set()).players.find(p=>p.id==='p1')?.waiting,true);
 assert.equal(E.members(r).at(-1)?.id,'p1');
 assert.throws(()=>E.join(r,'p1','renamed'),/已经在这个房间/);
});
test('solved player leaving still reduces current participation count',()=>{
 const r=room(2);setup(r);E.guess(r,'p0',cards[1],r.turnId);E.leave(r,'p0',new Set(['p1']));assert.equal(r.phase,'match-end');assert.equal(r.players[0].score,1000);
});
