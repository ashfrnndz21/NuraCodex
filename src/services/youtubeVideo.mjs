const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Return only a canonical YouTube video ID from a public watch, short, or embed URL. */
export function getYouTubeVideoId(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
    let videoId = null;
    if (url.hostname.toLowerCase().endsWith('youtu.be')) videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    else if (url.pathname === '/watch') videoId = url.searchParams.get('v');
    else {
      const parts = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live'].includes(parts[0])) videoId = parts[1] ?? null;
    }
    return videoId && VIDEO_ID.test(videoId) ? videoId : null;
  } catch { return null; }
}

/** Build a privacy-enhanced embed URL for a validated YouTube video ID. */
export function getYouTubeEmbedUrl(videoId) {
  return typeof videoId === 'string' && VIDEO_ID.test(videoId)
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`
    : null;
}

/** YouTube thumbnails are presented unmodified and link to the original YouTube video. */
export function getYouTubeThumbnailUrl(value) {
  const id = getYouTubeVideoId(value);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** Prefer the widely available high-quality image, then try larger/smaller variants. */
export function getYouTubeThumbnailCandidates(value) {
  const id = getYouTubeVideoId(value);
  if (!id) return [];
  return ['hqdefault', 'maxresdefault', 'mqdefault', 'default']
    .map((quality) => `https://i.ytimg.com/vi/${id}/${quality}.jpg`);
}

/** Accept only official YouTube thumbnail hosts before rendering server metadata. */
export function isYouTubeThumbnailUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['i.ytimg.com', 'img.youtube.com'].includes(url.hostname.toLowerCase());
  } catch { return false; }
}

/** Use only a provider-supplied thumbnail for the same validated video. */
export function getYouTubeThumbnailForVideo(videoUrl, thumbnailUrl) {
  const videoId = getYouTubeVideoId(videoUrl);
  if (!videoId || !isYouTubeThumbnailUrl(thumbnailUrl)) return null;
  try {
    const url = new URL(thumbnailUrl);
    const match = url.pathname.match(/^\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\/[^/]+$/);
    return match?.[1] === videoId ? url.href : null;
  } catch { return null; }
}
