const DEFAULT_DEV_ORIGINS = [
  'http://localhost:8092', 'http://127.0.0.1:8092',
  'http://localhost:8094', 'http://127.0.0.1:8094', 'http://nura.localhost:8094',
  'http://localhost:8095', 'http://127.0.0.1:8095', 'http://nura.localhost:8095',
  'http://localhost:8081', 'http://127.0.0.1:8081',
  // The current shareable Codex preview runs on this fixed local origin.
  'http://localhost:8099', 'http://127.0.0.1:8099',
];
const DEFAULT_DEV_ORIGIN_SET = new Set(DEFAULT_DEV_ORIGINS);

export function allowedOriginsFromEnv(configuredOrigins) {
  const values = typeof configuredOrigins === 'string' && configuredOrigins.trim()
    ? configuredOrigins.split(',')
    : DEFAULT_DEV_ORIGINS;
  if (values === DEFAULT_DEV_ORIGINS) return DEFAULT_DEV_ORIGIN_SET;
  return new Set(values.map((value) => value.trim()).filter(Boolean));
}

function isLocalPreviewOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:'
      && url.origin === origin
      && ['localhost', '127.0.0.1', 'nura.localhost'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin, allowedOrigins) {
  return !origin
    || allowedOrigins.has(origin)
    || (allowedOrigins === DEFAULT_DEV_ORIGIN_SET && isLocalPreviewOrigin(origin));
}

export function applyCorsHeaders(origin, response, allowedOrigins) {
  if (origin && isAllowedOrigin(origin, allowedOrigins)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'Origin');
  }
  response.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type, accept, authorization, x-nura-file-name, x-nura-consent-confirmed, x-nura-document-purpose, x-nura-local-sample-fixture, x-nura-health-area, x-nura-audio-processing-consent');
}
