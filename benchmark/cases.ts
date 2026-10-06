export type BenchmarkCategory =
  | 'printed-clean'
  | 'low-contrast'
  | 'noisy'
  | 'low-resolution'
  | 'rotated'
  | 'gaussian-blur'
  | 'jpeg-artifacts'
  | 'strong-low-resolution'
  | 'rotation-8deg'
  | 'uneven-light'
  | 'mixed-noise'
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
    id: 'gaussian-blur',
    category: 'gaussian-blur',
    fixturePath: 'tests/fixtures/degraded/gaussian-blur.png',
    groundTruthPath: 'benchmark/ground-truth/gaussian-blur.txt',
    description: 'Documento afectado por desenfoque gaussiano reproducible.',
  },
  {
    id: 'jpeg-artifacts',
    category: 'jpeg-artifacts',
    fixturePath: 'tests/fixtures/degraded/jpeg-artifacts.png',
    groundTruthPath: 'benchmark/ground-truth/jpeg-artifacts.txt',
    description: 'Documento degradado por compresión JPEG agresiva.',
  },
  {
    id: 'strong-low-resolution',
    category: 'strong-low-resolution',
    fixturePath: 'tests/fixtures/degraded/strong-low-resolution.png',
    groundTruthPath: 'benchmark/ground-truth/strong-low-resolution.txt',
    description: 'Documento con pérdida fuerte de resolución.',
  },
  {
    id: 'rotation-8deg',
    category: 'rotation-8deg',
    fixturePath: 'tests/fixtures/degraded/rotation-8deg.png',
    groundTruthPath: 'benchmark/ground-truth/rotation-8deg.txt',
    description: 'Documento rotado ocho grados.',
  },
  {
    id: 'uneven-light',
    category: 'uneven-light',
    fixturePath: 'tests/fixtures/degraded/uneven-light.png',
    groundTruthPath: 'benchmark/ground-truth/uneven-light.txt',
    description: 'Documento con iluminación no uniforme simulada.',
  },
  {
    id: 'mixed-noise',
    category: 'mixed-noise',
    fixturePath: 'tests/fixtures/degraded/mixed-noise.png',
    groundTruthPath: 'benchmark/ground-truth/mixed-noise.txt',
    description: 'Documento con desenfoque, compresión y ruido combinados.',
  },
  {
    id: 'confusing-characters',
    category: 'confusing-characters',
    fixturePath: 'tests/fixtures/printed/confusing-characters.png',
    groundTruthPath: 'benchmark/ground-truth/confusing-characters.txt',
    description: 'Texto diseñado para medir confusiones entre letras y números.',
  },
];
