import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_EDITOR_STATE,
  loadPlaygroundState,
  persistPlaygroundState,
  PLAYGROUND_STORAGE_KEY,
  type PlaygroundStorage,
} from '../src/utils/playgroundStorage';

function createStorage(initialValue: string | null = null): {
  storage: PlaygroundStorage;
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  if (initialValue !== null) {
    values.set(PLAYGROUND_STORAGE_KEY, initialValue);
  }

  return {
    values,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    },
  };
}

await test('loads and sanitizes persisted playground state', () => {
  const { storage } = createStorage(
    JSON.stringify({
      code: 'flowchart LR',
      outputMode: 'unicode',
      transparent: true,
      splitRatio: 2,
      lastSplitRatio: 0.1,
      workspaceMode: 'editor-hidden',
    }),
  );

  assert.deepEqual(loadPlaygroundState(storage), {
    code: 'flowchart LR',
    outputMode: 'unicode',
    transparent: true,
    splitRatio: 0.92,
    lastSplitRatio: 0.25,
    workspaceMode: 'editor-hidden',
  });
});

await test('falls back when storage access or parsing fails', () => {
  assert.deepEqual(loadPlaygroundState(null), DEFAULT_EDITOR_STATE);
  assert.deepEqual(loadPlaygroundState(createStorage('{').storage), DEFAULT_EDITOR_STATE);
  assert.deepEqual(
    loadPlaygroundState({
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {},
    }),
    DEFAULT_EDITOR_STATE,
  );
});

await test('persists state without surfacing storage failures', () => {
  const { storage, values } = createStorage();
  assert.equal(persistPlaygroundState(storage, DEFAULT_EDITOR_STATE), true);
  assert.equal(values.get(PLAYGROUND_STORAGE_KEY), JSON.stringify(DEFAULT_EDITOR_STATE));

  assert.equal(
    persistPlaygroundState(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota exceeded');
        },
      },
      DEFAULT_EDITOR_STATE,
    ),
    false,
  );
});
