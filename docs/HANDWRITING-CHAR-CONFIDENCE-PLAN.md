# Plan de implementación — OCR manuscrito con confianza por carácter

## Propósito

Evolucionar la capacidad manuscrita de `tevi-ocr` desde el pipeline experimental actual hacia un flujo capaz de:

1. detectar líneas de texto;
2. reconocer caracteres por línea;
3. obtener `char + bbox + confidence` por carácter;
4. aceptar automáticamente caracteres confiables;
5. aplicar fallback únicamente a caracteres o regiones dudosas;
6. preservar siempre el OCR bruto;
7. medir precisión, calibración, latencia y costo antes de integrar la capacidad en MVP-TEVI.

Este plan **no reemplaza** la ruta productiva de texto impreso. La ruta impresa validada con Tesseract permanece congelada mientras se desarrolla y evalúa la capacidad manuscrita.

---

## Estado de partida

### Estado consolidado en `main`

Las fases F1–F10 del laboratorio están cerradas.

La ruta productiva de texto impreso dispone de:

- entrada PDF/JPG/JPEG/PNG;
- captura por cámara;
- validación de firma y contenido;
- límites de tamaño y píxeles;
- preprocesamiento validado;
- Tesseract en español;
- evaluación de calidad;
- benchmark final reproducible.

El benchmark productivo final de impresos/degradados obtuvo:

- CER global: **0.32%**;
- WER global: **1.28%**.

La investigación F7 dejó el OCR manuscrito como:

> **Experimental / no apto para producción.**

Pipeline F7 congelado:

```text
fotografía
→ CRAFT / EasyOCR detector
→ agrupación geométrica
→ crop por línea
→ TrOCR español
→ reconstrucción del documento
→ CER / WER
```

Resultado global F7:

- CER: **46.48%**;
- WER: **96.74%**.

### Estado de trabajo F11 ya validado localmente

Existe una integración experimental local, aún pendiente de consolidación definitiva, con:

- selector `Texto impreso / Manuscrito`;
- ruta manuscrita separada;
- detector CRAFT reutilizable;
- recognizer TrOCR reutilizable;
- respuesta marcada como `experimental`;
- confianza manuscrita no inventada: `null`;
- calidad manuscrita: `REVIEW`;
- preservación del texto OCR bruto.

Prueba real de la muestra `handwritten-print-legible-02`:

- CRAFT detectó 7 líneas;
- TrOCR greedy: CER **38.71%**, WER **86.36%**;
- grayscale: sin mejora frente a RGB;
- autocontraste, upscale y sharpen: empeoraron;
- beam-2 y beam-4: sin mejora;
- beam-8: CER **30.65%**, WER **81.82%**, pero ~**5.6×** más lento que greedy.

Conclusión actual:

- la detección de líneas es reutilizable;
- grayscale no se adopta por defecto;
- beam-8 no se adopta como ruta normal por costo;
- el cuello de botella principal está en reconocimiento/confianza de caracteres.

---

# Arquitectura objetivo

```text
                        IMAGEN
                          │
                    validación actual
                          │
                        CRAFT
                          │
                 regiones + agrupación
                          │
                    crops por línea
                          │
                 preprocessing ligero
                  solo si el benchmark
                     demuestra mejora
                          │
                        KRAKEN
                          │
         ┌────────────────┴────────────────┐
         │                                 │
       texto                       char + bbox + confidence
         │                                 │
         │                         calibración de confianza
         │                                 │
         │                   ┌─────────────┴─────────────┐
         │                   │                           │
         │              confianza alta              confianza baja
         │                   │                           │
         │                aceptar                 fallback puntual
         │                                               │
         │                              segundo recognizer / TrOCR /
         │                              regla contextual / revisión
         │
         └───────────────→ OCR bruto preservado
                                  │
                           capa semántica separada
                                  │
                       NIT / correlativo / monto /
                         fecha / otros contratos
```

---

# Decisiones técnicas congeladas

## D1 — CRAFT se conserva como detector

CRAFT continuará siendo el componente de localización inicial.

Su responsabilidad en TEVI será:

- localizar regiones de texto;
- permitir agrupación geométrica;
- producir crops por línea.

No se reimplementará detección de líneas mientras el benchmark no demuestre que CRAFT es el cuello de botella.

## D2 — Kraken se evaluará como recognizer principal por línea

No se segmentarán físicamente todas las letras antes del reconocimiento.

Primera estrategia:

```text
CRAFT
→ línea
→ Kraken
→ secuencia reconocida
→ char + bbox + confidence
```

La posición y confianza devueltas por el recognizer se utilizarán para localizar caracteres dudosos.

## D3 — No se implementará inicialmente un segmentador letra-por-letra propio

Separar físicamente caracteres manuscritos conectados es un problema distinto y de mayor complejidad.

Solo se evaluará más adelante para regiones muy estructuradas si los datos demuestran que aporta valor.

Ejemplos posibles:

- NIT;
- fecha;
- monto;
- correlativos;
- secuencias mayormente numéricas.

## D4 — Grayscale es una hipótesis, no una regla

No se añadirá escala de grises por defecto.

Cada recognizer se evaluará al menos con:

1. crop RGB/original;
2. crop grayscale;
3. grayscale + normalización/autocontraste suave.

Binarización agresiva, threshold y filtros adicionales solo se incorporarán si reducen errores de forma reproducible.

## D5 — La confianza se calibrará antes de usar thresholds productivos

No se fijarán valores como 0.90/0.70 por intuición.

Primero se medirá si la confianza de Kraken está correlacionada con:

- carácter correcto;
- carácter incorrecto;
- sustitución;
- inserción;
- omisión.

Los thresholds definitivos se decidirán con evidencia del corpus.

## D6 — El fallback será selectivo

No se ejecutarán múltiples OCR pesados para todas las líneas.

El flujo objetivo será:

```text
carácter confiable
→ aceptar

carácter dudoso
→ fallback puntual
```

El fallback podrá usar, según benchmark:

- segundo candidato del recognizer;
- segundo modelo Kraken;
- TrOCR;
- clasificación de crop puntual;
- regla contextual de un campo identificado;
- revisión humana.

## D7 — El OCR bruto nunca se modifica silenciosamente

Se mantendrán separados:

```text
rawText
structuredFields
resolvedValue
confidence
reason
```

Una normalización semántica no podrá sobrescribir el resultado visual original.

## D8 — No se adivinarán campos

Ejemplo permitido:

```text
NIT OCR: 4587123O19
contexto: campo numérico
O → 0
```

Ejemplo no permitido:

```text
Código OCR: IV-125-2026
→ convertir IV a TV porque el sistema "espera" TV
```

Cuando la evidencia no sea suficiente:

```text
value: null
status: REVIEW / INVALID
```

## D9 — CPU es el baseline obligatorio

La solución debe poder medirse y funcionar en CPU.

GPU será una optimización opcional, no un requisito para la primera versión.

## D10 — No se entrenará un modelo nuevo en las primeras fases

Primero se reutilizarán modelos y herramientas existentes.

Fine-tuning o entrenamiento propio solo podrá abrirse como fase posterior si:

- los modelos disponibles no alcanzan el objetivo;
- existe corpus suficiente;
- existe justificación cuantitativa.

---

# Fases de implementación

## F11.0 — Consolidación del estado actual

### Objetivo

Cerrar correctamente la integración manuscrita ya probada localmente antes de introducir Kraken.

### Trabajo

- consolidar runtime CRAFT;
- consolidar runtime TrOCR;
- consolidar selector impreso/manuscrito;
- añadir pruebas automatizadas del contrato `mode`;
- verificar que la ruta impresa no cambia;
- mantener manuscrito como `experimental`;
- documentar tiempos y respuesta actual.

### Gate de salida

- build correcto;
- suite completa correcta;
- prueba real manuscrita correcta;
- ruta impresa sin regresiones;
- diff limpio;
- commit dedicado.

---

## F11.1 — Baseline Kraken aislado

### Objetivo

Determinar si Kraken es viable sobre los crops de línea que ya produce CRAFT.

### Trabajo

Crear un benchmark experimental:

```text
fixtures manuscritos
→ CRAFT actual
→ crops congelados
→ Kraken
→ texto
→ CER/WER
→ tiempo
```

No integrar aún Kraken al endpoint.

### Medir

- CER;
- WER;
- tiempo de detección;
- tiempo de reconocimiento;
- tiempo total;
- RAM máxima aproximada;
- número de líneas;
- errores por muestra.

### Gate de salida

Continuar únicamente si Kraken:

- funciona sobre el corpus real;
- puede ejecutarse de forma reproducible;
- no introduce dependencia inviable;
- ofrece alineamiento/confianza utilizable o una ruta equivalente verificable.

---

## F11.2 — Extracción `char + bbox + confidence`

### Objetivo

Convertir la salida de Kraken en un contrato estable para TEVI OCR.

### Contrato objetivo

```json
{
  "char": "0",
  "bbox": {
    "x1": 120,
    "y1": 4,
    "x2": 142,
    "y2": 37
  },
  "confidence": 0.93
}
```

### Trabajo

- mapear caracteres;
- conservar posición;
- conservar confianza original;
- asociar carácter con línea;
- reconstruir texto sin perder alineamiento;
- manejar espacios y tokens especiales;
- definir tipos internos;
- añadir tests de contrato.

### Gate de salida

Para cada carácter reconocido debe poder determinarse:

- qué carácter es;
- en qué línea está;
- dónde está;
- cuál es su score/confianza.

---

## F11.3 — Matriz de preprocessing para Kraken

### Objetivo

Determinar qué representación visual mejora realmente a Kraken.

### Variantes mínimas

```text
RGB
grayscale
grayscale + normalize/autocontrast suave
```

Solo si existe evidencia se ampliará con:

- resize;
- sharpen;
- denoise;
- threshold;
- binarización.

### Regla

La estrategia ganadora debe evaluarse sobre el corpus completo, no sobre una sola imagen.

### Gate de salida

Adoptar preprocessing únicamente si:

- reduce CER/WER o errores por carácter de manera reproducible;
- no degrada de forma importante otras categorías;
- el costo temporal es aceptable.

Si no existe mejora, se mantiene RGB.

---

## F11.4 — Benchmark de confianza por carácter

### Objetivo

Comprobar si el score del recognizer representa realmente riesgo de error.

### Por cada carácter

Guardar experimentalmente:

```text
ground truth
predicción
correcto/incorrecto
confidence
línea
muestra
categoría
```

### Métricas

- accuracy por carácter;
- distribución de confianza de aciertos;
- distribución de confianza de errores;
- precision/recall para detectar errores;
- tasa de falsos confiables;
- cobertura automática;
- matriz por rangos de confianza.

Cuando sea útil se añadirán métricas de calibración como ECE/Brier.

### Gate de salida

No se utilizará confianza para decisiones automáticas si los errores reciben scores altos de forma frecuente.

---

## F11.5 — Política de confianza

### Objetivo

Definir thresholds basados en F11.4.

### Estados objetivo

```text
ACCEPT
REVIEW
FALLBACK
```

Los umbrales se determinarán después del benchmark.

Ejemplo conceptual, no contractual:

```text
confidence alta
→ ACCEPT

confidence intermedia
→ REVIEW

confidence baja
→ FALLBACK
```

### Gate de salida

La política deberá documentar:

- cobertura;
- porcentaje de errores que captura;
- porcentaje de caracteres correctos enviados innecesariamente a fallback;
- costo temporal esperado.

---

## F11.6 — Fallback selectivo

### Objetivo

Mejorar únicamente los caracteres o regiones de baja confianza.

### Orden experimental

1. candidatos alternativos del recognizer, si son utilizables;
2. segundo recognizer/modelo ligero;
3. TrOCR sobre línea o región;
4. clasificación puntual de crop si el bbox permite aislarlo;
5. contexto estructurado;
6. revisión humana.

No todos los fallbacks deberán llegar a producción.

### Condición principal

El fallback debe mejorar precisión sin multiplicar el tiempo de procesamiento de todos los documentos.

### Gate de salida

Comparar:

```text
Kraken solo
vs
Kraken + fallback
```

en:

- CER/WER;
- accuracy de carácter;
- tiempo;
- cobertura;
- errores críticos.

---

## F11.7 — Campos estructurados y normalización segura

### Objetivo

Aprovechar contexto solo después de que el OCR haya producido su salida.

### Primera cobertura

- NIT;
- correlativo TV;
- fecha;
- monto.

### Contrato

```json
{
  "raw": "4587123O19",
  "resolved": "4587123019",
  "status": "NORMALIZED",
  "confidence": 0.91,
  "reason": "NUMERIC_CONTEXT"
}
```

El normalizador actual de NIT y TV se reutilizará.

Se ampliarán contratos únicamente con reglas explícitas y tests.

### Gate de salida

Ninguna corrección contextual podrá:

- destruir `rawText`;
- adivinar prefijos;
- inventar valores;
- convertir ambigüedad en certeza.

---

## F11.8 — Optimización de rendimiento

### Objetivo

Evitar que la mejora de precisión vuelva impráctico el OCR.

### Trabajo

Medir y optimizar:

- batch de líneas;
- carga única del modelo;
- reutilización del runtime;
- workers;
- CPU;
- RAM;
- cachés;
- paralelismo seguro;
- tiempo por documento.

### Objetivo arquitectónico

```text
CRAFT una vez
→ Kraken por batch
→ fallback solo donde haga falta
```

No:

```text
CRAFT repetido
→ modelo pesado por cada carácter
→ TrOCR completo para todas las líneas
```

### Gate de salida

Debe existir un presupuesto de tiempo explícito para:

- 1 página;
- documento típico;
- peor caso;
- CPU de referencia.

GPU se medirá solo como aceleración adicional.

---

## F11.9 — Integración runtime manuscrita v2

### Objetivo

Sustituir el recognizer experimental actual únicamente si el nuevo pipeline demuestra superioridad.

### Respuesta objetivo

```json
{
  "mode": "handwritten",
  "experimental": true,
  "text": "...",
  "lines": [],
  "characters": [],
  "quality": {},
  "structuredFields": {}
}
```

### Reglas

- mantener compatibilidad con la ruta impresa;
- no reutilizar thresholds de confianza de Tesseract;
- no mezclar confianza Kraken con confianza Tesseract;
- exponer revisión cuando corresponda;
- evitar detalles internos sensibles en errores API.

### Gate de salida

- tests unitarios;
- tests integración;
- smoke real;
- build;
- diff check;
- benchmark reproducible.

---

## F11.10 — UI de confianza y revisión

### Objetivo

Hacer útil la confianza por carácter sin convertir la interfaz en un depurador técnico.

### Funciones posibles

- resaltar caracteres dudosos;
- tooltip/detalle con confianza;
- indicar campos que requieren revisión;
- mostrar OCR bruto;
- mostrar valor normalizado por separado;
- permitir comparación visual con el crop.

No se mostrarán porcentajes sin significado calibrado.

### Gate de salida

La UI debe permitir identificar rápidamente qué parte necesita revisión sin ocultar el texto original.

---

## F11.11 — Benchmark final manuscrito v2

### Objetivo

Comparar formalmente contra F7.

### Comparaciones mínimas

```text
F7 CRAFT + TrOCR greedy
vs
CRAFT + Kraken
vs
CRAFT + Kraken + preprocessing ganador
vs
CRAFT + Kraken + fallback
```

### Métricas finales

- CER;
- WER;
- character accuracy;
- calidad de confianza;
- cobertura automática;
- tasa de revisión;
- tiempo;
- RAM;
- comportamiento por categoría;
- errores de campos estructurados.

### Regla

El ground truth se utilizará únicamente para evaluación, nunca para decidir la salida del OCR.

---

## F11.12 — Decisión de integración con MVP-TEVI

### Objetivo

Tomar una decisión binaria basada en evidencia.

### Posibles resultados

#### A. Apto

Integrar en MVP-TEVI con:

- contrato versionado;
- límites;
- timeouts;
- estrategia de despliegue;
- observabilidad;
- revisión de seguridad;
- fallback documentado.

#### B. Experimental

Mantenerlo en `tevi-ocr` y habilitarlo solo para pruebas/manual review.

#### C. No apto

Conservar resultados y cerrar la línea de investigación sin introducirla en producción.

---

# Criterios globales de aceptación

El nuevo pipeline no se considerará mejor únicamente porque reconozca una muestra concreta.

Debe demostrar:

1. mejora reproducible en corpus completo;
2. confianza útil para distinguir aciertos y errores;
3. tiempo compatible con uso real;
4. consumo de hardware razonable;
5. ausencia de regresiones en OCR impreso;
6. preservación del OCR bruto;
7. fallback selectivo, no indiscriminado;
8. reglas semánticas auditables;
9. benchmark sin leakage de ground truth;
10. pruebas automatizadas suficientes.

---

# Orden de ejecución

```text
F11.0  Consolidar integración manuscrita actual
F11.1  Baseline Kraken
F11.2  char + bbox + confidence
F11.3  Preprocessing Kraken
F11.4  Calibrar confianza
F11.5  Definir política de confianza
F11.6  Fallback selectivo
F11.7  Campos estructurados
F11.8  Rendimiento
F11.9  Runtime manuscrito v2
F11.10 UI de revisión
F11.11 Benchmark final
F11.12 Decisión MVP-TEVI
```

---

# Principio rector

La meta no es producir texto que “parezca correcto”.

La meta es producir un OCR manuscrito donde TEVI pueda distinguir entre:

```text
lo que el modelo leyó,
dónde lo leyó,
qué tan confiable es,
qué se corrigió,
por qué se corrigió,
y qué debe revisar una persona.
```

La precisión y la confianza deberán demostrarse mediante benchmark antes de convertir cualquier comportamiento experimental en comportamiento productivo.
