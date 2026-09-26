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
