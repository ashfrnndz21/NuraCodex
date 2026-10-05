/** One allowlist shared by the native/browser picker, client validation and upload server. */
export const INTAKE_MEDIA_TYPES_BY_EXTENSION = Object.freeze({
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  txt: 'text/plain',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
});

export const INTAKE_MIME_EXTENSIONS = Object.freeze({
  'application/pdf': Object.freeze(['.pdf']),
  'application/msword': Object.freeze(['.doc']),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': Object.freeze(['.docx']),
  'application/rtf': Object.freeze(['.rtf']),
  'text/rtf': Object.freeze(['.rtf']),
  'application/vnd.oasis.opendocument.text': Object.freeze(['.odt']),
  'text/plain': Object.freeze(['.txt']),
  'image/jpeg': Object.freeze(['.jpg', '.jpeg']),
  'image/png': Object.freeze(['.png']),
  'image/webp': Object.freeze(['.webp']),
  'video/mp4': Object.freeze(['.mp4']),
  'video/quicktime': Object.freeze(['.mov']),
  'video/webm': Object.freeze(['.webm']),
  'video/x-m4v': Object.freeze(['.m4v']),
});

export const SUPPORTED_INTAKE_MEDIA_TYPES = Object.freeze(Object.keys(INTAKE_MIME_EXTENSIONS));
export const DOCUMENT_PICKER_MIME_TYPES = Object.freeze([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'text/plain',
  'image/*',
]);
// Audio is staged locally only; keep it out of the shared server upload allowlist.
export const MEDICAL_DOCUMENT_PICKER_MIME_TYPES = Object.freeze([...DOCUMENT_PICKER_MIME_TYPES, 'video/*', 'audio/*']);
export const ACCEPTED_DOCUMENT_FORMATS = 'PDF, Word, RTF, OpenDocument and TXT files';

export function resolveSupportedIntakeMediaType(asset) {
  const extension = typeof asset?.name === 'string' ? asset.name.split('.').pop()?.toLowerCase() ?? '' : '';
  const inferred = INTAKE_MEDIA_TYPES_BY_EXTENSION[extension] ?? '';
  const rawDeclared = typeof asset?.mimeType === 'string' ? asset.mimeType.toLowerCase().split(';')[0].trim() : '';
  const declared = rawDeclared;
  if (Object.hasOwn(INTAKE_MIME_EXTENSIONS, declared)) {
    if (declared.startsWith('video/') && inferred.startsWith('video/') && declared !== inferred) return inferred;
    return declared;
  }
  return inferred;
}

export function isSupportedIntakeMediaType(mediaType) {
  return typeof mediaType === 'string' && Object.hasOwn(INTAKE_MIME_EXTENSIONS, mediaType.toLowerCase().split(';')[0].trim());
}
