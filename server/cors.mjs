const DEFAULT_DEV_ORIGINS = [
  'http://localhost:8092', 'http://127.0.0.1:8092',
  'http://localhost:8094', 'http://127.0.0.1:8094', 'http://nura.localhost:8094',
  'http://localhost:8095', 'http://127.0.0.1:8095', 'http://nura.localhost:8095',
  'http://localhost:8081', 'http://127.0.0.1:8081',
];

export function allowedOriginsFromEnv(configuredOrigins) {
  const values = typeof configuredOrigins === 'string' && configuredOrigins.trim()
    ? configuredOrigins.split(',')
    : DEFAULT_DEV_ORIGINS;
  return new Set(values.map((value) => value.trim()).filter(Boolean));
}

export function isAllowedOrigin(origin, allowedOrigins) {
  return !origin || allowedOrigins.has(origin);
}

export function applyCorsHeaders(origin, response, allowedOrigins) {
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'Origin');
  }
  response.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type, accept, x-nura-file-name, x-nura-consent-confirmed, x-nura-document-purpose');
}
