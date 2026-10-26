/**
 * Read-only spatial evidence for printed OCR.
 * Coordinates and confidence are supplied by Tesseract TSV.
 * No text is deleted or rewritten based on these observations.
 */
export interface PrintedSpatialWord {
  text: string;
  confidence: number;
  bbox: { left: number; top: number; width: number; height: number };
  block: number;
  paragraph: number;
  line: number;
}

export function parsePrintedTsv(tsv: string): PrintedSpatialWord[] {
  const rows = tsv.trim().split(/\r?\n/);
  if (rows.length < 2) return [];
  const header = rows[0]!.split('\t');
  const keys = ['level', 'left', 'top', 'width', 'height', 'conf', 'text', 'block_num', 'par_num', 'line_num'];
  if (keys.some(key => !header.includes(key))) return [];
  const index = Object.fromEntries(header.map((key, i) => [key, i]));
  const cell = (parts: string[], key: string) => parts[index[key]!] ?? '';
  const words: PrintedSpatialWord[] = [];
  for (const row of rows.slice(1)) {
    const parts = row.split('\t');
    if (cell(parts, 'level') !== '5') continue;
    const text = parts.slice(index.text!).join('\t').trim();
    if (!text) continue;
    const nums = ['left', 'top', 'width', 'height', 'conf', 'block_num', 'par_num', 'line_num']
      .map(key => Number(cell(parts, key)));
    if (nums.some(value => !Number.isFinite(value))) continue;
    const [left, top, width, height, confidence, block, paragraph, line] = nums as number[];
    if (left! < 0 || top! < 0 || width! <= 0 || height! <= 0) continue;
    words.push({
      text, confidence: confidence!,
      bbox: { left: left!, top: top!, width: width!, height: height! },
      block: block!, paragraph: paragraph!, line: line!,
    });
  }
  return words;
}

export function summarizePrintedSpatialEvidence(words: readonly PrintedSpatialWord[]) {
  const suspicious = words.filter(word => word.confidence >= 0 && word.confidence < 50);
  return {
    wordCount: words.length,
    lowConfidenceWordCount: suspicious.length,
    lowConfidenceWords: suspicious.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: word.bbox,
    })),
    removedWordCount: 0,
  };
}
