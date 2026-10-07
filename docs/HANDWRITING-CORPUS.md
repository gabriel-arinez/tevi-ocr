# Corpus manuscrito de TEVI OCR

## Objetivo

Evaluar la capacidad del OCR disponible para reconocer manuscritos reales
sin entrenar un modelo nuevo.

## Regla principal

No se aceptan:

- fuentes cursivas;
- texto generado digitalmente para simular escritura manual;
- imágenes sintéticas presentadas como handwriting;
- ground truth reconstruido después de ver el resultado del OCR.

Las muestras deben provenir de escritura humana real.

## Corpus inicial

El corpus inicial debe contener 8 muestras:

1. handwritten-print-legible-01
2. handwritten-print-legible-02
3. handwritten-cursive-legible-01
4. handwritten-cursive-legible-02
5. handwritten-irregular-01
6. handwritten-irregular-02
7. handwritten-photo-perspective-01
8. handwritten-photo-low-light-01

Idealmente deben participar al menos dos personas distintas.

## Texto A

SERVICIO DE IMPUESTOS NACIONALES

Referencia: Reclamo tributario gestión 2026

El contribuyente solicita revisión del trámite.

NIT: 1020304050
Código: TV-001-2026
Monto: Bs 3.850,50
Fecha: 06/10/2026

## Texto B

SOLICITUD DE REVISIÓN

Solicito verificar la documentación presentada
y comunicar cualquier observación pendiente.

NIT: 4587123019
Código: TV-125-2026
Monto: Bs 8.505,10
Fecha: 15/09/2026

## Captura

Las fotografías deben:

- contener la hoja completa o prácticamente completa;
- conservar resolución suficiente;
- no aplicar filtros de belleza ni OCR previo;
- no editar el contenido escrito;
- poder ser JPG, JPEG o PNG.

Las muestras de perspectiva o baja iluminación deben seguir siendo
humanamente legibles.

## Ground truth

El archivo de referencia debe contener exactamente lo que la persona
intentó escribir.

No debe modificarse para hacerlo coincidir con Tesseract.

## Evaluación posterior

Se medirán por separado:

- CER;
- WER;
- confianza informada por el OCR;
- tiempo OCR;
- tiempo de preprocesamiento;
- categoría de manuscrito;
- estrategia OCR utilizada.

Los resultados de manuscritos no se mezclarán inicialmente con los
resultados de impresos.

## Resultado de F7

El corpus fue evaluado completamente durante F7.

La ruta manuscrita final permanece como capacidad **experimental y no apta
para producción**.

El cierre metodológico, las métricas y el benchmark reproducible están
documentados en `docs/HANDWRITING-F7.md`.
