import { getYouTubeVideoId } from './youtubeVideo.mjs';

/** Return a concise first view for long answers without changing the stored answer. */
export function answerFirstView(answer, maxCharacters = 200) {
  const text = String(answer ?? '');
  const limit = Math.max(120, Math.floor(Number(maxCharacters) || 200));
  if (text.length <= limit) return { text, expandable: false };

  const sample = text.slice(0, limit + 1);
  const sentenceEnds = [...sample.matchAll(/[.!?](?:[”’"')\]]*)?(?=\s|$)/g)];
  const sentenceEnd = sentenceEnds
    .map((match) => (match.index ?? 0) + match[0].length)
    .find((end) => end <= limit);
  const wordEnd = sample.lastIndexOf(' ', limit);
  const end = sentenceEnd ?? (wordEnd > 0 ? wordEnd : limit);

  return { text: text.slice(0, end).trimEnd(), expandable: true };
}

/** Keep conversational answers focused while leaving the original available to expand. */
export function conversationalAnswerPreview(answer, { maxCharacters = 640, maxWords = 90 } = {}) {
  const paragraphs = String(answer ?? '').replace(/\r\n?/g, '\n').trim().split(/\n\s*\n+/u)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!paragraphs.length) return { text: '', expandable: false };

  const sourceText = paragraphs.join('\n\n');
  const sentences = paragraphs.flatMap((paragraph, paragraphIndex) => paragraph
    .split(/(?<=[.!?])\s+(?=[A-Z"'“])/u)
    .map((sentence) => ({ text: sentence.trim(), paragraphIndex }))
    .filter((sentence) => sentence.text));
  const inventoryLead = /^(?:the (?:available )?records? reviewed include|records? reviewed include|the records reviewed (?:are|show)|records reviewed (?:are|show))\b/i;
  const omittedInventory = sentences.length > 1 && inventoryLead.test(sentences[0].text);
  if (omittedInventory) sentences.shift();

  const withoutAreaMetadata = sentences.filter(({ text }) => !/^.{1,140}\b(?:is|are)\s+selected health areas?,\s*not confirmed diagnoses?\.?$/i.test(text));
  const omittedAreaMetadata = withoutAreaMetadata.length > 0 && withoutAreaMetadata.length < sentences.length;
  if (omittedAreaMetadata) sentences.splice(0, sentences.length, ...withoutAreaMetadata);

  const selected = [];
  for (const sentence of sentences) {
    const candidateItems = [...selected, sentence];
    const candidate = candidateItems.map((item, index) => index === 0 || item.paragraphIndex === candidateItems[index - 1].paragraphIndex
      ? item.text
      : `\n\n${item.text}`).join(' ');
    if (candidate.length > maxCharacters || candidate.split(/\s+/).length > maxWords) break;
    selected.push(sentence);
  }

  if (!selected.length) {
    const first = answerFirstView(sentences[0]?.text ?? sourceText, maxCharacters);
    return { text: first.text, expandable: omittedInventory || omittedAreaMetadata || first.expandable || first.text !== sourceText };
  }

  const preview = selected.reduce((result, item, index) => {
    if (!index) return item.text;
    return result + (item.paragraphIndex === selected[index - 1].paragraphIndex ? ' ' : '\n\n') + item.text;
  }, '');
  return { text: preview, expandable: omittedInventory || omittedAreaMetadata || preview !== sourceText };
}

/** Preserve answer structure and break oversized prose into readable paragraphs. */
export function conversationalAnswerBlocks(answer, { maxWordsPerParagraph = 52 } = {}) {
  const text = String(answer ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!text) return [];
  const blocks = [];
  let paragraphLines = [];
  const flushParagraph = () => {
    const paragraph = paragraphLines.join(' ').replace(/[ \t]+/g, ' ').trim();
    paragraphLines = [];
    if (!paragraph) return;
    const sentences = paragraph.split(/(?<=[.!?])\s+(?=[A-Z"'“(])/u).filter(Boolean);
    let group = [];
    let wordCount = 0;
    const flushGroup = () => {
      if (group.length) blocks.push({ kind: 'paragraph', text: group.join(' ').trim() });
      group = [];
      wordCount = 0;
    };
    for (const sentence of sentences) {
      const sentenceWords = sentence.split(/\s+/).length;
      if (group.length && (group.length >= 2 || wordCount + sentenceWords > maxWordsPerParagraph)) flushGroup();
      group.push(sentence.trim());
      wordCount += sentenceWords;
    }
    flushGroup();
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) { flushParagraph(); continue; }
    const heading = line.match(/^(?:#{1,3}\s+(.+?)\s*|\*\*(.+?)\*\*:?\s*)$/u);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: 'heading', text: (heading[1] ?? heading[2]).trim() });
      continue;
    }
    const listItem = line.match(/^([-*•]|(\d+)[.)])\s+(.+)$/u);
    if (listItem) {
      flushParagraph();
      blocks.push({ kind: listItem[2] ? 'number' : 'bullet', marker: listItem[2] ? `${listItem[2]}.` : '•', text: listItem[3].trim() });
      continue;
    }
    paragraphLines.push(line);
  }
  flushParagraph();
  return blocks;
}

/** Present generated follow-ups as compact topic pills while preserving the useful Ask prompt. */
export function askFollowUpOption(value, { maxLabelCharacters = 52 } = {}) {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  // Preserve an already well-formed question for the composer. Keep imperatives
  // as imperatives so the chip and the question sent to Nura read naturally.
  const imperative = /^(?:explain|compare|summarize|show|teach me|help me understand|walk me through|find|look up)\b/i.test(raw);
  const question = imperative
    ? raw.replace(/[.!?]+$/, '')
    : `${raw.replace(/[.!]+$/, '')}${raw.trimEnd().endsWith('?') ? '' : '?'}`;
  const text = raw.replace(/[.!?]+$/, '');

  const normalizeLabel = (label) => {
    const compact = label.replace(/\band\b/gi, '&').replace(/\s+/g, ' ').trim();
    const shortened = compact.length <= maxLabelCharacters
      ? compact
      : `${compact.slice(0, maxLabelCharacters - 1).replace(/\s+\S*$/, '')}…`;
    return shortened.charAt(0).toLocaleUpperCase() + shortened.slice(1);
  };

  // Convert model-generated natural questions into a concise, tappable topic.
  const knowAbout = text.match(/^(?:what should i (?:notice|know|learn|understand) about|tell me about)\s+(.+?)(?:\s+(?:while|as|because|given)\b.+)?$/i);
  if (knowAbout) {
    const focus = knowAbout[1].replace(/^(?:my|your|the|a|an)\s+/i, '').trim();
    const label = /\b(?:video|article|source)\b/i.test(focus) ? 'Key takeaway' : `Understand ${focus}`;
    return { label: normalizeLabel(label), question };
  }

  const showOrMean = text.match(/^(?:what does|what do)\s+(.+?)\s+(?:show|mean|tell me)\b.*$/i);
  if (showOrMean) {
    const focus = showOrMean[1].replace(/^(?:my|your|the|a|an)\s+/i, '').trim();
    return { label: normalizeLabel(`Understand ${focus}`), question };
  }

  const relationship = text.match(/^(?:how does|how do|how can)\s+(.+?)\s+(affect|change|relate to|compare with|work with|help)\s+(.+)$/i);
  if (relationship) {
    const left = relationship[1].replace(/^(?:my|your|the|a|an)\s+/i, '').trim();
    const right = relationship[3].replace(/^(?:my|your|the|a|an)\s+/i, '').trim();
    return { label: normalizeLabel(`${left} & ${right}`), question };
  }

  const compare = text.match(/^(?:compare|show me|help me compare)\s+(.+)$/i);
  if (compare) return { label: normalizeLabel(`Compare ${compare[1]}`), question };

  const action = text.match(/^(?:review|discuss|compare|check|look at|explore|learn about|understand|ask about|consider)\s+(.+)$/i);
  if (action) {
    const questionFocus = action[1]
      .split(/\s+(?:because|since|if|when|while|with|at|before|during|so)\b|,\s*(?:if|when|unless)\b/i)[0]
      .trim().replace(/[.!?]+$/, '');
    const focus = questionFocus.replace(/^(?:my|your|the|a|an)\s+/i, '');
    if (focus) {
      const subject = /^(?:my|your|the|a|an)\s+/i.test(questionFocus)
        ? questionFocus
        : /\b(?:value|result|panel|record|report)s?$/i.test(focus) ? `my ${focus}` : focus;
      return { label: normalizeLabel(focus), question: `What should I know about ${subject}?` };
    }
  }

  return { label: normalizeLabel(text), question };
}

/** Compare canonical source URLs so YouTube watch and short links count as one cited item. */
export function sameAskPublicSource(left, right) {
  const leftUrl = typeof left?.url === 'string' ? left.url.trim() : '';
  const rightUrl = typeof right?.url === 'string' ? right.url.trim() : '';
  if (!leftUrl || !rightUrl) return false;
  const leftVideo = getYouTubeVideoId(leftUrl);
  const rightVideo = getYouTubeVideoId(rightUrl);
  if (leftVideo || rightVideo) return Boolean(leftVideo && rightVideo && leftVideo === rightVideo);
  try {
    const leftParsed = new URL(leftUrl);
    const rightParsed = new URL(rightUrl);
    if (leftParsed.protocol !== 'https:' || rightParsed.protocol !== 'https:') return false;
    const canonical = (url) => `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}`;
    return canonical(leftParsed) === canonical(rightParsed);
  } catch { return false; }
}

/**
 * Fill missing selected-reading follow-ups from the source and cited personal context.
 * @param {string[]} steps
 * @param {{source?: {mediaType?: string, title?: string, topic?: string}|null, records?: Array<{title?: string}>}} options
 */
export function askSelectedReadingFollowUps(steps = [], { source, records = [] } = {}) {
  const options = (Array.isArray(steps) ? steps : [])
    .slice(0, 2)
    .map((step) => askFollowUpOption(step))
    .filter((item) => item !== null);
  if (!source) return options;
  const mediaLabel = source.mediaType === 'video' ? 'video' : 'article';
  const fallback = [
    `What should I learn about this ${mediaLabel}?`,
    records[0]?.title
      ? `What should I notice about my saved ${records[0].title} while I watch?`
      : `What should I know about ${source.topic || 'this topic'}?`,
  ];
  const seen = new Set(options.map((item) => item.question.toLocaleLowerCase()));
  for (const question of fallback) {
    if (options.length >= 2) break;
    const option = askFollowUpOption(question);
    if (option && !seen.has(option.question.toLocaleLowerCase())) {
      options.push(option);
      seen.add(option.question.toLocaleLowerCase());
    }
  }
  return options.slice(0, 2);
}

/**
 * Explain the visible personal connection without repeating a citation inventory.
 * @param {{source?: {topic?: string, mediaType?: string}|null, records?: Array<{title?: string}>, hasSelectedArea?: boolean}} options
 * @returns {string}
 */
export function askRelevanceSummary({ source, records = [], hasSelectedArea = false } = {}) {
  const topic = typeof source?.topic === 'string' ? source.topic.trim() : '';
  const recordTitles = [...new Set((Array.isArray(records) ? records : [])
    .map((record) => typeof record?.title === 'string' ? record.title.trim() : '')
    .filter(Boolean))];

  if (topic && recordTitles.length) {
    return `This ${source?.mediaType === 'video' ? 'video' : 'source'} appeared because you follow ${topic}. Nura connected the explanation to ${recordTitles.slice(0, 2).join(' and ')}.`;
  }
  if (topic) {
    return `This ${source?.mediaType === 'video' ? 'video' : 'source'} appeared because you follow ${topic}. It gives background on the topic.`;
  }
  if (recordTitles.length) {
    return `Nura connected this answer to ${recordTitles.slice(0, 2).join(' and ')} from your saved health details.`;
  }
  if (hasSelectedArea) return 'This answer relates to a health area you follow. Open the details below to see the records and sources Nura used.';
  return 'Open the details below to see which saved health information and sources Nura used.';
}

/** Show meaning only when it names a returned public source and stays compact. */
export function askMeaningView(meaning, sources = []) {
  const text = typeof meaning?.text === 'string' ? meaning.text.trim() : '';
  if (!text || text.length > 500 || text.split(/\s+/).length > 55) return null;
  const sourceByReference = new Map((Array.isArray(sources) ? sources : [])
    .filter((source) => source && source.kind === 'external_source' && typeof source.reference === 'string')
    .map((source) => [source.reference.trim(), source]));
  const citations = [...new Set((Array.isArray(meaning?.citations) ? meaning.citations : [])
    .filter((reference) => typeof reference === 'string')
    .map((reference) => reference.trim())
    .filter((reference) => reference && sourceByReference.has(reference)))];
  return citations.length ? { text, citations, sources: citations.map((reference) => sourceByReference.get(reference)) } : null;
}

/**
 * Build a source-bounded first view for Ask Nura. Evidence is included only
 * when the answer explicitly cited the matching returned source reference.
 * @param {{ answer?: string, citations?: string[], unknowns?: string[], sources?: Array<{ reference: string, id: string, title: string, detail: string, date: string, source: string, status: string, kind: string }>, excludedReferences?: string[], maxCharacters?: number, evidenceCharacters?: number }} options
 */
export function askAnswerFirstView({ answer, citations = [], unknowns = [], sources = [], excludedReferences = [], maxCharacters = 220, evidenceCharacters = 150 } = {}) {
  const response = answerFirstView(answer, maxCharacters);
  const references = [...new Set((Array.isArray(citations) ? citations : [])
    .filter((reference) => typeof reference === 'string')
    .map((reference) => reference.trim())
    .filter(Boolean))];
  const sourceByReference = new Map((Array.isArray(sources) ? sources : [])
    .filter((source) => source && typeof source.reference === 'string' && source.reference.trim())
    .map((source) => [source.reference.trim(), source]));
  const excluded = new Set((Array.isArray(excludedReferences) ? excludedReferences : [])
    .filter((reference) => typeof reference === 'string')
    .map((reference) => reference.trim())
    .filter(Boolean));
  const suppressedReferences = references.filter((reference) => excluded.has(reference));
  const evidence = references.filter((reference) => !excluded.has(reference)).map((reference) => {
    const source = sourceByReference.get(reference);
    const detail = source && typeof source.detail === 'string' ? answerFirstView(source.detail, evidenceCharacters) : null;
    return { reference, source: source ?? null, detail };
  });
  const unclear = (Array.isArray(unknowns) ? unknowns : [])
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  const evidenceGroups = groupAskEvidence(evidence);

  return {
    answer: String(answer ?? ''),
    shortAnswer: response.text,
    answerExpandable: response.expandable,
    evidence,
    evidenceGroups,
    suppressedReferences,
    unclear,
    expandable: response.expandable || evidence.some((item) => item.detail?.expandable),
  };
}

/**
 * Keep the first evidence view compact while leaving the caller's full evidence
 * list untouched for an expanded view. Evidence should already be bounded to
 * the answer's cited references; excluded references are omitted entirely.
 * @template {{reference?: string}} T
 * @param {T[]} evidence
 * @param {{limit?: number, excludedReferences?: string[]}} options
 * @returns {{visible: T[], hiddenCount: number, totalCount: number}}
 */
export function askEvidencePreview(evidence = [], { limit = 3, excludedReferences = [] } = {}) {
  const maximum = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 3;
  const excluded = new Set((Array.isArray(excludedReferences) ? excludedReferences : [])
    .filter((reference) => typeof reference === 'string')
    .map((reference) => reference.trim())
    .filter(Boolean));
  const unique = [];
  const seen = new Set();

  for (const item of Array.isArray(evidence) ? evidence : []) {
    const reference = typeof item?.reference === 'string' ? item.reference.trim() : '';
    if (!reference || excluded.has(reference) || seen.has(reference)) continue;
    seen.add(reference);
    unique.push(item);
  }

  const visible = unique.slice(0, maximum);
  return { visible, hiddenCount: unique.length - visible.length, totalCount: unique.length };
}

/** Keep different evidence origins visibly separate in the first view. */
export function groupAskEvidence(evidence = []) {
  const groups = { records: [], documentDetails: [], selectedAreas: [], savedLinks: [], publicSources: [], other: [], unavailable: [] };
  for (const item of Array.isArray(evidence) ? evidence : []) {
    if (!item?.source) { groups.unavailable.push(item); continue; }
    if (['user_record', 'treatment_record', 'care_visit'].includes(item.source.kind)) groups.records.push(item);
    else if (item.source.kind === 'document_context') groups.documentDetails.push(item);
    else if (item.source.kind === 'chosen_topic') groups.selectedAreas.push(item);
    else if (item.source.kind === 'user_link') groups.savedLinks.push(item);
    else if (item.source.kind === 'external_source') groups.publicSources.push(item);
    else groups.other.push(item);
  }
  return groups;
}

/** References already represented by the dedicated policy coverage panel. */
export function coveragePanelReferences(assessments = [], sources = []) {
  const availableSources = new Set((Array.isArray(sources) ? sources : [])
    .filter((source) => typeof source?.reference === 'string')
    .map((source) => source.reference.trim())
    .filter(Boolean));
  const references = new Set();
  for (const assessment of Array.isArray(assessments) ? assessments : []) {
    if (typeof assessment?.policyReference === 'string' && assessment.policyReference.trim()) references.add(assessment.policyReference.trim());
    for (const reference of Array.isArray(assessment?.relatedHealthReferences) ? assessment.relatedHealthReferences : []) {
      if (typeof reference === 'string' && availableSources.has(reference.trim())) references.add(reference.trim());
    }
  }
  return [...references];
}
