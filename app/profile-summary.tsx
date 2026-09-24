import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Crypto from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { Orb } from '../src/components/Orb';
import { useNura } from '../src/state/NuraContext';
import { useAIState } from '../src/state/AIStateContext';
import { AgentAnswer, AgentEvent, AgentSource, AgentTrace, runNuraAgent } from '../src/services/agentClient';

const C = { ink: '#FBF6F0', muted: 'rgba(251,246,240,.76)', soft: 'rgba(251,246,240,.56)', line: 'rgba(255,255,255,.18)', cream: '#FBF6F0', plum: '#2A203B', blue: '#A9D5FF', peach: '#E8B48F', green: '#A9D3AE' };

export default function ProfileSummary() {
  const { facts, topics, links, addAgentMessage, addFact } = useNura();
  const { dispatchRunEvent } = useAIState();
  const [consentOpen, setConsentOpen] = useState(false);
  const [revisionMode, setRevisionMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [sources, setSources] = useState<AgentSource[]>([]);
  const [trace, setTrace] = useState<AgentTrace[]>([]);
  const [error, setError] = useState('');
  const [correction, setCorrection] = useState('');
  const [savedNote, setSavedNote] = useState(false);
  const [activeRunId, setActiveRunId] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  const selectedContext = useMemo(() => ({
    facts: facts.filter((fact) => !fact.validUntil).map(({ id, label, value, date, category, source, status }) => ({ id, label, value, date, category, source, status })),
    topics: topics.map(({ id, label }) => ({ id, label })),
    links: links.map(({ id, from, to, label, createdAt }) => ({ id, from, to, label, createdAt })),
  }), [facts, topics, links]);
  const itemCount = facts.filter((fact) => !fact.validUntil).length + topics.length + links.length;
  const citedSources = useMemo(() => sources.filter((source) => answer?.citations.includes(source.reference)), [answer, sources]);

  async function createUnderstanding(revision = false) {
    if (busy) return;
    if (revision && !correction.trim()) { setError('Add a note about what you want Nura to reconsider.'); return; }
    if (revision && !savedNote) { setError('Save your correction as a new profile note before recontextualizing.'); return; }
    setConsentOpen(false); setBusy(true); setError(''); setAnswer(null); setSources([]); setTrace([]);
    const runId = Crypto.randomUUID();
    const labels = [...selectedContext.topics.map((topic) => topic.label), ...selectedContext.facts.map((fact) => fact.label)];
    const question = `${revision ? 'Re-contextualize' : 'Create a concise first-pass synthesis of'} my selected health profile. Search these selected items: ${labels.join(', ') || 'no saved health items yet'}. Keep the answer to at most 2 sentences and 45 words because citations and unknowns are shown separately. State only what the selected information supports, distinguish chosen topics from confirmed details, and say what is not known. Do not diagnose or recommend treatment.`;
    let runTrace: AgentTrace[] = [];
    let runSources: AgentSource[] = [];
    let finalAnswer: AgentAnswer | null = null;
    dispatchRunEvent('RUN_STARTED');
    try {
      await runNuraAgent({ runId, question, consentConfirmed: true, history: [], externalSearchConsent: false, treatmentContextConsent: false, visitContextConsent: false, context: { ...selectedContext, treatments: [], visits: [] } }, (event: AgentEvent) => {
        if (event.type === 'trace') {
          runTrace = [...runTrace.filter((item) => item.id !== event.id), { id: event.id, label: event.label, status: event.status, detail: event.detail }];
          setTrace(runTrace);
          if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        } else if (event.type === 'evidence') {
          runSources = event.sources;
          setSources(event.sources);
        } else if (event.type === 'answer') {
          finalAnswer = { answer: event.answer, citations: event.citations, unknowns: event.unknowns, nextSteps: event.nextSteps, coverageAssessments: event.coverageAssessments, memoryProposal: event.memoryProposal };
          setAnswer(finalAnswer);
          dispatchRunEvent('TEXT_MESSAGE_START');
        } else if (event.type === 'run_finished' && finalAnswer) {
          const savedText = [finalAnswer.answer, finalAnswer.unknowns.length ? `\n\nStill not in this profile:\n${finalAnswer.unknowns.map((item) => `• ${item}`).join('\n')}` : ''].join('');
          addAgentMessage({ runId, role: 'user', text: question, citations: [], trace: [] });
          addAgentMessage({ runId, role: 'assistant', text: savedText, citations: runSources.filter((source) => finalAnswer?.citations.includes(source.reference)), trace: runTrace.map((item) => ({ ...item, status: 'complete' })) });
          setActiveRunId(runId);
          dispatchRunEvent('RUN_FINISHED');
        } else if (event.type === 'run_error') {
          setError(event.message);
          dispatchRunEvent('RUN_ERROR');
        }
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nura could not create this profile understanding.');
      dispatchRunEvent('RUN_ERROR');
    } finally {
      setBusy(false);
    }
  }

  function saveCorrectionAsNote() {
    const value = correction.trim();
    if (!value || !activeRunId || savedNote) return;
    addFact('Profile note', value, { category: 'User-entered note', source: 'Entered by you', note: 'Added while reviewing a Nura profile synthesis; it does not replace another record.', sourceRunId: activeRunId, validFrom: new Date().toISOString(), confidence: 1, permissionScope: 'profile_write' });
    setSavedNote(true);
  }

  return <View style={s.page}>
    <LinearGradient pointerEvents="none" colors={['#57446F', '#392D51', '#211930']} locations={[0, .48, 1]} style={StyleSheet.absoluteFill} />
    <LinearGradient pointerEvents="none" colors={['rgba(235,184,151,.26)', 'rgba(235,184,151,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.warmGlow} />
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹  BACK TO YOUR PROFILE</Text></Pressable>
      <View style={s.brandRow}><Orb size={34} state={busy ? 'thinking' : 'idle'} /><View style={{ flex: 1 }}><Text style={s.brand}>nura</Text><Text style={s.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View><Text style={s.privacy}>FIRST PROFILE PASS</Text></View>
      <Text style={s.eyebrow}>YOUR 720 PROFILE · FIRST UNDERSTANDING</Text>
      <Text style={s.title}>Here’s what Nura knows so far.</Text>
      <Text style={s.intro}>A concise reading of the details and health areas you chose to include. You can question it, correct it, or add more context.</Text>

      {!answer && !busy && <View style={s.snapshot}>
        <Text style={s.snapshotTitle}>WHAT WILL BE INCLUDED</Text>
        <View style={s.countRow}><Count value={facts.length} label="SAVED DETAILS" /><Count value={topics.length} label="HEALTH AREAS" /><Count value={links.length} label="LINKS" /></View>
        {topics.length > 0 && <View style={s.topicList}>{topics.map((topic) => <View key={topic.id} style={s.topic}><View style={s.topicDot} /><Text style={s.topicText}>{topic.label}</Text><Text style={s.topicType}>YOUR FOCUS</Text></View>)}</View>}
        {itemCount === 0 && <Text style={s.emptyText}>There are no saved health details yet. Nura can still explain what the profile is for, or you can go back and choose a starting area.</Text>}
        <Text style={s.scopeNote}>Only these selected health details are sent for this answer. Your name, birthday, phone and email are not included. No public web search is used.</Text>
        <Pressable accessibilityRole="button" onPress={() => setConsentOpen(true)} style={({ pressed }) => [s.primary, pressed && s.pressed]}><Text style={s.primaryText}>CREATE MY FIRST UNDERSTANDING</Text><Text style={s.primaryArrow}>→</Text></Pressable>
      </View>}

      {busy && <View style={s.activityCard}><View style={s.activityHeading}><Orb size={28} state="thinking" /><View style={{ flex: 1 }}><Text style={s.activityTitle}>Nura is assembling the evidence.</Text><Text style={s.activitySub}>The activity below reflects live service events.</Text></View></View>{trace.map((item) => <View key={item.id} style={s.traceRow}><Text style={[s.traceMark, item.status === 'complete' && s.traceDone]}>{item.status === 'complete' ? '✓' : '·'}</Text><View style={{ flex: 1 }}><Text style={s.traceLabel}>{item.label}</Text>{item.detail ? <Text style={s.traceDetail}>{item.detail}</Text> : null}</View></View>)}</View>}

      {answer && <View style={s.resultCard}>
        <View style={s.resultHead}><Orb size={30} state="responding" /><View style={{ flex: 1 }}><Text style={s.resultEyebrow}>A FIRST PASS · REVIEWABLE</Text><Text style={s.resultTitle}>Your profile, in Nura’s words</Text></View><View style={s.reviewBadge}><Text style={s.reviewBadgeText}>YOUR REVIEW</Text></View></View>
        <Text style={s.answer}>{answer.answer}</Text>
        {citedSources.length > 0 && <View style={s.sources}><Text style={s.sectionLabel}>WHAT THIS IS BASED ON</Text>{citedSources.map((source) => <View key={source.reference} style={s.sourceRow}><Text style={s.sourceRef}>{source.reference}</Text><View style={{ flex: 1 }}><Text style={s.sourceTitle}>{source.title}</Text><Text style={s.sourceMeta}>{source.source}{source.date ? ` · ${source.date}` : ''}</Text></View></View>)}</View>}
        {answer.unknowns.length > 0 && <View style={s.unknowns}><Text style={s.sectionLabel}>WHAT NURA DOESN’T KNOW YET</Text>{answer.unknowns.map((item, index) => <Text key={`${index}-${item}`} style={s.unknownText}>•  {item}</Text>)}</View>}
        {answer.nextSteps.length > 0 && <View style={s.nextSteps}><Text style={s.sectionLabel}>POSSIBLE NEXT DETAILS</Text>{answer.nextSteps.map((item, index) => <Text key={`${index}-${item}`} style={s.unknownText}>•  {item}</Text>)}</View>}
        <Text style={s.disclaimer}>This is a summary of selected information, not a diagnosis. A chosen health area is not a confirmed condition.</Text>
        <TextInput value={correction} onChangeText={(value) => { setCorrection(value); setSavedNote(false); }} placeholder="What should Nura reconsider or remember?" placeholderTextColor={C.soft} style={s.correction} multiline accessibilityLabel="Tell Nura what to reconsider" />
        <View style={s.actions}><Pressable accessibilityRole="button" disabled={!savedNote || busy} onPress={() => { setRevisionMode(true); setConsentOpen(true); }} style={[s.secondaryAction, (!savedNote || busy) && s.disabled]}><Text style={s.secondaryText}>RECONTEXTUALIZE</Text></Pressable><Pressable accessibilityRole="button" disabled={!correction.trim() || savedNote} onPress={saveCorrectionAsNote} style={[s.noteAction, (!correction.trim() || savedNote) && s.disabled]}><Text style={s.noteText}>{savedNote ? 'NOTE ADDED' : 'ADD AS A NEW NOTE'}</Text></Pressable></View>
        <View style={s.actions}><Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/home')} style={s.confirmAction}><Text style={s.confirmText}>THIS LOOKS RIGHT · GO TO HOME</Text><Text style={s.confirmArrow}>→</Text></Pressable></View>
      </View>}

      {trace.length > 0 && !busy && <View style={s.traceCard}><Text style={s.sectionLabel}>HOW THIS SUMMARY WAS PREPARED</Text>{trace.map((item) => <View key={item.id} style={s.traceRow}><Text style={[s.traceMark, item.status === 'complete' && s.traceDone]}>{item.status === 'complete' ? '✓' : '·'}</Text><Text style={s.traceLabel}>{item.label}</Text></View>)}</View>}
      {error ? <View style={s.errorCard}><Text style={s.errorTitle}>Nura couldn’t finish this pass.</Text><Text style={s.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setConsentOpen(true)} style={s.retry}><Text style={s.retryText}>TRY AGAIN</Text></Pressable></View> : null}
      <Pressable accessibilityRole="button" onPress={() => router.push('/intake')} style={s.addRecord}><Text style={s.addRecordTitle}>ADD HEALTH RECORDS</Text><Text style={s.addRecordSub}>PDFs and images · review every suggestion</Text><Text style={s.addRecordArrow}>↗</Text></Pressable>
      <Text style={s.footer}>Preview mode uses fictional examples. Your changes stay in this browser until you clear Nura data. Please don’t enter real health or contact information.</Text>
    </ScrollView>

    <Modal transparent visible={consentOpen} animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setConsentOpen(false)}>
      <View style={[s.modalShade, Platform.OS === 'web' && s.modalShadeWeb]}><View style={[s.modal, Platform.OS === 'web' && s.modalWeb]}>
        <Text style={s.modalEyebrow}>ONE PROFILE · ONE SUMMARY</Text><Text style={s.modalTitle}>{revisionMode ? 'Revisit the updated profile?' : 'Use these selected details?'}</Text>
        <Text style={s.modalBody}>Nura will search {itemCount} selected profile item{itemCount === 1 ? '' : 's'} for this answer. The selected items include saved details, focus areas and your links. No name, phone, email, birthday or external web search is included.</Text>
        <Pressable accessibilityRole="button" onPress={() => void createUnderstanding(revisionMode)} style={s.modalPrimary}><Text style={s.modalPrimaryText}>{revisionMode ? 'I AGREE · RECONTEXTUALIZE' : 'I AGREE · CREATE SUMMARY'}</Text><Text style={s.primaryArrow}>→</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setConsentOpen(false)} style={s.modalCancel}><Text style={s.modalCancelText}>Not now</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}

function Count({ value, label }: { value: number; label: string }) {
  return <View style={s.count}><Text style={s.countValue}>{String(value).padStart(2, '0')}</Text><Text style={s.countLabel}>{label}</Text></View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#211930' }, content: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 34, paddingBottom: 42 },
  warmGlow: { position: 'absolute', top: -65, right: -100, width: 300, height: 300, borderRadius: 160 }, back: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', marginBottom: 15 }, backText: { color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 29 }, brand: { color: C.ink, fontSize: 18, fontWeight: '700', letterSpacing: -.4 }, tagline: { color: C.soft, fontSize: 9, letterSpacing: 1.4, marginTop: 2 }, privacy: { color: C.soft, fontSize: 9, fontWeight: '700', letterSpacing: 1 }, eyebrow: { color: '#D7C6E2', fontSize: 10, fontWeight: '700', letterSpacing: 1.7 }, title: { color: C.ink, fontSize: 33, lineHeight: 39, fontWeight: '300', letterSpacing: -1, marginTop: 10 }, intro: { color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 9, marginBottom: 20 },
  snapshot: { backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 15 }, snapshotTitle: { color: '#E8D9EF', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 }, countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 11 }, count: { alignItems: 'center', flex: 1 }, countValue: { color: C.ink, fontSize: 20, fontWeight: '400' }, countLabel: { color: C.soft, fontSize: 8, letterSpacing: .9, marginTop: 3 }, topicList: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 9, gap: 8 }, topic: { flexDirection: 'row', alignItems: 'center', gap: 8 }, topicDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.blue }, topicText: { color: C.ink, flex: 1, fontSize: 10 }, topicType: { color: C.soft, fontSize: 8, letterSpacing: .6 }, emptyText: { color: C.muted, fontSize: 10, lineHeight: 15, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }, scopeNote: { color: C.soft, fontSize: 10, lineHeight: 13, marginTop: 12 },
  primary: { minHeight: 51, borderRadius: 15, backgroundColor: C.cream, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, marginTop: 15 }, pressed: { opacity: .9, transform: [{ scale: .985 }] }, primaryText: { color: C.plum, fontSize: 9, fontWeight: '800', letterSpacing: .8 }, primaryArrow: { color: C.plum, fontSize: 20 },
  activityCard: { backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 15 }, activityHeading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: C.line }, activityTitle: { color: C.ink, fontSize: 12, fontWeight: '600' }, activitySub: { color: C.soft, fontSize: 10, marginTop: 3 }, traceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingTop: 10 }, traceMark: { width: 15, color: C.peach, fontSize: 11, textAlign: 'center' }, traceDone: { color: C.green }, traceLabel: { color: C.ink, fontSize: 9, flex: 1 }, traceDetail: { color: C.soft, fontSize: 10, lineHeight: 12, marginTop: 2 },
  resultCard: { backgroundColor: 'rgba(255,255,255,.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,.24)', borderRadius: 21, padding: 15 }, resultHead: { flexDirection: 'row', alignItems: 'center', gap: 8 }, resultEyebrow: { color: '#E1D0EA', fontSize: 9, fontWeight: '700', letterSpacing: 1.1 }, resultTitle: { color: C.ink, fontSize: 15, fontWeight: '600', marginTop: 3 }, reviewBadge: { borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,.07)' }, reviewBadgeText: { color: C.peach, fontSize: 8, fontWeight: '800', letterSpacing: .7 }, answer: { color: C.ink, fontSize: 14, lineHeight: 21, marginTop: 14 }, sources: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 14, paddingTop: 11, gap: 9 }, sectionLabel: { color: '#D7C6E2', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 }, sourceRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, sourceRef: { color: '#1B4F96', backgroundColor: C.blue, overflow: 'hidden', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 5, fontSize: 9, fontWeight: '800' }, sourceTitle: { color: C.ink, fontSize: 9, fontWeight: '600' }, sourceMeta: { color: C.soft, fontSize: 9, marginTop: 2 }, unknowns: { marginTop: 13, padding: 10, borderRadius: 12, backgroundColor: 'rgba(232,180,143,.10)', borderWidth: 1, borderColor: 'rgba(232,180,143,.24)', gap: 7 }, nextSteps: { marginTop: 12, gap: 6 }, unknownText: { color: C.muted, fontSize: 9, lineHeight: 14 }, disclaimer: { color: C.soft, fontSize: 10, lineHeight: 13, marginTop: 13 },
  correction: { minHeight: 66, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: 'rgba(255,255,255,.07)', padding: 11, color: C.ink, fontSize: 10, lineHeight: 15, marginTop: 13, textAlignVertical: 'top' }, actions: { flexDirection: 'row', gap: 8, marginTop: 9 }, secondaryAction: { flex: 1, minHeight: 43, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: C.ink, fontSize: 9, fontWeight: '700', letterSpacing: .6 }, noteAction: { flex: 1, minHeight: 43, borderRadius: 12, backgroundColor: 'rgba(169,211,174,.2)', borderWidth: 1, borderColor: 'rgba(169,211,174,.36)', alignItems: 'center', justifyContent: 'center' }, noteText: { color: '#D6EAD8', fontSize: 9, fontWeight: '700', letterSpacing: .5 }, disabled: { opacity: .42 }, confirmAction: { flex: 1, minHeight: 49, borderRadius: 14, backgroundColor: C.cream, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, confirmText: { color: C.plum, fontSize: 10, fontWeight: '800', letterSpacing: .4 }, confirmArrow: { color: C.plum, fontSize: 18 },
  traceCard: { marginTop: 14, padding: 13, backgroundColor: 'rgba(255,255,255,.05)', borderRadius: 14, borderWidth: 1, borderColor: C.line }, errorCard: { backgroundColor: 'rgba(120,47,53,.2)', borderColor: 'rgba(240,165,159,.5)', borderWidth: 1, borderRadius: 15, padding: 13, marginTop: 13 }, errorTitle: { color: C.ink, fontSize: 11, fontWeight: '700' }, errorText: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 5 }, retry: { alignSelf: 'flex-start', padding: 8, marginTop: 3 }, retryText: { color: C.ink, fontSize: 10, fontWeight: '700', letterSpacing: .8 }, addRecord: { minHeight: 55, borderRadius: 14, backgroundColor: '#1265E9', paddingHorizontal: 13, paddingVertical: 8, marginTop: 16, justifyContent: 'center' }, addRecordTitle: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: .9 }, addRecordSub: { color: 'rgba(255,255,255,.8)', fontSize: 10, marginTop: 3 }, addRecordArrow: { position: 'absolute', right: 14, color: '#FFFFFF', fontSize: 20 }, footer: { color: C.soft, fontSize: 9, lineHeight: 11, textAlign: 'center', marginTop: 12 },
  modalShade: { flex: 1, backgroundColor: 'rgba(16,12,23,.68)', justifyContent: 'flex-end' }, modalShadeWeb: { justifyContent: 'center', alignItems: 'center', padding: 12 }, modal: { backgroundColor: '#30263C', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.line, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 29 }, modalWeb: { width: '100%', maxWidth: 390, alignSelf: 'center', borderRadius: 24 }, modalEyebrow: { color: '#D7C6E2', fontSize: 9, fontWeight: '800', letterSpacing: 1.4 }, modalTitle: { color: C.ink, fontSize: 21, fontWeight: '400', marginTop: 7 }, modalBody: { color: C.muted, fontSize: 10, lineHeight: 16, marginTop: 8 }, modalPrimary: { minHeight: 50, backgroundColor: C.cream, borderRadius: 14, paddingHorizontal: 14, marginTop: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, modalPrimaryText: { color: C.plum, fontSize: 10, fontWeight: '800', letterSpacing: .8 }, modalCancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 3 }, modalCancelText: { color: C.muted, fontSize: 10 },
});
