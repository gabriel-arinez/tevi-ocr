import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { chooseReviewRegion, prepareRegionForSecondReading } from '../../src/ocr/printed-region-review.js';
import type { PrintedSpatialWord } from '../../src/ocr/printed-spatial-evidence.js';

const word: PrintedSpatialWord = {
  text: '6', confidence: 37.3,
  bbox: {left: 3, top: 1, width: 6, height: 12},
  block: 1, paragraph: 1, line: 1, page: 1,
};

test('limits review crop to real image bounds even on border', () => {
  const box = chooseReviewRegion(word, 120, 80);
  assert.deepEqual(box, { left: 0, top: 0, width: 33, height: 31 });
});

test('no review crop for corrupt boxes or outside document', () => {
  assert.equal(chooseReviewRegion({...word, bbox: {...word.bbox, width: -2}}, 100, 100), null);
  assert.equal(chooseReviewRegion({...word, bbox: {left: 1000, top: 1000, width: 20, height: 12}}, 100, 100), null);
});

test('second-pass extraction preserves original OCR and image boundary', async () => {
  const image = await sharp({create: {width: 120, height: 80, channels: 3, background: '#fff'}}).png().toBuffer();
  const crop = await prepareRegionForSecondReading(image, word);
  assert.ok(crop);
  assert.deepEqual((await sharp(crop.original).metadata()).width, crop.region.width);
  assert.deepEqual((await sharp(crop.original).metadata()).height, crop.region.height);
  assert.equal(word.text, '6');
});
