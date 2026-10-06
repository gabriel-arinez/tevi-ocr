export const config = Object.freeze({
  port: Number(process.env.PORT ?? 4100),

  upload: {
    maxBytes: 20 * 1024 * 1024,
    allowedMimeTypes: new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
    ]),
  },

  ocr: {
    language: 'spa',
  },
});
