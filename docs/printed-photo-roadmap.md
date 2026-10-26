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
## Implementación posterior: lectura geométrica y revisión localizada

- Las palabras del TSV se agrupan por página, bloque, párrafo y línea y se muestra una vista adicional denominada «Estructura detectada». Es **provisional** para páginas multicolumna: el orden de lectura top-to-bottom no garantiza que sean columnas correctas.
- La transcripción original no se modifica. Las palabras dudosas siguen visibles incluso cuando la segunda lectura no coincide.
- Al seleccionar una detección de baja confianza en imágenes no rotadas se muestra su caja y se solicita `POST /api/ocr/region-review`. Este servicio compara lectura regional original y normalizada y devuelve alternativas solo para revisión humana; la API no edita resultados OCR.
- El comando `./node_modules/.bin/tsx scripts/compare-printed-regions.ts IMAGEN SALIDA` conserva imágenes regionales y alternativas en JSON, sin modificar el documento.
- El experimento opcional `experiments/ppstructure_v3_compare.py` permite contrastar PP-StructureV3 en CPU con el motor actual usando imágenes no sensibles. No se ha incluido PaddleOCR como dependencia productiva ni se asegura un rendimiento superior sin benchmark.
- El detector alternativo de papel/perspectiva y la selección automática de motor permanecen desactivados mientras no se obtenga un corpus heterogéneo con verdad de terreno y métricas de integridad. Activarlos sin esa prueba podría destruir encabezados, campos y tablas.
- Para referencias de instalación del experimento: https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/PP-StructureV3.html

## Pruebas posteriores
- `npm run check`
- `npm run benchmark:final`
- `python3 -m py_compile experiments/ppstructure_v3_compare.py`
- `./node_modules/.bin/tsx scripts/compare-printed-regions.ts tests/fixtures/camera/foto_texto_impreso.jpeg "$HOME/Descargas/tevi-ocr-regiones"`
