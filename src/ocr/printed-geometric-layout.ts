import type { PrintedSpatialWord } from './printed-spatial-evidence.js';

export interface PrintedLayoutBlock {
  page: number;
  block: number;
  paragraph: number;
  bbox: { left: number; top: number; width: number; height: number };
  lines: string[];
  text: string;
  meanConfidence: number;
}

/** Preserve Tesseract line/paragraph boundaries, never infer structure from specific wording. */
export function buildGeometricPrintedLayout(words: readonly PrintedSpatialWord[]): PrintedLayoutBlock[] {
  const groups = new Map<string, PrintedSpatialWord[]>();
  for (const word of words) {
    const id = [word.page, word.block, word.paragraph].join(':');
    const group = groups.get(id) ?? [];
    group.push(word);
    groups.set(id, group);
  }

  const blocks: PrintedLayoutBlock[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const rows = new Map<number, PrintedSpatialWord[]>();
    for (const word of group) {
      const row = rows.get(word.line) ?? [];
      row.push(word);
      rows.set(word.line, row);
    }
    const sortedLines = [...rows.entries()].sort((a, b) => {
      const ay = Math.min(...a[1].map(w => w.bbox.top));
      const by = Math.min(...b[1].map(w => w.bbox.top));
      return ay - by || a[0] - b[0];
    });
    const lines = sortedLines.map(([, tokens]) =>
      [...tokens].sort((a, b) => a.bbox.left - b.bbox.left).map(w => w.text).join(' '));
    const left = Math.min(...group.map(w => w.bbox.left));
    const top = Math.min(...group.map(w => w.bbox.top));
    const right = Math.max(...group.map(w => w.bbox.left + w.bbox.width));
    const bottom = Math.max(...group.map(w => w.bbox.top + w.bbox.height));
    blocks.push({
      page: first.page, block: first.block, paragraph: first.paragraph,
      bbox: { left, top, width: right - left, height: bottom - top },
      lines, text: lines.join(' '),
      meanConfidence: group.reduce((sum, w) => sum + w.confidence, 0) / group.length,
    });
  }
  return blocks.sort((a, b) => a.page - b.page || a.bbox.top - b.bbox.top ||
    a.bbox.left - b.bbox.left || a.block - b.block || a.paragraph - b.paragraph);
}

/**
 * Geometry is informative, not authoritative. Do not discard the original result
 * or imply that global top-to-bottom sorting solves arbitrary multi-column pages.
 */
export function buildGeometricReadingView(words: readonly PrintedSpatialWord[]) {
  const blocks = buildGeometricPrintedLayout(words);
  return {
    blocks,
    text: blocks.map(b => b.text).join('\n\n'),
    needsReview: blocks.some(b => b.meanConfidence < 50),
    layoutConfidence: 'unverified' as const,
  };
}
