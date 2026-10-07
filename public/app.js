import {
  buildCameraConstraints,
  cameraErrorMessage,
  captureVideoFrame,
  stopMediaStream,
} from './camera.mjs';

const fileInput =
  document.getElementById(
    'fileInput',
  );

const ocrMode =
  document.getElementById(
    'ocrMode',
  );

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

function setStatus(
  message,
) {
  status.textContent =
    message;
}

ocrMode.addEventListener(
  'change',
  () => {
    if (
      ocrMode.value ===
      'handwritten'
    ) {
      modeHelp.textContent =
        'Usa Manuscrito para fotografías o imágenes con escritura a mano. Esta ruta es experimental y requiere revisión.';
    } else {
      modeHelp.textContent =
        'Usa Texto impreso para documentos mecanografiados o impresos.';
    }

    result.textContent = '';
    setStatus(
      'Listo para procesar un documento.',
    );
  },
);


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

  form.append(
    'mode',
    ocrMode.value,
  );

  setStatus(
    ocrMode.value === 'handwritten'
      ? 'Procesando manuscrito con CRAFT + TrOCR...'
      : 'Procesando texto impreso con Tesseract...',
  );

  result.textContent = '';

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

  const warning =
    payload.ocr.experimental
      ? 'ADVERTENCIA: reconocimiento manuscrito experimental; revise el texto obtenido.'
      : null;

  result.textContent = [
    `Origen: ${payload.document.source}`,
    `Formato: ${payload.document.kind}`,
    `Modo: ${mode}`,
    `Motor: ${engine}`,
    `Confianza: ${confidence}`,
    `Calidad: ${quality}`,
    ...(warning
      ? [
          '',
          warning,
        ]
      : []),
    '',
    payload.ocr.text,
  ].join('\n');

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
    stopMediaStream(
      mediaStream,
    );

    clearPreviewUrl();
  },
);
