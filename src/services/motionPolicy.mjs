/**
 * Keep motion off until the platform preference has been read. This avoids a
 * brief animated flash for people who have enabled reduced motion.
 */
export function shouldUseMotion(reducedMotionPreference) {
  return reducedMotionPreference === false;
}

/**
 * Replace a spinner with a static, visible state label when motion is reduced;
 * the busy state remains available to assistive technology in either mode.
 */
export function activityMotionPresentation(active, reducedMotion) {
  return {
    showSpinner: active && !reducedMotion,
    showStaticStatus: active && reducedMotion,
    busy: active,
  };
}
