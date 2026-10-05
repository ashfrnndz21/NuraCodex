import test from 'node:test';
import assert from 'node:assert/strict';
import { compactFeedBrief, feedCardCopy, isFeedItemFromLocalDay, summarizeFeedActivity } from './feedPresentation.mjs';
import { personalizeFeedItem, selectFeedPersonalContext } from './feedPersonalization.mjs';
import { getYouTubeEmbedUrl, getYouTubeThumbnailCandidates, getYouTubeThumbnailUrl, getYouTubeVideoId, isYouTubeThumbnailUrl } from './youtubeVideo.mjs';

test('compact feed brief shows a short overview and omits the generated text dump by default', () => {
  const full = 'Blood pressure: brief health education - Blood pressure is the force of blood against artery walls. The top number is systolic pressure and the bottom number is diastolic pressure. It is reported in millimeters of mercury. Adults have several categories. Home readings should be discussed with a health professional.';
  const preview = compactFeedBrief(full, 'Blood pressure');
  assert.match(preview, /^Blood pressure is the force/);
  assert.match(preview, /diastolic pressure\./);
  assert.doesNotMatch(preview, /Adults have several categories/);
});

test('compact feed brief bounds a very long first point at a whole word', () => {
  const long = `A detailed overview ${'with supporting context '.repeat(50)}and a final point.`;
  const preview = compactFeedBrief(long, '', 80);
  assert.ok(preview.length <= 81);
  assert.match(preview, /…$/);
  assert.doesNotMatch(preview, /\s$/);
});

test('unpersonalized feed cards use the publisher headline and source summary, not template copy', () => {
  const copy = feedCardCopy({
    title: 'What food has to do with cholesterol',
    detail: 'Learn how foods containing saturated fat can affect cholesterol levels.',
  }, { summary: 'A broader cholesterol overview.' }, undefined);
  assert.deepEqual(copy, {
    headline: 'What food has to do with cholesterol',
    headlineLabel: 'PUBLISHED HEADLINE',
    takeaway: 'Learn how foods containing saturated fat can affect cholesterol levels.',
    takeawayLabel: 'SOURCE SUMMARY',
    personalized: false,
  });
});

test('feed cards label generated copy as Nura personalization only when a model note exists', () => {
  const copy = feedCardCopy({ title: 'Cholesterol', detail: 'Published summary.' }, undefined, {
    headline: 'Why LDL and HDL matter for your lipid panel',
    learnFromSource: 'This video explains how the two measures differ and what to ask about at your next review.',
  });
  assert.equal(copy.headline, 'Why LDL and HDL matter for your lipid panel');
  assert.equal(copy.headlineLabel, 'NURA’S PERSONALIZED NOTE');
  assert.equal(copy.takeaway, 'This video explains how the two measures differ and what to ask about at your next review.');
  assert.equal(copy.takeawayLabel, 'LEARN FROM THIS SOURCE');
  assert.equal(copy.personalized, true);
});

test('feed activity names each selected topic and describes the actual service state', () => {
  const rows = summarizeFeedActivity([
    { id: 'bp', label: 'Searching trusted health sources', status: 'complete', detail: 'Found 3 articles · 2 videos for Blood pressure' },
    { id: 'sleep', label: 'Searching trusted health sources', status: 'started', detail: 'Selected area: Sleep' },
    { id: 'family', label: 'Searching trusted health sources', status: 'failed', detail: 'Search failed for Family history — No trusted videos found.' },
    { id: 'ldl', label: 'Searching trusted health sources', status: 'failed', detail: 'Found 3 articles · 0 videos for LDL and HDL · YouTube video search is unavailable.' },
  ]);
  assert.deepEqual(rows.map(({ topic, detail, status }) => ({ topic, detail, status })), [
    { topic: 'Blood pressure', detail: '3 articles · 2 videos', status: 'complete' },
    { topic: 'Sleep', detail: 'Checking trusted sources', status: 'started' },
    { topic: 'Family history', detail: 'No trusted videos found.', status: 'failed' },
    { topic: 'LDL and HDL', detail: '3 articles · 0 videos · YouTube video search is unavailable.', status: 'failed' },
  ]);
});

test('daily feed inclusion compares retrieval timestamps in the local calendar day', () => {
  const today = new Date(2026, 8, 29, 10, 0, 0);
  const sameLocalDay = new Date(2026, 8, 29, 1, 0, 0).toISOString();
  const previousDay = new Date(2026, 8, 28, 23, 59, 0).toISOString();
  assert.equal(isFeedItemFromLocalDay(sameLocalDay, today), true);
  assert.equal(isFeedItemFromLocalDay(previousDay, today), false);
  assert.equal(isFeedItemFromLocalDay('not-a-date', today), false);
});

test('recognizes standard YouTube video links for an unmodified linked thumbnail', () => {
  assert.equal(getYouTubeVideoId('https://www.youtube.com/watch?v=abcDEF123_-'), 'abcDEF123_-');
  assert.equal(getYouTubeVideoId('https://youtu.be/abcDEF123_-?si=share'), 'abcDEF123_-');
  assert.equal(getYouTubeVideoId('https://www.youtube.com/shorts/abcDEF123_-'), 'abcDEF123_-');
  assert.equal(getYouTubeThumbnailUrl('https://www.youtube.com/embed/abcDEF123_-'), 'https://i.ytimg.com/vi/abcDEF123_-/hqdefault.jpg');
  assert.deepEqual(getYouTubeThumbnailCandidates('https://www.youtube.com/watch?v=abcDEF123_-'), [
    'https://i.ytimg.com/vi/abcDEF123_-/hqdefault.jpg',
    'https://i.ytimg.com/vi/abcDEF123_-/maxresdefault.jpg',
    'https://i.ytimg.com/vi/abcDEF123_-/mqdefault.jpg',
    'https://i.ytimg.com/vi/abcDEF123_-/default.jpg',
  ]);
  assert.equal(isYouTubeThumbnailUrl('https://i.ytimg.com/vi/abcDEF123_-/hqdefault.jpg'), true);
  assert.equal(isYouTubeThumbnailUrl('https://example.com/hqdefault.jpg'), false);
});

test('opens a validated YouTube result in an in-app player that starts after the user taps play', () => {
  assert.equal(getYouTubeEmbedUrl('abcDEF123_-'), 'https://www.youtube-nocookie.com/embed/abcDEF123_-?autoplay=1&playsinline=1&rel=0');
  assert.equal(getYouTubeEmbedUrl('not-a-video-id'), null);
});

test('does not treat another host or an invalid ID as a YouTube source', () => {
  assert.equal(getYouTubeVideoId('https://example.com/watch?v=abcDEF123_-'), null);
  assert.equal(getYouTubeVideoId('https://www.youtube.com/watch?v=short'), null);
  assert.equal(getYouTubeThumbnailUrl('https://example.com/watch?v=abcDEF123_-'), null);
  assert.deepEqual(getYouTubeThumbnailCandidates('https://example.com/watch?v=abcDEF123_-'), []);
});

test('personalizes a feed card only from an accepted saved fact while preserving source framing', () => {
  const item = { topic: 'Cholesterol', url: 'https://medlineplus.gov/cholesterol', title: 'Cholesterol overview' };
  const fact = { label: 'LDL cholesterol', category: 'Lab results', value: '93 mg/dL', status: 'reviewed', reviewState: 'user_confirmed' };
  const presentation = personalizeFeedItem(item, [fact]);
  assert.equal(presentation.headline, 'Your LDL result, in context');
  assert.match(presentation.benefit, /in light of your saved LDL cholesterol result/);
  assert.match(presentation.benefit, /does not interpret your result/);
  assert.doesNotMatch(presentation.benefit, /93 mg\/dL/);
});

test('selects only a few matched, user-confirmed details for explicitly consented feed notes', () => {
  const item = { topic: 'Cholesterol', title: 'LDL cholesterol and heart health', detail: 'LDL cholesterol is measured in a lipid panel.' };
  const selected = selectFeedPersonalContext(item, [
    { label: 'LDL cholesterol', category: 'Lab results', value: '93 mg/dL', date: '2026-09-10', status: 'reviewed', reviewState: 'user_confirmed' },
    { label: 'HDL cholesterol', category: 'Lab results', value: '49 mg/dL', status: 'confirmed', reviewState: 'user_confirmed' },
    { label: 'Phone', category: 'Profile', value: '+1 555 123 4567', status: 'confirmed', reviewState: 'user_confirmed' },
    { label: 'Unreviewed LDL', category: 'Lab results', value: '999 mg/dL', status: 'reviewed', reviewState: 'candidate' },
  ], [
    { name: 'Ezetimibe', purpose: 'Cholesterol', status: 'current', dose: '10 mg', prescriber: 'Dr Sample' },
    { name: 'Old medicine', status: 'past' },
  ]);
  assert.deepEqual(selected, {
    facts: [
      { label: 'LDL cholesterol', value: '93 mg/dL', date: '2026-09-10' },
      { label: 'HDL cholesterol', value: '49 mg/dL', date: '' },
    ],
    treatments: [{ name: 'Ezetimibe', purpose: 'Cholesterol' }],
  });
});

test('uses a concise benefit drawn from source-specific details when available', () => {
  const detail = 'The source explains how LDL cholesterol is measured and how it differs from HDL.';
  const presentation = personalizeFeedItem({ topic: 'Cholesterol', url: 'https://medlineplus.gov/cholesterol', detail }, [
    { label: 'LDL cholesterol', category: 'Lab results', status: 'reviewed', reviewState: 'user_confirmed' },
  ]);
  assert.match(presentation.benefit, /how LDL and HDL differ/);
  assert.match(presentation.benefit, /does not interpret your result/);
});

test('does not personalize from unreviewed or superseded details', () => {
  const item = { topic: 'Cholesterol', url: 'https://example.org/article' };
  const presentation = personalizeFeedItem(item, [
    { label: 'LDL cholesterol', category: 'Lab results', status: 'reviewed', reviewState: 'candidate' },
    { label: 'HDL cholesterol', category: 'Lab results', status: 'reviewed', reviewState: 'user_confirmed', validUntil: '2026-09-01' },
  ]);
  assert.equal(presentation.relatedFactLabel, null);
  assert.equal(presentation.headline, 'Cholesterol, explained in plain language');
  assert.match(presentation.benefit, /For your cholesterol focus/i);
});

test('gives marker-specific headlines when the selected focus is a lab marker', () => {
  const presentation = personalizeFeedItem({ topic: 'LDL and HDL', title: 'Ldl And Hdl Cholesterol And Triglycerides' }, []);
  assert.equal(presentation.headline, 'LDL, HDL and triglycerides: how they differ');
  const medication = personalizeFeedItem({ topic: 'Medicine · Ezetimibe' }, []);
  assert.equal(medication.headline, 'Ezetimibe: what to know');
});

test('uses the specific result instead of a broad-topic note as a personalized headline', () => {
  const presentation = personalizeFeedItem({
    topic: 'Cholesterol',
    title: 'Synthetic reading · cholesterol overview',
    detail: 'Synthetic acceptance item for the saved reading journey.',
  }, [
    { label: 'Cholesterol · your note', category: 'Cholesterol', status: 'reviewed', reviewState: 'user_confirmed', source: 'Written by you', date: '2026-09-30' },
    { label: 'LDL cholesterol', category: 'Lab results', value: '99 mg/dL', status: 'reviewed', reviewState: 'user_confirmed', date: '2026-09-29' },
  ], [
    { name: 'Atorvastatin', status: 'current' },
  ]);

  assert.equal(presentation.headline, 'Your LDL result, in context');
  assert.equal(presentation.relatedFactLabel, 'LDL cholesterol');
  assert.match(presentation.benefit, /your saved LDL cholesterol result/);
  assert.doesNotMatch(presentation.benefit, /your note|Cholesterol ·|99 mg\/dL/);
});

test('uses source-supported angles to make related cholesterol headlines distinct', () => {
  const questions = personalizeFeedItem({ topic: 'Cholesterol', title: 'Questions About Cholesterol: Answers to Common Questions' }, []);
  const testing = personalizeFeedItem({ topic: 'Cholesterol', title: 'What a cholesterol test measures' }, []);
  const savedLDL = personalizeFeedItem({ topic: 'Cholesterol', title: 'Plaque in the arteries', detail: 'LDL cholesterol can contribute to plaque buildup.' }, [
    { label: 'LDL cholesterol', category: 'Lab results', status: 'reviewed', reviewState: 'user_confirmed' },
  ]);
  assert.equal(questions.headline, 'Cholesterol questions, answered');
  assert.equal(testing.headline, 'What a cholesterol test can tell you');
  assert.equal(savedLDL.headline, 'How LDL relates to artery health');
});

test('gives generic source cards a useful, source-aware headline and clear reader takeaway', () => {
  const information = personalizeFeedItem({ topic: 'Cholesterol', title: 'Cholesterol health information' }, []);
  const tools = personalizeFeedItem({ topic: 'Cholesterol', title: 'Cholesterol Tools And Resources' }, []);
  assert.equal(information.headline, 'Cholesterol, explained in plain language');
  assert.equal(tools.headline, 'A practical place to start with cholesterol');
  assert.match(information.benefit, /For your cholesterol focus/i);
  assert.match(tools.benefit, /For your cholesterol focus/i);
});

test('connects a relevant saved marker to reading context without exposing its stored number', () => {
  const presentation = personalizeFeedItem({ topic: 'Cholesterol', title: 'Cholesterol health information' }, [
    { label: 'LDL cholesterol', value: '93 mg/dL', category: 'Lab results', status: 'reviewed', reviewState: 'user_confirmed' },
  ]);
  assert.equal(presentation.headline, 'Your LDL result, in context');
  assert.match(presentation.benefit, /in light of your saved LDL cholesterol result/);
  assert.doesNotMatch(presentation.benefit, /93 mg\/dL/);
});

test('writes a personal takeaway from multiple confirmed health signals and current treatment', () => {
  const item = {
    topic: 'Cholesterol',
    title: 'LDL, HDL and heart health',
    detail: 'This explainer compares LDL and HDL, discusses shortness of breath and heart health, and explains atorvastatin treatment terms.',
  };
  const presentation = personalizeFeedItem(item, [
    { label: 'LDL cholesterol', category: 'Lab results', status: 'reviewed', reviewState: 'user_confirmed' },
    { label: 'Shortness of breath', category: 'Symptoms', status: 'confirmed', reviewState: 'user_confirmed' },
    { label: 'Family history', category: 'History', status: 'candidate', reviewState: 'candidate' },
  ], [
    { name: 'Atorvastatin', status: 'current', dose: '20 mg' },
    { name: 'Old medicine', status: 'past' },
  ]);
  assert.match(presentation.benefit, /saved health details about Shortness of breath and LDL cholesterol/);
  assert.match(presentation.benefit, /plus your current Atorvastatin record/);
  assert.match(presentation.benefit, /how LDL and HDL differ/);
  assert.match(presentation.benefit, /does not explain the cause of your symptom/);
  assert.match(presentation.benefit, /does not assess your medicine or suggest changes/);
  assert.doesNotMatch(presentation.benefit, /20 mg|Old medicine|Family history/);
});

test('personalizes only when a current medicine is named in the source or the selected medicine topic', () => {
  const item = { topic: 'Cholesterol', title: 'Cholesterol overview', detail: 'A general overview of cholesterol.' };
  const treatment = { name: 'Atorvastatin', status: 'current' };
  assert.doesNotMatch(personalizeFeedItem(item, [], [treatment]).benefit, /Atorvastatin/);
  const medicineSource = personalizeFeedItem({ ...item, detail: 'This source explains atorvastatin and statin treatment.' }, [], [treatment]);
  assert.match(medicineSource.benefit, /current Atorvastatin record/);
  assert.match(medicineSource.benefit, /does not assess your medicine or suggest changes/);
});

test('uses a concise learning goal instead of repeating source excerpts or boilerplate', () => {
  const item = {
    topic: 'LDL and HDL',
    title: 'What to know about cholesterol',
    detail: 'There are two types of cholesterol: LDL cholesterol, which is bad, and HDL, which is good. Learn why too much cholesterol can affect your health.',
  };
  const presentation = personalizeFeedItem(item, []);
  assert.match(presentation.benefit, /For your LDL and HDL focus/);
  assert.match(presentation.benefit, /how LDL and HDL differ and what their roles are/);
  assert.doesNotMatch(presentation.benefit, /There are two types of cholesterol/);
  assert.doesNotMatch(presentation.benefit, /This is general education, not a personal assessment/);
});

test('does not introduce cholesterol details into an unrelated topic takeaway', () => {
  const presentation = personalizeFeedItem({ topic: 'Sleep', title: 'Two types of sleep problems', detail: 'Learn the differences between sleep onset and sleep maintenance insomnia.' }, []);
  assert.match(presentation.benefit, /basics of sleep/);
  assert.doesNotMatch(presentation.benefit, /LDL|HDL|cholesterol/);
});
