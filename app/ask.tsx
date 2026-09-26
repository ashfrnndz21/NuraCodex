import React, { useEffect, useMemo, useRef, useState } from 'react';
import { animatedNativeDriver } from '../src/services/animatedDriver';
import { AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, LayoutAnimation, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as Crypto from 'expo-crypto';
import { Orb } from '../src/components/Orb';
import { AgentAnswer, AgentEvent, AgentRunInput, AgentSource, AgentTrace, CoverageAssessment, getAgentStatus, runNuraAgent } from '../src/services/agentClient';
import { getSourceClaims, sourceMatchesAsset } from '../src/services/intakeClient';
import { useNura } from '../src/state/NuraContext';
import { useAIState } from '../src/state/AIStateContext';
import { brandScenes, motion } from '../src/theme';
import { scopeProfileContext } from '../src/services/agentContextScope.mjs';
import { registryBriefCitations, registryBriefDisplayText } from '../src/services/registryBrief.mjs';
import { agentCitationTarget } from '../src/services/agentCitationNavigation.mjs';
import { resolvePolicyReviewSourceIds, selectPolicyReviewFacts } from '../src/services/policyReviewScope.mjs';
import { createAgentRunEventGate } from '../src/services/agentRunLifecycle.mjs';
import { answerFirstView } from '../src/services/askAnswerPresentation.mjs';

const C = {
  bg: brandScenes.atmosphere.base,
  ink: '#FFF9F3',
  muted: '#F2EAF0',
  faint: '#DED0E0',
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
  const params = useLocalSearchParams<{ context?: string; recordId?: string; question?: string; policySourceIds?: string; registryBriefTopicId?: string; registryBriefTopicLabel?: string; registrySourceSignature?: string }>();
  const { facts, topics, links, treatments, visits, assets, agentMessages, addAgentMessage, saveRegistryBrief, clearAgentMessages, addQuestion, saveApprovedMemoryFact } = useNura();
  const recordId = typeof params.recordId === 'string' ? params.recordId : null;
  const requestedPolicySourceIds = typeof params.policySourceIds === 'string' ? params.policySourceIds.split(',').filter(Boolean) : [];
  const policyReviewSourceKey = resolvePolicyReviewSourceIds(requestedPolicySourceIds, facts).join('|');
  const policyReviewSourceIds = useMemo(() => policyReviewSourceKey ? policyReviewSourceKey.split('|') : [], [policyReviewSourceKey]);
  const policyReviewMode = policyReviewSourceIds.length > 0;
  const policyComparisonMode = policyReviewSourceIds.length === 2;
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
  const [proposalSaving, setProposalSaving] = useState(false);
  const [proposalSaveError, setProposalSaveError] = useState('');
  const proposalSaveLock = useRef(false);
  const [registryBriefSaved, setRegistryBriefSaved] = useState(false);
  const [registryBriefSaving, setRegistryBriefSaving] = useState(false);
  const [registryBriefSaveError, setRegistryBriefSaveError] = useState('');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ambientShift] = useState(() => new Animated.Value(0));
  const [sendScale] = useState(() => new Animated.Value(1));
  const [shareFacts, setShareFacts] = useState(true);
  const [shareTopics, setShareTopics] = useState(!policyReviewMode);
  const [shareLinks, setShareLinks] = useState(!policyReviewMode);
  const [shareHistory, setShareHistory] = useState(!registryBriefMode && !policyReviewMode);
  const [shareTreatments, setShareTreatments] = useState(false);
  const [shareVisits, setShareVisits] = useState(false);
  const [sharePolicyTerms, setSharePolicyTerms] = useState(policyReviewMode);
  const [selectedHealthFactIds, setSelectedHealthFactIds] = useState<string[]>([]);
  const [shareSourceContext, setShareSourceContext] = useState<boolean | null>(null);
  const [shareExternalSearch, setShareExternalSearch] = useState(false);
  const [sourceContextSnapshot, setSourceContextSnapshot] = useState<{ key: string; documents: NonNullable<AgentRunInput['context']['documentSources']> }>({ key: '', documents: [] });
  const initialQuestionSet = useRef(false);
  const activeRunController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
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
  const availablePolicyFacts = personalContext.facts.filter((fact) => /^(insurance coverage|coverage_term|coverage term)$/i.test(fact.category) && policyReviewSourceIds.includes(fact.sourceId ?? ''));
  const availableHealthFacts = personalContext.facts.filter((fact) => fact.category !== 'Insurance coverage');
  const historyForConsent = agentMessages.slice(-8);
  const scopedContext = useMemo(() => {
    const scoped = scopeProfileContext(personalContext, recordId);
    if (policyReviewMode) return {
      ...scoped,
      facts: scoped.facts.filter((fact) => !/^(insurance coverage|coverage_term|coverage term)$/i.test(fact.category) || policyReviewSourceIds.includes(fact.sourceId ?? '')),
      topics: [],
      links: [],
    };
    if (!fileContext || !selectedAsset?.serverSourceId) return scoped;
    return { ...scoped, facts: personalContext.facts.filter((fact) => fact.sourceId === selectedAsset.serverSourceId) };
  }, [personalContext, recordId, fileContext, selectedAsset, policyReviewMode, policyReviewSourceIds]);
  const sourceAssets = useMemo(() => {
    const sourceIds = new Set(scopedContext.facts.map((fact) => fact.sourceId).filter((id): id is string => Boolean(id)));
    if (selectedAsset?.serverSourceId) sourceIds.add(selectedAsset.serverSourceId);
    return assets.filter((asset) => Boolean(asset.serverSourceId && sourceIds.has(asset.serverSourceId) && (!policyReviewMode || policyReviewSourceIds.includes(asset.serverSourceId)))).slice(0, 5);
  }, [assets, scopedContext.facts, selectedAsset, policyReviewMode, policyReviewSourceIds]);
  const sourceContextKey = sourceAssets.map((asset) => `${asset.id}:${asset.serverSourceId}`).join('|');
  const linkedDocumentContexts = sourceContextSnapshot.key === sourceContextKey ? sourceContextSnapshot.documents : [];
  const sourceContextLoading = sourceAssets.length > 0 && sourceContextSnapshot.key !== sourceContextKey;
  const sourceContextSelected = shareSourceContext ?? (fileContext || policyReviewMode);
  const selectedHistory = registryBriefMode || policyReviewMode ? [] : shareHistory ? historyForConsent.map((message) => ({ role: message.role, content: message.text })) : [];
  const selectedContext = policyReviewMode
    ? { facts: selectPolicyReviewFacts(personalContext.facts, policyReviewSourceIds, sharePolicyTerms, selectedHealthFactIds), topics: [], links: [] }
    : { facts: shareFacts ? scopedContext.facts : [], topics: shareTopics ? scopedContext.topics : [], links: shareLinks ? scopedContext.links : [] };

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
      Animated.timing(ambientShift, { toValue: 1, duration: 18000, easing: Easing.inOut(Easing.ease), useNativeDriver: animatedNativeDriver }),
      Animated.timing(ambientShift, { toValue: 0, duration: 18000, easing: Easing.inOut(Easing.ease), useNativeDriver: animatedNativeDriver }),
    ]));
    drift.start();
    return () => drift.stop();
  }, [ambientShift, reducedMotion]);
  useEffect(() => { if (initialQuestion && !initialQuestionSet.current) { initialQuestionSet.current = true; setQuestion(initialQuestion); } }, [initialQuestion]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeRunController.current?.abort();
      activeRunController.current = null;
    };
  }, []);
  function startQuestion() { if (!question.trim() || busy || proposalSaveLock.current) return; setError(''); setShareExternalSearch(false); setShareTreatments(false); setShareVisits(false); if (policyReviewMode) setSelectedHealthFactIds([]); setConsentOpen(true); }
  function animateSend(toValue: number) {
    if (reducedMotion || busy || !question.trim()) return;
    Animated.timing(sendScale, { toValue, duration: toValue === 1 ? motion.pressOut : motion.pressIn, easing: toValue === 1 ? Easing.bezier(...motion.easing.bouncy) : Easing.linear, useNativeDriver: animatedNativeDriver }).start();
  }
  async function confirmAndSend() {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || busy || proposalSaveLock.current) return;
    setConsentOpen(false);
    setQuestion('');
    setAnswer(null); setSources([]); setTrace([]); setError(''); setProposalSaved(false); setProposalSaving(false); setProposalSaveError(''); setRegistryBriefSaved(false); setRegistryBriefSaveError(''); setBusy(true);
    const runId = Crypto.randomUUID();
    const controller = new AbortController();
    const runGate = createAgentRunEventGate();
    activeRunController.current = controller;
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
        if (!mounted.current || controller.signal.aborted) return;
        const gated = runGate.receive(event);
        if (gated.kind === 'ignored' || gated.kind === 'pending' || gated.kind === 'pending_finish') {
          if (gated.kind === 'pending') dispatchRunEvent('TEXT_MESSAGE_START');
          return;
        }
        if (gated.kind === 'failed') {
          finalAnswer = null;
          setAnswer(null);
          setSources([]);
          setError(gated.message);
          return;
        }
        const progressEvent = gated.event;
        if (progressEvent.type === 'trace') {
          const item = { id: progressEvent.id, label: progressEvent.label, status: progressEvent.status, detail: progressEvent.detail };
          runTrace = [...runTrace.filter((existing) => existing.id !== progressEvent.id), item];
          setTrace(runTrace);
          if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        } else if (progressEvent.type === 'evidence') {
          runSources = progressEvent.sources;
          setSources(progressEvent.sources);
        }
      }, controller.signal);
      const transportResult = runGate.completeTransport();
      if (transportResult.kind !== 'complete') {
        throw new Error(transportResult.kind === 'failed' ? transportResult.message : 'Nura could not finish this answer. Please try again.');
      }
      finalAnswer = transportResult.answer;
      const cited = runSources.filter((source) => finalAnswer?.citations.includes(source.reference));
      setSources(cited);
      setAnswer(finalAnswer);
      addAgentMessage({ runId, role: 'assistant', text: finalAnswer.answer, citations: cited, trace: runTrace.map((item) => ({ ...item, status: 'complete' })), coverageAssessments: finalAnswer.coverageAssessments });
      dispatchRunEvent('RUN_FINISHED');
    } catch (caught) {
      const message = controller.signal.aborted
        ? 'This run was stopped. You can try again when you’re ready.'
        : caught instanceof Error ? caught.message : 'Nura could not complete this answer.';
      runGate.cancel(message);
      finalAnswer = null;
      if (mounted.current) {
        setAnswer(null);
        setSources([]);
        setError(message);
        setQuestion(cleanQuestion);
        dispatchRunEvent('RUN_ERROR');
      }
    } finally {
      if (activeRunController.current === controller) activeRunController.current = null;
      if (mounted.current) {
        setBusy(false);
        void getAgentStatus().then((status) => { if (mounted.current) setService(status); });
      }
    }
  }
  function stopCurrentRun() { activeRunController.current?.abort(); }
  function evidenceTarget(source: AgentSource): AgentCitationTarget {
    return agentCitationTarget(source, { facts, topics, links, treatments, visits, assets }) as AgentCitationTarget;
  }
  function openEvidenceSource(source: AgentSource) {
    const target = evidenceTarget(source);
    if (!target) return;
    if (target.kind === 'external') { void Linking.openURL(target.url); return; }
    if (target.kind === 'registry') { router.push({ pathname: '/registry', params: { topicId: target.topicId } }); return; }
    router.push({ pathname: '/(tabs)/health', params: { focusId: target.focusId } });
  }
  async function acceptMemoryProposal() {
    const proposal = answer?.memoryProposal;
    if (!proposal || proposalSaved || proposalSaveLock.current || !activeRunId) return;
    proposalSaveLock.current = true;
    setProposalSaving(true);
    setProposalSaveError('');
    try {
      await saveApprovedMemoryFact(proposal.label, proposal.value, { category: 'User-approved memory', source: 'Nura suggestion · confirmed by you', note: proposal.reason || 'Suggested in an Ask Nura conversation and approved by you.', sourceRunId: activeRunId, reviewState: 'user_confirmed', validFrom: new Date().toISOString(), validUntil: null, confidence: null, permissionScope: 'profile_memory_write' });
      if (mounted.current) setProposalSaved(true);
    } catch (caught) {
      if (mounted.current) setProposalSaveError(caught instanceof Error ? caught.message : 'The profile update could not be saved. Nothing was added. Please try again.');
    } finally {
      proposalSaveLock.current = false;
      if (mounted.current) setProposalSaving(false);
    }
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
    <LinearGradient pointerEvents="none" colors={brandScenes.atmosphere.colors} locations={brandScenes.atmosphere.locations} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <Animated.View pointerEvents="none" style={[s.warmLight, { transform: [{ translateX: warmX }, { translateY: warmY }] }]}>
      <LinearGradient colors={[brandScenes.atmosphere.peachGlow, 'rgba(237,180,145,0.13)', 'rgba(237,180,145,0)']} locations={[0, 0.4, 1]} start={{ x: 0.7, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
    <Animated.View pointerEvents="none" style={[s.lilacLight, { transform: [{ translateX: lilacX }, { translateY: lilacY }] }]}>
      <LinearGradient colors={[brandScenes.atmosphere.lilacGlow, 'rgba(162,135,205,0.11)', 'rgba(162,135,205,0)']} locations={[0, 0.42, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
    <View style={s.header}><Pressable accessibilityLabel="Close Ask Nura" style={s.close} onPress={() => router.back()}><Text style={s.closeText}>⌄</Text></Pressable><View style={s.headerMain}><Orb size={45} /><View style={{ flex: 1 }}><Text style={s.brand}>Ask Nura</Text><Text style={s.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View><Pressable onPress={() => { if (!busy && agentMessages.length) { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); clearAgentMessages(); setAnswer(null); setTrace([]); setError(''); } }} disabled={busy || !agentMessages.length} style={s.clear}><Text style={[s.clearText, (!agentMessages.length || busy) && s.disabledText]}>Clear</Text></Pressable></View></View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={s.contextLine}>{registryBriefMode ? <>Preparing a source-linked Registry summary for <Text style={s.contextStrong}>{registryBriefTopic?.label}</Text> · chat history excluded</> : policyComparisonMode ? <>Compare the two linked policies. Add only the health details you choose for this run.</> : policyReviewMode ? <>Review this policy against only the health details you choose for this run.</> : <>Looking at <Text style={s.contextStrong}>{context}</Text></>}</Text>
      <View style={[s.serviceCard, service?.available ? s.serviceReady : s.serviceOffline]}><View style={[s.serviceDot, service?.available && s.serviceDotReady]} /><View style={{ flex: 1 }}><Text style={s.serviceTitle}>{service === null ? 'Connecting to Nura…' : service.available ? 'Nura is ready' : 'Nura is unavailable'}</Text><Text style={s.serviceBody}>{service?.available ? 'Choose what to share for each question. Nothing is sent before you review the details.' : service?.reason ?? 'This check does not send your health information.'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Check Nura availability" onPress={() => void getAgentStatus().then(setService)}><Text style={s.refresh}>↻</Text></Pressable></View>
      {fileContext && !selectedAsset?.serverSourceId && <View style={s.fileNotice}><Text style={s.fileNoticeTitle}>THIS SOURCE HAS NOT BEEN REVIEWED</Text><Text style={s.fileNoticeBody}>Nura can’t answer from this file yet. Open its review, request extraction and decide which suggested details belong in your record.</Text></View>}
      {fileContext && selectedAsset?.serverSourceId && <View style={s.fileNotice}><Text style={s.fileNoticeTitle}>ASKING ABOUT THIS SAVED SOURCE</Text><Text style={s.fileNoticeBody}>Only details already linked to this report are in scope. The original file stays on your device; you choose whether to share saved report notes for this answer.</Text></View>}
      {!fileContext && agentMessages.length === 0 && !busy && <View style={s.welcome}><Text style={s.welcomeEyebrow}>YOUR RECORDS, IN CONTEXT</Text><Text style={s.welcomeTitle}>Let’s look at the whole picture.</Text><Text style={s.welcomeBody}>Ask about information you’ve saved. Nura will show which records it used and where it could not find an answer.</Text><View style={s.promptRow}><Pressable style={s.prompt} onPress={() => setQuestion('What information is in my health profile?')}><Text style={s.promptText}>What’s in my profile?</Text><Text style={s.promptArrow}>↗</Text></Pressable><Pressable style={s.prompt} onPress={() => setQuestion('What information is missing from my records?')}><Text style={s.promptText}>What’s missing?</Text><Text style={s.promptArrow}>↗</Text></Pressable></View></View>}
      {agentMessages.filter((message) => !(answer && activeRunId && message.role === 'assistant' && message.runId === activeRunId)).map((message) => <View key={message.id} style={[s.message, message.role === 'user' ? s.userMessage : s.assistantMessage]}>
        <Text style={[s.messageLabel, message.role === 'user' && s.userMessageLabel]}>{message.role === 'user' ? 'YOU' : 'NURA'}</Text>
        {message.role === 'assistant' ? <PresentedAnswer text={registryBriefDisplayText(message.text)} textStyle={s.messageText} reducedMotion={reducedMotion} /> : <Text style={[s.messageText, s.userMessageText]}>{message.text}</Text>}
        {message.role === 'assistant' && message.coverageAssessments?.length ? <CoveragePanel assessments={message.coverageAssessments} sources={message.citations} onOpenSource={openEvidenceSource} targetFor={evidenceTarget} /> : null}
        {message.role === 'assistant' && message.trace.length > 0 && <View style={s.savedTrace}><Text style={s.traceHeading}>HOW NURA WORKED</Text>{message.trace.map((item) => <Text key={item.id} style={s.savedTraceLine}>✓  {item.label}{item.detail ? ` · ${item.detail}` : ''}</Text>)}</View>}
        {message.role === 'assistant' && message.citations.length > 0 && <View style={s.citationWrap}><Text style={s.traceHeading}>SOURCES USED</Text>{message.citations.map((citation) => <EvidenceSourceCard key={citation.id} source={citation} target={evidenceTarget(citation)} onPress={() => openEvidenceSource(citation)} />)}</View>}
      </View>)}
      {busy && <View style={s.liveCard}><View style={s.liveHeader}><Orb size={30} /><View style={{ flex: 1 }}><Text style={s.liveTitle}>{aiState === 'responding' ? 'Nura is preparing an answer' : 'Nura is working with your records'}</Text><Text style={s.liveSub}>Live activity · only actions and evidence</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Stop this Ask Nura run" onPress={stopCurrentRun} style={s.stopRunButton}><Text style={s.stopRunText}>Stop</Text></Pressable></View>{trace.map((item) => <View key={item.id} style={s.traceRow}><View style={[s.traceMark, item.status === 'complete' && s.traceMarkDone]}><Text style={[s.traceMarkText, item.status === 'complete' && s.traceMarkTextDone]}>{item.status === 'complete' ? '✓' : '·'}</Text></View><View style={{ flex: 1 }}><Text style={s.traceLabel}>{item.label}</Text>{item.detail && <Text style={s.traceDetail}>{item.detail}</Text>}</View></View>)}</View>}
      {answer && <View style={s.answerCard}><Text style={s.answerLabel}>NURA’S RESPONSE</Text><PresentedAnswer text={registryBriefDisplayText(answer.answer)} textStyle={s.answerText} reducedMotion={reducedMotion} />
        {answer.coverageAssessments !== undefined && <CoveragePanel assessments={answer.coverageAssessments} sources={sources} onOpenSource={openEvidenceSource} targetFor={evidenceTarget} />}
        {!busy && trace.length > 0 && <View style={s.savedTrace}><Text style={s.traceHeading}>HOW NURA WORKED</Text>{trace.map((item) => <Text key={item.id} style={s.savedTraceLine}>✓  {item.label}{item.detail ? ` · ${item.detail}` : ''}</Text>)}</View>}
        {sources.length > 0 && <View style={s.citationWrap}><Text style={s.traceHeading}>SOURCES REVIEWED</Text>{sources.map((source) => <EvidenceSourceCard key={source.id} source={source} target={evidenceTarget(source)} onPress={() => openEvidenceSource(source)} />)}</View>}
        {answer.unknowns.length > 0 && <View style={s.unknownBox}><Text style={s.unknownTitle}>{answer.coverageAssessments !== undefined ? 'POLICY DETAIL NOT SHOWN HERE' : 'NOT FOUND IN THIS REVIEW'}</Text>{answer.unknowns.map((item, index) => <Text key={`${index}-${item}`} style={s.unknownText}>•  {item}</Text>)}{answer.coverageAssessments === undefined && <Text style={s.unknownScope}>This reflects only information selected for this answer. Other saved areas, files or records may not have been included.</Text>}</View>}
        {answer.nextSteps.length > 0 && <View style={s.nextBox}><Text style={s.nextTitle}>{answer.coverageAssessments !== undefined ? 'QUESTIONS TO CONFIRM WITH YOUR INSURER' : 'POSSIBLE NEXT STEP'}</Text>{answer.nextSteps.map((item, index) => <Text key={`${index}-${item}`} style={s.nextText}>•  {item}</Text>)}</View>}
        {registryBriefMode && !busy && <View style={s.registrySave}><Text style={s.registrySaveTitle}>SAVE TO MEDICAL REGISTRY</Text><Text style={s.registrySaveBody}>This saves the answer, its stated unknowns and only the sources it cited. The summary will be marked out of date if linked records change.</Text>{registryBriefSaveError ? <Text style={s.registrySaveError}>{registryBriefSaveError}</Text> : null}<Pressable accessibilityRole="button" disabled={registryBriefSaved || registryBriefSaving || answer.citations.length === 0} onPress={() => void saveRegistrySummary()} style={[s.registrySaveButton, (registryBriefSaved || registryBriefSaving || answer.citations.length === 0) && { opacity: .5 }]}><Text style={s.registrySaveButtonText}>{registryBriefSaved ? 'SAVED TO MEDICAL REGISTRY' : registryBriefSaving ? 'SAVING ON THIS DEVICE…' : 'SAVE CITED SUMMARY'}</Text></Pressable></View>}
        {answer.memoryProposal && <View style={s.proposal}><Text style={s.proposalTitle}>NURA SUGGESTED A PROFILE UPDATE</Text><Text style={s.proposalText}>{answer.memoryProposal.label}: {answer.memoryProposal.value}</Text>{answer.memoryProposal.reason ? <Text style={s.proposalReason}>{answer.memoryProposal.reason}</Text> : null}{answer.memoryProposal.sourceReferences?.length ? <View style={s.proposalSources}><Text style={s.proposalSourceHeading}>SUPPORTING RECORDS</Text>{answer.memoryProposal.sourceReferences.map((reference) => { const source = sources.find((item) => item.reference === reference); if (!source) return <Text key={reference} style={s.proposalSourceUnavailable}>Supporting record {reference} is unavailable in this review.</Text>; const target = evidenceTarget(source); return <Pressable key={reference} accessibilityRole="button" accessibilityState={{ disabled: !target }} disabled={!target} onPress={() => openEvidenceSource(source)} style={[s.proposalSourceLink, !target && s.proposalSourceLinkDisabled]}><Text style={s.proposalSourceRef}>{reference}</Text><View style={{ flex: 1 }}><Text style={s.proposalSourceTitle}>{source.title}</Text><Text style={s.proposalSourceAction}>{target ? 'OPEN SUPPORTING RECORD ↗' : 'SOURCE UNAVAILABLE'}</Text></View></Pressable>; })}</View> : answer.memoryProposal.sourceKind === 'user_request' ? <Text style={s.proposalReason}>Based on your explicit request in this conversation.</Text> : null}{proposalSaveError ? <Text accessibilityRole="alert" style={s.proposalSaveError}>{proposalSaveError}</Text> : null}<Pressable onPress={() => void acceptMemoryProposal()} disabled={proposalSaved || proposalSaving} style={[s.proposalButton, proposalSaved && s.proposalSaved, (proposalSaved || proposalSaving) && { opacity: .8 }]}><Text style={[s.proposalButtonText, proposalSaved && s.proposalSavedText]}>{proposalSaved ? 'ADDED · CONFIRMED BY YOU' : proposalSaving ? 'SAVING TO YOUR PROFILE…' : proposalSaveError ? 'TRY AGAIN' : 'REVIEW AND ADD TO MY PROFILE'}</Text></Pressable></View>}
        <Text style={s.medicalNote}>{answer.coverageAssessments !== undefined ? 'This is an evidence summary, not an insurer decision. Confirm important coverage questions with your insurer.' : 'Nura helps organize your records; this is not a diagnosis or a substitute for care from a clinician.'}</Text>
      </View>}
      {error ? <View style={s.errorCard}><Text style={s.errorTitle}>This run didn’t complete</Text><Text style={s.errorText}>{error}</Text><Text style={s.errorNote}>Your saved health records were not changed.</Text></View> : null}
    </ScrollView>
    <View style={s.composerWrap}><View style={s.composer}><TextInput value={question} onChangeText={setQuestion} onFocus={() => setComposerFocused(true)} onBlur={() => setComposerFocused(false)} placeholder="Ask about your health history…" placeholderTextColor="#8A818D" style={s.input} multiline maxLength={2000} editable={!busy && !proposalSaving} /><Animated.View style={{ transform: [{ scale: sendScale }] }}><Pressable accessibilityRole="button" accessibilityLabel="Ask Nura" disabled={!question.trim() || busy || proposalSaving} onPress={startQuestion} onPressIn={() => animateSend(motion.pressScale)} onPressOut={() => animateSend(1)} style={[s.sendButton, (!question.trim() || busy || proposalSaving) && s.sendDisabled]}><Text style={[s.sendText, (!question.trim() || busy || proposalSaving) && s.sendTextDisabled]}>↑</Text></Pressable></Animated.View></View><Text style={s.composerNote}>Conversation saves on this device. Selected context is sent for an answer only after you confirm.</Text></View>
      <Modal visible={consentOpen} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setConsentOpen(false)}><View style={[s.modalShade, Platform.OS === 'web' && s.modalShadeWeb]}><ScrollView style={[s.modalCard, Platform.OS === 'web' && s.modalCardWeb]} contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled"><View style={s.modalHandle} /><Text style={s.modalEyebrow}>YOUR CHOICE · THIS ANSWER</Text><Text style={s.modalTitle}>{registryBriefMode ? 'Review what goes into this summary.' : 'Choose what Nura can use.'}</Text><Text style={s.modalBody}>When you continue, your question and selected details below are sent to Nura’s AI service to prepare an answer. Its privacy practices apply. Original files are never included. If you select report details below, only saved text from those sources is shared. {registryBriefMode ? 'This summary uses only the selected health area and its connected records. Recent chat messages are excluded.' : ''} {coverageQuestion ? 'For a policy review, Nura uses only the reviewed policy terms and health details you select. It does not search the web.' : ''} Nothing is sent until you continue.</Text><View style={s.shareList}>{policyReviewMode ? <>
        <ShareToggle label={policyComparisonMode ? 'Terms from these two policy documents' : 'Terms from this policy document'} count={availablePolicyFacts.length} selected={sharePolicyTerms} onPress={() => setSharePolicyTerms((value) => !value)} />
        <Text style={s.shareHint}>Choose the personal health facts Nura may compare. No health fact is selected by default.</Text>
        {availableHealthFacts.length ? availableHealthFacts.map((fact) => <HealthFactToggle key={fact.id} fact={fact} selected={selectedHealthFactIds.includes(fact.id)} onPress={() => setSelectedHealthFactIds((current) => current.includes(fact.id) ? current.filter((id) => id !== fact.id) : [...current, fact.id])} />) : <ShareRow label="Personal health facts" count="None saved yet" excluded />}
        <ShareToggle label={policyComparisonMode ? 'Text from the two linked policy sources' : 'Text from this policy source'} count={sourceContextLoading ? 'Checking source…' : linkedDocumentContexts.length ? `${linkedDocumentContexts.length} source${linkedDocumentContexts.length === 1 ? '' : 's'} · saved text only` : 'None available'} selected={sourceContextSelected && linkedDocumentContexts.length > 0} disabled={sourceContextLoading || !linkedDocumentContexts.length} onPress={() => setShareSourceContext((value) => !(value ?? policyReviewMode))} />
        <ShareToggle label="Treatment and medicine records" count={scopedContext.treatments.length} selected={shareTreatments} onPress={() => setShareTreatments((value) => !value)} />
        <ShareToggle label="Visits and follow-up history" count={scopedContext.visits.length} selected={shareVisits} onPress={() => setShareVisits((value) => !value)} />
      </> : <>
        <ShareToggle label="Saved health facts" count={scopedContext.facts.length} selected={shareFacts} onPress={() => setShareFacts((value) => !value)} /><ShareToggle label="Health areas you selected" count={scopedContext.topics.length} selected={shareTopics} onPress={() => setShareTopics((value) => !value)} /><ShareToggle label="Links you created" count={scopedContext.links.length} selected={shareLinks} onPress={() => setShareLinks((value) => !value)} />{registryBriefMode ? <ShareRow label="Recent chat messages" count="Not included in this summary" excluded /> : <ShareToggle label="Recent chat messages" count={historyForConsent.length} selected={shareHistory} onPress={() => setShareHistory((value) => !value)} />}<ShareToggle label="Treatment and medicine records" count={scopedContext.treatments.length} selected={shareTreatments} onPress={() => setShareTreatments((value) => !value)} /><ShareToggle label="Visits and follow-up history" count={scopedContext.visits.length} selected={shareVisits} onPress={() => setShareVisits((value) => !value)} /><ShareToggle label="Details from linked reports" count={sourceContextLoading ? 'Checking linked sources…' : linkedDocumentContexts.length ? `${linkedDocumentContexts.length} source${linkedDocumentContexts.length === 1 ? '' : 's'} · text only` : 'None available'} selected={sourceContextSelected && linkedDocumentContexts.length > 0} disabled={sourceContextLoading || !linkedDocumentContexts.length} onPress={() => setShareSourceContext((value) => !(value ?? fileContext))} /><ShareToggle label="Search trusted health sources · general topics" count={coverageQuestion ? 'Not used for policy review' : service?.capabilities?.trustedHealthSearch ? (shareExternalSearch ? 'On · selected topics only' : 'Off') : 'Not available'} selected={shareExternalSearch && !coverageQuestion} disabled={coverageQuestion || !service?.capabilities?.trustedHealthSearch} onPress={() => setShareExternalSearch((value) => !value)} />
      </>}<ShareRow label="Name, contact details and original files" count="Not shared" excluded /></View><Text style={s.privacyNote}>Treatment, visit and report details stay out unless you select them above. Nura can organize your information, but does not advise starting, stopping or changing medicines, or treat personal notes as clinician instructions. Saved chat stays on this device unless you choose to include it. The AI service’s privacy practices apply to each request. Public health search stays off unless you opt in. Cancel to send nothing.</Text><Pressable onPress={() => void confirmAndSend()} style={s.confirmShare}><Text style={s.confirmShareText}>CONTINUE WITH SELECTED DETAILS</Text></Pressable><Pressable onPress={() => setConsentOpen(false)} style={s.cancelShare}><Text style={s.cancelShareText}>Not now</Text></Pressable></ScrollView></View></Modal>
  </KeyboardAvoidingView>;
}
function ShareRow({ label, count, excluded }: { label: string; count: string; excluded?: boolean }) { return <View style={s.shareRow}><Text style={s.shareLabel}>{label}</Text><Text style={[s.shareCount, excluded && s.shareExcluded]}>{count}</Text></View>; }
function PresentedAnswer({ text, textStyle, reducedMotion }: { text: string; textStyle: StyleProp<TextStyle>; reducedMotion: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const firstView = answerFirstView(text);
  const toggle = () => {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  };
  return <View>
    <Text style={textStyle}>{expanded || !firstView.expandable ? text : `${firstView.text}…`}</Text>
    {firstView.expandable ? <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={expanded ? 'Show less of Nura’s answer' : 'Read the full Nura answer'} onPress={toggle} style={s.answerDisclosure}><Text style={s.answerDisclosureText}>{expanded ? 'SHOW LESS ↑' : 'READ FULL ANSWER ↓'}</Text></Pressable> : null}
  </View>;
}
function ShareToggle({ label, count, selected, onPress, disabled = false }: { label: string; count: number | string; selected: boolean; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={s.shareRow}><View style={s.shareToggleLabel}><View style={[s.checkBox, selected && s.checkBoxOn]}><Text style={s.checkMark}>{selected ? '✓' : ''}</Text></View><Text style={s.shareLabel}>{label}</Text></View><Text style={[s.shareCount, (!count || disabled) && s.shareExcluded]}>{typeof count === 'number' ? `${count} ${count === 1 ? 'item' : 'items'}` : count}</Text></Pressable>; }
function HealthFactToggle({ fact, selected, onPress }: { fact: { id: string; label: string; value: string; source: string; date: string }; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={s.healthFactRow}><View style={[s.checkBox, selected && s.checkBoxOn]}><Text style={s.checkMark}>{selected ? '✓' : ''}</Text></View><View style={s.healthFactCopy}><Text style={s.shareLabel}>{fact.label}</Text><Text style={s.healthFactDetail}>{fact.value} · {fact.source} · {fact.date}</Text></View></Pressable>; }
type AgentCitationTarget = { kind: 'health'; focusId: string } | { kind: 'registry'; topicId: string } | { kind: 'external'; url: string } | null;

function EvidenceSourceCard({ source, target, onPress }: { source: AgentSource; target: AgentCitationTarget; onPress: () => void }) {
  const available = Boolean(target);
  const action = !target ? 'SOURCE UNAVAILABLE' : target.kind === 'external' ? 'OPEN SOURCE ↗' : target.kind === 'registry' ? 'OPEN HEALTH AREA ↗' : 'VIEW IN HISTORY ↗';
  const displayTitle = source.id.startsWith('link:') ? source.title.replace(/Saved item/g, 'an item not included in this review') : source.title;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !available }} accessibilityLabel={available ? 'Open cited source ' + displayTitle : 'Cited source unavailable: ' + displayTitle} disabled={!available} onPress={onPress} style={[s.citationCard, !available && s.citationCardUnavailable]}>
    <Text style={s.citationRef}>{source.reference}</Text>
    <View style={{ flex: 1 }}>
      <Text style={s.citationTitle}>{displayTitle}</Text>
      <Text style={s.citationDetail}>{source.source}{source.date ? ' · ' + source.date : ''}</Text>
      {source.detail ? <Text numberOfLines={2} style={s.citationEvidence}>{source.detail}</Text> : null}
      <Text style={available ? s.citationOpen : s.citationUnavailable}>{action}</Text>
    </View>
  </Pressable>;
}

function CoveragePanel({ assessments, sources, onOpenSource, targetFor }: { assessments: CoverageAssessment[]; sources: AgentSource[]; onOpenSource: (source: AgentSource) => void; targetFor: (source: AgentSource) => AgentCitationTarget }) {
  if (!assessments.length) return <View style={[s.coveragePanel, s.coverageEmpty]}><Text style={s.coverageHeading}>NO SPECIFIC HEALTH LINK ESTABLISHED</Text><Text style={s.coverageEmptyText}>Nura did not establish a specific connection between a reviewed policy term and the health details selected for this answer. This does not confirm or rule out an effect on cover.</Text></View>;
  const byReference = new Map(sources.map((source) => [source.reference, source]));
  const labels: Record<CoverageAssessment['kind'], { title: string; tone: string; tint: string }> = {
    explicit_benefit: { title: 'BENEFIT STATED', tone: '#BCE8D0', tint: 'rgba(100, 181, 139, 0.20)' },
    explicit_limit: { title: 'LIMIT STATED', tone: '#FFD797', tint: 'rgba(226, 164, 82, 0.20)' },
    explicit_exclusion: { title: 'EXCLUSION STATED', tone: '#FFC0B2', tint: 'rgba(192, 92, 75, 0.20)' },
    unclear: { title: 'WORDING UNCLEAR', tone: '#D7C2F1', tint: 'rgba(190, 159, 220, 0.20)' },
  };
  return <View style={s.coveragePanel}><Text style={s.coverageHeading}>WHAT THE REVIEWED POLICY SAYS</Text><Text style={s.coverageContextNote}>Selected health details provide context for this review. Their presence does not establish that a term applies to you or predict an insurer decision.</Text>
    {assessments.map((item, index) => {
      const appearance = labels[item.kind];
      const policy = byReference.get(item.policyReference);
      const related = item.relatedHealthReferences.map((reference) => byReference.get(reference)).filter((source): source is AgentSource => Boolean(source));
      return <View key={item.policyReference + '-' + index} style={s.coverageItem}>
        <View style={s.coverageItemTop}><Text style={s.coverageKind}>{appearance.title}</Text><Text style={[s.coveragePill, { color: appearance.tone, backgroundColor: appearance.tint }]}>{item.policyReference}</Text></View>
        <Text style={s.coverageDetail}>{item.detail}</Text>
        {policy ? <Pressable accessibilityRole="button" accessibilityLabel={'Open cited policy source ' + policy.title} disabled={!targetFor(policy)} onPress={() => onOpenSource(policy)} style={s.coverageSourceAction}><Text style={s.coverageSource}>Policy · {policy.title}  ↗</Text></Pressable> : <Text style={s.coverageSource}>Policy source unavailable</Text>}
        {related.length > 0 && <View style={s.coverageRelatedRow}><Text style={s.coverageRelatedPrefix}>Selected health detail · </Text>{related.map((source) => <Pressable key={source.reference} accessibilityRole="button" accessibilityLabel={'Open cited health source ' + source.title} disabled={!targetFor(source)} onPress={() => onOpenSource(source)}><Text style={s.coverageRelated}>{source.title} ↗</Text></Pressable>)}</View>}
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
  citationCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 9, paddingHorizontal: 9, borderRadius: 10, backgroundColor: C.bluePale, borderWidth: 1, borderColor: 'rgba(183, 208, 255, 0.22)', marginTop: 5 },
  citationCardUnavailable: { opacity: .65 },
  citationRef: { color: C.blue, fontSize: 9, fontWeight: '700', width: 22 },
  citationTitle: { color: C.ink, fontSize: 10, fontWeight: '600' },
  citationDetail: { color: C.muted, fontSize: 8, marginTop: 2 },
  citationEvidence: { color: C.faint, fontSize: 8, lineHeight: 12, marginTop: 4 },
  citationOpen: { color: C.blue, fontSize: 7, fontWeight: '700', letterSpacing: .55, marginTop: 4 },
  citationUnavailable: { color: C.faint, fontSize: 7, fontWeight: '600', letterSpacing: .45, marginTop: 4 },

  liveCard: { backgroundColor: C.surfaceRaised, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(242, 191, 165, 0.34)', padding: 13, marginTop: 12 },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  stopRunButton: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255, 249, 246, 0.38)', paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(255, 249, 246, 0.10)' },
  stopRunText: { color: C.ink, fontSize: 9, fontWeight: '700', letterSpacing: .25 },
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
  answerDisclosure: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 8 },
  answerDisclosureText: { color: C.blue, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  unknownBox: { backgroundColor: C.amber, padding: 10, borderRadius: 12, marginTop: 11 },
  unknownTitle: { color: C.amberInk, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  unknownText: { color: C.ink, fontSize: 10, lineHeight: 15, marginTop: 5 },
  unknownScope: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 7 },
  nextBox: { backgroundColor: C.bluePale, padding: 10, borderRadius: 12, marginTop: 9 },
  nextTitle: { color: C.blue, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  nextText: { color: C.ink, fontSize: 10, lineHeight: 15, marginTop: 5 },
  proposal: { backgroundColor: C.lilac, borderWidth: 1, borderColor: 'rgba(210, 184, 231, 0.32)', padding: 11, borderRadius: 13, marginTop: 11 },
  proposalTitle: { color: C.plum, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  proposalText: { color: C.ink, fontSize: 11, fontWeight: '600', marginTop: 6 },
  proposalReason: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 4 },
  proposalSources: { marginTop: 9, gap: 6 },
  proposalSourceHeading: { color: C.faint, fontSize: 7, fontWeight: '700', letterSpacing: 0.8 },
  proposalSourceLink: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  proposalSourceLinkDisabled: { opacity: 0.65 },
  proposalSourceRef: { color: C.blue, fontSize: 8, fontWeight: '700' },
  proposalSourceTitle: { color: C.ink, fontSize: 9, fontWeight: '600' },
  proposalSourceAction: { color: C.blue, fontSize: 7, fontWeight: '700', letterSpacing: 0.5, marginTop: 3 },
  proposalSourceUnavailable: { color: C.faint, fontSize: 8, lineHeight: 12 },
  proposalSaveError: { color: '#FFD2C4', fontSize: 9, lineHeight: 13, marginTop: 7 },
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
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, backgroundColor: '#FBF6F0', borderWidth: 1, borderColor: 'rgba(255,255,255,0.64)', borderRadius: 19, paddingLeft: 13, paddingRight: 7, paddingVertical: 7, maxWidth: 600, width: '100%', alignSelf: 'center' },
  input: { flex: 1, color: C.plumInk, minHeight: 39, maxHeight: 100, paddingVertical: 9, fontSize: 11, textAlignVertical: 'center' },
  sendButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#493452', alignItems: 'center', justifyContent: 'center', shadowColor: '#493452', shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  sendDisabled: { backgroundColor: '#D9CEDC', shadowOpacity: 0 },
  sendText: { color: '#FFFFFF', fontSize: 19, fontWeight: '600', lineHeight: 23 },
  sendTextDisabled: { color: '#66586F' },
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
  shareHint: { color: C.faint, fontSize: 9, lineHeight: 14, paddingTop: 10 },
  shareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 249, 246, 0.09)' },
  healthFactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 249, 246, 0.09)' }, healthFactCopy: { flex: 1, gap: 3 }, healthFactDetail: { color: C.faint, fontSize: 9, lineHeight: 13 },
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
  coverageContextNote: { color: C.muted, fontSize: 8, lineHeight: 12, marginBottom: 6 },
  coverageEmpty: { backgroundColor: 'rgba(226, 164, 82, 0.10)', borderColor: 'rgba(255, 215, 151, 0.28)' },
  coverageEmptyText: { color: C.muted, fontSize: 9, lineHeight: 14 },
  coverageItem: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 11, padding: 9, marginTop: 5 },
  coverageItemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
  coverageKind: { color: C.ink, fontSize: 8, fontWeight: '700', letterSpacing: 0.5, flex: 1 },
  coveragePill: { overflow: 'hidden', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3, fontSize: 7, fontWeight: '700' },
  coverageDetail: { color: C.ink, fontSize: 10, lineHeight: 15, marginTop: 6 },
  coverageSourceAction: { alignSelf: 'flex-start' },
  coverageSource: { color: C.blue, fontSize: 8, marginTop: 6 },
  coverageRelatedRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  coverageRelatedPrefix: { color: C.muted, fontSize: 8, lineHeight: 13 },
  coverageRelated: { color: C.blue, fontSize: 8, lineHeight: 13 },
});
