import { sanitizePublicHealthTopics } from '../../src/services/healthSearchTopic.mjs';

const MEDLINEPLUS_URL = 'https://wsearch.nlm.nih.gov/ws/query';
const MEDLINEPLUS_HOST = 'medlineplus.gov';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function decodeXml(value) {
  let text = String(value ?? '');
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[String(code).toLowerCase()];
      if (named) return named;
      const point = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isSafeInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    });
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}

function plainText(value) {
  return decodeXml(value)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '. ')
    .replace(/<br\s*\/?>/gi, '. ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/([.!?])(?:\s*[.!?])+/g, '$1')
    .trim();
}

function content(document, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return document.match(new RegExp(`<content\\b(?=[^>]*\\bname=["']${escaped}["'])[^>]*>([\\s\\S]*?)<\\/content>`, 'i'))?.[1] ?? '';
}

function parseDocuments(xml) {
  const output = [];
  const documents = String(xml ?? '').matchAll(/<document\b([^>]*)>([\s\S]*?)<\/document>/gi);
  for (const match of documents) {
    const rawUrl = match[1].match(/\burl=["']([^"']+)["']/i)?.[1];
    const title = plainText(content(match[2], 'title'));
    const detail = plainText(content(match[2], 'FullSummary') || content(match[2], 'snippet'));
    let url;
    try {
      url = new URL(decodeXml(rawUrl));
    } catch { continue; }
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== MEDLINEPLUS_HOST || !title || !detail) continue;
    output.push({ title: title.slice(0, 140), detail: detail.slice(0, 700), url: url.href, publisher: 'MedlinePlus' });
  }
  return output;
}

/** Direct, keyless search against NLM's public MedlinePlus health-topic service. */
export function createMedlinePlusWebService({ fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 8_000 } = {}) {
  const cache = new Map();

  return async function searchMedlinePlus({ query, signal } = {}) {
    let topic;
    try {
      [topic] = sanitizePublicHealthTopics([{ id: 'medlineplus-search', label: String(query ?? '').trim().replace(/\s+/g, ' ') }]);
    } catch {
      throw new Error('Choose a general health topic before searching public health sources.');
    }
    const cacheKey = topic.label.toLocaleLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return { summary: '', sources: cached.sources.map((source) => ({ ...source })) };

    const url = new URL(MEDLINEPLUS_URL);
    url.searchParams.set('db', 'healthTopics');
    url.searchParams.set('term', topic.label);
    url.searchParams.set('retmax', '10');
    url.searchParams.set('rettype', 'brief');
    url.searchParams.set('tool', 'nura');
    const timeout = AbortSignal.timeout(timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response;
    try {
      response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/xml, text/xml' }, signal: requestSignal });
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      throw new Error('MedlinePlus could not complete this health-topic search. Try again later.');
    }
    if (!response.ok) throw new Error('MedlinePlus could not complete this health-topic search. Try again later.');
    let xml;
    try { xml = await response.text(); }
    catch { throw new Error('MedlinePlus returned an unreadable search response.'); }
    if (xml.length > 2_000_000) throw new Error('MedlinePlus returned an oversized search response.');
    const sources = parseDocuments(xml);
    if (!sources.length) throw new Error('MedlinePlus found no matching health-topic pages.');
    cache.set(cacheKey, { sources, expiresAt: now() + CACHE_TTL_MS });
    return { summary: '', sources: sources.map((source) => ({ ...source })) };
  };
}

/** Use an existing trusted article provider first, then fill gaps from MedlinePlus. */
export function createFallbackArticleSearch({ searchPrimary, searchFallback }) {
  return async function searchTrustedArticles(input) {
    let primary;
    let primaryError;
    try { primary = await searchPrimary(input); }
    catch (error) { primaryError = error; }
    const excluded = new Set((input?.excludeUrls ?? []).map((value) => {
      try { const url = new URL(value); if (url.protocol !== 'https:') return ''; url.hash = ''; return url.href; } catch { return ''; }
    }).filter(Boolean));
    const primarySources = (primary?.sources ?? []).filter((source) => {
      if (!source?.url || /youtube\.com|youtu\.be/i.test(source.url)) return false;
      try { const url = new URL(source.url); url.hash = ''; return url.protocol === 'https:' && !excluded.has(url.href); } catch { return false; }
    });
    if (primarySources.length >= 10) return { ...primary, sources: primarySources.slice(0, 10) };

    let fallback;
    try { fallback = await searchFallback(input); }
    catch (error) {
      if (primarySources.length) return { ...primary, sources: primarySources.slice(0, 10) };
      throw primaryError ?? error;
    }
    const sources = [];
    const seen = new Set();
    for (const source of [...primarySources, ...(fallback?.sources ?? [])]) {
      let canonical;
      try {
        const url = new URL(source?.url);
        if (url.protocol !== 'https:') continue;
        url.hash = '';
        canonical = url.href;
      } catch { continue; }
      if (seen.has(canonical) || excluded.has(canonical)) continue;
      seen.add(canonical);
      sources.push(source);
      if (sources.length >= 10) break;
    }
    if (!sources.length && primaryError) throw primaryError;
    return { summary: primary?.summary ?? '', sources };
  };
}
