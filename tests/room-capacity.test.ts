import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, join, members } from '../server/engine.js';

test('a room accepts ten members and rejects an eleventh', () => {
  const room = createRoom('ABCDEF', 'host', '房主', { mode: 'random', attempts: 3 });
  for (let index = 2; index <= 10; index++) {
    join(room, `player-${index}`, `玩家${index}`);
  }

  assert.equal(members(room).length, 10);
  assert.throws(() => join(room, 'player-11', '玩家11'), /房间已满（最多10人）/);
  assert.equal(members(room).length, 10);
});
