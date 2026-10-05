import React, { useEffect, useMemo, useRef, useState } from 'react';
import { animatedNativeDriver } from '../src/services/animatedDriver';
import { AccessibilityInfo, Animated, Easing, findNodeHandle, Image, Keyboard, KeyboardAvoidingView, LayoutAnimation, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as Crypto from 'expo-crypto';
import { Orb } from '../src/components/Orb';
import { GlassMaterial } from '../src/components/GlassMaterial';
import { EtchedContours } from '../src/components/ambient/Atmosphere';
import { AgentAnswer, AgentAvailability, AgentEvent, AgentRunInput, AgentSource, AgentTrace, CoverageAssessment, getAgentStatus, runNuraAgent } from '../src/services/agentClient';
import { getSourceClaims, sourceMatchesAsset } from '../src/services/intakeClient';
import { useNura } from '../src/state/NuraContext';
import { useAIState } from '../src/state/AIStateContext';
import { brandScenes, motion } from '../src/theme';
import { scopeProfileContext } from '../src/services/agentContextScope.mjs';
import { registryBriefCitations, registryBriefDisplayText } from '../src/services/registryBrief.mjs';
import { agentCitationTarget } from '../src/services/agentCitationNavigation.mjs';
import { resolvePolicyReviewSourceIds, selectPolicyReviewFacts } from '../src/services/policyReviewScope.mjs';
import { createAgentRunEventGate } from '../src/services/agentRunLifecycle.mjs';
import { askAnswerFirstView, askRelevanceSummary, askSelectedReadingFollowUps, sameAskPublicSource, conversationalAnswerBlocks, conversationalAnswerPreview } from '../src/services/askAnswerPresentation.mjs';
import { selectAskHealthFacts } from '../src/services/askHealthFactSelection.mjs';
import { createAskClarificationReply } from '../src/services/askClarificationReply.mjs';
import { selectAskSourceContext } from '../src/services/askSourceContext.mjs';
import { deriveAgeForMeasurements } from '../src/services/derivedHealthMeasures.mjs';
import { createConversationTitle, selectLinkedConversationContext, selectRecentConversationMessages, sortConversationsByLatestActivity } from '../src/services/conversationHistory.mjs';
import { getYouTubeThumbnailForVideo, getYouTubeVideoId } from '../src/services/youtubeVideo.mjs';
import InlineYouTubePlayer from '../src/components/InlineYouTubePlayer';
import InlineSourceReader from '../src/components/InlineSourceReader';
import VideoArtworkFallback from '../src/components/VideoArtworkFallback';
import type { AskReadingSource } from '../src/state/NuraContext';
import type { ConsentScope } from '../src/services/consentReceipts.mjs';

const C = {
  bg: brandScenes.atmosphere.base,
  ink: '#FFF9F3',
  muted: '#F2EAF0',
  faint: '#DED0E0',
  line: 'rgba(255, 249, 246, 0.20)',
  white: '#FFF9F3',
  surface: 'rgba(255, 249, 246, 0.10)',
  surfaceRaised: 'rgba(255, 249, 246, 0.16)',
  surfaceDeep: 'rgba(43, 30, 26, 0.94)',
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
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ context?: string; recordId?: string; question?: string; profileContext?: string; readingSourceId?: string; conversationId?: string; policySourceIds?: string; registryBriefTopicId?: string; registryBriefTopicLabel?: string; registrySourceSignature?: string }>();
  const { name, birthday, email, phone, facts, topics, links, treatments, visits, assets, feedItems, agentMessages, askConversations, addAgentMessage, ensureAskConversation, linkAskConversation, saveRegistryBrief, deleteAskConversation, addQuestion, saveApprovedMemoryFact, recordConsentReceipt } = useNura();
  const requestedConversationId = typeof params.conversationId === 'string' ? params.conversationId : '';
  const [activeConversationId, setActiveConversationId] = useState(() => requestedConversationId || Crypto.randomUUID());
  const [linkedConversationOverride, setLinkedConversationOverride] = useState<string[] | null>(null);
  const [conversationSheet, setConversationSheet] = useState<'recent' | 'link' | null>(null);
  const [suppressEntryMedia, setSuppressEntryMedia] = useState(false);
  const currentConversation = askConversations.find((conversation) => conversation.id === activeConversationId) ?? null;
  const linkedConversationIds = linkedConversationOverride ?? currentConversation?.linkedConversationIds ?? [];
  const conversationMessages = agentMessages.filter((message) => message.conversationId === activeConversationId);
  const orderedConversations = useMemo(() => sortConversationsByLatestActivity(askConversations), [askConversations]);
  const readingSourceId = typeof params.readingSourceId === 'string' ? params.readingSourceId : '';
  const readingSourceItem = readingSourceId ? feedItems.find((item) => item.id === readingSourceId) ?? null : null;
  const readingSourceMode = Boolean(readingSourceId) && !suppressEntryMedia && conversationMessages.length === 0;
  const readingSource = useMemo<AskReadingSource | null>(() => {
    if (suppressEntryMedia || conversationMessages.length > 0) return null;
    if (!readingSourceItem) return null;
    return {
      title: readingSourceItem.title.slice(0, 180),
      publisher: readingSourceItem.publisher.slice(0, 140),
      topic: readingSourceItem.topic.slice(0, 120),
      mediaType: getYouTubeVideoId(readingSourceItem.url) ? 'video' : 'article',
      summary: readingSourceItem.detail.slice(0, 1200),
      url: readingSourceItem.url,
    };
  }, [readingSourceItem, suppressEntryMedia, conversationMessages.length]);
  const activeReadingSource = readingSource ?? [...conversationMessages].reverse().find((message) => message.role === 'user' && message.readingSource)?.readingSource ?? null;
  const recordId = typeof params.recordId === 'string' ? params.recordId : null;
  const requestedPolicySourceIds = typeof params.policySourceIds === 'string' ? params.policySourceIds.split(',').filter(Boolean) : [];
  const policyReviewSourceKey = resolvePolicyReviewSourceIds(requestedPolicySourceIds, facts).join('|');
  const policyReviewSourceIds = useMemo(() => policyReviewSourceKey ? policyReviewSourceKey.split('|') : [], [policyReviewSourceKey]);
  const policyReviewMode = policyReviewSourceIds.length > 0;
  const policyComparisonMode = policyReviewSourceIds.length === 2;
  const fileContext = recordId?.startsWith('asset:') ?? false;
  const selectedAsset = fileContext ? assets.find((asset) => `asset:${asset.id}` === recordId) ?? null : null;
  const [includeWholeProfileFromSource, setIncludeWholeProfileFromSource] = useState(false);
  const registryBriefTopicId = typeof params.registryBriefTopicId === 'string' ? params.registryBriefTopicId : '';
  const registryBriefTopic = topics.find((topic) => topic.id === registryBriefTopicId);
  const registrySourceSignature = typeof params.registrySourceSignature === 'string' ? params.registrySourceSignature : '';
  const registryBriefMode = Boolean(registryBriefTopic && recordId === `topic:${registryBriefTopicId}` && /^[a-f0-9]{64}$/i.test(registrySourceSignature));
  const fullProfileContextMode = (params.profileContext === 'full' || includeWholeProfileFromSource) && !policyReviewMode && !registryBriefMode && !readingSourceMode;
  const { state: aiState, dispatchRunEvent, setComposerFocused } = useAIState();
  const [question, setQuestion] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [composerNotice, setComposerNotice] = useState('');
  const [checkingBeforeSend, setCheckingBeforeSend] = useState(false);
  const [includeClarificationReply, setIncludeClarificationReply] = useState(false);
  const sendCheckLock = useRef(false);
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [sources, setSources] = useState<AgentSource[]>([]);
  const [trace, setTrace] = useState<AgentTrace[]>([]);
  const [error, setError] = useState('');
  const [messageSaveWarning, setMessageSaveWarning] = useState('');
  const [service, setService] = useState<AgentAvailability | null>(null);
  const [activeVideo, setActiveVideo] = useState<{ id: string; title: string; sourceTitle: string } | null>(null);
  const [activeArticle, setActiveArticle] = useState<{ url: string; title: string } | null>(null);
  const questionInputRef = useRef<TextInput>(null);
  const answerHeadingRef = useRef<Text>(null);
  const answerFocusRun = useRef<string | null>(null);
  const credentialRejected = service?.failureCode === 'ai_credential_rejected';
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
  const [shareCalculatedAge, setShareCalculatedAge] = useState(fullProfileContextMode);
  const [shareEarlierValues, setShareEarlierValues] = useState(false);
  const [shareTopics, setShareTopics] = useState(!policyReviewMode);
  const [shareLinks, setShareLinks] = useState(!policyReviewMode);
  const [shareHistory, setShareHistory] = useState(!registryBriefMode && !policyReviewMode);
  const [shareLinkedHistory, setShareLinkedHistory] = useState(false);
  const [shareTreatments, setShareTreatments] = useState(fullProfileContextMode);
  const [shareVisits, setShareVisits] = useState(fullProfileContextMode);
  const [sharePolicyTerms, setSharePolicyTerms] = useState(policyReviewMode);
  const [selectedHealthFactIds, setSelectedHealthFactIds] = useState<string[]>([]);
  const [excludedHealthFactIds, setExcludedHealthFactIds] = useState<string[]>([]);
  const [factSelectionExpanded, setFactSelectionExpanded] = useState(false);
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
    facts: facts.filter((fact) => fact.reviewState !== 'user_retracted').map(({ id, label, value, date, category, source, status, sourceId, sourceClaimId, reviewState, validFrom, validUntil }) => ({ id, label, value, date, category, source, status, sourceId, sourceClaimId, reviewState, validFrom, validUntil })),
    topics: topics.map(({ id, label }) => ({ id, label })),
    links: links.map(({ id, from, to, relationType, label, createdAt }) => ({ id, from, to, relationType, label, createdAt })),
    treatments: treatments.map(({ id, name, dose, schedule, purpose, prescriber, careLocation, pharmacy, status, startedOn, endedOn, source }) => ({ id, name, dose, schedule, purpose, prescriber, careLocation, pharmacy, status, startedOn, endedOn: endedOn ?? '', source })),
    visits: visits.map(({ id, purpose, appointmentAt, clinician, location, status, source, questions, outcome, followUp, followUpActions }) => ({ id, purpose, appointmentAt, clinician, location, status, source, questions: [...questions], outcome, followUp, followUpActions: (followUpActions ?? []).map(({ id: actionId, title, dueOn, status: actionStatus, source: actionSource }) => ({ id: actionId, title, dueOn, status: actionStatus, source: actionSource })) })),
  }), [facts, topics, links, treatments, visits]);
  const sourceAskContext = useMemo(() => readingSourceItem
    ? selectAskSourceContext(readingSourceItem, personalContext, [name, email, phone])
    : null, [readingSourceItem, personalContext, name, email, phone]);
  const availablePolicyFacts = personalContext.facts.filter((fact) => !fact.validUntil && /^(insurance coverage|coverage_term|coverage term)$/i.test(fact.category) && policyReviewSourceIds.includes(fact.sourceId ?? ''));
  const availableHealthFacts = personalContext.facts.filter((fact) => !fact.validUntil && fact.category !== 'Insurance coverage');
  const reviewedSourceFactCount = selectedAsset?.serverSourceId
    ? personalContext.facts.filter((fact) => fact.sourceId === selectedAsset.serverSourceId && !fact.validUntil).length
    : 0;
  const historyForConsent = selectRecentConversationMessages(conversationMessages, activeConversationId, { maxTurns: 6, maxChars: 6000 });
  const linkedConversationId = linkedConversationIds[0] ?? '';
  const linkedConversationContext = linkedConversationId ? selectLinkedConversationContext({ conversations: askConversations, messages: agentMessages, currentConversationId: activeConversationId, linkedConversationId, maxTurns: 4, maxChars: 4000 }) : null;
  const scopedContext = useMemo(() => {
    const scoped = scopeProfileContext(personalContext, recordId, { includeWholeProfile: fullProfileContextMode });
    if (policyReviewMode) return {
      ...scoped,
      facts: scoped.facts.filter((fact) => !fact.validUntil && (!/^(insurance coverage|coverage_term|coverage term)$/i.test(fact.category) || policyReviewSourceIds.includes(fact.sourceId ?? ''))),
      topics: [],
      links: [],
    };
    if (readingSourceMode && sourceAskContext) return { ...scoped, ...sourceAskContext };
    if (!fileContext || !selectedAsset?.serverSourceId || fullProfileContextMode) return fullProfileContextMode ? scoped : { ...scoped, facts: scoped.facts.filter((fact) => !fact.validUntil) };
    return { ...scoped, facts: personalContext.facts.filter((fact) => fact.sourceId === selectedAsset.serverSourceId && !fact.validUntil) };
  }, [personalContext, recordId, fileContext, selectedAsset, policyReviewMode, policyReviewSourceIds, fullProfileContextMode, readingSourceMode, sourceAskContext]);
  const sourceAssets = useMemo(() => {
    const sourceIds = new Set(scopedContext.facts.filter((fact) => !fact.validUntil).map((fact) => fact.sourceId).filter((id): id is string => Boolean(id)));
    if (selectedAsset?.serverSourceId) sourceIds.add(selectedAsset.serverSourceId);
    return assets.filter((asset) => Boolean(asset.serverSourceId && sourceIds.has(asset.serverSourceId) && (!policyReviewMode || policyReviewSourceIds.includes(asset.serverSourceId)))).slice(0, 5);
  }, [assets, scopedContext.facts, selectedAsset, policyReviewMode, policyReviewSourceIds]);
  const sourceContextKey = sourceAssets.map((asset) => `${asset.id}:${asset.serverSourceId}`).join('|');
  const linkedDocumentContexts = sourceContextSnapshot.key === sourceContextKey ? sourceContextSnapshot.documents : [];
  const sourceContextLoading = sourceAssets.length > 0 && sourceContextSnapshot.key !== sourceContextKey;
  const sourceContextSelected = shareSourceContext ?? (fileContext || policyReviewMode || fullProfileContextMode);
  const selectedHistory = registryBriefMode || policyReviewMode ? [] : [
    ...(shareLinkedHistory && linkedConversationContext ? linkedConversationContext.messages : []),
    ...(shareHistory ? historyForConsent : []),
  ].map((message) => ({ role: message.role, content: message.text, ...(message.readingSource ? { readingSource: message.readingSource } : {}) }));
  const currentFacts = scopedContext.facts.filter((fact) => !fact.validUntil);
  const earlierFacts = fullProfileContextMode ? scopedContext.facts.filter((fact) => Boolean(fact.validUntil) && fact.reviewState !== 'user_retracted') : [];
  const selectedContext = policyReviewMode
    ? { facts: selectPolicyReviewFacts(personalContext.facts, policyReviewSourceIds, sharePolicyTerms, selectedHealthFactIds), topics: [], links: [] }
    : { facts: [...selectAskHealthFacts(currentFacts, shareFacts, excludedHealthFactIds), ...(shareEarlierValues && shareFacts ? selectAskHealthFacts(earlierFacts, shareFacts, excludedHealthFactIds) : [])], topics: shareTopics ? scopedContext.topics : [], links: shareLinks ? scopedContext.links : [] };
  const ageForSelectedMeasurements = deriveAgeForMeasurements(birthday, selectedContext.facts);
  const calculatedAgeContext = ageForSelectedMeasurements && ageForSelectedMeasurements.ageAtMeasurement >= 2 ? ageForSelectedMeasurements : null;
  const clarificationReply = useMemo(() => {
    if (registryBriefMode || policyReviewMode || readingSourceMode || fileContext) return null;
    return createAskClarificationReply(question, conversationMessages);
  }, [question, conversationMessages, registryBriefMode, policyReviewMode, readingSourceMode, fileContext]);

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const checkService = async () => {
      const status = await getAgentStatus();
      if (!mounted) return;
      setService(status);
      if (!status.available) retryTimer = setTimeout(() => { void checkService(); }, 5_000);
    };
    void checkService();
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; if (retryTimer) clearTimeout(retryTimer); subscription.remove(); };
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
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => {
    if (!answer || busy || !activeRunId || answerFocusRun.current !== activeRunId || Platform.OS === 'web') return;
    answerFocusRun.current = null;
    const frame = requestAnimationFrame(() => {
      const tag = findNodeHandle(answerHeadingRef.current);
      if (tag !== null) AccessibilityInfo.setAccessibilityFocus(tag);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeRunId, answer, busy]);
  async function startQuestion() {
    if (!question.trim() || busy || proposalSaving || proposalSaveLock.current || sendCheckLock.current) return;
    if (readingSourceMode && !readingSource) {
      setComposerNotice('This selected source is no longer available. Return to Explore and choose it again.');
      return;
    }
    sendCheckLock.current = true;
    setCheckingBeforeSend(true);
    setComposerNotice('');
    try {
      // Refresh on send so a recovered local server does not leave this screen
      // blocked by an old unavailable status. No health data is sent here.
      const currentService = await getAgentStatus();
      if (!mounted.current) return;
      setService(currentService);
      if (!currentService.available) {
        setError('');
        setComposerNotice(`${currentService.reason ?? 'Nura cannot connect right now.'} Your question is still here; try again after Nura reconnects.`);
        return;
      }
      setError('');
      setIncludeClarificationReply(false);
      setExcludedHealthFactIds([]);
      setFactSelectionExpanded(false);
      setShareEarlierValues(false);
      if (policyReviewMode) setSelectedHealthFactIds([]);
      setConsentOpen(true);
    } catch {
      if (mounted.current) {
        setError('');
        setComposerNotice('Nura could not check its connection. Your question is still here; try again shortly.');
      }
    } finally {
      sendCheckLock.current = false;
      if (mounted.current) setCheckingBeforeSend(false);
    }
  }
  function openSourceReview() {
    if (!selectedAsset) return;
    router.push({ pathname: '/review', params: { purpose: selectedAsset.purpose === 'insurance' ? 'insurance' : 'medical', assetId: selectedAsset.id } });
  }
  function openReadingSource(source: AskReadingSource) {
    if (source.mediaType === 'video') {
      const id = getYouTubeVideoId(source.url ?? '');
      if (id) setActiveVideo({ id, title: source.title, sourceTitle: source.title });
      else setComposerNotice('This video link is no longer available.');
      return;
    }
    if (source.url && /^https:\/\//i.test(source.url)) setActiveArticle({ url: source.url, title: source.title });
    else setComposerNotice('This article link is not available.');
  }
  function chooseFollowUp(value: string) {
    setQuestion(value);
    setComposerNotice('');
    setTimeout(() => questionInputRef.current?.focus(), 60);
  }
  function toggleWholeProfileScope() {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !fullProfileContextMode;
    setIncludeWholeProfileFromSource(next);
    setShareCalculatedAge(next);
    setShareTreatments(next);
    setShareVisits(next);
    if (!next) setShareEarlierValues(false);
  }
  function animateSend(toValue: number) {
    if (reducedMotion || busy || !question.trim() || proposalSaving) return;
    Animated.timing(sendScale, { toValue, duration: toValue === 1 ? motion.pressOut : motion.pressIn, easing: toValue === 1 ? Easing.bezier(...motion.easing.bouncy) : Easing.linear, useNativeDriver: animatedNativeDriver }).start();
  }
  async function confirmAndSend() {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || busy || activeRunController.current || proposalSaveLock.current) return;
    if (clarificationReply && !includeClarificationReply) return;
    const approvedClarificationReply = clarificationReply && includeClarificationReply
      ? createAskClarificationReply(cleanQuestion, conversationMessages, { includeReply: true })
      : null;
    const requestQuestion = approvedClarificationReply?.requestText ?? cleanQuestion;
    setConsentOpen(false);
    questionInputRef.current?.blur();
    setQuestion('');
    setAnswer(null); setSources([]); setTrace([]); setError(''); setMessageSaveWarning(''); setProposalSaved(false); setProposalSaving(false); setProposalSaveError(''); setRegistryBriefSaved(false); setRegistryBriefSaveError(''); setBusy(true);
    const runId = Crypto.randomUUID();
    answerFocusRun.current = runId;
    const controller = new AbortController();
    const runGate = createAgentRunEventGate();
    activeRunController.current = controller;
    setActiveRunId(runId);
    const userMessage = { runId, role: 'user' as const, conversationId: activeConversationId, text: cleanQuestion, citations: [], trace: [], ...(readingSource ? { readingSource } : {}) };
    let runTrace: AgentTrace[] = [];
    let runSources: AgentSource[] = [];
    let finalAnswer: AgentAnswer | null = null;
    const previous = selectedHistory;
    try {
      const consentScopes: ConsentScope[] = ['user_question'];
      if (approvedClarificationReply) consentScopes.push('ask_clarification_reply');
      if (readingSource) consentScopes.push('selected_public_source');
      if (shareFacts && selectedContext.facts.length) consentScopes.push('saved_details');
      if (shareTopics && selectedContext.topics.length) consentScopes.push('health_areas');
      if (shareLinks && selectedContext.links.length) consentScopes.push('record_links');
      if (shareEarlierValues && shareFacts && selectedContext.facts.some((fact) => Boolean(fact.validUntil))) consentScopes.push('earlier_values');
      if (shareCalculatedAge && calculatedAgeContext) consentScopes.push('derived_age');
      if (previous.length) consentScopes.push('recent_messages');
      if (shareTreatments && scopedContext.treatments.length) consentScopes.push('treatments');
      if (shareVisits && scopedContext.visits.length) consentScopes.push('visits');
      if (sourceContextSelected && linkedDocumentContexts.length) consentScopes.push('linked_report_text');
      if (shareExternalSearch && !coverageQuestion) consentScopes.push('public_health_search');
      await recordConsentReceipt({ consentConfirmed: true, purpose: shareExternalSearch && !coverageQuestion ? 'health_search' : 'ask', scopes: consentScopes });
      router.setParams({ conversationId: activeConversationId });
      await ensureAskConversation(activeConversationId, readingSource ? `What is ${readingSource.title}?` : cleanQuestion, linkedConversationIds);
      await addAgentMessage(userMessage);
      setSuppressEntryMedia(true);
      if (!approvedClarificationReply) addQuestion(cleanQuestion);
      dispatchRunEvent('RUN_STARTED');
      await runNuraAgent({ runId, question: requestQuestion, consentConfirmed: true, history: previous, recentMessagesConsent: previous.length > 0 && ((shareHistory && historyForConsent.length > 0) || (shareLinkedHistory && Boolean(linkedConversationContext?.messages.length))), externalSearchConsent: shareExternalSearch && !coverageQuestion, derivedAgeConsent: shareCalculatedAge && Boolean(calculatedAgeContext), treatmentContextConsent: shareTreatments, visitContextConsent: shareVisits, sourceContextConsent: sourceContextSelected && linkedDocumentContexts.length > 0, historyContextConsent: fullProfileContextMode && shareFacts && shareEarlierValues, ...(readingSource ? { readingSource } : {}), context: { ...selectedContext, ...(shareCalculatedAge && calculatedAgeContext ? { demographics: calculatedAgeContext } : {}), treatments: shareTreatments ? scopedContext.treatments : [], visits: shareVisits ? scopedContext.visits : [], documentSources: sourceContextSelected ? linkedDocumentContexts : [] } }, (event: AgentEvent) => {
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
      try {
        await addAgentMessage({ runId, role: 'assistant', conversationId: activeConversationId, text: finalAnswer.answer, citations: cited, trace: runTrace.map((item) => ({ ...item, status: 'complete' })), meaning: finalAnswer.meaning, unknowns: finalAnswer.unknowns, nextSteps: finalAnswer.nextSteps, coverageAssessments: finalAnswer.coverageAssessments, ...(readingSource ? { readingSource } : {}) });
      } catch {
        setMessageSaveWarning('This answer is ready, but device storage could not save it to your conversation history.');
      }
      dispatchRunEvent('RUN_FINISHED');
    } catch (caught) {
      const message = controller.signal.aborted
        ? 'This run was stopped. You can try again when you’re ready.'
        : caught instanceof Error ? caught.message : 'Nura could not complete this answer.';
      runGate.cancel(message);
      answerFocusRun.current = null;
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
  function openSavedConversation(conversationId: string) {
    if (busy) return;
    setActiveConversationId(conversationId);
    setLinkedConversationOverride(null);
    setShareLinkedHistory(false);
    router.setParams({ conversationId });
    setSuppressEntryMedia(true);
    setConversationSheet(null);
    setQuestion(''); setAnswer(null); setSources([]); setTrace([]); setError(''); setMessageSaveWarning('');
    setActiveVideo(null); setActiveArticle(null);
  }
  function startNewConversation() {
    if (busy) return;
    const id = Crypto.randomUUID();
    setActiveConversationId(id);
    router.setParams({ conversationId: id });
    setLinkedConversationOverride([]);
    setShareLinkedHistory(false);
    setSuppressEntryMedia(false);
    setConversationSheet(null);
    setQuestion(''); setAnswer(null); setSources([]); setTrace([]); setError(''); setMessageSaveWarning('');
    setActiveVideo(null); setActiveArticle(null);
    setShareLinkedHistory(false);
  }
  function connectPreviousConversation(conversationId: string) {
    if (busy || conversationId === activeConversationId) return;
    const next = [conversationId];
    setLinkedConversationOverride(next);
    setShareLinkedHistory(false);
    if (currentConversation) void linkAskConversation(activeConversationId, next).catch((caught) => setError(caught instanceof Error ? caught.message : 'This chat could not be linked.'));
    setConversationSheet(null);
  }
  async function removeConversation(conversationId: string) {
    await deleteAskConversation(conversationId);
    if (activeConversationId === conversationId) startNewConversation();
  }
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
      await saveApprovedMemoryFact(proposal.label, proposal.value, { category: proposal.sourceKind === 'user_statement' ? 'Self-reported health context' : 'User-approved memory', source: proposal.sourceKind === 'user_statement' ? 'Your statement · confirmed by you' : 'Nura suggestion · confirmed by you', note: proposal.reason || 'Suggested in an Ask Nura conversation and approved by you.', sourceRunId: activeRunId, reviewState: 'user_confirmed', validFrom: new Date().toISOString(), validUntil: null, confidence: proposal.sourceKind === 'user_statement' ? 0.95 : null, permissionScope: 'profile_memory_write' });
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
    <EtchedContours />
    <View style={[s.header, { paddingTop: Math.max(10, insets.top) }]}><Pressable accessibilityRole="button" accessibilityLabel="Close Ask Nura" style={s.close} onPress={() => router.back()}><Text style={s.closeText}>⌄</Text></Pressable><View style={s.headerMain}><Orb size={45} /><View style={{ flex: 1, minWidth: 0 }}><Text style={s.brand}>Ask Nura</Text><Text style={s.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Recent conversations" onPress={() => setConversationSheet('recent')} style={s.clear}><Text style={s.clearText}>Recents</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Start a new conversation" disabled={busy} onPress={startNewConversation} style={[s.clear, busy && { opacity: 0.5 }]}><Text style={s.clearText}>New</Text></Pressable></View></View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {!readingSourceMode && conversationMessages.length === 0 && !answer && !busy && <Text style={s.contextLine}>{registryBriefMode ? <>Preparing a source-linked Registry summary for <Text style={s.contextStrong}>{registryBriefTopic?.label}</Text> · chat history excluded</> : policyComparisonMode ? <>Compare the two linked policies. Add only the health details you choose for this run.</> : policyReviewMode ? <>Review this policy against only the health details you choose for this run.</> : <>Looking at <Text style={s.contextStrong}>{context}</Text></>}</Text>}
      {currentConversation && <View style={s.conversationTitleRow}><Text numberOfLines={2} style={s.conversationTitle}>{currentConversation.title}</Text><Pressable accessibilityRole="button" onPress={() => setConversationSheet('link')} style={s.contextLinkButton}><Text style={s.contextLinkText}>Link chat</Text></Pressable></View>}
      {!currentConversation && orderedConversations.length > 0 && <Pressable accessibilityRole="button" onPress={() => setConversationSheet('link')} style={s.linkPrompt}><Text style={s.contextLinkText}>{linkedConversationIds.length ? `Linked: ${askConversations.find((item) => item.id === linkedConversationIds[0])?.title ?? 'previous conversation'}` : 'Link a recent conversation for context'}</Text><Text style={s.linkPromptAction}>{linkedConversationIds.length ? 'Change' : 'Choose'} ↗</Text></Pressable>}
      {currentConversation && linkedConversationIds.length > 0 && <View style={s.linkedContext}><Text numberOfLines={2} style={s.linkedContextText}>Context link · {askConversations.find((item) => item.id === linkedConversationIds[0])?.title ?? 'Previous conversation'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Remove linked chat context" onPress={() => { setLinkedConversationOverride([]); setShareLinkedHistory(false); if (currentConversation) void linkAskConversation(activeConversationId, []); }}><Text style={s.linkRemove}>Remove</Text></Pressable></View>}
      {(!readingSourceMode || service?.available !== true) && (service?.available !== true || (conversationMessages.length === 0 && !answer)) && <View style={[s.serviceCard, service?.available ? s.serviceReady : s.serviceOffline]}><GlassMaterial tone="dark" intensity={38} radius={15} /><View style={[s.serviceDot, service?.available && s.serviceDotReady]} /><View style={{ flex: 1 }}><Text style={s.serviceTitle}>{service === null ? 'Connecting to Nura…' : service.available ? 'Ask service connected' : 'Nura is unavailable'}</Text><Text style={s.serviceBody}>{service?.available ? 'Choose what to share before each question. Nura checks its answer provider when you send.' : service?.reason ?? 'This check does not send your health information.'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Check Nura availability" onPress={() => void getAgentStatus().then(setService)}><Text style={s.refresh}>↻</Text></Pressable></View>}
      {fileContext && selectedAsset && <View style={s.fileNotice}>
        <Text style={s.fileNoticeTitle}>{!selectedAsset.serverSourceId ? 'THIS FILE HAS NOT BEEN REVIEWED' : reviewedSourceFactCount === 0 ? 'NO REVIEWED DETAILS LINKED YET' : fullProfileContextMode ? 'THIS REPORT + YOUR HEALTH PROFILE' : 'ASKING ABOUT THIS SAVED SOURCE'}</Text>
        <Text style={s.fileNoticeBody}>{!selectedAsset.serverSourceId
          ? 'Nura has not linked reviewed details to this file yet. Review its suggestions before asking about its results.'
          : reviewedSourceFactCount === 0
            ? 'The file is linked, but no extracted details have been approved into your registry yet. Report notes alone are not confirmed health results.'
            : fullProfileContextMode
              ? 'Nura can use this report and other saved health details you select. Review the sharing choices before the answer is sent.'
              : 'Only details already linked to this report are in scope. Switch to your whole profile for a broader health question. You’ll review what is shared before Nura answers.'}</Text>
        <Pressable accessibilityRole="button" onPress={openSourceReview} style={s.fileScopeAction}><Text style={s.fileScopeActionText}>Review report details ↗</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: fullProfileContextMode }} onPress={toggleWholeProfileScope} style={s.fileScopeAction}><Text style={s.fileScopeActionText}>{fullProfileContextMode ? 'Use this report only' : 'Use my whole health profile'} ↗</Text></Pressable>
      </View>}
      {!fileContext && !readingSourceMode && conversationMessages.length === 0 && !busy && <View style={s.welcome}><GlassMaterial tone="dark" intensity={40} radius={20} /><Text style={s.welcomeEyebrow}>YOUR RECORDS, IN CONTEXT</Text><Text style={s.welcomeTitle}>Let’s look at the whole picture.</Text><Text style={s.welcomeBody}>Ask about information you’ve saved. Nura will show which records it used and where it could not find an answer.</Text><View style={s.promptRow}><Pressable style={s.prompt} onPress={() => setQuestion('What information is in my health profile?')}><Text style={s.promptText}>What’s in my profile?</Text><Text style={s.promptArrow}>↗</Text></Pressable><Pressable style={s.prompt} onPress={() => setQuestion('What information is missing from my records?')}><Text style={s.promptText}>What’s missing?</Text><Text style={s.promptArrow}>↗</Text></Pressable></View></View>}
      {readingSource && !conversationMessages.some((message) => message.role === 'user' && message.readingSource?.url === readingSource.url) ? <SelectedReadingCard key={`${readingSource.url ?? ''}:${readingSource.title}`} source={readingSource} thumbnailUrl={readingSourceItem?.thumbnailUrl} onOpen={openReadingSource} /> : null}
      {conversationMessages.filter((message) => !(answer && activeRunId && message.role === 'assistant' && message.runId === activeRunId)).map((message, messageIndex) => (
        <View key={message.id} style={[s.message, message.role === 'user' ? s.userMessage : s.assistantMessage]}>
          {message.role === 'user' && <GlassMaterial tone="dark" intensity={46} radius={19} />}
          <Text style={[s.messageLabel, message.role === 'user' && s.userMessageLabel]}>{message.role === 'user' ? 'YOU ASKED' : 'NURA'}</Text>
          {message.role === 'assistant'
            ? <SourceConversationAnswer key={message.runId} text={registryBriefDisplayText(message.text)} source={message.readingSource ?? null} citations={message.citations.map((citation) => citation.reference)} unknowns={message.unknowns ?? []} sources={message.citations} nextSteps={message.coverageAssessments?.length ? [] : message.nextSteps ?? []} onOpenSource={openEvidenceSource} targetFor={evidenceTarget} onOpenReadingSource={openReadingSource} onFollowUp={chooseFollowUp} reducedMotion={reducedMotion} />
            : <>
              <Text style={[s.messageText, s.userMessageText]}>{message.text}</Text>
              {message.readingSource && conversationMessages.findIndex((candidate) => candidate.role === 'user' && candidate.readingSource?.url === message.readingSource?.url) === messageIndex
                ? <SelectedReadingCard key={`${message.readingSource.url ?? ''}:${message.readingSource.title}`} source={message.readingSource} thumbnailUrl={feedItems.find((item) => item.url === message.readingSource?.url)?.thumbnailUrl} onOpen={openReadingSource} />
                : null}
            </>}
          {message.role === 'assistant' && message.coverageAssessments?.length
            ? <CoveragePanel assessments={message.coverageAssessments} sources={message.citations} onOpenSource={openEvidenceSource} targetFor={evidenceTarget} reducedMotion={reducedMotion} />
            : null}
        {message.role === 'assistant' && message.coverageAssessments?.length && message.nextSteps?.length
            ? <AnswerDetailSection title="QUESTIONS FOR YOUR INSURER" summary={message.nextSteps[0]} reducedMotion={reducedMotion} tone="blue">
              {message.nextSteps.map((item, index) => <Text key={`${index}-${item}`} style={s.nextText}>•  {item}</Text>)}
            </AnswerDetailSection>
            : null}
        </View>
      ))}
      {busy && <View testID="nura-ask-processing" style={s.liveCard}><GlassMaterial tone="dark" intensity={42} radius={18} /><View style={s.liveHeader}><View testID="nura-ask-processing-orb"><Orb size={30} /></View><View style={{ flex: 1 }}><Text style={s.liveTitle}>{aiState === 'responding' ? 'Nura is preparing an answer' : 'Nura is working with your records'}</Text><Text style={s.liveSub}>Live activity · only actions and evidence</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Stop this Ask Nura run" onPress={stopCurrentRun} style={s.stopRunButton}><Text style={s.stopRunText}>Stop</Text></Pressable></View>{trace.map((item) => <View key={item.id} style={s.traceRow}><View style={[s.traceMark, item.status === 'complete' && s.traceMarkDone]}><Text style={[s.traceMarkText, item.status === 'complete' && s.traceMarkTextDone]}>{item.status === 'complete' ? '✓' : '·'}</Text></View><View style={{ flex: 1 }}><Text style={s.traceLabel}>{item.label}</Text>{item.detail && <Text style={s.traceDetail}>{item.detail}</Text>}</View></View>)}</View>}
      {answer && <View style={s.answerCard}><SourceConversationAnswer key={activeRunId ?? 'live-answer'} answerHeadingRef={answerHeadingRef} text={registryBriefDisplayText(answer.answer)} source={activeReadingSource} citations={answer.citations} unknowns={answer.unknowns} sources={sources} nextSteps={answer.coverageAssessments !== undefined ? [] : answer.nextSteps} onOpenSource={openEvidenceSource} targetFor={evidenceTarget} onOpenReadingSource={openReadingSource} onFollowUp={chooseFollowUp} reducedMotion={reducedMotion} showLabel />
        {!readingSource && answer.coverageAssessments !== undefined && <CoveragePanel assessments={answer.coverageAssessments} sources={sources} onOpenSource={openEvidenceSource} targetFor={evidenceTarget} reducedMotion={reducedMotion} />}
        {!readingSource && answer.coverageAssessments !== undefined && answer.nextSteps.length > 0 && <AnswerDetailSection title="QUESTIONS FOR YOUR INSURER" summary={answer.nextSteps[0]} reducedMotion={reducedMotion} tone="blue"><>{answer.nextSteps.map((item, index) => <Text key={`${index}-${item}`} style={s.nextText}>•  {item}</Text>)}</></AnswerDetailSection>}
        {registryBriefMode && !busy && <View style={s.registrySave}><Text style={s.registrySaveTitle}>SAVE TO MEDICAL REGISTRY</Text><Text style={s.registrySaveBody}>This saves the answer, its stated unknowns and only the sources it cited. The summary will be marked out of date if linked records change.</Text>{registryBriefSaveError ? <Text style={s.registrySaveError}>{registryBriefSaveError}</Text> : null}<Pressable accessibilityRole="button" disabled={registryBriefSaved || registryBriefSaving || answer.citations.length === 0} onPress={() => void saveRegistrySummary()} style={[s.registrySaveButton, (registryBriefSaved || registryBriefSaving || answer.citations.length === 0) && { opacity: .5 }]}><Text style={s.registrySaveButtonText}>{registryBriefSaved ? 'SAVED TO MEDICAL REGISTRY' : registryBriefSaving ? 'SAVING ON THIS DEVICE…' : 'SAVE CITED SUMMARY'}</Text></Pressable></View>}
        {answer.memoryProposal && <View style={s.proposal}><Text style={s.proposalTitle}>{answer.memoryProposal.sourceKind === 'user_statement' ? 'A DETAIL YOU SHARED' : 'NURA SUGGESTED A PROFILE UPDATE'}</Text><Text style={s.proposalText}>{answer.memoryProposal.label}: {answer.memoryProposal.value}</Text>{answer.memoryProposal.reason ? <Text style={s.proposalReason}>{answer.memoryProposal.reason}</Text> : null}{answer.memoryProposal.sourceReferences?.length ? <View style={s.proposalSources}><Text style={s.proposalSourceHeading}>SUPPORTING RECORDS</Text>{answer.memoryProposal.sourceReferences.map((reference) => { const source = sources.find((item) => item.reference === reference); if (!source) return <Text key={reference} style={s.proposalSourceUnavailable}>Supporting record {reference} is unavailable in this review.</Text>; const target = evidenceTarget(source); return <Pressable key={reference} accessibilityRole="button" accessibilityState={{ disabled: !target }} disabled={!target} onPress={() => openEvidenceSource(source)} style={[s.proposalSourceLink, !target && s.proposalSourceLinkDisabled]}><Text style={s.proposalSourceRef}>{reference}</Text><View style={{ flex: 1 }}><Text style={s.proposalSourceTitle}>{source.title}</Text><Text style={s.proposalSourceAction}>{target ? 'OPEN SUPPORTING RECORD ↗' : 'SOURCE UNAVAILABLE'}</Text></View></Pressable>; })}</View> : answer.memoryProposal.sourceKind === 'user_request' ? <Text style={s.proposalReason}>Based on your explicit request in this conversation.</Text> : null}{proposalSaveError ? <Text accessibilityRole="alert" style={s.proposalSaveError}>{proposalSaveError}</Text> : null}<Pressable onPress={() => void acceptMemoryProposal()} disabled={proposalSaved || proposalSaving} style={[s.proposalButton, proposalSaved && s.proposalSaved, (proposalSaved || proposalSaving) && { opacity: .8 }]}><Text style={[s.proposalButtonText, proposalSaved && s.proposalSavedText]}>{proposalSaved ? 'ADDED · CONFIRMED BY YOU' : proposalSaving ? 'SAVING TO YOUR PROFILE…' : proposalSaveError ? 'TRY AGAIN' : answer.memoryProposal.sourceKind === 'user_statement' ? 'REVIEW AND SAVE THIS DETAIL' : 'REVIEW AND ADD TO MY PROFILE'}</Text></Pressable></View>}
        <Text style={s.medicalNote}>{answer.coverageAssessments !== undefined ? 'This is an evidence summary, not an insurer decision. Confirm important coverage questions with your insurer.' : 'Nura helps organize your records; this is not a diagnosis or a substitute for care from a clinician.'}</Text>
        {messageSaveWarning ? <Text accessibilityRole="alert" style={s.messageSaveWarning}>{messageSaveWarning}</Text> : null}
      </View>}
      {error ? <View style={s.errorCard}><Text style={s.errorTitle}>This run didn’t complete</Text><Text style={s.errorText}>{error}</Text><Text style={s.errorNote}>Your saved health records were not changed.</Text></View> : null}
    </ScrollView>
        <View style={[s.composerWrap, { paddingBottom: keyboardVisible ? 6 : Math.max(Platform.OS === 'ios' ? 9 : 12, insets.bottom + 8) }]}><GlassMaterial tone="dark" intensity={40} radius={0} /><View style={s.composer}><GlassMaterial tone="dark" intensity={36} radius={19} /><TextInput ref={questionInputRef} testID="ask-question-input" accessibilityLabel="Your question for Nura" value={question} onChangeText={(value) => { setQuestion(value); setComposerNotice(''); }} onFocus={() => setComposerFocused(true)} onBlur={() => setComposerFocused(false)} onSubmitEditing={() => { void startQuestion(); }} placeholder={readingSource ? `Ask about this ${readingSource.mediaType === 'video' ? 'video' : 'article'} or ask a follow-up…` : "Ask Nura anything about your health…"} placeholderTextColor="#F0E2D8" selectionColor={C.peach} style={s.input} multiline blurOnSubmit returnKeyType="send" enterKeyHint="send" submitBehavior="submit" editable={!busy && !proposalSaving && !checkingBeforeSend} /><Animated.View style={{ transform: [{ scale: sendScale }] }}><Pressable accessibilityRole="button" accessibilityLabel={checkingBeforeSend ? "Checking Nura before sending" : "Check Nura and continue"} accessibilityHint="Checks Nura’s connection. If ready, opens the sharing review; if not, keeps your question here." accessibilityState={{ disabled: !question.trim() || busy || proposalSaving || checkingBeforeSend, busy: checkingBeforeSend }} disabled={!question.trim() || busy || proposalSaving || checkingBeforeSend} onPress={() => { void startQuestion(); }} onPressIn={() => animateSend(motion.pressScale)} onPressOut={() => animateSend(1)} style={[s.sendButton, (!question.trim() || busy || proposalSaving || checkingBeforeSend) && s.sendDisabled]}><Text style={[s.sendText, (!question.trim() || busy || proposalSaving || checkingBeforeSend) && s.sendTextDisabled]}>{checkingBeforeSend ? '…' : '↑'}</Text></Pressable></Animated.View></View><Text accessibilityRole={composerNotice ? 'alert' : undefined} style={[s.composerNote, composerNotice ? s.composerNoteError : null]}>{composerNotice || (checkingBeforeSend ? "Checking Nura’s connection…" : service === null ? "Nura is checking its connection. Your question stays here until you send." : service.available ? readingSource ? "Choose what to share before this question." : "Choose what to share when you send your question." : credentialRejected ? "Your question stays here. OpenAI rejected Nura’s server key; replace it and restart the local server, then tap ↑ to retry." : "Your question stays here while Nura reconnects. Tap ↑ to retry.")}</Text></View>
      <Modal visible={consentOpen} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setConsentOpen(false)}><View style={[s.modalShade, Platform.OS === 'web' && s.modalShadeWeb]}><ScrollView style={[s.modalCard, Platform.OS === 'web' && s.modalCardWeb]} contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled"><View style={s.modalHandle} /><Text style={s.modalEyebrow}>YOUR CHOICE · THIS ANSWER</Text><Text style={s.modalTitle}>{registryBriefMode ? 'Review what goes into this summary.' : 'Choose what Nura can use.'}</Text><Text style={s.modalBody}>{readingSource ? <>Your question, the selected source’s title, publisher, topic, short description and public link, plus any relevant health details you choose below, are sent to Nura’s AI service. The video itself is not uploaded. This source question only offers topic-matched, confirmed details; unrelated records stay out. Nothing is sent until you continue.</> : <>When you continue, your question and selected details below are sent to Nura’s AI service to prepare an answer. Its privacy practices apply. Original files are never included. If you select report details below, only saved text from those sources is shared. {registryBriefMode ? 'This summary uses only the selected health area and its connected records. Recent chat messages are excluded.' : ''} {coverageQuestion ? 'For a policy review, Nura uses only the reviewed policy terms and health details you select. It does not search the web.' : ''} {fullProfileContextMode ? ' Current saved details are selected below. Earlier saved values start off and are included only if you turn them on for this question.' : ''} Nothing is sent until you continue.</>}</Text><View style={s.shareList}>{clarificationReply ? <View testID="ask-clarification-reply-consent" style={{ marginBottom: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255, 249, 246, 0.24)', backgroundColor: 'rgba(255, 249, 246, 0.08)' }}><Text style={{ color: C.peach, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>ANSWER TO NURA’S QUESTION</Text><Text style={{ color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 7 }}>Nura asked: {clarificationReply.clarification}</Text><Text style={{ color: C.white, fontSize: 13, lineHeight: 19, marginTop: 5 }}>Your reply: {clarificationReply.reply}</Text><Text style={{ color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 7 }}>This is self-reported context, not a saved or verified result. It will not be added to your profile.</Text></View> : null}{clarificationReply ? <ShareToggle label="Include this reply with my question for one answer" count="One run · self-reported · not a profile fact" selected={includeClarificationReply} onPress={() => setIncludeClarificationReply((value) => !value)} /> : null}{readingSource ? <ShareRow label={readingSource.mediaType === 'video' ? 'Selected public video' : 'Selected public article'} count={`${readingSource.publisher || 'Source'} · title, topic and link`} /> : null}{policyReviewMode ? <>
        <ShareToggle label={policyComparisonMode ? 'Terms from these two policy documents' : 'Terms from this policy document'} count={availablePolicyFacts.length} selected={sharePolicyTerms} onPress={() => setSharePolicyTerms((value) => !value)} />
        <Text style={s.shareHint}>Choose the personal health facts Nura may compare. No health fact is selected by default.</Text>
        {availableHealthFacts.length ? availableHealthFacts.map((fact) => <HealthFactToggle key={fact.id} fact={fact} selected={selectedHealthFactIds.includes(fact.id)} onPress={() => setSelectedHealthFactIds((current) => current.includes(fact.id) ? current.filter((id) => id !== fact.id) : [...current, fact.id])} />) : <ShareRow label="Personal health facts" count="None saved yet" excluded />}
        <ShareToggle label={policyComparisonMode ? 'Text from the two linked policy sources' : 'Text from this policy source'} count={sourceContextLoading ? 'Checking source…' : linkedDocumentContexts.length ? `${linkedDocumentContexts.length} source${linkedDocumentContexts.length === 1 ? '' : 's'} · saved text only` : 'None available'} selected={sourceContextSelected && linkedDocumentContexts.length > 0} disabled={sourceContextLoading || !linkedDocumentContexts.length} onPress={() => setShareSourceContext((value) => !(value ?? policyReviewMode))} />
        <ShareToggle label="Treatment and medicine records" count={scopedContext.treatments.length} selected={shareTreatments} onPress={() => setShareTreatments((value) => !value)} />
        <ShareToggle label="Visits and follow-up history" count={scopedContext.visits.length} selected={shareVisits} onPress={() => setShareVisits((value) => !value)} />
      </> : <>
        {calculatedAgeContext && !policyReviewMode && !readingSourceMode ? <ShareToggle label="Age at these measurements" count={`${calculatedAgeContext.ageAtMeasurement} years · calculated here; date of birth stays on this device`} selected={shareCalculatedAge} onPress={() => setShareCalculatedAge((value) => !value)} /> : null}
        {readingSource ? <Text style={s.shareHint}>Only up to two relevant, current, confirmed details appear here. Medicines stay off unless you choose to share them.</Text> : null}<ShareToggle label="Saved health facts" count={currentFacts.length} selected={shareFacts} onPress={() => { setShareFacts((value) => !value); setShareEarlierValues(false); }} />{fullProfileContextMode && earlierFacts.length > 0 ? <ShareToggle label="Earlier saved values" count={earlierFacts.length} selected={shareFacts && shareEarlierValues} disabled={!shareFacts} onPress={() => { setShareFacts(true); setShareEarlierValues((value) => !value); }} /> : null}{fullProfileContextMode && earlierFacts.length > 0 ? <Text style={s.shareHint}>Off by default. Turn this on for this question to compare earlier and current results.</Text> : null}{shareFacts && currentFacts.length + (shareEarlierValues ? earlierFacts.length : 0) > 0 ? <><Pressable accessibilityRole="button" accessibilityState={{ expanded: factSelectionExpanded }} accessibilityLabel={`${factSelectionExpanded ? 'Hide' : 'Choose'} individual health facts; ${selectedContext.facts.length} included`} onPress={() => setFactSelectionExpanded((value) => !value)} style={s.factDisclosure}><Text style={s.factDisclosureTitle}>{factSelectionExpanded ? 'Hide individual facts' : 'Choose individual facts'}</Text><Text style={s.factDisclosureCount}>{selectedContext.facts.length} included</Text></Pressable>{factSelectionExpanded ? [...currentFacts, ...(shareEarlierValues ? earlierFacts : [])].map((fact) => <HealthFactToggle key={fact.id} fact={fact} selected={!excludedHealthFactIds.includes(fact.id)} onPress={() => setExcludedHealthFactIds((current) => current.includes(fact.id) ? current.filter((id) => id !== fact.id) : [...current, fact.id])} />) : null}</> : null}<ShareToggle label="Health areas you selected" count={scopedContext.topics.length} selected={shareTopics} onPress={() => setShareTopics((value) => !value)} /><ShareToggle label="Links you created" count={scopedContext.links.length} selected={shareLinks} onPress={() => setShareLinks((value) => !value)} />{registryBriefMode ? <ShareRow label="Recent chat messages" count="Not included in this summary" excluded /> : historyForConsent.length
          ? <ShareToggle label="This conversation" count={`${historyForConsent.length} recent messages${historyForConsent.some((message) => Boolean(message.readingSource)) ? ' · includes selected media details' : ''}`} selected={shareHistory} onPress={() => setShareHistory((value) => !value)} />
          : <ShareRow label="This conversation" count="No earlier messages yet" excluded />}{linkedConversationContext ? <ShareToggle label={`Linked chat · ${linkedConversationContext.sourceTitle}`} count={`${linkedConversationContext.messages.length} recent messages · conversation context only`} selected={shareLinkedHistory} onPress={() => setShareLinkedHistory((value) => !value)} /> : null}<ShareToggle label="Treatment and medicine records" count={scopedContext.treatments.length} selected={shareTreatments} onPress={() => setShareTreatments((value) => !value)} /><ShareToggle label="Visits and follow-up history" count={scopedContext.visits.length} selected={shareVisits} onPress={() => setShareVisits((value) => !value)} /><ShareToggle label="Details from linked reports" count={sourceContextLoading ? 'Checking linked sources…' : linkedDocumentContexts.length ? `${linkedDocumentContexts.length} source${linkedDocumentContexts.length === 1 ? '' : 's'} · text only` : 'None available'} selected={sourceContextSelected && linkedDocumentContexts.length > 0} disabled={sourceContextLoading || !linkedDocumentContexts.length} onPress={() => setShareSourceContext((value) => !(value ?? fileContext))} /><ShareToggle label="Search trusted health sources · general topics" count={coverageQuestion ? 'Not used for policy review' : service?.capabilities?.trustedHealthSearch ? (shareExternalSearch ? 'On · selected topics only' : 'Off') : 'Not available'} selected={shareExternalSearch && !coverageQuestion} disabled={coverageQuestion || !service?.capabilities?.trustedHealthSearch} onPress={() => setShareExternalSearch((value) => !value)} />
      </>}<ShareRow label="Name, contact details and original files" count="Not shared" excluded /></View><Text style={s.privacyNote}>You can turn off any selected category before sending. Nura can organize your information, but does not advise starting, stopping or changing medicines, or treat personal notes as clinician instructions. Saved chat stays on this device unless you choose to include it. The AI service’s privacy practices apply to each request. Public health search stays off unless you opt in. Cancel to send nothing.</Text><Pressable disabled={Boolean(clarificationReply && !includeClarificationReply)} accessibilityRole="button" accessibilityState={{ disabled: Boolean(clarificationReply && !includeClarificationReply) }} onPress={() => void confirmAndSend()} style={[s.confirmShare, clarificationReply && !includeClarificationReply && { opacity: 0.45 }]}><Text style={s.confirmShareText}>CONTINUE WITH SELECTED DETAILS</Text></Pressable><Pressable onPress={() => setConsentOpen(false)} style={s.cancelShare}><Text style={s.cancelShareText}>Not now</Text></Pressable></ScrollView></View></Modal>
    <ConversationHistoryModal visible={conversationSheet !== null} mode={conversationSheet ?? 'recent'} conversations={orderedConversations} messages={agentMessages} activeId={activeConversationId} reducedMotion={reducedMotion} onClose={() => setConversationSheet(null)} onOpen={openSavedConversation} onLink={connectPreviousConversation} onNew={startNewConversation} onDelete={(conversationId) => { void removeConversation(conversationId).catch((caught) => setError(caught instanceof Error ? caught.message : 'This conversation could not be deleted.')); }} />
    <InlineYouTubePlayer visible={Boolean(activeVideo)} videoId={activeVideo?.id ?? null} title={activeVideo?.title ?? 'Health video'} sourceTitle={activeVideo?.sourceTitle} onClose={() => setActiveVideo(null)} />
    <InlineSourceReader visible={Boolean(activeArticle)} url={activeArticle?.url ?? null} title={activeArticle?.title ?? 'Health source'} onClose={() => setActiveArticle(null)} />
  </KeyboardAvoidingView>;
}
function ShareRow({ label, count, excluded }: { label: string; count: string; excluded?: boolean }) { return <View style={s.shareRow}><Text style={s.shareLabel}>{label}</Text><Text style={[s.shareCount, excluded && s.shareExcluded]}>{count}</Text></View>; }
function SelectedReadingCard({ source, thumbnailUrl: providerThumbnailUrl, onOpen }: { source: AskReadingSource; thumbnailUrl?: string; onOpen: (source: AskReadingSource) => void }) {
  const videoId = source.mediaType === 'video' ? getYouTubeVideoId(source.url ?? '') : null;
  const thumbnailUrl = videoId ? getYouTubeThumbnailForVideo(source.url ?? '', providerThumbnailUrl) : null;
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${videoId ? 'Play selected video' : 'Open selected article'}: ${source.title}`} onPress={() => onOpen(source)} style={s.selectedReadingCard}>
    <View style={s.selectedReadingMedia}>
      {thumbnailUrl && !thumbnailFailed ? <Image key={`${source.url}:${thumbnailUrl}`} accessibilityLabel={`Thumbnail for ${source.title}`} source={{ uri: thumbnailUrl }} resizeMode="cover" onError={() => setThumbnailFailed(true)} style={StyleSheet.absoluteFill} /> : videoId ? <VideoArtworkFallback title={source.title} topic={source.topic ?? ''} /> : <LinearGradient pointerEvents="none" colors={['#35241F', '#614338', '#816151']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
      <View pointerEvents="none" style={s.selectedReadingScrim} />
      <View pointerEvents="none" style={s.selectedReadingPlay}><Text style={s.selectedReadingPlayText}>{videoId ? '▶' : '↗'}</Text></View>
      <Text pointerEvents="none" style={s.selectedReadingMediaLabel}>{videoId ? 'PLAY VIDEO IN NURA' : 'OPEN ARTICLE IN NURA'}</Text>
    </View>
    <View style={s.selectedReadingCopy}>
      <Text style={s.selectedReadingEyebrow}>{videoId ? 'SELECTED VIDEO' : 'SELECTED ARTICLE'}{source.topic ? ` · ${source.topic.toUpperCase()}` : ''}</Text>
      <Text numberOfLines={videoId ? 1 : 2} style={s.selectedReadingTitle}>{source.title}</Text>
      {!videoId ? <Text style={s.selectedReadingPublisher}>{source.publisher || 'Public health source'} · Tap to read</Text> : null}
    </View>
  </Pressable>;
}

function SourceConversationAnswer({ text, source, citations, unknowns, sources, nextSteps, onOpenSource, targetFor, onOpenReadingSource, onFollowUp, reducedMotion, showLabel = false, answerHeadingRef }: {
  text: string; source: AskReadingSource | null; citations: string[]; unknowns: string[]; sources: AgentSource[]; nextSteps: string[];
  onOpenSource: (source: AgentSource) => void; targetFor: (source: AgentSource) => AgentCitationTarget;
  onOpenReadingSource: (source: AskReadingSource) => void; onFollowUp: (question: string) => void; reducedMotion: boolean; showLabel?: boolean; answerHeadingRef?: React.Ref<Text>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [answerExpanded, setAnswerExpanded] = useState(false);
  const answerText = text.replace(/\s*\((?:R|W)\d+(?:,\s*(?:R|W)\d+)*\)/g, '').replace(/\s+([,.;!?])/g, '$1');
  const preview = conversationalAnswerPreview(answerText);
  const answerBlocks = conversationalAnswerBlocks(answerExpanded ? answerText : preview.text);
  const view = askAnswerFirstView({ answer: answerText, citations, unknowns, sources });
  const citedRecords = view.evidenceGroups.records as { reference: string; source?: AgentSource }[];
  const followUps = askSelectedReadingFollowUps(nextSteps, { source, records: citedRecords.map(({ source: cited }) => cited).filter((item): item is AgentSource => Boolean(item)) });
  const allCitedPublicSources = view.evidenceGroups.publicSources as { reference: string; source?: AgentSource }[];
  const selectedSourceCitation = source ? allCitedPublicSources.find(({ source: cited }) => cited && sameAskPublicSource(cited, source)) : undefined;
  const citedPublicSources = allCitedPublicSources.filter(({ source: cited }) => !source || !cited || !sameAskPublicSource(cited, source));
  const otherEvidence = [
    ...view.evidenceGroups.documentDetails,
    ...view.evidenceGroups.selectedAreas,
    ...view.evidenceGroups.savedLinks,
    ...view.evidenceGroups.other,
    ...view.evidenceGroups.unavailable,
  ] as { reference: string; source?: AgentSource }[];
  const relevanceSummary = askRelevanceSummary({
    source,
    records: citedRecords.map(({ source: cited }) => cited).filter((item): item is AgentSource => Boolean(item)),
    hasSelectedArea: view.evidenceGroups.selectedAreas.length > 0,
  });
  function toggle() {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((value) => !value);
  }
  return <View style={s.sourceAnswer}>
    {showLabel ? <Text ref={answerHeadingRef} accessibilityRole="header" accessibilityLabel="Nura has replied" style={s.messageLabel}>NURA</Text> : null}
    <View style={s.sourceAnswerBlocks}>{answerBlocks.map((block, index) => block.kind === 'heading'
      ? <Text key={`heading-${index}`} style={s.sourceAnswerHeading}>{block.text}</Text>
      : block.kind === 'bullet' || block.kind === 'number'
        ? <View key={`list-${index}`} style={s.sourceAnswerListRow}><Text style={s.sourceAnswerListMarker}>{block.marker}</Text><Text style={s.sourceAnswerListText}>{block.text}</Text></View>
        : <Text key={`paragraph-${index}`} style={s.sourceAnswerText}>{block.text}</Text>)}</View>
    {preview.expandable ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: answerExpanded }} accessibilityLabel={`${answerExpanded ? 'Show less' : 'Read'} full answer`} onPress={() => setAnswerExpanded((value) => !value)} style={s.fullAnswerAction}><Text style={s.fullAnswerActionText}>{answerExpanded ? 'Show less' : 'Read full answer'} {answerExpanded ? '⌃' : '⌄'}</Text></Pressable> : null}
    {source && selectedSourceCitation?.source ? <Pressable accessibilityRole="button" accessibilityLabel={'Open source citation ' + selectedSourceCitation.source.title} disabled={!targetFor(selectedSourceCitation.source)} onPress={() => onOpenSource(selectedSourceCitation.source!)} style={s.sourceCitation}>
      <Text style={s.sourceCitationMark}>↗</Text>
      <Text numberOfLines={1} style={s.sourceCitationText}>{(selectedSourceCitation.source.publisher ? selectedSourceCitation.source.publisher + ' · ' : '') + selectedSourceCitation.source.title}</Text>
      <Text style={s.sourceCitationAction}>SOURCE</Text>
    </Pressable> : null}
    {!source && citedPublicSources[0]?.source ? <Pressable accessibilityRole="button" accessibilityLabel={'Open cited source ' + citedPublicSources[0].source.title} onPress={() => onOpenSource(citedPublicSources[0].source!)} style={s.sourceAttribution}>
      <Text style={s.sourceAttributionMark}>↗</Text>
      <Text numberOfLines={2} style={s.sourceAttributionText}>{(citedPublicSources[0].source.publisher ? citedPublicSources[0].source.publisher + ' · ' : '') + citedPublicSources[0].source.title}</Text>
      <Text style={s.sourceAttributionAction}>SOURCE</Text>
    </Pressable> : null}
    <View style={s.whyRelevant}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${expanded ? 'Hide' : 'Show'} why this answer is relevant`} onPress={toggle} style={s.whyRelevantToggle}>
        <View style={{ flex: 1 }}><Text style={s.whyRelevantTitle}>Why this is relevant</Text><Text style={s.whyRelevantSubtitle}>{expanded ? 'The connection and evidence used' : source?.topic ? `Suggested for ${source.topic}` : citedRecords.length ? 'See the saved details behind this answer' : 'See the information and sources Nura used'}</Text></View>
        <Text style={s.whyRelevantChevron}>{expanded ? '⌃' : '⌄'}</Text>
      </Pressable>
      {expanded ? <View style={s.whyRelevantDetails}>
        <Text style={s.whyRelevantNote}>{relevanceSummary}</Text>
        {citedRecords.length ? <View style={s.whyRelevantGroup}><Text style={s.whyRelevantLabel}>Saved health details</Text>{citedRecords.map(({ reference, source: cited }) => cited ? <Pressable key={reference} accessibilityRole="button" accessibilityLabel={`Open cited saved detail ${cited.title}`} disabled={!targetFor(cited)} onPress={() => onOpenSource(cited)} style={s.relevanceEvidence}><Text style={s.relevanceEvidenceTitle}>{cited.title}</Text><Text numberOfLines={2} style={s.relevanceEvidenceDetail}>{cited.detail}</Text><Text style={s.relevanceEvidenceAction}>{reference} · OPEN RECORD ↗</Text></Pressable> : null)}</View> : null}
        {citedPublicSources.length ? <View style={s.whyRelevantGroup}><Text style={s.whyRelevantLabel}>Supporting sources</Text>{citedPublicSources.map(({ reference, source: cited }) => cited ? <Pressable key={reference} accessibilityRole="button" accessibilityLabel={`Open trusted source ${cited.title}`} disabled={!targetFor(cited)} onPress={() => onOpenSource(cited)} style={s.relevanceEvidence}><Text style={s.relevanceEvidenceTitle}>{cited.title}</Text><Text style={s.relevanceEvidenceAction}>{cited.source} · OPEN SOURCE ↗</Text></Pressable> : null)}</View> : null}
        {otherEvidence.length ? <View style={s.whyRelevantGroup}><Text style={s.whyRelevantLabel}>Profile context</Text>{otherEvidence.map(({ reference, source: cited }) => cited ? <Pressable key={reference} accessibilityRole="button" accessibilityLabel={'Open cited item ' + cited.title} disabled={!targetFor(cited)} onPress={() => onOpenSource(cited)} style={s.relevanceEvidence}><Text style={s.relevanceEvidenceTitle}>{cited.title}</Text><Text numberOfLines={2} style={s.relevanceEvidenceDetail}>{cited.detail}</Text><Text style={s.relevanceEvidenceAction}>{reference} · OPEN DETAIL ↗</Text></Pressable> : <Text key={reference} style={s.whyRelevantUnclear}>A cited detail isn’t available in this view.</Text>)}</View> : null}
        {view.unclear.length ? <Text style={s.whyRelevantUnclear}>Still unclear: {view.unclear.slice(0, 2).join(' ')}</Text> : null}
      </View> : null}
    </View>
    {followUps.length ? <View style={s.keepExploring}><Text style={s.keepExploringLabel}>Keep exploring</Text><View style={s.followUpChips}>{followUps.map((item) => <Pressable key={item.question} accessibilityRole="button" accessibilityLabel={`Ask: ${item.question}`} onPress={() => onFollowUp(item.question)} style={s.followUpChip}><Text style={s.followUpChipText}>{item.label}</Text></Pressable>)}</View></View> : null}
  </View>;
}
function ConversationHistoryModal({ visible, mode, conversations, messages, activeId, reducedMotion, onClose, onOpen, onLink, onNew, onDelete }: {
  visible: boolean;
  mode: 'recent' | 'link';
  conversations: { id: string; title: string; updatedAt: string }[];
  messages: { id: string; conversationId?: string; role: string; text: string; createdAt: string }[];
  activeId: string;
  reducedMotion: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  onLink: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [deleteId, setDeleteId] = useState('');
  function closeHistory() {
    setDeleteId('');
    onClose();
  }
  return <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={closeHistory}>
    <View style={[s.modalShade, Platform.OS === 'web' && s.modalShadeWeb]}>
      <View style={[s.historyCard, Platform.OS === 'web' && s.historyCardWeb]}>
        <View style={s.modalHandle} />
        <View style={s.historyHeadingRow}><View style={{ flex: 1 }}><Text style={s.modalEyebrow}>{mode === 'link' ? 'CONVERSATION CONTEXT' : 'ASK NURA · SAVED ON THIS DEVICE'}</Text><Text style={s.modalTitle}>{mode === 'link' ? 'Link a recent conversation' : 'Recent conversations'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close conversations" onPress={closeHistory} style={s.historyClose}><Text style={s.historyCloseText}>×</Text></Pressable></View>
        <Text style={s.historyIntro}>{mode === 'link' ? 'This helps Nura understand follow-up references. It does not add chat text to your health records, and you choose whether to share it before each answer.' : 'Open a saved chat, or start a new one. Nura keeps each conversation separate unless you link one for context.'}</Text>
        <ScrollView style={s.historyList} contentContainerStyle={s.historyListContent} keyboardShouldPersistTaps="handled">
          {conversations.length === 0 ? <Text style={s.historyEmpty}>Your conversations will appear here after your first question.</Text> : conversations.map((conversation) => {
            const conversationMessages = messages.filter((message) => message.conversationId === conversation.id);
            const firstUserMessage = conversationMessages.find((message) => message.role === 'user');
            const latestUserMessage = [...conversationMessages].reverse().find((message) => message.role === 'user');
            const title = firstUserMessage?.text ? createConversationTitle(firstUserMessage.text) : conversation.title;
            const preview = latestUserMessage?.text ?? '';
            const deleting = deleteId === conversation.id;
            return <View key={conversation.id} testID={`ask-conversation-${conversation.id}`} style={[s.historyItem, activeId === conversation.id && s.historyItemActive]}>
              <Text numberOfLines={2} style={s.historyTitle}>{title}</Text>
              {preview ? <Text numberOfLines={2} style={s.historyPreview}>{preview}</Text> : null}
              <Text style={s.historyDate}>{new Date(conversation.updatedAt).toLocaleDateString()}</Text>
              {deleting ? <View style={s.historyConfirm}><Text style={s.historyConfirmText}>Delete this conversation and its saved messages?</Text><View style={s.historyActions}><Pressable accessibilityRole="button" onPress={() => setDeleteId('')} style={s.historyAction}><Text style={s.historyActionText}>Keep it</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Confirm delete ${title}`} onPress={() => { setDeleteId(''); onDelete(conversation.id); }} style={[s.historyAction, s.historyDeleteAction]}><Text style={s.historyDeleteText}>Delete</Text></Pressable></View></View> : <View style={s.historyActions}>
                {mode === 'link' ? <Pressable accessibilityRole="button" disabled={activeId === conversation.id} onPress={() => { setDeleteId(''); onLink(conversation.id); }} style={[s.historyAction, activeId === conversation.id && { opacity: 0.4 }]}><Text style={s.historyActionText}>Use context</Text></Pressable> : <Pressable accessibilityRole="button" onPress={() => { setDeleteId(''); onOpen(conversation.id); }} style={s.historyAction}><Text style={s.historyActionText}>Open chat</Text></Pressable>}
                {mode === 'recent' ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${title}`} onPress={() => setDeleteId(conversation.id)} style={s.historyAction}><Text style={s.historyDeleteText}>Delete</Text></Pressable> : null}
              </View>}
            </View>;
          })}
        </ScrollView>
        {mode === 'recent' ? <Pressable accessibilityRole="button" onPress={() => { setDeleteId(''); onNew(); }} style={s.historyNew}><Text style={s.historyNewText}>＋ New conversation</Text></Pressable> : null}
        <Pressable accessibilityRole="button" onPress={closeHistory} style={s.cancelShare}><Text style={s.cancelShareText}>Close</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

function AnswerDetailSection({ title, summary, children, reducedMotion, tone }: { title: string; summary: string; children: React.ReactNode; reducedMotion: boolean; tone: 'blue' | 'quiet' }) {
  const [expanded, setExpanded] = useState(false);
  if (title === 'HOW THIS WAS ANSWERED' || title === 'NEXT STEP') return null;
  function toggle() {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  }
  return <View style={tone === 'blue' ? s.nextBox : s.savedTrace}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${expanded ? 'Hide' : 'Show'} ${title.toLowerCase()}`} onPress={toggle} style={s.disclosureHeader}>
      <View style={{ flex: 1 }}><Text style={tone === 'blue' ? s.nextTitle : s.traceHeading}>{title}{tone === 'quiet' ? ` · ${summary}` : ''}</Text>{tone === 'blue' && !expanded ? <Text numberOfLines={2} style={s.nextText}>•  {summary}</Text> : null}</View>
      <Text style={s.disclosureAction}>{expanded ? 'Hide' : 'View'}</Text>
    </Pressable>
    {expanded ? <View style={s.disclosureBody}>{children}</View> : null}
  </View>;
}

function ShareToggle({ label, count, selected, onPress, disabled = false }: { label: string; count: number | string; selected: boolean; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="checkbox" accessibilityLabel={`${label} · ${typeof count === 'number' ? `${count} ${count === 1 ? 'item' : 'items'}` : count}`} accessibilityState={{ checked: selected, disabled }} aria-checked={selected} disabled={disabled} onPress={onPress} style={s.shareRow}><View style={s.shareToggleLabel}><View style={[s.checkBox, selected && s.checkBoxOn]}><Text style={s.checkMark}>{selected ? '✓' : ''}</Text></View><Text style={s.shareLabel}>{label}</Text></View><Text style={[s.shareCount, (!count || disabled) && s.shareExcluded]}>{typeof count === 'number' ? `${count} ${count === 1 ? 'item' : 'items'}` : count}</Text></Pressable>; }
function HealthFactToggle({ fact, selected, onPress }: { fact: { id: string; label: string; value: string; source: string; date: string; validUntil?: string | null }; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="checkbox" accessibilityLabel={`Share ${fact.validUntil ? 'earlier saved value ' : ''}${fact.label}: ${fact.value}`} accessibilityState={{ checked: selected }} onPress={onPress} style={s.healthFactRow}><View style={[s.checkBox, selected && s.checkBoxOn]}><Text style={s.checkMark}>{selected ? '✓' : ''}</Text></View><View style={s.healthFactCopy}><Text style={s.shareLabel}>{fact.label}{fact.validUntil ? ' · Earlier version' : ''}</Text><Text style={s.healthFactDetail}>{fact.value} · {fact.source} · {fact.date}</Text></View></Pressable>; }
type AgentCitationTarget = { kind: 'health'; focusId: string } | { kind: 'registry'; topicId: string } | { kind: 'external'; url: string } | null;

function CoveragePanel({ assessments, sources, onOpenSource, targetFor, reducedMotion }: { assessments: CoverageAssessment[]; sources: AgentSource[]; onOpenSource: (source: AgentSource) => void; targetFor: (source: AgentSource) => AgentCitationTarget; reducedMotion: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!assessments.length) return null;
  function toggle() {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  }
  const byReference = new Map(sources.map((source) => [source.reference, source]));
  const labels: Record<CoverageAssessment['kind'], { title: string; tone: string; tint: string }> = {
    explicit_benefit: { title: 'BENEFIT STATED', tone: '#BCE8D0', tint: 'rgba(100, 181, 139, 0.20)' },
    explicit_limit: { title: 'LIMIT STATED', tone: '#FFD797', tint: 'rgba(226, 164, 82, 0.20)' },
    explicit_exclusion: { title: 'EXCLUSION STATED', tone: '#FFC0B2', tint: 'rgba(192, 92, 75, 0.20)' },
    unclear: { title: 'WORDING UNCLEAR', tone: '#D7C2F1', tint: 'rgba(190, 159, 220, 0.20)' },
  };
  return <View style={s.coveragePanel}><Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={expanded ? 'Hide reviewed policy terms' : `Show ${assessments.length} reviewed policy terms`} onPress={toggle} style={s.disclosureHeader}><Text style={s.coverageHeading}>WHAT THE REVIEWED POLICY SAYS · {assessments.length}</Text><Text style={s.disclosureAction}>{expanded ? 'Hide' : 'View'}</Text></Pressable>{expanded ? <><Text style={s.coverageContextNote}>Selected health details provide context for this review. Their presence does not establish that a term applies to you or predict an insurer decision.</Text>
    {assessments.map((item, index) => {
      const appearance = labels[item.kind];
      const policy = byReference.get(item.policyReference);
      const related = item.relatedHealthReferences.map((reference) => byReference.get(reference)).filter((source): source is AgentSource => Boolean(source));
      return <View key={item.policyReference + '-' + index} style={s.coverageItem}>
        <View style={s.coverageItemTop}><Text style={s.coverageKind}>{appearance.title}</Text><Text style={[s.coveragePill, { color: appearance.tone, backgroundColor: appearance.tint }]}>{item.policyReference}</Text></View>
        <Text style={s.coverageDetail}>{item.detail}</Text>
        {policy ? <Pressable accessibilityRole="button" accessibilityLabel={'Open cited policy source ' + policy.title + ' from ' + policy.source} disabled={!targetFor(policy)} onPress={() => onOpenSource(policy)} style={s.coverageSourceAction}><Text style={s.coverageSource}>Policy · {policy.title}  ↗</Text><Text style={s.coverageSourceDetail}>Source · {policy.source}</Text></Pressable> : <Text style={s.coverageSource}>Policy source unavailable</Text>}
        {related.length > 0 && <View style={s.coverageRelatedRow}><Text style={s.coverageRelatedPrefix}>Selected health detail · </Text>{related.map((source) => <Pressable key={source.reference} accessibilityRole="button" accessibilityLabel={'Open cited health source ' + source.title} disabled={!targetFor(source)} onPress={() => onOpenSource(source)}><Text style={s.coverageRelated}>{source.title} ↗</Text></Pressable>)}</View>}
      </View>;
    })}</> : null}
  </View>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  warmLight: { position: 'absolute', width: 390, height: 430, borderRadius: 240, right: -210, top: -210, overflow: 'hidden' },
  lilacLight: { position: 'absolute', width: 410, height: 470, borderRadius: 240, left: -245, top: 220, overflow: 'hidden' },
  header: { paddingHorizontal: 19, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: 'rgba(39, 27, 24, 0.30)' },
  close: { alignSelf: 'flex-start', width: 31, height: 28, justifyContent: 'center' },
  closeText: { color: C.muted, fontSize: 22, transform: [{ rotate: '90deg' }] },
  headerMain: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brand: { color: C.ink, fontSize: 19, fontWeight: '600' },
  tagline: { color: C.faint, fontSize: 9, letterSpacing: 1.2, fontWeight: '700', marginTop: 3 },
  clear: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  clearText: { color: C.plum, fontSize: 10, fontWeight: '600' },
  disabledText: { color: C.faint },
  conversationTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: C.line },
  conversationTitle: { color: C.ink, fontSize: 13, lineHeight: 18, fontWeight: '600', flex: 1 },
  contextLinkButton: { borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 7 },
  contextLinkText: { color: C.blue, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  linkPrompt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 12, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(183,208,255,.36)', backgroundColor: 'rgba(183,208,255,.08)' },
  linkPromptAction: { color: C.blue, fontSize: 10, fontWeight: '700' },
  linkedContext: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: 'rgba(183,208,255,.10)', borderWidth: 1, borderColor: 'rgba(183,208,255,.28)' },
  linkedContextText: { flex: 1, color: C.muted, fontSize: 11, lineHeight: 16 },
  linkRemove: { color: C.blue, fontSize: 10, fontWeight: '700' },
  content: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 20, maxWidth: 600, width: '100%', alignSelf: 'center', flexGrow: 1 },
  contextLine: { color: C.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  contextStrong: { color: C.plum, fontWeight: '600' },

  serviceCard: { position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 10, marginBottom: 14 },
  serviceReady: { backgroundColor: C.green, borderColor: 'rgba(188, 232, 208, 0.35)' },
  serviceOffline: { backgroundColor: C.surface, borderColor: C.line },
  serviceDot: { width: 8, height: 8, borderRadius: 5, backgroundColor: C.faint },
  serviceDotReady: { backgroundColor: C.mint },
  serviceTitle: { color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  serviceBody: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  refresh: { color: C.plum, fontSize: 17, paddingHorizontal: 4 },

  fileNotice: { backgroundColor: C.amber, borderWidth: 1, borderColor: 'rgba(255, 215, 151, 0.32)', borderRadius: 15, padding: 13, marginTop: 8, marginBottom: 10 },
  fileNoticeTitle: { color: C.amberInk, fontSize: 10, lineHeight: 15, letterSpacing: 0.7, fontWeight: '700' },
  fileNoticeBody: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  fileScopeAction: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4 },
  fileScopeActionText: { color: C.blue, fontSize: 10, fontWeight: '700' },
  welcome: { position: 'relative', overflow: 'hidden', backgroundColor: C.surface, borderRadius: 20, padding: 17, borderWidth: 1, borderColor: C.line, marginTop: 6 },
  welcomeEyebrow: { color: C.plum, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  welcomeTitle: { color: C.ink, fontSize: 21, lineHeight: 27, fontWeight: '500', marginTop: 7 },
  welcomeBody: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 7 },
  promptRow: { gap: 7, marginTop: 12 },
  prompt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surfaceRaised, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255, 249, 246, 0.14)' },
  promptText: { color: C.ink, fontSize: 12, lineHeight: 17 },
  promptArrow: { color: C.blue, fontSize: 15 },

  message: { position: 'relative', overflow: 'hidden', borderRadius: 19, padding: 14, marginTop: 11, maxWidth: '93%' },
  userMessage: { alignSelf: 'flex-end', backgroundColor: C.surfaceRaised, borderWidth: 1, borderColor: 'rgba(255, 221, 198, 0.46)', borderTopRightRadius: 7 },
  assistantMessage: { alignSelf: 'flex-start', backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderTopLeftRadius: 0, padding: 0, maxWidth: '100%', width: '100%' },
  messageLabel: { color: C.plum, fontSize: 10, lineHeight: 15, letterSpacing: 0.8, fontWeight: '700', marginBottom: 5 },
  userMessageLabel: { color: C.peach },
  messageText: { color: C.ink, fontSize: 12, lineHeight: 18 },
  userMessageText: { color: C.ink },
  selectedReadingCard: { overflow: 'hidden', backgroundColor: 'rgba(30, 20, 18, 0.58)', borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255, 231, 211, 0.28)', marginTop: 10 },
  selectedReadingMedia: { position: 'relative', width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', backgroundColor: '#30211D', justifyContent: 'center', alignItems: 'center' },
  selectedReadingScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(21, 13, 12, 0.18)' },
  selectedReadingPlay: { position: 'absolute', top: '38%', alignSelf: 'center', width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(28, 19, 17, 0.76)', borderWidth: 1, borderColor: 'rgba(255, 249, 246, 0.82)' },
  selectedReadingPlayText: { color: '#FFF9F3', fontSize: 20, fontWeight: '700', marginLeft: 3 },
  selectedReadingMediaLabel: { position: 'absolute', right: 10, bottom: 9, overflow: 'hidden', borderRadius: 8, backgroundColor: 'rgba(27, 18, 16, 0.82)', color: '#FFF7F0', paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.5 },
  selectedReadingCopy: { paddingHorizontal: 12, paddingVertical: 8 },
  selectedReadingEyebrow: { color: C.mint, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  selectedReadingTitle: { color: C.ink, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 5 },
  selectedReadingPublisher: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  savedTrace: { backgroundColor: 'rgba(32, 24, 22, 0.42)', borderRadius: 11, padding: 10, marginTop: 10 },
  traceHeading: { color: C.plum, fontSize: 10, lineHeight: 15, letterSpacing: 0.8, fontWeight: '700', marginBottom: 6 },
  savedTraceLine: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  citationWrap: { marginTop: 12 },
  citationCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 9, paddingHorizontal: 9, borderRadius: 10, backgroundColor: C.bluePale, borderWidth: 1, borderColor: 'rgba(183, 208, 255, 0.22)', marginTop: 5 },
  citationCardUnavailable: { opacity: .65 },
  citationRef: { color: C.blue, fontSize: 10, fontWeight: '700', width: 24 },
  citationTitle: { color: C.ink, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  citationDetail: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  citationEvidence: { color: C.faint, fontSize: 10, lineHeight: 15, marginTop: 4 },
  citationOpen: { color: C.blue, fontSize: 9, lineHeight: 14, fontWeight: '700', letterSpacing: .35, marginTop: 4 },
  citationUnavailable: { color: C.faint, fontSize: 9, lineHeight: 14, fontWeight: '600', letterSpacing: .3, marginTop: 4 },

  liveCard: { position: 'relative', overflow: 'hidden', backgroundColor: C.surfaceRaised, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(242, 191, 165, 0.34)', padding: 13, marginTop: 12 },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  stopRunButton: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255, 249, 246, 0.38)', paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(255, 249, 246, 0.10)' },
  stopRunText: { color: C.ink, fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: .15 },
  liveTitle: { color: C.ink, fontSize: 12, fontWeight: '600' },
  liveSub: { color: C.faint, fontSize: 10, lineHeight: 15, marginTop: 3 },
  traceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 6 },
  traceMark: { width: 18, height: 18, borderRadius: 10, backgroundColor: 'rgba(255, 249, 246, 0.12)', alignItems: 'center', justifyContent: 'center' },
  traceMarkDone: { backgroundColor: C.green },
  traceMarkText: { color: C.faint, fontSize: 12, lineHeight: 16 },
  traceMarkTextDone: { color: C.mint, fontSize: 10 },
  traceLabel: { color: C.ink, fontSize: 11, fontWeight: '500', lineHeight: 17 },
  traceDetail: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 1 },

  answerCard: { position: 'relative', overflow: 'hidden', backgroundColor: 'transparent', borderRadius: 0, borderWidth: 0, borderColor: 'transparent', padding: 0, marginTop: 12 },
  answerLabel: { color: C.plum, fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  sourceAnswer: { paddingTop: 1 },
  sourceAnswerBlocks: { gap: 9 },
  sourceAnswerText: { color: '#FFF8F1', fontSize: 15, lineHeight: 23, fontWeight: '400' },
  sourceAnswerHeading: { color: '#F3C2A8', fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 2 },
  sourceAnswerListRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 2 },
  sourceAnswerListMarker: { color: '#A9D4E3', fontSize: 15, lineHeight: 23, fontWeight: '700', minWidth: 18 },
  sourceAnswerListText: { color: '#FFF8F1', fontSize: 14, lineHeight: 22, fontWeight: '400', flex: 1 },
  fullAnswerAction: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 8 },
  fullAnswerActionText: { color: C.blue, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  sourceAttribution: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: 'rgba(255, 242, 230, 0.08)', borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255, 236, 220, 0.18)', marginTop: 13 },
  sourceCitation: { minHeight: 28, maxWidth: '100%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2, paddingVertical: 3, marginTop: 5 },
  sourceCitationMark: { color: C.blue, fontSize: 12, fontWeight: '700' },
  sourceCitationText: { color: '#DCE7F5', flexShrink: 1, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  sourceCitationAction: { color: C.blue, fontSize: 9, lineHeight: 14, fontWeight: '800', letterSpacing: 0.35 },
  sourceAttributionMark: { width: 27, height: 27, overflow: 'hidden', borderRadius: 14, textAlign: 'center', textAlignVertical: 'center', color: C.peach, backgroundColor: 'rgba(226, 164, 130, 0.17)', fontSize: 13, fontWeight: '800', lineHeight: 27 },
  sourceAttributionText: { color: C.ink, flex: 1, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  sourceAttributionAction: { color: C.blue, fontSize: 9, lineHeight: 14, fontWeight: '800', letterSpacing: 0.35 },
  whyRelevant: { overflow: 'hidden', marginTop: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255, 236, 220, 0.24)' },
  whyRelevantToggle: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  whyRelevantTitle: { color: C.ink, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  whyRelevantSubtitle: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  whyRelevantChevron: { color: C.blue, fontSize: 21, paddingHorizontal: 3 },
  whyRelevantDetails: { borderTopWidth: 1, borderTopColor: 'rgba(255, 236, 220, 0.18)', paddingHorizontal: 14, paddingBottom: 14 },
  whyRelevantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 236, 220, 0.15)' },
  whyRelevantLabel: { color: C.plum, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  whyRelevantValue: { color: C.ink, flex: 1, textAlign: 'right', fontSize: 13, lineHeight: 18 },
  whyRelevantNote: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 12 },
  whyRelevantGroup: { marginTop: 14 },
  relevanceEvidence: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 236, 220, 0.11)' },
  relevanceEvidenceTitle: { color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  relevanceEvidenceDetail: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  relevanceEvidenceAction: { color: C.blue, fontSize: 10, lineHeight: 15, fontWeight: '800', letterSpacing: 0.3, marginTop: 5 },
  whyRelevantUnclear: { color: C.faint, fontSize: 12, lineHeight: 18, marginTop: 12 },
  keepExploring: { paddingTop: 9, marginTop: 0 },
  keepExploringLabel: { color: C.muted, fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: 0.2 },
  followUpChips: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'stretch', gap: 8, marginTop: 7 },
  followUpChip: { flex: 1, minHeight: 40, alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 22, backgroundColor: 'rgba(255, 242, 230, 0.035)', borderWidth: 1, borderColor: 'rgba(183, 208, 255, 0.62)' },
  followUpChipText: { color: '#F0F4F5', fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center' },
  structuredAnswer: { padding: 0, marginTop: 8 },
  structuredEyebrow: { color: '#F1C2A7', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  structuredLead: { color: '#FFF8F1', fontSize: 16, lineHeight: 24, fontWeight: '500' },
  meaningCard: { backgroundColor: 'rgba(195, 158, 211, 0.12)', borderRadius: 13, borderWidth: 1, borderColor: 'rgba(220, 192, 230, 0.26)', padding: 11, marginTop: 11 },
  meaningHeading: { color: '#E4C8F0', fontSize: 11, fontWeight: '800', letterSpacing: 0.65 },
  meaningText: { color: '#FFF8F1', fontSize: 14, lineHeight: 21, marginTop: 6 },
  meaningNote: { color: '#E5D8E0', fontSize: 12, lineHeight: 18, marginTop: 6 },
  meaningSources: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  meaningSourceLabel: { color: '#E3D6E3', fontSize: 10, fontWeight: '800', letterSpacing: 0.4, marginRight: 2 },
  meaningSourceChip: { maxWidth: '78%', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255, 243, 231, 0.09)', borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255, 238, 224, 0.24)', paddingHorizontal: 8, paddingVertical: 6 },
  meaningSourceDisabled: { opacity: 0.6 },
  meaningSourceRef: { color: '#B8D1FF', fontSize: 10, fontWeight: '800' },
  meaningSourceTitle: { color: '#FFF8F1', fontSize: 11, maxWidth: 180 },
  recordEvidenceSection: { borderTopWidth: 1, borderTopColor: 'rgba(255, 239, 225, 0.18)', paddingTop: 11, marginTop: 12 },
  evidenceSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  evidenceCount: { color: '#E3D6E3', fontSize: 10, fontWeight: '700', letterSpacing: 0.35 },
  citedOriginSection: { borderTopWidth: 1, borderTopColor: 'rgba(255, 239, 225, 0.18)', paddingTop: 10, marginTop: 10 },
  recordSectionLabel: { color: '#F1C2A7', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  recordEvidence: { backgroundColor: 'transparent', borderBottomWidth: 1, borderColor: 'rgba(255, 239, 225, 0.16)', borderRadius: 0, paddingHorizontal: 0, paddingVertical: 9, marginTop: 2 },
  recordEvidenceUnavailable: { backgroundColor: 'rgba(255, 243, 231, 0.06)', borderRadius: 10, padding: 9, marginTop: 6 },
  recordEvidenceHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordReference: { color: '#B8D1FF', backgroundColor: 'rgba(109, 151, 221, 0.19)', overflow: 'hidden', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4, fontSize: 11, fontWeight: '800' },
  recordEvidenceTitle: { color: '#FFF8F1', flex: 1, fontSize: 14, fontWeight: '700' },
  recordEvidenceMeta: { color: '#E3D6E3', fontSize: 12, lineHeight: 18, marginTop: 5 },
  recordEvidenceDetail: { color: '#FFF4EA', fontSize: 14, lineHeight: 21, marginTop: 6 },
  recordEvidenceMissing: { color: '#E3D6E3', fontSize: 13, lineHeight: 19, marginTop: 5 },
  recordEvidenceAction: { color: '#B8D1FF', fontSize: 11, fontWeight: '800', letterSpacing: 0.35, marginTop: 7 },
  recordSectionNote: { color: '#E3D6E3', fontSize: 13, lineHeight: 19, marginTop: 6 },
  unclearSection: { borderTopWidth: 1, borderColor: 'rgba(255, 239, 225, 0.18)', borderRadius: 0, paddingTop: 8, marginTop: 10 },
  unclearSectionLabel: { color: '#FFD19D', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  unclearText: { color: '#FFF4EA', fontSize: 14, lineHeight: 21, marginTop: 6 },
  unclearScope: { color: '#E3D6E3', fontSize: 12, lineHeight: 18, marginTop: 7 },
  fullResponse: { borderTopWidth: 1, borderTopColor: 'rgba(255, 239, 225, 0.18)', paddingTop: 10, marginTop: 10 },
  fullResponseText: { color: '#FFF4EA', fontSize: 13, lineHeight: 20, marginTop: 6 },
  structuredDisclosure: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingVertical: 9, paddingRight: 8 },
  structuredDisclosureText: { color: '#B8D1FF', fontSize: 10, fontWeight: '800', letterSpacing: 0.45 },
  answerSummaryLabel: { color: C.faint, fontSize: 10, lineHeight: 15, fontWeight: '700', letterSpacing: 0.6, marginTop: 8 },
  answerText: { color: C.ink, fontSize: 15, lineHeight: 23, marginTop: 7 },
  answerDisclosure: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingVertical: 9, paddingRight: 8 },
  answerDisclosureText: { color: C.blue, fontSize: 10, lineHeight: 15, fontWeight: '700', letterSpacing: 0.55 },
  evidenceNote: { backgroundColor: C.surface, borderRadius: 11, borderWidth: 1, borderColor: C.line, padding: 10, marginTop: 10 },
  evidenceNoteText: { color: C.muted, fontSize: 11, lineHeight: 17 },
  unknownBox: { backgroundColor: C.amber, padding: 10, borderRadius: 12, marginTop: 11 },
  unknownTitle: { color: C.amberInk, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  unknownText: { color: C.ink, fontSize: 12, lineHeight: 18, marginTop: 6 },
  unknownScope: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 8 },
  nextBox: { backgroundColor: C.bluePale, padding: 10, borderRadius: 12, marginTop: 9 },
  nextTitle: { color: C.blue, fontSize: 10, lineHeight: 15, fontWeight: '700', letterSpacing: 0.55 },
  nextText: { color: C.ink, fontSize: 11, lineHeight: 17, marginTop: 5 },
  disclosureHeader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  disclosureAction: { color: C.blue, fontSize: 10, lineHeight: 15, fontWeight: '700', paddingHorizontal: 4, paddingVertical: 6 },
  disclosureBody: { marginTop: 3 },
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
  medicalNote: { color: C.faint, fontSize: 10, lineHeight: 15, marginTop: 11 },
  messageSaveWarning: { color: C.amberInk, fontSize: 11, lineHeight: 16, marginTop: 8 },

  errorCard: { backgroundColor: 'rgba(139, 73, 62, 0.24)', borderWidth: 1, borderColor: 'rgba(242, 191, 165, 0.4)', borderRadius: 16, padding: 13, marginTop: 12 },
  errorTitle: { color: '#FFD2C4', fontSize: 11, fontWeight: '700' },
  errorText: { color: C.ink, fontSize: 10, lineHeight: 15, marginTop: 5 },
  errorNote: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },

  composerWrap: { position: 'relative', overflow: 'hidden', backgroundColor: 'rgba(39, 27, 24, 0.72)', paddingHorizontal: 15, paddingTop: 9, paddingBottom: Platform.OS === 'ios' ? 9 : 12, borderTopWidth: 1, borderTopColor: C.line },
  composer: { position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.surfaceRaised, borderWidth: 1, borderColor: 'rgba(255, 224, 204, 0.44)', borderRadius: 19, paddingLeft: 13, paddingRight: 7, paddingVertical: 7, minHeight: 60, maxWidth: 600, width: '100%', alignSelf: 'center' },
  input: { flex: 1, flexGrow: 1, flexShrink: 1, width: 0, minWidth: 0, alignSelf: 'stretch', zIndex: 2, opacity: 1, backgroundColor: 'transparent', color: '#FFF9F3', minHeight: 44, maxHeight: 108, paddingVertical: 10, fontSize: 15, lineHeight: 20, textAlignVertical: 'top' },
  sendButton: { zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: '#BD7656', alignItems: 'center', justifyContent: 'center', shadowColor: '#D78C69', shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  sendDisabled: { backgroundColor: 'rgba(255,238,224,.22)', shadowOpacity: 0 },
  sendText: { color: '#FFFFFF', fontSize: 19, fontWeight: '600', lineHeight: 23 },
  sendTextDisabled: { color: '#66586F' },
  composerNote: { color: C.faint, textAlign: 'center', fontSize: 10, lineHeight: 15, marginTop: 6, maxWidth: 600, alignSelf: 'center' },
  composerNoteError: { color: C.peach, fontWeight: '700' },

  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20, 14, 12, 0.72)' },
  modalShadeWeb: { justifyContent: 'center', alignItems: 'center', padding: 12 },
  historyCard: { maxHeight: '92%', width: '100%', backgroundColor: C.surfaceDeep, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderWidth: 1, borderColor: C.line },
  historyCardWeb: { maxWidth: 440, borderRadius: 24, alignSelf: 'center' },
  historyHeadingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  historyClose: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: C.line },
  historyCloseText: { color: C.muted, fontSize: 22, lineHeight: 25 },
  historyIntro: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  historyList: { flexGrow: 0, maxHeight: 440, marginTop: 12 },
  historyListContent: { gap: 8, paddingBottom: 4 },
  historyEmpty: { color: C.faint, fontSize: 12, lineHeight: 18, paddingVertical: 20 },
  historyItem: { borderWidth: 1, borderColor: C.line, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: 'rgba(255,249,246,.055)' },
  historyItemActive: { borderColor: 'rgba(183,208,255,.55)', backgroundColor: 'rgba(183,208,255,.09)' },
  historyTitle: { color: C.ink, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  historyPreview: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  historyDate: { color: C.faint, fontSize: 9, lineHeight: 13, marginTop: 5 },
  historyActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  historyAction: { minHeight: 34, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(183,208,255,.34)', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  historyActionText: { color: C.blue, fontSize: 10, fontWeight: '700' },
  historyDeleteAction: { borderColor: 'rgba(240,194,174,.45)' },
  historyDeleteText: { color: C.plum, fontSize: 10, fontWeight: '700' },
  historyConfirm: { marginTop: 9, padding: 10, borderRadius: 12, backgroundColor: 'rgba(240,194,174,.09)' },
  historyConfirmText: { color: C.muted, fontSize: 11, lineHeight: 16 },
  historyNew: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 11, borderRadius: 14, backgroundColor: C.white },
  historyNewText: { color: C.plumInk, fontSize: 12, fontWeight: '800' },
  modalCard: { backgroundColor: C.surfaceDeep, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30 },
  modalCardWeb: { width: '100%', maxWidth: 390, maxHeight: '92%', alignSelf: 'center', borderRadius: 24, borderWidth: 1, borderColor: C.line, paddingBottom: 18 },
  modalContent: { flexGrow: 1 },
  modalHandle: { width: 39, height: 4, borderRadius: 3, backgroundColor: 'rgba(255, 249, 246, 0.45)', alignSelf: 'center', marginBottom: 17 },
  modalEyebrow: { color: C.plum, fontSize: 10, lineHeight: 15, fontWeight: '700', letterSpacing: 0.8 },
  modalTitle: { color: C.ink, fontSize: 21, fontWeight: '500', lineHeight: 27, marginTop: 6 },
  modalBody: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 8 },
  shareList: { backgroundColor: 'rgba(255, 249, 246, 0.07)', borderRadius: 15, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: C.line, marginTop: 13 },
  factDisclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 249, 246, 0.09)' }, factDisclosureTitle: { color: C.plum, fontSize: 11, lineHeight: 16, fontWeight: '600' }, factDisclosureCount: { color: C.faint, fontSize: 10, lineHeight: 15 },
  shareHint: { color: C.faint, fontSize: 11, lineHeight: 17, paddingTop: 10 },
  shareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 249, 246, 0.09)' },
  healthFactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 249, 246, 0.09)' }, healthFactCopy: { flex: 1, gap: 3 }, healthFactDetail: { color: C.faint, fontSize: 11, lineHeight: 17 },
  shareToggleLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkBox: { width: 17, height: 17, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255, 249, 246, 0.42)', alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: C.plum, borderColor: C.plum },
  checkMark: { color: C.plumInk, fontSize: 10, fontWeight: '700', lineHeight: 13 },
  shareLabel: { color: C.ink, fontSize: 12, lineHeight: 18 },
  shareCount: { color: C.plum, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  shareExcluded: { color: C.faint },
  privacyNote: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 12 },
  confirmShare: { borderRadius: 15, backgroundColor: C.white, paddingVertical: 14, alignItems: 'center', marginTop: 15 },
  confirmShareText: { color: C.plumInk, fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.35, textAlign: 'center' },
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
  coverageDetail: { color: C.ink, fontSize: 12, lineHeight: 18, marginTop: 6 },
  coverageSourceAction: { alignSelf: 'flex-start' },
  coverageSource: { color: C.blue, fontSize: 10, marginTop: 6 },
  coverageSourceDetail: { color: C.muted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  coverageRelatedRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  coverageRelatedPrefix: { color: C.muted, fontSize: 8, lineHeight: 13 },
  coverageRelated: { color: C.blue, fontSize: 8, lineHeight: 13 },
});
