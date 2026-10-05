export type RegistryFactVersionKind = 'previous' | 'corrected' | 'retracted' | 'ended';
export type RegistryFactVersionInput = {
  id: string;
  supersedesId?: string;
  reviewState?: string;
  validUntil?: string | null;
};
export type RegistryFactVersionBadge = {
  kind: RegistryFactVersionKind;
  label: string;
  relatedFactId: string | null;
};
export function getRegistryFactVersionBadge(
  fact: RegistryFactVersionInput | null | undefined,
  facts?: readonly RegistryFactVersionInput[],
): RegistryFactVersionBadge | null;
