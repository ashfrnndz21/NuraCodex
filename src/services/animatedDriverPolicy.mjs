const NATIVE_ANIMATION_PLATFORMS = new Set(['ios', 'android']);

export function nativeAnimatedDriverFor(platform) {
  return NATIVE_ANIMATION_PLATFORMS.has(platform);
}
