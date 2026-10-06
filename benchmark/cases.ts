export type BenchmarkCategory =
  | 'printed-clean'
  | 'low-contrast'
  | 'noisy'
  | 'low-resolution'
  | 'rotated'
  | 'confusing-characters';

export interface BenchmarkCase {
  id: string;
  category: BenchmarkCategory;
  fixturePath: string;
  groundTruthPath: string;
  description: string;
}

export const benchmarkCases: BenchmarkCase[] = [
  {
    id: 'printed-clean',
    category: 'printed-clean',
    fixturePath: 'tests/fixtures/printed/printed-clean.png',
    groundTruthPath: 'benchmark/ground-truth/printed-clean.txt',
    description: 'Documento impreso limpio y de alta resolución.',
  },
  {
    id: 'low-contrast',
    category: 'low-contrast',
    fixturePath: 'tests/fixtures/degraded/low-contrast.png',
    groundTruthPath: 'benchmark/ground-truth/low-contrast.txt',
    description: 'Texto impreso con contraste reducido.',
  },
  {
    id: 'noisy',
    category: 'noisy',
    fixturePath: 'tests/fixtures/degraded/noisy.png',
    groundTruthPath: 'benchmark/ground-truth/noisy.txt',
    description: 'Texto impreso afectado por ruido digital reproducible.',
  },
  {
    id: 'low-resolution',
    category: 'low-resolution',
    fixturePath: 'tests/fixtures/degraded/low-resolution.png',
    groundTruthPath: 'benchmark/ground-truth/low-resolution.txt',
    description: 'Documento reducido y reescalado para simular baja resolución.',
  },
  {
    id: 'rotated',
    category: 'rotated',
    fixturePath: 'tests/fixtures/degraded/rotated.png',
    groundTruthPath: 'benchmark/ground-truth/rotated.txt',
    description: 'Documento con una inclinación moderada.',
  },
  {
    id: 'confusing-characters',
    category: 'confusing-characters',
    fixturePath: 'tests/fixtures/printed/confusing-characters.png',
    groundTruthPath: 'benchmark/ground-truth/confusing-characters.txt',
    description: 'Texto diseñado para medir confusiones entre letras y números.',
  },
];
