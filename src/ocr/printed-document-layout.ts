/**
 * Builds a reading-oriented view without changing the raw OCR evidence.
 * Tesseract's blank lines are considered boundaries; a hard line wrap
 * within the same block becomes a space. No punctuation substitutions,
 * text suppression, or semantic guessing are performed.
 */
export function reconstructPrintedParagraphs(raw: string): string {
  const normal = raw.replace(/\r\n?/g, '\n');
  const pages = normal.split('\f');
  return pages.map(page => {
    const lines = page.split('\n');
    const groups: string[][] = [];
    let current: string[] = [];
    const flush = () => {
      if (current.length) groups.push(current);
      current = [];
    };
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { flush(); continue; }
      current.push(trimmed);
    }
    flush();
    return groups.map(group => group.join(' ').replace(/([\p{L}])[-¬]\s+(?=[\p{Ll}])/gu, '$1')).join('\n\n');
  }).filter(page => page.trim()).join('\n\n\f\n\n');
}

export interface PrintedTextView {
  raw: string;
  readable: string;
  rawPreserved: true;
}

export function buildPrintedTextView(raw: string): PrintedTextView {
  return { raw, readable: reconstructPrintedParagraphs(raw), rawPreserved: true };
}
