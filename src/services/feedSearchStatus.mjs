/** Explain local Explore setup without implying that a present key was validated. */
export function feedSearchSetupReason(status = {}) {
  if (status.capabilities?.youtubeVideoSearch !== true) {
    return 'YouTube video search needs the server-only NURA_YOUTUBE_DATA_API_KEY in the local preview settings, then restart the preview.';
  }
  if (status.capabilities?.trustedHealthSearch !== true) {
    return 'Trusted search is turned off. Enable NURA_HEALTH_SEARCH_ENABLED and NURA_ENABLE_DEMO_WEB_SEARCH in server settings, then restart.';
  }
  return status.reason || 'Trusted health search isn’t available right now.';
}
