import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../worker/index.js';

await test('passes successful asset responses through unchanged', async () => {
  const assetResponse = new Response('asset', { status: 200 });
  const response = await worker.fetch(new Request('https://example.com/app.js'), {
    ASSETS: {
      fetch: async () => assetResponse,
    },
  });

  assert.equal(response, assetResponse);
});

await test('falls back GET and HEAD routes to index.html', async () => {
  await Promise.all(
    ['GET', 'HEAD'].map(async (method) => {
      const requests: Request[] = [];
      const response = await worker.fetch(
        new Request('https://example.com/deep/link', { method }),
        {
          ASSETS: {
            fetch: async (request) => {
              requests.push(request);
              return requests.length === 1
                ? new Response(null, { status: 404 })
                : new Response(method === 'HEAD' ? null : 'app', { status: 200 });
            },
          },
        },
      );

      assert.equal(response.status, 200);
      assert.equal(requests.length, 2);
      assert.equal(new URL(requests[1]?.url ?? '').pathname, '/index.html');
      assert.equal(requests[1]?.method, method);
    }),
  );
});

await test('does not rewrite non-navigation methods', async () => {
  const missingResponse = new Response(null, { status: 404 });
  let requestCount = 0;
  const response = await worker.fetch(
    new Request('https://example.com/deep/link', { method: 'POST', body: 'value' }),
    {
      ASSETS: {
        fetch: async () => {
          requestCount += 1;
          return missingResponse;
        },
      },
    },
  );

  assert.equal(response, missingResponse);
  assert.equal(requestCount, 1);
});
