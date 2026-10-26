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

interface ReadingLine {
  page: number;
  block: number;
  paragraph: number;
  line: number;
  words: PrintedSpatialWord[];
  bbox: PrintedLayoutBlock['bbox'];
  text: string;
  headingLike: boolean;
  fieldLike: boolean;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function classifyLine(line: string, bbox: PrintedLayoutBlock['bbox']): {
  headingLike: boolean;
  fieldLike: boolean;
} {
  const letters = [...line].filter(c => /\p{L}/u.test(c));
  const uppercase = letters.filter(c => c === c.toLocaleUpperCase('es') &&
    c !== c.toLocaleLowerCase('es'));
  const words = line.trim().split(/\s+/);
  const colonIndex = line.indexOf(':');
  return {
    // Typography, not any fixed document title or wording.
    headingLike: letters.length >= 4 && words.length <= 9 &&
      letters.length > 0 && uppercase.length / letters.length >= 0.88 &&
      bbox.width > 0,
    // A short leading label with colon is a typical field, not prose.
    fieldLike: colonIndex > 0 && colonIndex <= 48 &&
      colonIndex / Math.max(1, line.length) < 0.55 &&
      words.length <= 18,
  };
}

function collectLines(words: readonly PrintedSpatialWord[]): ReadingLine[] {
  const groups = new Map<string, PrintedSpatialWord[]>();
  for (const word of words) {
    const key = [word.page, word.block, word.paragraph, word.line].join(':');
    const group = groups.get(key) ?? [];
    group.push(word);
    groups.set(key, group);
  }
  const lines: ReadingLine[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const ordered = [...group].sort((a, b) => a.bbox.left - b.bbox.left);
    const left = Math.min(...group.map(w => w.bbox.left));
    const top = Math.min(...group.map(w => w.bbox.top));
    const right = Math.max(...group.map(w => w.bbox.left + w.bbox.width));
    const bottom = Math.max(...group.map(w => w.bbox.top + w.bbox.height));
    const bbox = { left, top, width: right - left, height: bottom - top };
    const text = ordered.map(w => w.text).join(' ');
    lines.push({
      page: first.page, block: first.block, paragraph: first.paragraph,
      line: first.line, words: ordered, bbox, text, ...classifyLine(text, bbox),
    });
  }
  return lines.sort((a, b) =>
    a.page - b.page || a.bbox.top - b.bbox.top || a.bbox.left - b.bbox.left ||
    a.block - b.block || a.paragraph - b.paragraph || a.line - b.line);
}

/**
 * Reconstruct using physical line spacing and typography even when the OCR
 * engine incorrectly puts every word in a single TSV paragraph.
 * Never removes a word or replaces a digit. Blocks are suggestions, not a
 * guarantee of correct table or multi-column reading order.
 */
export function buildGeometricPrintedLayout(words: readonly PrintedSpatialWord[]): PrintedLayoutBlock[] {
  const lines = collectLines(words);
  if (!lines.length) return [];
  const medianHeight = Math.max(1, median(lines.map(l => l.bbox.height)));
  const groups: ReadingLine[][] = [];
  let current: ReadingLine[] = [];
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
  };
  for (const line of lines) {
    const previous = current[current.length - 1];
    const gap = previous ? line.bbox.top -
      (previous.bbox.top + previous.bbox.height) : 0;
    const leftOffset = previous ? Math.abs(line.bbox.left - previous.bbox.left) : 0;
    const newPage = previous && line.page !== previous.page;
    const bigVerticalGap = previous && gap > medianHeight * 1.1;
    const strongIndent = previous && leftOffset > medianHeight * 2.5 &&
      (line.bbox.width < previous.bbox.width * 0.85 ||
       previous.bbox.width < line.bbox.width * 0.85);
    const structuralLine = previous &&
      (line.headingLike || previous.headingLike || line.fieldLike || previous.fieldLike);
    const differentTsvParagraph = previous && (
      line.block !== previous.block || line.paragraph !== previous.paragraph
    );
    if (previous && (newPage || bigVerticalGap || strongIndent ||
      structuralLine || differentTsvParagraph)) {
      flush();
    }
    current.push(line);
  }
  flush();

  return groups.map(group => {
    const first = group[0]!;
    const allWords = group.flatMap(line => line.words);
    const left = Math.min(...group.map(line => line.bbox.left));
    const top = Math.min(...group.map(line => line.bbox.top));
    const right = Math.max(...group.map(line => line.bbox.left + line.bbox.width));
    const bottom = Math.max(...group.map(line => line.bbox.top + line.bbox.height));
    const pieces = group.map(line => line.text);
    return {
      page: first.page, block: first.block, paragraph: first.paragraph,
      bbox: {left, top, width: right - left, height: bottom - top},
      lines: pieces,
      text: pieces.join(' '),
      meanConfidence: allWords.reduce((total, w) => total + w.confidence, 0) / allWords.length,
    };
  });
}

export function buildGeometricReadingView(words: readonly PrintedSpatialWord[]) {
  const blocks = buildGeometricPrintedLayout(words);
  return {
    blocks, text: blocks.map(b => b.text).join('\n\n'),
    needsReview: blocks.some(b => b.meanConfidence < 50),
    layoutConfidence: 'unverified' as const,
  };
}
