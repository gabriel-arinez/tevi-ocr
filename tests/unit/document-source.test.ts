import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveDocumentSource,
} from '../../src/files/document-source.js';

test(
  'acepta camera como origen',
  () => {
    assert.equal(
      resolveDocumentSource(
        'camera',
      ),
      'camera',
    );
  },
);

test(
  'usa file para cualquier otro valor',
  () => {
    assert.equal(
      resolveDocumentSource(
        'otro',
      ),
      'file',
    );

    assert.equal(
      resolveDocumentSource(
        undefined,
      ),
      'file',
    );
  },
);
