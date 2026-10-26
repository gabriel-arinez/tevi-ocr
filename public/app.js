import {
  buildCameraConstraints,
  cameraErrorMessage,
  captureVideoFrame,
  stopMediaStream,
} from './camera.mjs';

import {
  buildHandwritingReviewModel,
  formatConfidencePercent,
  structuredFieldDisplayValue,
  structuredFieldStatusLabel,
  structuredFieldTypeLabel,
} from './handwriting-review.mjs';

const fileInput =
  document.getElementById(
    'fileInput',
  );

const ocrModeInputs =
  Array.from(
    document.querySelectorAll(
      'input[name="ocrMode"]',
    ),
  );


function selectedOcrMode() {
  return (
    ocrModeInputs.find(
      (input) =>
        input.checked,
    )?.value ??
    'printed'
  );
}

const modeHelp =
  document.getElementById(
    'modeHelp',
  );

const status =
  document.getElementById(
    'status',
  );

const result =
  document.getElementById(
    'ocrResult',
  );

const metadataResult =
  document.getElementById(
    'ocrMetadata',
  );

const metadataDetails =
  document.getElementById(
    'ocrMetadataDetails',
  );

const handwritingReview =
  document.getElementById(
    'handwritingReview',
  );

const reviewBadge =
  document.getElementById(
    'reviewBadge',
  );

const reviewCharacterCount =
  document.getElementById(
    'reviewCharacterCount',
  );

const reviewFallbackCount =
  document.getElementById(
    'reviewFallbackCount',
  );

const reviewText =
  document.getElementById(
    'reviewText',
  );

const structuredFields =
  document.getElementById(
    'structuredFields',
  );

const rawHandwritingText =
  document.getElementById(
    'rawHandwritingText',
  );


const cameraPanel =
  document.getElementById(
    'cameraPanel',
  );

const video =
  document.getElementById(
    'cameraVideo',
  );

const canvas =
  document.getElementById(
    'cameraCanvas',
  );

const capturedImage =
  document.getElementById(
    'capturedImage',
  );

const captureButton =
  document.getElementById(
    'capturePhoto',
  );

const retryButton =
  document.getElementById(
    'retryPhoto',
  );

const useButton =
  document.getElementById(
    'usePhoto',
  );

const closeButton =
  document.getElementById(
    'closeCamera',
  );

let mediaStream = null;
let capturedBlob = null;
let previewUrl = null;
let printedTextState = { raw: '', readable: '', structured: '', current: 'readable' };
let printedImagePreviewUrl = null;
let lastPrintedFile = null;
const regionalReviewResult = document.getElementById('regionalReviewResult');

async function reviewPrintedWord(word) {
  if (!lastPrintedFile || !word.canLocateOnSource) return;
  regionalReviewResult.textContent = 'Comparando la lectura de esta región...';
  const form = new FormData();
  form.append('file', lastPrintedFile, lastPrintedFile.name);
  for (const key of ['left', 'top', 'width', 'height']) {
    form.append(key, String(word.bbox[key]));
  }
  try {
    const response = await fetch('/api/ocr/region-review', {
      method: 'POST',
      body: form,
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error('No se pudo verificar la región.');
    }
    const alternatives = data.alternatives.map(candidate =>
      `${candidate.type}: "${candidate.text.trim()}" (${candidate.confidence === null ? 'N/D' : candidate.confidence.toFixed(1) + '%'})`
    );
    regionalReviewResult.textContent = [
      `OCR inicial: "${word.text}" (${word.confidence.toFixed(1)}%)`,
      ...alternatives,
      'Estas opciones no se aplican automáticamente; compare con la imagen.',
    ].join('\n');
  } catch (error) {
    regionalReviewResult.textContent = error instanceof Error
      ? error.message : 'No se pudo verificar la región.';
  }
}
const geometricTextButton = document.getElementById('geometricTextButton');
const printedImageOverlay = document.getElementById('printedImageOverlay');
const printedImagePreview = document.getElementById('printedImagePreview');
const printedBoundingBox = document.getElementById('printedBoundingBox');
function revokePrintedImagePreview() {
  if (printedImagePreviewUrl) URL.revokeObjectURL(printedImagePreviewUrl);
  printedImagePreviewUrl = null;
  printedImagePreview.removeAttribute('src');
  printedImageOverlay.hidden = true;
  regionalReviewResult.textContent = '';
}
function selectPrintedWord(word) {
  if (!printedImagePreviewUrl) return;
  const width = printedImagePreview.naturalWidth;
  const height = printedImagePreview.naturalHeight;
  if (!width || !height) return;
  const box = word.bbox;
  printedBoundingBox.style.left = (box.left / width * 100) + '%';
  printedBoundingBox.style.top = (box.top / height * 100) + '%';
  printedBoundingBox.style.width = (box.width / width * 100) + '%';
  printedBoundingBox.style.height = (box.height / height * 100) + '%';
  printedImageOverlay.hidden = false;
}
const printedTextControls = document.getElementById('printedTextControls');
const printedReviewNotice = document.getElementById('printedReviewNotice');
const printedEvidencePanel = document.getElementById('printedEvidencePanel');
const printedEvidenceList = document.getElementById('printedEvidenceList');
function renderPrintedEvidence(pages) {
  printedEvidenceList.replaceChildren();
  const suspicious = (pages ?? []).flatMap(page => (
    page.spatialEvidence?.lowConfidenceWords ?? []
  ).map(word => ({
    ...word,
    pageNumber: page.pageNumber,
    canLocateOnSource: Math.abs(page.detectedAngle ?? 0) < 0.5,
  })));
  printedEvidencePanel.hidden = suspicious.length === 0;
  printedEvidencePanel.open = false;
  for (const word of suspicious.slice(0, 80)) {
    const entry = document.createElement('li');
    entry.textContent = `Página ${word.pageNumber} · ${word.text} · ${word.confidence.toFixed(1)}% · (${word.bbox.left}, ${word.bbox.top})`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = entry.textContent;
    if (word.canLocateOnSource) {
      button.addEventListener('click', () => {
        selectPrintedWord(word);
        void reviewPrintedWord(word);
      });
    } else {
      button.disabled = true;
      button.title = 'La imagen OCR fue rotada; estas coordenadas corresponden a la imagen procesada.';
    }
    entry.replaceChildren(button);
    printedEvidenceList.append(entry);
  }
  if (suspicious.length > 80) {
    const more = document.createElement('li');
    more.textContent = `Hay ${suspicious.length - 80} detecciones adicionales. Consulte el JSON de evidencia.`;
    printedEvidenceList.append(more);
  }
}
const readableTextButton = document.getElementById('readableTextButton');
const rawTextButton = document.getElementById('rawTextButton');

function showPrintedText(view) {
  printedTextState.current = view;
  result.textContent = view === 'readable'
    ? printedTextState.readable : view === 'structured'
      ? printedTextState.structured : printedTextState.raw;
  readableTextButton.setAttribute('aria-pressed', String(view === 'readable'));
  rawTextButton.setAttribute('aria-pressed', String(view === 'raw'));
  geometricTextButton.setAttribute('aria-pressed', String(view === 'structured'));
  readableTextButton.classList.toggle('secondary', view !== 'readable');
  rawTextButton.classList.toggle('secondary', view !== 'raw');
  geometricTextButton.classList.toggle('secondary', view !== 'structured');
}
readableTextButton.addEventListener('click', () => showPrintedText('readable'));
rawTextButton.addEventListener('click', () => showPrintedText('raw'));
geometricTextButton.addEventListener('click', () => showPrintedText('structured'));


function setStatus(
  message,
) {
  status.textContent =
    message;
}

for (
  const input
  of ocrModeInputs
) {
  input.addEventListener(
    'change',
    () => {
      const mode =
        selectedOcrMode();

      if (
        mode ===
        'handwritten'
      ) {
        modeHelp.textContent =
          'Usa Manuscrito para fotografías o imágenes con escritura a mano. Esta ruta es experimental y requiere revisión.';
      } else {
        modeHelp.textContent =
          'Usa Texto impreso para documentos mecanografiados o impresos.';
      }

      result.textContent =
        '';
      printedTextControls.hidden = true;
      printedReviewNotice.hidden = true;
      printedEvidencePanel.hidden = true;
      lastPrintedFile = null;
      revokePrintedImagePreview();

      metadataResult.textContent =
        '';

      metadataDetails.open =
        false;

      clearHandwritingReview();

      setStatus(
        'Listo para procesar un documento.',
      );
    },
  );
}


function clearHandwritingReview() {
  handwritingReview.hidden =
    true;

  reviewText.replaceChildren();

  structuredFields
    .replaceChildren();

  rawHandwritingText.textContent =
    '';
}


function createReviewCharacter(
  character,
) {
  const span =
    document.createElement(
      'span',
    );

  span.textContent =
    character.char;

  span.classList.add(
    'review-character',
  );

  span.classList.add(
    character.review.level ===
      'fallback'
      ? 'review-character-fallback'
      : 'review-character-review',
  );

  span.title =
    `${
      character.review.label
    } · ${
      formatConfidencePercent(
        character.confidence,
      )
    }`;

  return span;
}


function renderStructuredFields(
  fields,
) {
  structuredFields
    .replaceChildren();

  if (!fields.length) {
    const empty =
      document.createElement(
        'p',
      );

    empty.className =
      'structured-empty';

    empty.textContent =
      'No se detectaron campos estructurados seguros.';

    structuredFields.append(
      empty,
    );

    return;
  }

  for (const field of fields) {
    const display =
      structuredFieldDisplayValue(
        field,
      );

    const item =
      document.createElement(
        'article',
      );

    item.className =
      'structured-field';

    const header =
      document.createElement(
        'div',
      );

    header.className =
      'structured-field-header';

    const type =
      document.createElement(
        'strong',
      );

    type.textContent =
      structuredFieldTypeLabel(
        field.fieldType,
      );

    const statusLabel =
      document.createElement(
        'span',
      );

    statusLabel.className =
      'structured-status';

    statusLabel.textContent =
      structuredFieldStatusLabel(
        display.status,
      );

    header.append(
      type,
      statusLabel,
    );

    const raw =
      document.createElement(
        'div',
      );

    raw.className =
      'structured-value';

    raw.innerHTML =
      '<span>Leído</span>';

    const rawValue =
      document.createElement(
        'code',
      );

    rawValue.textContent =
      display.raw;

    raw.append(
      rawValue,
    );

    item.append(
      header,
      raw,
    );

    if (display.changed) {
      const resolved =
        document.createElement(
          'div',
        );

      resolved.className =
        'structured-value structured-resolved';

      resolved.innerHTML =
        '<span>Normalizado</span>';

      const resolvedValue =
        document.createElement(
          'code',
        );

      resolvedValue.textContent =
        display.resolved;

      resolved.append(
        resolvedValue,
      );

      item.append(
        resolved,
      );
    }

    if (
      display.resolved === null
    ) {
      const unresolved =
        document.createElement(
          'p',
        );

      unresolved.className =
        'structured-warning';

      unresolved.textContent =
        'Valor no resuelto automáticamente.';

      item.append(
        unresolved,
      );
    }

    structuredFields.append(
      item,
    );
  }
}


function renderHandwritingReview(
  ocr,
) {
  const model =
    buildHandwritingReviewModel(
      ocr,
    );

  if (!model) {
    clearHandwritingReview();
    return;
  }

  handwritingReview.hidden =
    false;

  reviewBadge.textContent =
    model.requiresReview
      ? 'Revisión requerida'
      : 'Sin revisión';

  reviewCharacterCount.textContent =
    String(
      model.characterCount,
    );

  reviewFallbackCount.textContent =
    String(
      model.fallbackCharacterCount,
    );

  rawHandwritingText.textContent =
    model.rawText;

  reviewText.replaceChildren();

  if (model.lines.length > 0) {
    for (
      const [
        lineIndex,
        line,
      ]
      of model.lines.entries()
    ) {
      const lineElement =
        document.createElement(
          'div',
        );

      lineElement.className =
        'review-line';

      for (
        const character
        of line.characters
      ) {
        lineElement.append(
          createReviewCharacter(
            character,
          ),
        );
      }

      reviewText.append(
        lineElement,
      );

      if (
        lineIndex <
        model.lines.length - 1
      ) {
        reviewText.append(
          document.createTextNode(
            '\n',
          ),
        );
      }
    }
  } else {
    for (
      const character
      of model.characters
    ) {
      reviewText.append(
        createReviewCharacter(
          character,
        ),
      );
    }
  }

  renderStructuredFields(
    model.structuredFields,
  );
}


function clearPreviewUrl() {
  if (previewUrl) {
    URL.revokeObjectURL(
      previewUrl,
    );

    previewUrl = null;
  }
}

function setCameraMode(
  mode,
) {
  const live =
    mode === 'live';

  const captured =
    mode === 'captured';

  video.hidden = !live;
  capturedImage.hidden =
    !captured;

  captureButton.hidden =
    !live;

  retryButton.hidden =
    !captured;

  useButton.hidden =
    !captured;
}

async function submitOcr(
  file,
  source,
) {
  const form =
    new FormData();

  form.append(
    'file',
    file,
    file.name,
  );

  form.append(
    'source',
    source,
  );

  const selectedMode =
    selectedOcrMode();

  form.append(
    'mode',
    selectedMode,
  );

  setStatus(
    selectedMode === 'handwritten'
      ? 'Procesando manuscrito con CRAFT + Kraken...'
      : 'Procesando texto impreso con Tesseract...',
  );

  result.textContent = '';
  printedTextControls.hidden = true;
  printedReviewNotice.hidden = true;
  printedEvidencePanel.hidden = true;
  lastPrintedFile = null;
  revokePrintedImagePreview();

  metadataResult.textContent =
    '';

  metadataDetails.open =
    false;

  clearHandwritingReview();

  const response =
    await fetch(
      '/api/ocr/file',
      {
        method: 'POST',
        body: form,
      },
    );

  const payload =
    await response.json();

  if (
    !response.ok ||
    !payload.ok
  ) {
    throw new Error(
      payload.message ??
      'No fue posible procesar el documento.',
    );
  }

  const confidence =
    payload.ocr.confidence === null
      ? 'N/D'
      : Number(
          payload.ocr.confidence,
        ).toFixed(2);

  const quality =
    payload.ocr.quality?.status ??
    'N/D';

  const engine =
    payload.ocr.engine ??
    'N/D';

  const mode =
    payload.ocr.mode ===
      'handwritten'
      ? 'Manuscrito'
      : 'Texto impreso';

  if (payload.ocr.mode === 'printed') {
    if (payload.document.kind !== 'pdf') {
      lastPrintedFile = file;
      printedImagePreviewUrl = URL.createObjectURL(file);
      printedImagePreview.src = printedImagePreviewUrl;
    }
    printedTextState = {
      raw: payload.ocr.text,
      readable: payload.ocr.readableText ?? payload.ocr.text,
      structured: payload.ocr.structuredText ?? payload.ocr.readableText ?? payload.ocr.text,
      current: 'readable',
    };
    printedTextControls.hidden = false;
    printedReviewNotice.hidden = false;
    showPrintedText(payload.document.kind === 'pdf' ? 'readable' : 'structured');
    renderPrintedEvidence(payload.ocr.pages);
  } else {
    result.textContent = payload.ocr.text;
    printedTextControls.hidden = true;
    printedReviewNotice.hidden = true;
    printedEvidencePanel.hidden = true;
    revokePrintedImagePreview();
  }

  metadataResult.textContent = [
    `Origen: ${payload.document.source}`,
    `Formato: ${payload.document.kind}`,
    `Modo: ${mode}`,
    `Motor: ${engine}`,
    `Confianza: ${confidence}`,
    `Calidad: ${quality}`,
  ].join('\n');

  if (
    payload.ocr.mode ===
    'handwritten'
  ) {
    renderHandwritingReview(
      payload.ocr,
    );
  } else {
    clearHandwritingReview();
  }

  setStatus(
    payload.ocr.quality
      ?.requiresReview
      ? 'OCR completado. El resultado requiere revisión.'
      : 'OCR completado correctamente.',
  );
}

async function startCamera() {
  stopMediaStream(
    mediaStream,
  );

  mediaStream = null;
  capturedBlob = null;

  clearPreviewUrl();

  if (
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices
      .getUserMedia !==
      'function'
  ) {
    throw Object.assign(
      new Error(
        'getUserMedia no disponible',
      ),
      {
        name:
          'NotSupportedError',
      },
    );
  }

  mediaStream =
    await navigator.mediaDevices
      .getUserMedia(
        buildCameraConstraints(),
      );

  video.srcObject =
    mediaStream;

  await video.play();

  cameraPanel.hidden =
    false;

  setCameraMode(
    'live',
  );

  setStatus(
    'Cámara activa. Encuadra el documento y captura la fotografía.',
  );
}

function closeCamera() {
  stopMediaStream(
    mediaStream,
  );

  mediaStream = null;
  capturedBlob = null;

  video.srcObject = null;

  clearPreviewUrl();

  cameraPanel.hidden =
    true;

  setCameraMode(
    'closed',
  );
}

document
  .getElementById(
    'selectFile',
  )
  .addEventListener(
    'click',
    () =>
      fileInput.click(),
  );

fileInput.addEventListener(
  'change',
  async () => {
    const file =
      fileInput.files?.[0];

    if (!file) {
      setStatus(
        'No se seleccionó archivo.',
      );
      return;
    }

    try {
      await submitOcr(
        file,
        'file',
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Error procesando archivo.',
      );
    } finally {
      fileInput.value = '';
    }
  },
);

document
  .getElementById(
    'openCamera',
  )
  .addEventListener(
    'click',
    async () => {
      try {
        await startCamera();
      } catch (error) {
        closeCamera();

        setStatus(
          cameraErrorMessage(
            error,
          ),
        );
      }
    },
  );

captureButton.addEventListener(
  'click',
  async () => {
    try {
      capturedBlob =
        await captureVideoFrame(
          video,
          canvas,
        );

      stopMediaStream(
        mediaStream,
      );

      mediaStream = null;
      video.srcObject = null;

      clearPreviewUrl();

      previewUrl =
        URL.createObjectURL(
          capturedBlob,
        );

      capturedImage.src =
        previewUrl;

      setCameraMode(
        'captured',
      );

      setStatus(
        'Fotografía capturada. Puedes repetirla o utilizarla.',
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'No fue posible capturar la fotografía.',
      );
    }
  },
);

retryButton.addEventListener(
  'click',
  async () => {
    try {
      await startCamera();
    } catch (error) {
      closeCamera();

      setStatus(
        cameraErrorMessage(
          error,
        ),
      );
    }
  },
);

useButton.addEventListener(
  'click',
  async () => {
    if (!capturedBlob) {
      setStatus(
        'No existe una fotografía para procesar.',
      );
      return;
    }

    const file =
      new File(
        [
          capturedBlob,
        ],
        `camera-${Date.now()}.jpg`,
        {
          type:
            'image/jpeg',
        },
      );

    try {
      await submitOcr(
        file,
        'camera',
      );

      closeCamera();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'No fue posible procesar la fotografía.',
      );
    }
  },
);

closeButton.addEventListener(
  'click',
  () => {
    closeCamera();

    setStatus(
      'Cámara cerrada.',
    );
  },
);

window.addEventListener(
  'pagehide',
  () => {
    revokePrintedImagePreview();
    stopMediaStream(
      mediaStream,
    );

    clearPreviewUrl();
  },
);
