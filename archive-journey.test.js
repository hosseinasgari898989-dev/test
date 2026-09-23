const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeState,
  nextPosition,
  progressPercent
} = require('./archive-journey.js');

test('normalizes saved resume state without losing the saved article and block', () => {
  assert.deepEqual(
    normalizeState({ articleIndex: 2, blockIndex: 4, speed: 1.5 }),
    { articleIndex: 2, blockIndex: 4, speed: 1.5 }
  );
});

test('moves from the last block of an article to the first block of the next article', () => {
  assert.deepEqual(
    nextPosition({ articleIndex: 0, blockIndex: 2 }, [3, 4, 2]),
    { articleIndex: 1, blockIndex: 0, done: false }
  );
});

test('reports completion after the final block of the final article', () => {
  assert.deepEqual(
    nextPosition({ articleIndex: 2, blockIndex: 1 }, [3, 4, 2]),
    { articleIndex: 2, blockIndex: 1, done: true }
  );
});

test('reports progress at the start of the second article after the first article is complete', () => {
  assert.equal(progressPercent(1, 0, [3, 4]), 43);
  assert.equal(progressPercent(99, 99, [3, 4]), 100);
});
