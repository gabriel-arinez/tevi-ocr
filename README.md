# tevi-ocr

Laboratorio independiente de OCR para TEVI.

## Objetivo

Desarrollar, medir y validar un flujo OCR antes de integrarlo en MVP-TEVI.

## Entradas previstas

- Archivos PDF.
- Imágenes JPG/JPEG.
- Imágenes PNG.
- Fotografías capturadas directamente con la cámara.

## Flujo objetivo

Entrada
→ validación
→ normalización
→ preprocesamiento
→ OCR
→ evaluación de confianza
→ texto extraído
→ métricas
→ resultado

## Evaluación

El proyecto deberá medir al menos:

- CER (Character Error Rate).
- WER (Word Error Rate).
- Tiempo de procesamiento.
- Tipo de entrada.
- Estrategia de preprocesamiento.
- Resultado esperado frente a resultado OCR.

## Regla de integración

Este proyecto permanece aislado de MVP-TEVI hasta completar las pruebas
y demostrar una mejora reproducible.
