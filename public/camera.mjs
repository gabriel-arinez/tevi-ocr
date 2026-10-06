export function buildCameraConstraints() {
  return {
    audio: false,
    video: {
      facingMode: {
        ideal: 'environment',
      },
      width: {
        ideal: 1920,
      },
      height: {
        ideal: 1080,
      },
    },
  };
}

export function cameraErrorMessage(
  error,
) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'El permiso para utilizar la cámara fue rechazado.';

    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No se encontró una cámara disponible.';

    case 'NotReadableError':
    case 'TrackStartError':
      return 'La cámara está siendo utilizada por otra aplicación o no puede iniciarse.';

    case 'OverconstrainedError':
      return 'La cámara disponible no admite la configuración solicitada.';

    default:
      return 'No fue posible acceder a la cámara.';
  }
}

export function stopMediaStream(
  stream,
) {
  if (!stream) {
    return;
  }

  for (
    const track of stream.getTracks()
  ) {
    track.stop();
  }
}

export function captureVideoFrame(
  video,
  canvas,
  quality = 0.92,
) {
  const width =
    video.videoWidth;

  const height =
    video.videoHeight;

  if (
    !width ||
    !height
  ) {
    throw new Error(
      'La cámara todavía no tiene una imagen disponible.',
    );
  }

  canvas.width = width;
  canvas.height = height;

  const context =
    canvas.getContext(
      '2d',
    );

  if (!context) {
    throw new Error(
      'No fue posible preparar la captura.',
    );
  }

  context.drawImage(
    video,
    0,
    0,
    width,
    height,
  );

  return new Promise(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              new Error(
                'No fue posible generar la fotografía.',
              ),
            );
            return;
          }

          resolve(blob);
        },
        'image/jpeg',
        quality,
      );
    },
  );
}
