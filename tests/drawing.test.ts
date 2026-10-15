import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifyStroke } from '../client/DrawingBoard.js';
import type { DrawingPoint } from '../shared/types.js';

test('drawing simplification removes straight-line samples but preserves a corner',()=>{
  const straight:DrawingPoint[]=[[0,0],[10,0],[20,0],[30,0]];
  assert.deepEqual(simplifyStroke(straight),[[0,0],[30,0]]);
  const corner:DrawingPoint[]=[[0,0],[10,0],[20,0],[20,10],[20,20]];
  assert.deepEqual(simplifyStroke(corner),[[0,0],[20,0],[20,20]]);
});
