import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as E from '../server/engine.js';
import { Hub, parseCommand } from '../server/hub.js';
import type { Store } from '../server/store.js';
import { FixtureCards } from './fixtures.js';
import type { Command, RoomState, Session } from '../shared/types.js';

function makeRoom(){return E.createRoom('ABCDEF','host','房主',{mode:'custom',attempts:3,itemCards:false});}
function command(body:Record<string,unknown>):Extract<Command,{type:'debug'}>{return {id:randomUUID(),type:'debug',...body} as Extract<Command,{type:'debug'}>;}
const host:Session={playerId:'host',name:'房主',admin:false,expiresAt:Date.now()+60000};

test('solo debug setup creates a target and card grants stay private',()=>{
  const r=makeRoom();
  E.debugAction(r,command({action:'start-solo'}));
  assert.equal(r.phase,'guessing');
  assert.equal(r.settings.itemCards,true);
  assert.equal(r.entries.length,2);
  assert(r.entries.every(entry=>entry.card));
  assert.equal(r.turnPlayerId,'host');
  E.debugAction(r,command({action:'grant-card',playerId:'host',cardId:'snatch-card',makeTurn:true}));
  assert.equal(E.view(r,'host',new Set()).myItemCards.at(-1)?.cardId,'snatch-card');
  assert.equal(E.view(r,'debug-bot:ABCDEF',new Set()).myItemCards.some(card=>card.cardId==='snatch-card'),false);
  E.debugAction(r,command({action:'set-attempts',playerId:'debug-bot:ABCDEF',attempts:5}));
  const snatch=r.entries[0].itemCards!.at(-1)!;
  E.useItemCard(r,'host',snatch.instanceId,r.turnId,'debug-bot:ABCDEF');
  assert.equal(r.entries[0].attempts,7);
  assert.equal(r.entries[1].attempts,1);
});

test('debug controls prepare guess failure and countdown without changing normal card rules',()=>{
  const r=makeRoom();
  E.debugAction(r,command({action:'start-solo'}));
  E.debugAction(r,command({action:'fail-by-guess',playerId:'debug-bot:ABCDEF'}));
  assert.equal(r.entries[1].status,'failed');
  assert.equal(r.entries[1].failedByGuess,true);
  E.debugAction(r,command({action:'set-attempts',playerId:'debug-bot:ABCDEF',attempts:2}));
  assert.equal(r.entries[1].status,'playing');
  E.debugAction(r,command({action:'grant-card',playerId:'host',cardId:'countdown-card'}));
  const item=r.entries[0].itemCards!.at(-1)!;
  E.useItemCard(r,'host',item.instanceId,r.turnId);
  E.debugAction(r,command({action:'countdown-to-one'}));
  assert.equal(r.finalCountdown?.remainingTurns,1);
  E.debugAction(r,command({action:'expire-effects'}));
  assert.deepEqual(r.visualEffects,{});
  E.debugAction(r,command({action:'clear-hand',playerId:'host'}));
  assert.deepEqual(r.entries[0].itemCards,[]);
});

test('debug protocol rejects unknown cards and server gates commands by mode and host',async()=>{
  const bad=command({action:'grant-card',playerId:'host',cardId:'invented-card'});
  assert.throws(()=>parseCommand(bad));
  let saved:RoomState|undefined;
  const store={
    async loadRooms(){return saved?[saved]:[];},
    async saveRoom(r:RoomState){saved=structuredClone(r);},
    async saveRooms(rooms:RoomState[]){saved=structuredClone(rooms.at(-1)!);},
    async deleteRooms(){saved=undefined;},
    async getSession(){return null;},
    async putSession(){},
    async close(){},
  } as Store;
  const production=new Hub(store,new FixtureCards());
  production.rooms.set('ABCDEF',makeRoom());
  await assert.rejects(production.handle(host,command({action:'start-solo'})),/仅在本地开发模式/);
  const development=new Hub(store,new FixtureCards(),30000,true);
  development.rooms.set('ABCDEF',makeRoom());
  const guest={...host,playerId:'guest'};
  E.join(development.rooms.get('ABCDEF')!,'guest','访客');
  await assert.rejects(development.handle(guest,command({action:'grant-card',playerId:'host',cardId:'test-card'})),/只有房主/);
  await assert.rejects(development.handle(host,command({action:'start-solo'})),/单人测试/);
});
