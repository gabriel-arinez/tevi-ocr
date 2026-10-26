# OCR de impresos fotografiados — implementación y validación

## Reglas de seguridad
- Preservar ocr.text inmutable. El texto legible nunca reemplaza la evidencia original.
- No borrar cabeceras, números ni líneas basándose en su posición, confianza aislada o palabras esperadas.
- Mantener manuscritos y PDFs sin cambio de estrategia.
- No introducir dependencias nuevas para detección geométrica sin benchmark representativo.

## Implementado
- Parseo TSV con y sin cabecera; geometría por palabra y página.
- Resumen espacial con todas las palabras detectadas y señales de baja confianza, sin borrar ninguna.
- Texto legible conservador que une líneas dentro de los bloques separados por líneas vacías.
- Conmutador visual texto legible / transcripción original.
- Inspección genérica de una foto en scripts/inspect-printed-layout.ts: texto, legible, JSON y SVG de cajas.
- Pruebas de regresión de parser, integridad y límites de párrafos.

## Pendiente de demostrar antes de activar filtros o motores auxiliares
- Corpus representativo con cartas, contratos, tablas, formularios, documentos a columnas, sellos, bordes, sombras y perspectiva.
- Ground truth etiquetado para CER, WER, integridad de datos, límites de párrafo y orden de lectura.
- Comparación de detector del papel y perspectiva OpenCV versus original; no recortar si hay incertidumbre.
- Comparación de PaddleOCR/PP-StructureV3 con Tesseract, con medición de recursos y de regresiones.
- Validación humana de detecciones aisladas antes de diseñar reglas de supresión o segunda lectura.
- Despliegue de motores opcionales únicamente si mejoran generalización; fallback seguro para errores.

## Comandos
- npm run check
- npm run benchmark:final
- ./node_modules/.bin/tsx scripts/inspect-printed-layout.ts tests/fixtures/camera/foto_texto_impreso.jpeg "$HOME/Descargas/tevi-ocr-inspeccion"

## Criterio de cierre
Un test que pase no certifica la precisión de fotografías ajenas al corpus. No mezclar etapas de lectura, interpretación y presentación ni alegar eliminación de ruido sin medición comparativa.