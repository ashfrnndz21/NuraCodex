import { isSyntheticPlaceholderUri } from '../state/browserAssetStore.mjs';

export function isReviewableIntakeAsset(asset, purpose) {
  if (isSyntheticPlaceholderUri(asset.uri)) return false;
  return !(purpose === 'insurance' && asset.kind === 'video');
}
