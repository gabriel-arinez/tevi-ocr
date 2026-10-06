import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCameraConstraints,
  cameraErrorMessage,
  stopMediaStream,
} from '../../public/camera.mjs';

test(
  'solicita preferentemente cámara trasera',
  () => {
    const constraints =
      buildCameraConstraints();

    assert.equal(
      constraints.audio,
      false,
    );

    assert.equal(
      constraints.video.facingMode.ideal,
      'environment',
    );

    assert.equal(
      constraints.video.width.ideal,
      1920,
    );

    assert.equal(
      constraints.video.height.ideal,
      1080,
    );
  },
);

test(
  'traduce permiso de cámara denegado',
  () => {
    assert.match(
      cameraErrorMessage({
        name:
          'NotAllowedError',
      }),
      /permiso/i,
    );
  },
);

test(
  'traduce ausencia de dispositivo',
  () => {
    assert.match(
      cameraErrorMessage({
        name:
          'NotFoundError',
      }),
      /cámara disponible/i,
    );
  },
);

test(
  'detiene todas las pistas del stream',
  () => {
    let stopped = 0;

    const stream = {
      getTracks() {
        return [
          {
            stop() {
              stopped += 1;
            },
          },
          {
            stop() {
              stopped += 1;
            },
          },
        ];
      },
    };

    stopMediaStream(
      stream,
    );

    assert.equal(
      stopped,
      2,
    );
  },
);
