import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createApp } from '../server/app.js';
import { SqliteStore } from '../server/store.js';
import { FixtureCards } from './fixtures.js';
import { GAME_VERSION, VERSION_POLICY, isClientCompatible } from '../shared/version.js';
import type { ServerMessage } from '../shared/types.js';

test('compatibility uses a numeric minimum and rejects absent, malformed and other major versions', () => {
  const policy = { currentVersion: '4.12.0', minClientVersion: '4.2.0' };
  for (const version of ['4.2.0', '4.2.1', '4.10.0', '4.12.0']) assert(isClientCompatible(version, policy), version);
  for (const version of [null, undefined, '', '4.1.99', '3.99.0', '5.0.0', '4.2', '4.02.0', '4.2.0-beta', '4.2.0junk', '4.2.999999999999999999']) {
    assert.equal(isClientCompatible(version, policy), false, String(version));
  }
  assert(isClientCompatible(GAME_VERSION));
});

test('transport blocks old clients before join, switch and room restoration; current clients recover', async () => {
  const store = new SqliteStore(':memory:');
  const app = await createApp({ store, cards: new FixtureCards() });
  const sockets: WebSocket[] = [];
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (app.server.address() as { port: number }).port;
  async function guest(name: string) {
    const res = await fetch(base + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    return { cookie: res.headers.get('set-cookie')!.split(';')[0], session: (await res.json()).session };
  }
  async function connect(cookie: string, version?: string) {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws' + (version === undefined ? '' : '?version=' + encodeURIComponent(version)), { headers: { Cookie: cookie, Origin: base } });
    sockets.push(ws);
    const messages: ServerMessage[] = [];
    ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const wait = async (predicate: (m: ServerMessage) => boolean) => {
      for (let i = 0; i < 200; i++) {
        const found = messages.find(predicate);
        if (found) return found;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error('Timed out waiting for server message');
    };
    return { ws, messages, wait };
  }
  try {
    const res = await fetch(base + '/api/version');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), VERSION_POLICY);
    const host = await guest('host'), guestUser = await guest('guest');
    const live = await connect(host.cookie, GAME_VERSION);
    live.ws.send(JSON.stringify({ id: 'create', type: 'create', settings: { mode: 'random', attempts: 3 } }));
    await live.wait(m => m.type === 'ack' && m.id === 'create');
    const room = app.hub.roomFor(host.session.playerId)!;
    const before = JSON.stringify(room);
    for (const version of [undefined, '3.4.0', 'garbage', '5.0.0']) {
      const old = await connect(guestUser.cookie, version);
      const error = await old.wait(m => m.type === 'error');
      assert(error.type === 'error' && error.code === 'UPDATE_REQUIRED');
      assert.match(error.message, /刷新页面/);
      for (const command of [{ id: 'join', type: 'join', code: room.code }, { id: 'create', type: 'create', settings: { mode: 'random', attempts: 3 } }]) {
        old.ws.send(JSON.stringify(command));
        await old.wait(m => m.type === 'error' && m.id === command.id);
      }
      assert.equal(old.messages.some(m => m.type === 'snapshot'), false);
      assert.equal(app.hub.roomFor(guestUser.session.playerId), undefined);
      old.ws.close();
    }
    const oldHost = await connect(host.cookie, '3.4.0');
    await oldHost.wait(m => m.type === 'error');
    oldHost.ws.send(JSON.stringify({ id: 'switch', type: 'join', code: 'ZZZZZZ' }));
    await oldHost.wait(m => m.type === 'error' && m.id === 'switch');
    assert.equal(oldHost.messages.some(m => m.type === 'snapshot'), false);
    assert.equal(JSON.stringify(room), before);
    assert.equal(app.hub.rooms.size, 1);
    const refreshed = await connect(host.cookie, GAME_VERSION);
    const snapshot = await refreshed.wait(m => m.type === 'snapshot');
    assert(snapshot.type === 'snapshot' && snapshot.room?.code === room.code);
    const joined = await connect(guestUser.cookie, GAME_VERSION);
    joined.ws.send(JSON.stringify({ id: 'join', type: 'join', code: room.code }));
    await joined.wait(m => m.type === 'ack' && m.id === 'join');
    assert.equal(app.hub.roomFor(guestUser.session.playerId)?.code, room.code);
  } finally {
    for (const ws of sockets) ws.terminate();
    await app.close();
    await store.close();
  }
});
