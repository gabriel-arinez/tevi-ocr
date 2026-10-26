import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { app } from '../../src/server.js';

test('region review refuses missing document and invalid bounding boxes', async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const url = `http://127.0.0.1:${addr.port}/api/ocr/region-review`;
    const empty = await fetch(url, {method: 'POST', body: new FormData()});
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error, 'FILE_REQUIRED');

    const image = await sharp({create: {
      width: 240, height: 300, channels: 3, background: '#fff',
    }}).png().toBuffer();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(image)], {type: 'image/png'}), 'image.png');
    form.append('left', '0');
    form.append('top', '0');
    form.append('width', '-1');
    form.append('height', '10');
    const invalid = await fetch(url, {method: 'POST', body: form});
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, 'INVALID_REGION');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});
