import express from 'express';

import {
  config,
} from './core/config.js';

const app = express();

app.disable('x-powered-by');

app.use(
  express.json({
    limit: '1mb',
  }),
);

app.use(
  express.static('public'),
);

app.get(
  '/api/health',
  (_request, response) => {
    response.json({
      ok: true,
      service: 'tevi-ocr',
    });
  },
);

if (
  process.env.NODE_ENV !== 'test'
) {
  app.listen(
    config.port,
    '127.0.0.1',
    () => {
      console.log(
        `TEVI OCR disponible en http://127.0.0.1:${config.port}`,
      );
    },
  );
}

export { app };
