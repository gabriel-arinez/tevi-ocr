# F7 — OCR manuscrito

## Estado

La capacidad de OCR manuscrito queda clasificada como:

**Experimental / no apta para producción.**

El flujo productivo de TEVI continúa utilizando la ruta validada para
documentos impresos/degradados. La investigación manuscrita permanece
aislada dentro de `tevi-ocr`.

## Corpus evaluado

El benchmark utiliza las 8 fotografías auténticas definidas en
`benchmark/handwriting-manifest.json`.

Incluye:

- escritura de imprenta legible;
- cursiva legible;
- escritura irregular;
- fotografía con perspectiva;
- fotografía con baja iluminación;
- dos escritores distintos.

No se utilizan fuentes cursivas ni muestras sintéticas.

## Rutas investigadas

Durante F7 se evaluaron:

- Tesseract sobre documento completo;
- distintas estrategias de preprocesamiento;
- TrOCR con segmentación exploratoria;
- CRAFT como detector de texto;
- regiones `free` y `horizontal` de CRAFT;
- TrOCR sobre crops CRAFT;
- EasyOCR como recognizer;
- Tesseract restringido para campos estructurados;
- agrupación geométrica de regiones CRAFT.

EasyOCR y Tesseract restringido no recuperaron de forma fiable los campos
estructurados evaluados.

## Benchmark final F7.5G

La política se congeló antes de consultar las referencias.

Pipeline:

```text
fotografía
→ CRAFT horizontal + free
→ agrupación geométrica fija
→ crop por línea
→ TrOCR
→ texto del documento
→ CER / WER
```

El ground truth no participa ni en detección ni en reconocimiento. Se utiliza
únicamente después de generar el texto OCR para calcular las métricas.

### Regla geométrica

Tolerancia vertical:

```text
max(20 px, mediana_altura_regiones × 0.45)
```

Padding por crop:

```text
X = max(12 px, ancho × 0.02)
Y = max(10 px, alto × 0.15)
```

## Resultado final

| Muestra | CER | WER |
|---|---:|---:|
| handwritten-print-legible-01 | 51.27% | 100.00% |
| handwritten-print-legible-02 | 38.71% | 86.36% |
| handwritten-cursive-legible-01 | 44.67% | 95.83% |
| handwritten-cursive-legible-02 | 40.86% | 95.45% |
| handwritten-irregular-01 | 42.13% | 104.17% |
| handwritten-irregular-02 | 39.78% | 100.00% |
| handwritten-photo-perspective-01 | 77.66% | 95.83% |
| handwritten-photo-low-light-01 | 34.95% | 95.45% |

Resultado global:

```text
CER = 46.48%
WER = 96.74%
```

Se evaluaron 8 documentos y 61 crops de línea.

En la máquina de evaluación, TrOCR necesitó aproximadamente 139.8 s para las
61 líneas, equivalentes a 2.29 s por línea. La carga del modelo depende del
estado del cache y del hardware, por lo que estos tiempos no constituyen un
SLA.

## Interpretación

CRAFT mejora la localización de texto manuscrito y TrOCR supera claramente
al baseline manuscrito de Tesseract.

Sin embargo, la tasa de error continúa siendo demasiado alta para utilizar
estas transcripciones como información administrativa confiable.

Siguen siendo inestables especialmente:

- NIT;
- correlativos;
- montos;
- fechas;
- escritura en perspectiva;
- caracteres visualmente ambiguos.

Por tanto, F7 no habilita OCR manuscrito para producción.

## Reproducción

Con los dos entornos Python preparados:

```bash
npm run benchmark:handwriting-final
```

El ejecutor utiliza por defecto:

```text
Detector:
~/.cache/tevi-ocr-venvs/text-detector/bin/python

TrOCR:
./.venv-handwriting/bin/python
```

Pueden sustituirse mediante:

```text
TEVI_OCR_DETECTOR_PYTHON
TEVI_OCR_TROCR_PYTHON
TEVI_OCR_HF_CACHE
TEVI_OCR_EASYOCR_CACHE
```

Las versiones directas validadas durante el cierre F7 se documentan en:

```text
benchmark/runtime/handwriting-detector.txt
benchmark/runtime/handwriting-trocr.txt
```

Los resultados generados permanecen en
`benchmark/results/handwriting-final/` y no se versionan.

## Benchmark TrOCR histórico

`benchmark/handwriting-trocr.py` se conserva únicamente como experimento
histórico.

Ese script utiliza el número de líneas esperado del ground truth para
seleccionar una segmentación. Por ese motivo, sus métricas no representan un
benchmark end-to-end imparcial y no deben utilizarse para justificar
integración productiva.
