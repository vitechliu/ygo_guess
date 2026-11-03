import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Hub } from '../server/hub.js';
import { SqliteStore } from '../server/store.js';
import { HttpOpsReporter, type OpsEvent, type OpsReporter } from '../server/ops-log.js';
import type { Command } from '../shared/types.js';
import { FixtureCards, session } from './fixtures.js';

const command = (body: object) => ({ ...body, id: randomUUID() }) as Command;
class Reporter implements OpsReporter {
  events: OpsEvent[] = [];
  report(event: OpsEvent) { this.events.push(event); }
  async close() {}
}
async function harness() {
  const store = new SqliteStore(':memory:');
  const reporter = new Reporter();
  const hub = new Hub(store, new FixtureCards(), 30000, false, reporter);
  await hub.init();
  await hub.handle({ ...session('host'), name: '房主昵称' }, command({ type: 'create', settings: { mode: 'random', attempts: 3 } }));
  const code = hub.roomFor('host')!.code;
  await hub.handle({ ...session('guest'), name: '玩家昵称' }, command({ type: 'join', code }));
  await hub.handle(session('guest'), command({ type: 'ready', ready: true }));
  return { store, reporter, hub, code, async close() { await hub.close(); await store.close(); } };
}

test('committed games report once with participant nicknames and omit player IDs and answers', async () => {
  const h = await harness();
  try {
    const start = command({ type: 'start' });
    await h.hub.handle(session('host'), start);
    await h.hub.handle(session('host'), start);
    assert.equal(h.reporter.events.length, 1);
    await h.hub.handle({ ...session('spectator'), name: '观战昵称' }, command({ type: 'join', code: h.code }));
    for (let i = 0; i < 2; i++) {
      const room = h.hub.rooms.get(h.code)!;
      await h.hub.handle(session(room.turnPlayerId!), command({ type: 'give-up', turnId: room.turnId }));
    }
    assert.deepEqual(h.reporter.events.map(e => e.event), ['game.started', 'game.ended']);
    const [started, ended] = h.reporter.events;
    assert.equal(started.metadata.gameId, ended.metadata.gameId);
    assert.equal(ended.metadata.results?.length, 2);
    assert.deepEqual(started.metadata.playerNames, ['房主昵称', '玩家昵称']);
    assert.deepEqual(ended.metadata.playerNames, started.metadata.playerNames);
    assert.deepEqual(ended.metadata.results?.map(e => e.playerName), started.metadata.playerNames);
    assert.equal(ended.metadata.reason, 'give-up');
    assert.equal(ended.level, 'success');
    const payload = JSON.stringify(h.reporter.events);
    for (const secret of ['playerId', 'host', 'guest', '观战昵称', '测试卡', 'cookie', 'cardId']) assert(!payload.includes(secret));
    await h.hub.handle(session('host'), command({ type: 'next' }));
    await h.hub.handle(session('guest'), command({ type: 'ready', ready: true }));
    await h.hub.handle(session('spectator'), command({ type: 'ready', ready: true }));
    await h.hub.handle(session('host'), command({ type: 'start' }));
    assert.equal(h.reporter.events.length, 3);
    assert.notEqual(h.reporter.events[2].metadata.gameId, started.metadata.gameId);
  } finally { await h.close(); }
});

test('failed saves emit nothing; retries emit only after commit, and reload does not report a new start', async t => {
  const h = await harness();
  try {
    const start = command({ type: 'start' });
    const failure = t.mock.method(h.store, 'saveRoom', async () => { throw new Error('save failed'); });
    await assert.rejects(h.hub.handle(session('host'), start), /save failed/);
    assert.equal(h.reporter.events.length, 0);
    failure.mock.restore();
    await h.hub.handle(session('host'), start);
    const failureEnd = t.mock.method(h.store, 'saveRoom', async () => { throw new Error('save failed'); });
    await assert.rejects(h.hub.handle(session('admin', true), command({ type: 'admin-close', code: h.code })), /save failed/);
    assert.equal(h.reporter.events.length, 1);
    failureEnd.mock.restore();
    await h.hub.close();
    const restored = new Hub(h.store, new FixtureCards(), 30000, false, h.reporter);
    try { await restored.init(); assert.equal(h.reporter.events.length, 1); }
    finally { await restored.close(); }
  } finally { await h.close(); }
});

for (const ending of ['leave', 'switch-room', 'admin-close', 'idle-timeout'] as const) {
  test(`active game ends once on ${ending}`, async t => {
    const h = await harness();
    try {
      await h.hub.handle(session('host'), command({ type: 'start' }));
      if (ending === 'idle-timeout') {
        h.hub.rooms.get(h.code)!.lastActivityAt = Date.now() - 4 * 3600000;
        const failure = t.mock.method(h.store, 'deleteRooms', async () => { throw new Error('delete failed'); });
        await assert.rejects(h.hub.cleanupRooms(), /delete failed/);
        assert.equal(h.reporter.events.length, 1);
        failure.mock.restore();
        await h.hub.cleanupRooms();
      } else if (ending === 'switch-room') {
        await h.hub.handle(session('other'), command({ type: 'create', settings: { mode: 'custom', attempts: 3 } }));
        await h.hub.handle(session('host'), command({ type: 'join', code: h.hub.roomFor('other')!.code }));
      } else if (ending === 'admin-close') {
        await h.hub.handle(session('admin', true), command({ type: 'admin-close', code: h.code }));
      } else {
        await h.hub.handle(session('host'), command({ type: 'leave' }));
      }
      await h.hub.cleanupRooms();
      assert.deepEqual(h.reporter.events.map(e => e.event), ['game.started', 'game.ended']);
      assert.equal(h.reporter.events[1].metadata.reason, ending);
      assert.deepEqual(h.reporter.events[1].metadata.playerNames, ['房主昵称', '玩家昵称']);
      assert.deepEqual(h.reporter.events[1].metadata.results?.map(e => e.playerName), ['房主昵称', '玩家昵称']);
    } finally { await h.close(); }
  });
}

test('custom game starts during setup and leaving ends it before guessing', async () => {
  const h = await harness();
  try {
    await h.hub.handle(session('host'), command({ type: 'update-settings', settings: { mode: 'custom', attempts: 3, initialDrawing: true } }));
    await h.hub.handle(session('guest'), command({ type: 'ready', ready: true }));
    await h.hub.handle(session('host'), command({ type: 'start' }));
    assert.equal(h.hub.rooms.get(h.code)!.phase, 'setting');
    assert.equal(h.reporter.events[0].metadata.initialDrawing, true);
    await h.hub.handle(session('guest'), command({ type: 'leave' }));
    assert.equal(h.reporter.events[1].event, 'game.ended');
  } finally { await h.close(); }
});

test('HTTP reporter sends expected JSON, isolates rejection/timeout, and bounds pending requests', async t => {
  const received: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    received.push(JSON.parse(body));
    if (req.url === '/timeout') return;
    res.writeHead(req.url === '/reject' ? 503 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: req.url === '/reject' ? 'error' : 'success' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const warn = t.mock.method(console, 'warn', () => {});
  const event: OpsEvent = { level: 'info', event: 'game.started', message: '对局开始', metadata: { eventId: 'a', gameId: 'b', occurredAt: Date.now(), roomCode: 'ABCDEF', round: 1, mode: 'random', initialDrawing: false, playerCount: 2, playerNames: ['房主昵称', '玩家昵称'] } };
  try {
    const reporter = new HttpOpsReporter(`http://127.0.0.1:${port}/api/ops-logs/report`);
    reporter.report(event);
    await reporter.close();
    assert.deepEqual(received[0], { ...event, source: 'ygo_guess' });
    assert.equal(warn.mock.callCount(), 0);
    const rejected = new HttpOpsReporter(`http://127.0.0.1:${port}/reject`);
    rejected.report(event);
    await rejected.close();
    assert.equal(warn.mock.callCount(), 1);
    const timeout = new HttpOpsReporter(`http://127.0.0.1:${port}/timeout`, 'ygo_guess', 100);
    for (let i = 0; i < 21; i++) timeout.report(event);
    assert.equal(warn.mock.callCount(), 2); // Capacity drop is synchronous; HTTP does not block the caller.
    await timeout.close();
    assert.equal(warn.mock.callCount(), 22);
    assert.throws(() => new HttpOpsReporter('file:///tmp/log'), /HTTP/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
