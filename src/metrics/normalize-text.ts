export function normalizeBenchmarkText(
  input: string,
): string {
  return input
    .normalize('NFC')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .trim();
}
