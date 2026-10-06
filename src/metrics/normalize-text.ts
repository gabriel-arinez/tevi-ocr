export function normalizeBenchmarkText(
  input: string,
): string {
  return input
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .trim();
}
