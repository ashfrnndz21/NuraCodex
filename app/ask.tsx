import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, LayoutAnimation, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as Crypto from 'expo-crypto';
import { Orb } from '../src/components/Orb';
import { AgentAnswer, AgentEvent, AgentRunInput, AgentSource, AgentTrace, CoverageAssessment, getAgentStatus, runNuraAgent } from '../src/services/agentClient';
import { getSourceClaims, sourceMatchesAsset } from '../src/services/intakeClient';
import { useNura } from '../src/state/NuraContext';
import { useAIState } from '../src/state/AIStateContext';
import { motion } from '../src/theme';
import { scopeProfileContext } from '../src/services/agentContextScope.mjs';
import { registryBriefCitations, registryBriefDisplayText } from '../src/services/registryBrief.mjs';

const C = {
  bg: '#241A32',
  ink: '#FFF9F3',
  muted: '#D8CDDF',
  faint: '#B7A9C2',
  line: 'rgba(255, 249, 246, 0.20)',
  white: '#FFF9F3',
  surface: 'rgba(255, 249, 246, 0.10)',
  surfaceRaised: 'rgba(255, 249, 246, 0.16)',
  surfaceDeep: 'rgba(39, 29, 51, 0.96)',
  plum: '#F0C2AE',
  plumInk: '#35243F',
  blue: '#B7D0FF',
  blueInk: '#263B67',
  bluePale: 'rgba(81, 131, 219, 0.20)',
  lilac: 'rgba(190, 159, 220, 0.18)',
  amber: 'rgba(226, 164, 82, 0.18)',
  amberInk: '#FFD797',
  green: 'rgba(100, 181, 139, 0.20)',
  mint: '#BCE8D0',
  peach: '#F2BFA5',
};
export default function Ask() {
  const params = useLocalSearchParams<{ context?: string; recordId?: string; question?: string; registryBriefTopicId?: string; registryBriefTopicLabel?: string; registrySourceSignature?: string }>();
  const { facts, topics, links, treatments, visits, assets, agentMessages, addAgentMessage, saveRegistryBrief, clearAgentMessages, addQuestion, addFact } = useNura();
  const recordId = typeof params.recordId === 'string' ? params.recordId : null;
  const fileContext = recordId?.startsWith('asset:') ?? false;
  const selectedAsset = fileContext ? assets.find((asset) => `asset:${asset.id}` === recordId) ?? null : null;
  const registryBriefTopicId = typeof params.registryBriefTopicId === 'string' ? params.registryBriefTopicId : '';
  const registryBriefTopic = topics.find((topic) => topic.id === registryBriefTopicId);
  const registrySourceSignature = typeof params.registrySourceSignature === 'string' ? params.registrySourceSignature : '';
  const registryBriefMode = Boolean(registryBriefTopic && recordId === `topic:${registryBriefTopicId}` && /^[a-f0-9]{64}$/i.test(registrySourceSignature));
  const { state: aiState, dispatchRunEvent, setComposerFocused } = useAIState();
  const [question, setQuestion] = useState('');
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [sources, setSources] = useState<AgentSource[]>([]);
  const [trace, setTrace] = useState<AgentTrace[]>([]);
  const [error, setError] = useState('');
  const [service, setService] = useState<{ available: boolean; provider?: string; model?: string; reason?: string; capabilities?: { documentExtraction?: boolean; trustedHealthSearch?: boolean } } | null>(null);
  const [proposalSaved, setProposalSaved] = useState(false);
  const [registryBriefSaved, setRegistryBriefSaved] = useState(false);
  const [registryBriefSaving, setRegistryBriefSaving] = useState(false);
  const [registryBriefSaveError, setRegistryBriefSaveError] = useState('');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ambientShift] = useState(() => new Animated.Value(0));
  const [sendScale] = useState(() => new Animated.Value(1));
  const [shareFacts, setShareFacts] = useState(true);
  const [shareTopics, setShareTopics] = useState(true);
  const [shareLinks, setShareLinks] = useState(true);
  const [shareHistory, setShareHistory] = useState(!registryBriefMode);
  const [shareTreatments, setShareTreatments] = useState(false);
  const [shareVisits, setShareVisits] = useState(false);
  const [shareSourceContext, setShareSourceContext] = useState<boolean | null>(null);
  const [shareExternalSearch, setShareExternalSearch] = useState(false);
  const [sourceContextSnapshot, setSourceContextSnapshot] = useState<{ key: string; documents: NonNullable<AgentRunInput['context']['documentSources']> }>({ key: '', documents: [] });
  const initialQuestionSet = useRef(false);
  const context = typeof params.context === 'string' ? params.context : 'your saved health profile';
  const initialQuestion = typeof params.question === 'string' ? params.question : '';
  const coverageQuestion = /\b(insurance|policy|coverage|covered|copay|deductible|benefit|claim)\b/i.test(question);
  const personalContext = useMemo(() => ({
    facts: facts.filter((fact) => !fact.validUntil).map(({ id, label, value, date, category, source, status, sourceId }) => ({ id, label, value, date, category, source, status, sourceId })),
    topics: topics.map(({ id, label }) => ({ id, label })),
    links: links.map(({ id, from, to, relationType, label, createdAt }) => ({ id, from, to, relationType, label, createdAt })),
    treatments: treatments.map(({ id, name, dose, schedule, purpose, prescriber, careLocation, pharmacy, status, startedOn, endedOn, source }) => ({ id, name, dose, schedule, purpose, prescriber, careLocation, pharmacy, status, startedOn, endedOn: endedOn ?? '', source })),
    visits: visits.map(({ id, purpose, appointmentAt, clinician, location, status, source, questions, outcome, followUp, followUpActions }) => ({ id, purpose, appointmentAt, clinician, location, status, source, questions: [...questions], outcome, followUp, followUpActions: (followUpActions ?? []).map(({ id: actionId, title, dueOn, status: actionStatus, source: actionSource }) => ({ id: actionId, title, dueOn, status: actionStatus, source: actionSource })) })),
  }), [facts, topics, links, treatments, visits]);
  const historyForConsent = agentMessages.slice(-8);
  const scopedContext = useMemo(() => {
    const scoped = scopeProfileContext(personalContext, recordId);
    if (!fileContext || !selectedAsset?.serverSourceId) return scoped;
    return { ...scoped, facts: personalContext.facts.filter((fact) => fact.sourceId === selectedAsset.serverSourceId) };
  }, [personalContext, recordId, fileContext, selectedAsset]);
  const sourceAssets = useMemo(() => {
    const sourceIds = new Set(scopedContext.facts.map((fact) => fact.sourceId).filter((id): id is string => Boolean(id)));
    if (selectedAsset?.serverSourceId) sourceIds.add(selectedAsset.serverSourceId);
    return assets.filter((asset) => Boolean(asset.serverSourceId && sourceIds.has(asset.serverSourceId))).slice(0, 5);
  }, [assets, scopedContext.facts, selectedAsset]);
  const sourceContextKey = sourceAssets.map((asset) => `${asset.id}:${asset.serverSourceId}`).join('|');
  const linkedDocumentContexts = sourceContextSnapshot.key === sourceContextKey ? sourceContextSnapshot.documents : [];
  const sourceContextLoading = sourceAssets.length > 0 && sourceContextSnapshot.key !== sourceContextKey;
  const sourceContextSelected = shareSourceContext ?? fileContext;
  const selectedHistory = registryBriefMode ? [] : shareHistory ? historyForConsent.map((message) => ({ role: message.role, content: message.text })) : [];
  const selectedContext = { facts: shareFacts ? scopedContext.facts : [], topics: shareTopics ? scopedContext.topics : [], links: shareLinks ? scopedContext.links : [] };

  useEffect(() => {
    let mounted = true;
    void getAgentStatus().then((status) => { if (mounted) setService(status); });
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    let active = true;
    if (!sourceAssets.length) return () => { active = false; };
    void Promise.all(sourceAssets.map(async (asset) => {
      if (!asset.serverSourceId) return null;
      try {
        const result = await getSourceClaims(asset.serverSourceId);
        if (!await sourceMatchesAsset(asset, result.source) || !result.source.documentContext) return null;
        const context = result.source.documentContext;
        const normalizeEntries = (entries: typeof context.dates) => entries.map((entry) => ({ ...entry, quote: entry.quote ?? '' }));
        return {
          id: result.source.id,
          title: result.source.displayName,
          documentType: context.documentType ?? '',
          dates: normalizeEntries(context.dates),
          entities: normalizeEntries(context.entities),
          notes: normalizeEntries(context.notes),
        };
      } catch {
        return null;
      }
    })).then((documents) => {
      if (active) setSourceContextSnapshot({ key: sourceContextKey, documents: documents.filter((document): document is NonNullable<typeof document> => Boolean(document)) });
    });
    return () => { active = false; };
  }, [sourceAssets, sourceContextKey]);
  useEffect(() => {
    if (reducedMotion) {
      ambientShift.stopAnimation();
      ambientShift.setValue(0);
      return;
    }
    const drift = Animated.loop(Animated.sequence([
      Animated.timing(ambientShift, { toValue: 1, duration: 18000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(ambientShift, { toValue: 0, duration: 18000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    drift.start();
    return () => drift.stop();
  }, [ambientShift, reducedMotion]);
  useEffect(() => { if (initialQuestion && !initialQuestionSet.current) { initialQuestionSet.current = true; setQuestion(initialQuestion); } }, [initialQuestion]);
  function startQuestion() { if (!question.trim() || busy) return; setError(''); setShareExternalSearch(false); setShareTreatments(false); setShareVisits(false); setConsentOpen(true); }
  function animateSend(toValue: number) {
    if (reducedMotion || busy || !question.trim()) return;
    Animated.timing(sendScale, { toValue, duration: toValue === 1 ? motion.pressOut : motion.pressIn, easing: toValue === 1 ? Easing.bezier(...motion.easing.bouncy) : Easing.linear, useNativeDriver: true }).start();
  }
  async function confirmAndSend() {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || busy) return;
    setConsentOpen(false);
    setQuestion('');
    setAnswer(null); setSources([]); setTrace([]); setError(''); setProposalSaved(false); setRegistryBriefSaved(false); setRegistryBriefSaveError(''); setBusy(true);
    const runId = Crypto.randomUUID();
    setActiveRunId(runId);
    const userMessage = { runId, role: 'user' as const, text: cleanQuestion, citations: [], trace: [] };
    addAgentMessage(userMessage);
    addQuestion(cleanQuestion);
    dispatchRunEvent('RUN_STARTED');
    let runTrace: AgentTrace[] = [];
    let runSources: AgentSource[] = [];
    let finalAnswer: AgentAnswer | null = null;
    const previous = selectedHistory;
    try {
      await runNuraAgent({ runId, question: cleanQuestion, consentConfirmed: true, history: previous, externalSearchConsent: shareExternalSearch && !coverageQuestion, treatmentContextConsent: shareTreatments, visitContextConsent: shareVisits, sourceContextConsent: sourceContextSelected && linkedDocumentContexts.length > 0, context: { ...selectedContext, treatments: shareTreatments ? scopedContext.treatments : [], visits: shareVisits ? scopedContext.visits : [], documentSources: sourceContextSelected ? linkedDocumentContexts : [] } }, (event: AgentEvent) => {
        if (event.type === 'trace') {
          const item = { id: event.id, label: event.label, status: event.status, detail: event.detail };
          runTrace = [...runTrace.filter((existing) => existing.id !== event.id), item];
          setTrace(runTrace);
          if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        } else if (event.type === 'evidence') {
          runSources = event.sources;
          setSources(event.sources);
        } else if (event.type === 'answer') {
          finalAnswer = { answer: event.answer, citations: event.citations, unknowns: event.unknowns, nextSteps: event.nextSteps, coverageAssessments: event.coverageAssessments, memoryProposal: event.memoryProposal };
          setAnswer(finalAnswer);
          dispatchRunEvent('TEXT_MESSAGE_START');
        } else if (event.type === 'run_finished') {
          if (finalAnswer) {
            const cited = runSources.filter((source) => finalAnswer?.citations.includes(source.reference));
            addAgentMessage({ runId, role: 'assistant', text: finalAnswer.answer, citations: cited, trace: runTrace.map((item) => ({ ...item, status: 'complete' })), coverageAssessments: finalAnswer.coverageAssessments });
          }
          dispatchRunEvent('RUN_FINISHED');
        } else if (event.type === 'run_error') {
          setError(event.message);
          dispatchRunEvent('RUN_ERROR');
        }
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Nura could not complete this answer.';
      setError(message);
      dispatchRunEvent('RUN_ERROR');
    } finally {
      setBusy(false);
      const status = await getAgentStatus();
      setService(status);
    }
  }
  function acceptMemoryProposal() {
    if (!answer?.memoryProposal || proposalSaved || !activeRunId) return;
    addFact(answer.memoryProposal.label, answer.memoryProposal.value, { category: 'User-approved memory', source: 'Nura suggestion · confirmed by you', note: answer.memoryProposal.reason || 'Suggested in an Ask Nura conversation and approved by you.', sourceRunId: activeRunId, reviewState: 'user_confirmed', validFrom: new Date().toISOString(), validUntil: null, confidence: null, permissionScope: 'profile_memory_write' });
    setProposalSaved(true);
  }
  async function saveRegistrySummary() {
    if (!registryBriefMode || !registryBriefTopic || !answer || !activeRunId || busy || registryBriefSaved || registryBriefSaving) return;
    const citations = registryBriefCitations(answer, sources);
    if (citations.length === 0) { setRegistryBriefSaveError('This answer has no source references that can be saved to the Medical Registry.'); return; }
    setRegistryBriefSaving(true); setRegistryBriefSaveError('');
    try {
      await saveRegistryBrief({ topicId: registryBriefTopic.id, topicLabel: registryBriefTopic.label, answer: answer.answer, unknowns: answer.unknowns, citations, sourceSignature: registrySourceSignature, runId: activeRunId });
      setRegistryBriefSaved(true);
    } catch (caught) {
      setRegistryBriefSaveError(caught instanceof Error ? caught.message : 'Nura could not save this summary. Your answer is still available above.');
    } finally { setRegistryBriefSaving(false); }
  }

  const warmX = ambientShift.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });
  const warmY = ambientShift.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  const lilacX = ambientShift.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  const lilacY = ambientShift.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });

  return <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <StatusBar style="light" />
    <LinearGradient pointerEvents="none" colors={['#A27B8E', '#755B7B', '#4B3C69', '#372B52', '#1F1731']} locations={[0, 0.14, 0.34, 0.58, 1]} start={{ x: 1, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
    <Animated.View pointerEvents="none" style={[s.warmLight, { transform: [{ translateX: warmX }, { translateY: warmY }] }]}>
      <LinearGradient colors={['rgba(242, 191, 165, 0.36)', 'rgba(242, 191, 165, 0.12)', 'rgba(242, 191, 165, 0)']} locations={[0, 0.4, 1]} start={{ x: 0.7, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
    <Animated.View pointerEvents="none" style={[s.lilacLight, { transform: [{ translateX: lilacX }, { translateY: lilacY }] }]}>
      <LinearGradient colors={['rgba(190, 159, 220, 0.25)', 'rgba(190, 159, 220, 0.08)', 'rgba(190, 159, 220, 0)']} locations={[0, 0.42, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
    <View style={s.header}><Pressable accessibilityLabel="Close Ask Nura" style={s.close} onPress={() => router.back()}><Text style={s.closeText}>⌄</Text></Pressable><View style={s.headerMain}><Orb size={45} /><View style={{ flex: 1 }}><Text style={s.brand}>Ask Nura</Text><Text style={s.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View><Pressable onPress={() => { if (!busy && agentMessages.length) { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); clearAgentMessages(); setAnswer(null); setTrace([]); setError(''); } }} disabled={busy || !agentMessages.length} style={s.clear}><Text style={[s.clearText, (!agentMessages.length || busy) && s.disabledText]}>Clear</Text></Pressable></View></View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={s.contextLine}>{registryBriefMode ? <>Preparing a source-linked Registry summary for <Text style={s.contextStrong}>{registryBriefTopic?.label}</Text> · chat history excluded</> : <>Looking at <Text style={s.contextStrong}>{context}</Text></>}</Text>
      <View style={[s.serviceCard, service?.available ? s.serviceReady : s.serviceOffline]}><View style={[s.serviceDot, service?.available && s.serviceDotReady]} /><View style={{ flex: 1 }}><Text style={s.serviceTitle}>{service === null ? 'Connecting to Nura…' : service.available ? 'Nura is ready' : 'Nura is unavailable'}</Text><Text style={s.serviceBody}>{service?.available ? 'Choose what to share for each question. Nothing is sent before you review the details.' : service?.reason ?? 'This check does not send your health information.'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Check Nura availability" onPress={() => void getAgentStatus().then(setService)}><Text style={s.refresh}>↻</Text></Pressable></View>
      {fileContext && !selectedAsset?.serverSourceId && <View style={s.fileNotice}><Text style={s.fileNoticeTitle}>THIS SOURCE HAS NOT BEEN REVIEWED</Text><Text style={s.fileNoticeBody}>Nura can’t answer from this file yet. Open its review, request extraction and decide which suggested details belong in your record.</Text></View>}
      {fileContext && selectedAsset?.serverSourceId && <View style={s.fileNotice}><Text style={s.fileNoticeTitle}>ASKING ABOUT THIS SAVED SOURCE</Text><Text style={s.fileNoticeBody}>Only details already linked to this report are in scope. The original file stays on your device; you choose whether to share saved report notes for this answer.</Text></View>}
      {!fileContext && agentMessages.length === 0 && !busy && <View style={s.welcome}><Text style={s.welcomeEyebrow}>YOUR RECORDS, IN CONTEXT</Text><Text style={s.welcomeTitle}>Let’s look at the whole picture.</Text><Text style={s.welcomeBody}>Ask about information you’ve saved. Nura will show which records it used and where it could not find an answer.</Text><View style={s.promptRow}><Pressable style={s.prompt} onPress={() => setQuestion('What information is in my health profile?')}><Text style={s.promptText}>What’s in my profile?</Text><Text style={s.promptArrow}>↗</Text></Pressable><Pressable style={s.prompt} onPress={() => setQuestion('What information is missing from my records?')}><Text style={s.promptText}>What’s missing?</Text><Text style={s.promptArrow}>↗</Text></Pressable></View></View>}
      {agentMessages.map((message) => <View key={message.id} style={[s.message, message.role === 'user' ? s.userMessage : s.assistantMessage]}>
        <Text style={[s.messageLabel, message.role === 'user' && s.userMessageLabel]}>{message.role === 'user' ? 'YOU' : 'NURA'}</Text>
        <Text style={[s.messageText, message.role === 'user' && s.userMessageText]}>{message.role === 'assistant' ? registryBriefDisplayText(message.text) : message.text}</Text>
        {message.role === 'assistant' && message.coverageAssessments?.length ? <CoveragePanel assessments={message.coverageAssessments} sources={message.citations} /> : null}
        {message.role === 'assistant' && message.trace.length > 0 && <View style={s.savedTrace}><Text style={s.traceHeading}>HOW NURA WORKED</Text>{message.trace.map((item) => <Text key={item.id} style={s.savedTraceLine}>✓  {item.label}{item.detail ? ` · ${item.detail}` : ''}</Text>)}</View>}
        {message.role === 'assistant' && message.citations.length > 0 && <View style={s.citationWrap}><Text style={s.traceHeading}>SOURCES USED</Text>{message.citations.map((citation) => <Pressable key={citation.id} disabled={!citation.url} onPress={() => { if (citation.url) void Linking.openURL(citation.url); }} style={s.citationCard}><Text style={s.citationRef}>{citation.reference}</Text><View style={{ flex: 1 }}><Text style={s.citationTitle}>{citation.title}</Text><Text style={s.citationDetail}>{citation.source}{citation.date ? ` · ${citation.date}` : ''}</Text></View></Pressable>)}</View>}
      </View>)}
      {busy && <View style={s.liveCard}><View style={s.liveHeader}><Orb size={30} /><View style={{ flex: 1 }}><Text style={s.liveTitle}>{aiState === 'responding' ? 'Nura has an answer' : 'Nura is working with your records'}</Text><Text style={s.liveSub}>Live activity · only actions and evidence</Text></View></View>{trace.map((item) => <View key={item.id} style={s.traceRow}><View style={[s.traceMark, item.status === 'complete' && s.traceMarkDone]}><Text style={[s.traceMarkText, item.status === 'complete' && s.traceMarkTextDone]}>{item.status === 'complete' ? '✓' : '·'}</Text></View><View style={{ flex: 1 }}><Text style={s.traceLabel}>{item.label}</Text>{item.detail && <Text style={s.traceDetail}>{item.detail}</Text>}</View></View>)}</View>}
      {answer && <View style={s.answerCard}><Text style={s.answerLabel}>NURA’S RESPONSE</Text><Text style={s.answerText}>{registryBriefDisplayText(answer.answer)}</Text>
        {answer.coverageAssessments !== undefined && <CoveragePanel assessments={answer.coverageAssessments} sources={sources} />}
        {sources.length > 0 && <View style={s.citationWrap}><Text style={s.traceHeading}>EVIDENCE NURA CHECKED</Text>{sources.map((source) => <Pressable key={source.id} disabled={!source.url} onPress={() => { if (source.url) void Linking.openURL(source.url); }} style={s.citationCard}><Text style={s.citationRef}>{source.reference}</Text><View style={{ flex: 1 }}><Text style={s.citationTitle}>{source.title}</Text><Text style={s.citationDetail}>{source.source}{source.date ? ` · ${source.date}` : ''}</Text></View></Pressable>)}</View>}
        {answer.unknowns.length > 0 && <View style={s.unknownBox}><Text style={s.unknownTitle}>{answer.coverageAssessments !== undefined ? 'POLICY DETAIL NOT SHOWN HERE' : 'WHAT YOUR PROFILE DOESN’T SHOW'}</Text>{answer.unknowns.map((item, index) => <Text key={`${index}-${item}`} style={s.unknownText}>•  {item}</Text>)}</View>}
        {answer.nextSteps.length > 0 && <View style={s.nextBox}><Text style={s.nextTitle}>{answer.coverageAssessments !== undefined ? 'QUESTIONS TO CONFIRM WITH YOUR INSURER' : 'POSSIBLE NEXT STEP'}</Text>{answer.nextSteps.map((item, index) => <Text key={`${index}-${item}`} style={s.nextText}>•  {item}</Text>)}</View>}
        {registryBriefMode && !busy && <View style={s.registrySave}><Text style={s.registrySaveTitle}>SAVE TO MEDICAL REGISTRY</Text><Text style={s.registrySaveBody}>This saves the answer, its stated unknowns and only the sources it cited. The summary will be marked out of date if linked records change.</Text>{registryBriefSaveError ? <Text style={s.registrySaveError}>{registryBriefSaveError}</Text> : null}<Pressable accessibilityRole="button" disabled={registryBriefSaved || registryBriefSaving || answer.citations.length === 0} onPress={() => void saveRegistrySummary()} style={[s.registrySaveButton, (registryBriefSaved || registryBriefSaving || answer.citations.length === 0) && { opacity: .5 }]}><Text style={s.registrySaveButtonText}>{registryBriefSaved ? 'SAVED TO MEDICAL REGISTRY' : registryBriefSaving ? 'SAVING ON THIS DEVICE…' : 'SAVE CITED SUMMARY'}</Text></Pressable></View>}
        {answer.memoryProposal && <View style={s.proposal}><Text style={s.proposalTitle}>NURA SUGGESTED A PROFILE UPDATE</Text><Text style={s.proposalText}>{answer.memoryProposal.label}: {answer.memoryProposal.value}</Text>{answer.memoryProposal.reason ? <Text style={s.proposalReason}>{answer.memoryProposal.reason}</Text> : null}<Pressable onPress={acceptMemoryProposal} disabled={proposalSaved} style={[s.proposalButton, proposalSaved && s.proposalSaved]}><Text style={[s.proposalButtonText, proposalSaved && s.proposalSavedText]}>{proposalSaved ? 'ADDED · CONFIRMED BY YOU' : 'REVIEW AND ADD TO MY PROFILE'}</Text></Pressable></View>}
        <Text style={s.medicalNote}>{answer.coverageAssessments !== undefined ? 'This is an evidence summary, not an insurer decision. Confirm important coverage questions with your insurer.' : 'Nura helps organize your records; this is not a diagnosis or a substitute for care from a clinician.'}</Text>
      </View>}
      {error ? <View style={s.errorCard}><Text style={s.errorTitle}>This run didn’t complete</Text><Text style={s.errorText}>{error}</Text><Text style={s.errorNote}>Your saved health records were not changed.</Text></View> : null}
    </ScrollView>
    <View style={s.composerWrap}><View style={s.composer}><TextInput value={question} onChangeText={setQuestion} onFocus={() => setComposerFocused(true)} onBlur={() => setComposerFocused(false)} placeholder="Ask about your health history…" placeholderTextColor={C.faint} style={s.input} multiline maxLength={2000} editable={!busy} /><Animated.View style={{ transform: [{ scale: sendScale }] }}><Pressable accessibilityRole="button" accessibilityLabel="Ask Nura" disabled={!question.trim() || busy} onPress={startQuestion} onPressIn={() => animateSend(motion.pressScale)} onPressOut={() => animateSend(1)} style={[s.sendButton, (!question.trim() || busy) && s.sendDisabled]}><Text style={s.sendText}>↑</Text></Pressable></Animated.View></View><Text style={s.composerNote}>Conversation saves on this device. Selected context is sent for an answer only after you confirm.</Text></View>
      <Modal visible={consentOpen} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setConsentOpen(false)}><View style={[s.modalShade, Platform.OS === 'web' && s.modalShadeWeb]}><ScrollView style={[s.modalCard, Platform.OS === 'web' && s.modalCardWeb]} contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled"><View style={s.modalHandle} /><Text style={s.modalEyebrow}>YOUR CHOICE · THIS ANSWER</Text><Text style={s.modalTitle}>{registryBriefMode ? 'Review what goes into this summary.' : 'Choose what Nura can use.'}</Text><Text style={s.modalBody}>When you continue, your question and selected details below are sent to Nura’s AI service to prepare an answer. Its privacy practices apply. Original files are never included. If you select report details below, only saved text from those sources is shared. {registryBriefMode ? 'This summary uses only the selected health area and its connected records. Recent chat messages are excluded.' : ''} {coverageQuestion ? 'For a policy review, Nura uses only the reviewed policy terms and health details you select. It does not search the web.' : ''} Nothing is sent until you continue.</Text><View style={s.shareList}><ShareToggle label="Saved health facts" count={scopedContext.facts.length} selected={shareFacts} onPress={() => setShareFacts((value) => !value)} /><ShareToggle label="Health areas you selected" count={scopedContext.topics.length} selected={shareTopics} onPress={() => setShareTopics((value) => !value)} /><ShareToggle label="Links you created" count={scopedContext.links.length} selected={shareLinks} onPress={() => setShareLinks((value) => !value)} />{registryBriefMode ? <ShareRow label="Recent chat messages" count="Not included in this summary" excluded /> : <ShareToggle label="Recent chat messages" count={historyForConsent.length} selected={shareHistory} onPress={() => setShareHistory((value) => !value)} />}<ShareToggle label="Treatment and medicine records" count={scopedContext.treatments.length} selected={shareTreatments} onPress={() => setShareTreatments((value) => !value)} /><ShareToggle label="Visits and follow-up history" count={scopedContext.visits.length} selected={shareVisits} onPress={() => setShareVisits((value) => !value)} /><ShareToggle label="Details from linked reports" count={sourceContextLoading ? 'Checking linked sources…' : linkedDocumentContexts.length ? `${linkedDocumentContexts.length} source${linkedDocumentContexts.length === 1 ? '' : 's'} · text only` : 'None available'} selected={sourceContextSelected && linkedDocumentContexts.length > 0} disabled={sourceContextLoading || !linkedDocumentContexts.length} onPress={() => setShareSourceContext((value) => !(value ?? fileContext))} /><ShareToggle label="Search trusted health sources · general topics" count={coverageQuestion ? 'Not used for policy review' : service?.capabilities?.trustedHealthSearch ? (shareExternalSearch ? 'On · selected topics only' : 'Off') : 'Not available'} selected={shareExternalSearch && !coverageQuestion} disabled={coverageQuestion || !service?.capabilities?.trustedHealthSearch} onPress={() => setShareExternalSearch((value) => !value)} /><ShareRow label="Name, contact details and original files" count="Not shared" excluded /></View><Text style={s.privacyNote}>Treatment, visit and report details stay out unless you select them above. Nura can organize your information, but does not advise starting, stopping or changing medicines, or treat personal notes as clinician instructions. Saved chat stays on this device unless you choose to include it. The AI service’s privacy practices apply to each request. Public health search stays off unless you opt in. Cancel to send nothing.</Text><Pressable onPress={() => void confirmAndSend()} style={s.confirmShare}><Text style={s.confirmShareText}>CONTINUE WITH SELECTED DETAILS</Text></Pressable><Pressable onPress={() => setConsentOpen(false)} style={s.cancelShare}><Text style={s.cancelShareText}>Not now</Text></Pressable></ScrollView></View></Modal>
  </KeyboardAvoidingView>;
}
function ShareRow({ label, count, excluded }: { label: string; count: string; excluded?: boolean }) { return <View style={s.shareRow}><Text style={s.shareLabel}>{label}</Text><Text style={[s.shareCount, excluded && s.shareExcluded]}>{count}</Text></View>; }
function ShareToggle({ label, count, selected, onPress, disabled = false }: { label: string; count: number | string; selected: boolean; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={s.shareRow}><View style={s.shareToggleLabel}><View style={[s.checkBox, selected && s.checkBoxOn]}><Text style={s.checkMark}>{selected ? '✓' : ''}</Text></View><Text style={s.shareLabel}>{label}</Text></View><Text style={[s.shareCount, (!count || disabled) && s.shareExcluded]}>{typeof count === 'number' ? `${count} ${count === 1 ? 'item' : 'items'}` : count}</Text></Pressable>; }
function CoveragePanel({ assessments, sources }: { assessments: CoverageAssessment[]; sources: AgentSource[] }) {
  if (!assessments.length) return null;
  const byReference = new Map(sources.map((source) => [source.reference, source]));
  const labels: Record<CoverageAssessment['kind'], { title: string; tone: string; tint: string }> = {
    explicit_benefit: { title: 'BENEFIT STATED', tone: '#BCE8D0', tint: 'rgba(100, 181, 139, 0.20)' },
    explicit_limit: { title: 'LIMIT STATED', tone: '#FFD797', tint: 'rgba(226, 164, 82, 0.20)' },
    explicit_exclusion: { title: 'EXCLUSION STATED', tone: '#FFC0B2', tint: 'rgba(192, 92, 75, 0.20)' },
    unclear: { title: 'WORDING UNCLEAR', tone: '#D7C2F1', tint: 'rgba(190, 159, 220, 0.20)' },
  };
  return <View style={s.coveragePanel}><Text style={s.coverageHeading}>WHAT THE REVIEWED POLICY SAYS</Text>
    {assessments.map((item, index) => {
      const appearance = labels[item.kind];
      const policy = byReference.get(item.policyReference);
      const related = item.relatedHealthReferences.map((reference) => byReference.get(reference)).filter((source): source is AgentSource => Boolean(source));
      return <View key={`${item.policyReference}-${index}`} style={s.coverageItem}>
        <View style={s.coverageItemTop}><Text style={s.coverageKind}>{appearance.title}</Text><Text style={[s.coveragePill, { color: appearance.tone, backgroundColor: appearance.tint }]}>{item.policyReference}</Text></View>
        <Text style={s.coverageDetail}>{item.detail}</Text>
        <Text style={s.coverageSource}>Policy · {policy?.title ?? `Source ${item.policyReference}`}</Text>
        {related.length > 0 && <Text style={s.coverageRelated}>Compared with · {related.map((source) => source.title).join(' · ')}</Text>}
      </View>;
    })}
  </View>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  warmLight: { position: 'absolute', width: 390, height: 430, borderRadius: 240, right: -210, top: -210, overflow: 'hidden' },
  lilacLight: { position: 'absolute', width: 410, height: 470, borderRadius: 240, left: -245, top: 220, overflow: 'hidden' },
  header: { paddingHorizontal: 19, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: 'rgba(35, 26, 48, 0.28)' },
  close: { alignSelf: 'flex-start', width: 31, height: 28, justifyContent: 'center' },
  closeText: { color: C.muted, fontSize: 22, transform: [{ rotate: '90deg' }] },
  headerMain: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brand: { color: C.ink, fontSize: 19, fontWeight: '600' },
  tagline: { color: C.faint, fontSize: 7, letterSpacing: 1.65, fontWeight: '700', marginTop: 3 },
  clear: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  clearText: { color: C.plum, fontSize: 10, fontWeight: '600' },
  disabledText: { color: C.faint },
  content: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 20, maxWidth: 600, width: '100%', alignSelf: 'center', flexGrow: 1 },
  contextLine: { color: C.muted, fontSize: 10, marginBottom: 12 },
  contextStrong: { color: C.plum, fontWeight: '600' },

  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 10, marginBottom: 14 },
  serviceReady: { backgroundColor: C.green, borderColor: 'rgba(188, 232, 208, 0.35)' },
  serviceOffline: { backgroundColor: C.surface, borderColor: C.line },
  serviceDot: { width: 8, height: 8, borderRadius: 5, backgroundColor: C.faint },
  serviceDotReady: { backgroundColor: C.mint },
  serviceTitle: { color: C.ink, fontSize: 10, fontWeight: '600' },
  serviceBody: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  refresh: { color: C.plum, fontSize: 17, paddingHorizontal: 4 },

  fileNotice: { backgroundColor: C.amber, borderWidth: 1, borderColor: 'rgba(255, 215, 151, 0.32)', borderRadius: 15, padding: 13, marginTop: 8, marginBottom: 10 },
  fileNoticeTitle: { color: C.amberInk, fontSize: 8, letterSpacing: 0.9, fontWeight: '700' },
  fileNoticeBody: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  welcome: { backgroundColor: C.surface, borderRadius: 20, padding: 17, borderWidth: 1, borderColor: C.line, marginTop: 6 },
  welcomeEyebrow: { color: C.plum, fontSize: 8, fontWeight: '700', letterSpacing: 1.4 },
  welcomeTitle: { color: C.ink, fontSize: 21, lineHeight: 27, fontWeight: '500', marginTop: 7 },
  welcomeBody: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 7 },
  promptRow: { gap: 7, marginTop: 12 },
  prompt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surfaceRaised, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255, 249, 246, 0.14)' },
  promptText: { color: C.ink, fontSize: 10 },
  promptArrow: { color: C.blue, fontSize: 15 },

  message: { borderRadius: 19, padding: 14, marginTop: 11, maxWidth: '93%' },
  userMessage: { alignSelf: 'flex-end', backgroundColor: C.white, borderTopRightRadius: 7 },
  assistantMessage: { alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderTopLeftRadius: 7, width: '100%' },
  messageLabel: { color: C.plum, fontSize: 8, letterSpacing: 1, fontWeight: '700', marginBottom: 5 },
  userMessageLabel: { color: C.plumInk },
  messageText: { color: C.ink, fontSize: 12, lineHeight: 18 },
  userMessageText: { color: C.plumInk },
  savedTrace: { backgroundColor: 'rgba(32, 25, 44, 0.45)', borderRadius: 11, padding: 10, marginTop: 10 },
  traceHeading: { color: C.plum, fontSize: 8, letterSpacing: 1, fontWeight: '700', marginBottom: 6 },
  savedTraceLine: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 2 },
  citationWrap: { marginTop: 12 },
  citationCard: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 9, borderRadius: 10, backgroundColor: C.bluePale, borderWidth: 1, borderColor: 'rgba(183, 208, 255, 0.22)', marginTop: 5 },
  citationRef: { color: C.blue, fontSize: 9, fontWeight: '700', width: 22 },
  citationTitle: { color: C.ink, fontSize: 10, fontWeight: '600' },
  citationDetail: { color: C.muted, fontSize: 8, marginTop: 2 },

  liveCard: { backgroundColor: C.surfaceRaised, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(242, 191, 165, 0.34)', padding: 13, marginTop: 12 },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  liveTitle: { color: C.ink, fontSize: 12, fontWeight: '600' },
  liveSub: { color: C.faint, fontSize: 8, marginTop: 3 },
  traceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 6 },
  traceMark: { width: 18, height: 18, borderRadius: 10, backgroundColor: 'rgba(255, 249, 246, 0.12)', alignItems: 'center', justifyContent: 'center' },
  traceMarkDone: { backgroundColor: C.green },
  traceMarkText: { color: C.faint, fontSize: 12, lineHeight: 16 },
  traceMarkTextDone: { color: C.mint, fontSize: 10 },
  traceLabel: { color: C.ink, fontSize: 10, fontWeight: '500', lineHeight: 15 },
  traceDetail: { color: C.muted, fontSize: 9, lineHeight: 13, marginTop: 1 },

  answerCard: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 15, marginTop: 12 },
  answerLabel: { color: C.plum, fontSize: 8, fontWeight: '700', letterSpacing: 1.25 },
  answerText: { color: C.ink, fontSize: 13, lineHeight: 20, marginTop: 7 },
  unknownBox: { backgroundColor: C.amber, padding: 10, borderRadius: 12, marginTop: 11 },
  unknownTitle: { color: C.amberInk, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  unknownText: { color: C.ink, fontSize: 10, lineHeight: 15, marginTop: 5 },
  nextBox: { backgroundColor: C.bluePale, padding: 10, borderRadius: 12, marginTop: 9 },
  nextTitle: { color: C.blue, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  nextText: { color: C.ink, fontSize: 10, lineHeight: 15, marginTop: 5 },
  proposal: { backgroundColor: C.lilac, borderWidth: 1, borderColor: 'rgba(210, 184, 231, 0.32)', padding: 11, borderRadius: 13, marginTop: 11 },
  proposalTitle: { color: C.plum, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  proposalText: { color: C.ink, fontSize: 11, fontWeight: '600', marginTop: 6 },
  proposalReason: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 4 },
  proposalButton: { borderRadius: 12, backgroundColor: C.white, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', marginTop: 10 },
  proposalButtonText: { color: C.plumInk, fontSize: 8, fontWeight: '700', letterSpacing: 0.7 },
  proposalSaved: { backgroundColor: C.green, borderColor: 'rgba(188, 232, 208, 0.38)' },
  proposalSavedText: { color: C.mint },
  medicalNote: { color: C.faint, fontSize: 8, lineHeight: 12, marginTop: 11 },

  errorCard: { backgroundColor: 'rgba(139, 73, 62, 0.24)', borderWidth: 1, borderColor: 'rgba(242, 191, 165, 0.4)', borderRadius: 16, padding: 13, marginTop: 12 },
  errorTitle: { color: '#FFD2C4', fontSize: 11, fontWeight: '700' },
  errorText: { color: C.ink, fontSize: 10, lineHeight: 15, marginTop: 5 },
  errorNote: { color: C.muted, fontSize: 8, marginTop: 5 },

  composerWrap: { backgroundColor: 'rgba(35, 26, 48, 0.72)', paddingHorizontal: 15, paddingTop: 9, paddingBottom: Platform.OS === 'ios' ? 9 : 12, borderTopWidth: 1, borderTopColor: C.line },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, backgroundColor: C.surfaceRaised, borderWidth: 1, borderColor: C.line, borderRadius: 19, paddingLeft: 13, paddingRight: 7, paddingVertical: 7, maxWidth: 600, width: '100%', alignSelf: 'center' },
  input: { flex: 1, color: C.ink, minHeight: 39, maxHeight: 100, paddingVertical: 9, fontSize: 11, textAlignVertical: 'center' },
  sendButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', shadowColor: C.peach, shadowOpacity: 0.22, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  sendDisabled: { backgroundColor: 'rgba(255, 249, 246, 0.36)', shadowOpacity: 0 },
  sendText: { color: C.plumInk, fontSize: 19, fontWeight: '600', lineHeight: 23 },
  composerNote: { color: C.faint, textAlign: 'center', fontSize: 8, lineHeight: 12, marginTop: 6, maxWidth: 600, alignSelf: 'center' },

  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20, 14, 28, 0.72)' },
  modalShadeWeb: { justifyContent: 'center', alignItems: 'center', padding: 12 },
  modalCard: { backgroundColor: C.surfaceDeep, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30 },
  modalCardWeb: { width: '100%', maxWidth: 390, maxHeight: '92%', alignSelf: 'center', borderRadius: 24, borderWidth: 1, borderColor: C.line, paddingBottom: 18 },
  modalContent: { flexGrow: 1 },
  modalHandle: { width: 39, height: 4, borderRadius: 3, backgroundColor: 'rgba(255, 249, 246, 0.45)', alignSelf: 'center', marginBottom: 17 },
  modalEyebrow: { color: C.plum, fontSize: 8, fontWeight: '700', letterSpacing: 1.3 },
  modalTitle: { color: C.ink, fontSize: 21, fontWeight: '500', lineHeight: 27, marginTop: 6 },
  modalBody: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 8 },
  shareList: { backgroundColor: 'rgba(255, 249, 246, 0.07)', borderRadius: 15, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: C.line, marginTop: 13 },
  shareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 249, 246, 0.09)' },
  shareToggleLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkBox: { width: 17, height: 17, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255, 249, 246, 0.42)', alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: C.plum, borderColor: C.plum },
  checkMark: { color: C.plumInk, fontSize: 10, fontWeight: '700', lineHeight: 13 },
  shareLabel: { color: C.ink, fontSize: 10 },
  shareCount: { color: C.plum, fontSize: 9, fontWeight: '600' },
  shareExcluded: { color: C.faint },
  privacyNote: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 12 },
  confirmShare: { borderRadius: 15, backgroundColor: C.white, paddingVertical: 14, alignItems: 'center', marginTop: 15 },
  confirmShareText: { color: C.plumInk, fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  cancelShare: { alignItems: 'center', paddingVertical: 13 },
  cancelShareText: { color: C.muted, fontSize: 11, fontWeight: '600' },

  registrySave: { backgroundColor: C.bluePale, borderWidth: 1, borderColor: 'rgba(183, 208, 255, 0.28)', borderRadius: 14, padding: 11, marginTop: 12 },
  registrySaveTitle: { color: C.blue, fontSize: 8, fontWeight: '800', letterSpacing: 0.75 },
  registrySaveBody: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 5 },
  registrySaveError: { color: '#FFD2C4', fontSize: 9, lineHeight: 14, marginTop: 6 },
  registrySaveButton: { minHeight: 40, backgroundColor: C.white, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, marginTop: 9 },
  registrySaveButtonText: { color: C.plumInk, fontSize: 8, fontWeight: '800', letterSpacing: 0.55 },

  coveragePanel: { backgroundColor: 'rgba(255, 249, 246, 0.06)', borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 10, marginTop: 11 },
  coverageHeading: { color: C.plum, fontSize: 8, fontWeight: '700', letterSpacing: 0.8, marginBottom: 7 },
  coverageItem: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 11, padding: 9, marginTop: 5 },
  coverageItemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
  coverageKind: { color: C.ink, fontSize: 8, fontWeight: '700', letterSpacing: 0.5, flex: 1 },
  coveragePill: { overflow: 'hidden', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3, fontSize: 7, fontWeight: '700' },
  coverageDetail: { color: C.ink, fontSize: 10, lineHeight: 15, marginTop: 6 },
  coverageSource: { color: C.muted, fontSize: 8, marginTop: 6 },
  coverageRelated: { color: C.blue, fontSize: 8, lineHeight: 13, marginTop: 4 },
});
