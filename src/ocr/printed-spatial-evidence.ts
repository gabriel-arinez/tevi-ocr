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
  page: number;
}

const TSV_COLUMNS = [
  'level', 'page_num', 'block_num', 'par_num', 'line_num', 'word_num',
  'left', 'top', 'width', 'height', 'conf', 'text',
] as const;

export function parsePrintedTsv(tsv: string): PrintedSpatialWord[] {
  if (!tsv.trim()) return [];

  const rows = tsv.trimEnd().split(/\r?\n/);
  const first = rows[0]!.split('\t');
  const hasHeader = first[0] === 'level';
  const header = hasHeader ? first : [...TSV_COLUMNS];

  if (TSV_COLUMNS.some(key => !header.includes(key))) {
    throw new Error('Formato TSV Tesseract desconocido: faltan columnas.');
  }
  if (!hasHeader && first.length < TSV_COLUMNS.length) {
    throw new Error('Formato TSV Tesseract desconocido: faltan valores.');
  }

  const index = Object.fromEntries(header.map((key, i) => [key, i]));
  const cell = (parts: string[], key: string) => parts[index[key]!] ?? '';
  const words: PrintedSpatialWord[] = [];

  for (const row of rows.slice(hasHeader ? 1 : 0)) {
    if (!row.trim()) continue;
    const parts = row.split('\t');
    if (parts.length < header.length) {
      throw new Error('Registro TSV Tesseract incompleto.');
    }
    if (cell(parts, 'level') !== '5') continue;
    const text = parts.slice(index.text!).join('\t').trim();
    if (!text) continue;

    const keys = ['left', 'top', 'width', 'height', 'conf', 'block_num', 'par_num', 'line_num', 'page_num'];
    const nums = keys.map(key => Number(cell(parts, key)));
    if (nums.some(value => !Number.isFinite(value))) {
      throw new Error('Coordenadas o confianza TSV inválidas.');
    }
    const [left, top, width, height, confidence, block, paragraph, line, page] = nums as number[];
    if (left! < 0 || top! < 0 || width! <= 0 || height! <= 0) {
      throw new Error('Caja TSV inválida.');
    }
    words.push({
      text, confidence: confidence!,
      bbox: { left: left!, top: top!, width: width!, height: height! },
      block: block!, paragraph: paragraph!, line: line!, page: page!,
    });
  }
  return words;
}

export function summarizePrintedSpatialEvidence(words: readonly PrintedSpatialWord[]) {
  const suspicious = words.filter(word => word.confidence >= 0 && word.confidence < 50);
  return {
    wordCount: words.length,
    // Full, read-only evidence is necessary for verifying reading order
    // and separating actual page text from photographic background.
    words: words.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: word.bbox,
      page: word.page,
      block: word.block,
      paragraph: word.paragraph,
      line: word.line,
    })),
    lowConfidenceWordCount: suspicious.length,
    lowConfidenceWords: suspicious.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: word.bbox,
    })),
    removedWordCount: 0,
  };
}
