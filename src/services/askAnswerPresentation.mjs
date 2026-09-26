/** Return a readable first view for long answers without changing the stored answer. */
export function answerFirstView(answer, maxCharacters = 360) {
  const text = String(answer ?? '');
  const limit = Math.max(120, Math.floor(Number(maxCharacters) || 720));
  if (text.length <= limit) return { text, expandable: false };

  const sample = text.slice(0, limit + 1);
  const sentenceEnds = [...sample.matchAll(/[.!?](?:[”’"')\]]*)?(?=\s|$)/g)];
  const minimumSentenceEnd = Math.floor(limit * 0.35);
  const sentenceEnd = sentenceEnds
    .map((match) => (match.index ?? 0) + match[0].length)
    .filter((end) => end >= minimumSentenceEnd && end <= limit)
    .at(-1);
  const wordEnd = sample.lastIndexOf(' ', limit);
  const end = sentenceEnd ?? (wordEnd > minimumSentenceEnd ? wordEnd : limit);

  return { text: text.slice(0, end).trimEnd(), expandable: true };
}
