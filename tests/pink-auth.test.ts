import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { createApp } from '../server/app.js';
import { PinkAuthError, pinkGameName, verifyPinkToken } from '../server/pink-auth.js';
import { SqliteStore } from '../server/store.js';
import { Hub } from '../server/hub.js';
import { gameEvents } from '../server/ops-log.js';
import { view } from '../server/engine.js';
import { GAME_VERSION } from '../shared/version.js';
import type { Command, PinkIdentity } from '../shared/types.js';
import { FixtureCards, session } from './fixtures.js';

const pink: PinkIdentity = { userId: 11, coreUserId: 123, name: '机器人昵称', verifiedAt: Date.now() };
const cmd = (body: object) => ({ ...body, id: randomUUID() }) as Command;

test('verifier trusts core_user identity only and distinguishes denial from outages', async t => {
  let response = { status: 'success', data: { id: 11, nickname: '禁止使用的网站昵称', core_user: { id: 123, name: '机器人昵称' } } };
  let status = 200;
  const mock = t.mock.method(globalThis, 'fetch', async (url: unknown, options?: RequestInit) => {
    assert.equal(url, 'https://io2.vitechliu.com/api/auth/me');
    assert.equal((options?.headers as Record<string,string>).Authorization, 'Bearer secret');
    assert.equal(options?.redirect, 'error');
    return new Response(JSON.stringify(response), { status });
  });
  const result = await verifyPinkToken('secret');
  assert.equal(result.name, '机器人昵称'); assert.equal(result.coreUserId, 123); assert.equal(result.userId, 11);
  response = { ...response, data: { ...response.data, core_user: null as never } };
  await assert.rejects(verifyPinkToken('secret'), e => e instanceof PinkAuthError && e.status === 403 && /机器人/.test(e.message));
  for (const code of [401,403,429,500]) {
    status = code;
    await assert.rejects(verifyPinkToken('secret'), e => e instanceof PinkAuthError && e.status === (code === 500 ? 503 : code));
  }
  mock.mock.mockImplementation(async () => { throw new Error('secret'); });
  await assert.rejects(verifyPinkToken('secret'), e => e instanceof PinkAuthError && e.status === 503 && !e.message.includes('secret'));
  assert.equal(pinkGameName('  \n' + 'a'.repeat(15) + '😀'), 'a'.repeat(15));
});

test('HTTP identity verification, nickname editing, cookie revocation and existing socket synchronization', async () => {
  const store = new SqliteStore(':memory:');
  let releaseSlow!:()=>void;let enteredSlow!:()=>void;
  const slowGate=new Promise<void>(resolve=>{releaseSlow=resolve;});
  const slowEntered=new Promise<void>(resolve=>{enteredSlow=resolve;});
  const app = await createApp({ store, cards: new FixtureCards(), pinkVerifier: async token => {
    if(token==='slow'){enteredSlow();await slowGate;}
    if (token === 'bad') throw new PinkAuthError(401, '凭证失效');
    if (token === 'offline') throw new PinkAuthError(503, '暂不可用');
    if (token === 'unlinked') throw new PinkAuthError(403, '请先关联机器人账号');
    return { ...pink, userId: token === 'other' ? 22 : 11, verifiedAt: Date.now() };
  } });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (app.server.address() as {port:number}).port;
  let cookie = '';
  let ws: WebSocket | undefined;
  const request = async (path:string, init:RequestInit = {}) => {
    const result = await fetch(base + path, { ...init, headers: { Cookie: cookie, 'Content-Type':'application/json', ...init.headers } });
    if (result.headers.get('set-cookie')) cookie = result.headers.get('set-cookie')!.split(';')[0];
    return { status:result.status, body:await result.json() };
  };
  const login = (token:string) => request('/api/pink/session', { method:'POST', headers:{Authorization:'Bearer '+token},body:JSON.stringify({coreUserId:999,name:'伪造'}) });
  try {
    const guest = await request('/api/session', {method:'POST', body:JSON.stringify({name:'游客'})});
    const playerId = guest.body.session.playerId;
    const guestCookie = cookie;
    const linked = await login('valid');
    assert.equal(linked.status,200); assert.equal(linked.body.session.name,pink.name);
    assert.equal(linked.body.session.playerId,playerId); assert.equal(linked.body.session.admin,false);
    assert(!JSON.stringify(linked.body).includes('coreUserId'));
    const expired = await fetch(base+'/api/session',{headers:{Cookie:guestCookie}});
    assert.equal((await expired.json()).session,null);
    await request('/api/session',{method:'POST',body:JSON.stringify({name:'自定义昵称'})});
    assert.equal((await login('valid')).body.session.name,'自定义昵称');
    const slow=login('slow');await slowEntered;
    await request('/api/session',{method:'POST',body:JSON.stringify({name:'新的游戏昵称'})});
    releaseSlow();assert.equal((await slow).status,409);
    assert.equal((await request('/api/session')).body.session.name,'新的游戏昵称');
    ws = new WebSocket(base.replace('http:','ws:')+'/ws?version='+GAME_VERSION,{headers:{Cookie:cookie}});
    await new Promise<void>((resolve,reject)=>{ws!.once('open',resolve);ws!.once('error',reject);});
    const send = (command:Command) => new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('ack timeout')),3000);
      const receive=(raw:Buffer)=>{const message=JSON.parse(raw.toString());if(message.id===command.id){clearTimeout(timer);ws!.off('message',receive);message.type==='ack'?resolve():reject(new Error(message.message));}};
      ws!.on('message',receive);ws!.send(JSON.stringify(command));
    });
    await send(cmd({type:'create',settings:{mode:'random',attempts:3}}));
    assert.equal(app.hub.roomFor(playerId)!.pinkMembers![playerId].coreUserId,123);
    assert.equal((await login('other')).status,409);
    assert.equal((await login('offline')).status,503);
    assert((await request('/api/session')).body.session.pink);
    assert.equal((await login('valid')).status,200);
    assert.equal((await login('bad')).status,401);
    assert.equal((await request('/api/session')).body.session.pink,undefined);
    assert.equal(app.hub.roomFor(playerId)!.pinkMembers![playerId],undefined);
    await send(cmd({type:'leave'}));
    assert.equal((await login('unlinked')).status,403);
    await login('valid');
    const oldCookie=cookie;
    const unlinked=await request('/api/pink/session',{method:'DELETE'});
    assert.equal(unlinked.body.session.playerId,playerId); assert.equal(unlinked.body.session.pink,undefined);
    assert.equal((await (await fetch(base+'/api/session',{headers:{Cookie:oldCookie}})).json()).session,null);
    await send(cmd({type:'create',settings:{mode:'random',attempts:3}}));
    assert.equal(app.hub.roomFor(playerId)!.pinkMembers![playerId],undefined);
  } finally {ws?.terminate();await app.close();await store.close();}
});

test('per-round identity survives revocation, leaving, reload and is private; stale identities become guests',async()=>{
  const store = new SqliteStore(':memory:');
  let hub = new Hub(store,new FixtureCards()); await hub.init();
  const host={...session('host'),pink:{...pink,verifiedAt:Date.now()}};
  try {
    await hub.handle(host,cmd({type:'create',settings:{mode:'random',attempts:3}}));
    const code=hub.roomFor('host')!.code;
    await hub.handle(session('guest'),cmd({type:'join',code}));
    await hub.handle(session('guest'),cmd({type:'ready',ready:true}));
    const before=structuredClone(hub.rooms.get(code)!);
    await hub.handle(host,cmd({type:'start'}));
    const started=structuredClone(hub.rooms.get(code)!);
    assert.deepEqual(gameEvents(before,started,'start')[0].metadata.participants,[{playerName:'host',coreUserId:123},{playerName:'guest',coreUserId:null}]);
    const exposed=JSON.stringify(view(started,'guest',new Set()));
    for(const field of ['pinkMembers','pinkParticipants','coreUserId','userId','verifiedAt','机器人昵称'])assert(!exposed.includes(field),field);
    await hub.updateIdentity(session('host'),async()=>{},true);
    await hub.close();hub=new Hub(store,new FixtureCards());await hub.init();
    const restored=structuredClone(hub.rooms.get(code)!);
    await hub.handle(session('host'),cmd({type:'leave'}));
    const ended=gameEvents(restored,hub.rooms.get(code)!,'leave')[0];
    assert.equal(ended.metadata.participants![0].coreUserId,123);assert.equal(ended.metadata.results![0].coreUserId,123);
    await hub.handle({...session('stale'),pink:{...pink,verifiedAt:Date.now()-6*60000}},cmd({type:'create',settings:{mode:'random',attempts:3}}));
    const staleCode=hub.roomFor('stale')!.code;
    await hub.handle(session('guest2'),cmd({type:'join',code:staleCode}));await hub.handle(session('guest2'),cmd({type:'ready',ready:true}));
    await hub.handle(session('stale'),cmd({type:'start'}));
    assert.equal(hub.rooms.get(staleCode)!.pinkParticipants!.stale,null);
  }finally{await hub.close();await store.close();}
});
