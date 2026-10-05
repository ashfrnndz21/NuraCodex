export const INTAKE_MEDIA_TYPES_BY_EXTENSION: Readonly<Record<string, string>>;
export const INTAKE_MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>>;
export const SUPPORTED_INTAKE_MEDIA_TYPES: readonly string[];
export const DOCUMENT_PICKER_MIME_TYPES: readonly string[];
export const MEDICAL_DOCUMENT_PICKER_MIME_TYPES: readonly string[];
export const ACCEPTED_DOCUMENT_FORMATS: string;
export function resolveSupportedIntakeMediaType(asset: { name: string; mimeType?: string }): string;
export function isSupportedIntakeMediaType(mediaType: string): boolean;
