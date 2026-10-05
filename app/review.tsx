import React, { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeReviewEventDate } from '../src/utils/healthDate.mjs';
import { animatedNativeDriver } from '../src/services/animatedDriver';
import { activityMotionPresentation, shouldUseMotion } from '../src/services/motionPolicy.mjs';
import { router, useLocalSearchParams } from 'expo-router';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Orb } from '../src/components/Orb';
import { Atmosphere } from '../src/components/ambient/Atmosphere';
import { Label, Surface } from '../src/components/Surface';
import { ProfileSetupProgress } from '../src/components/ProfileSetupProgress';
import { DocumentContextCard } from '../src/components/DocumentContextCard';
import { documentDisplayName, documentOriginalName } from '../src/services/documentPresentation.mjs';
import { useNura } from '../src/state/NuraContext';
import type { IntakeAsset } from '../src/state/NuraContext';
import { colors, motion, radius } from '../src/theme';
import { isLocalSampleFixtureId } from '../src/services/localSampleFixtures.mjs';
import { CandidateClaim, IntakeActivity, LocalSource, analyzeSelfReport, correctCandidate, decideCandidate, describeSourceLocation, extractPickedFile, formatVideoTimestamp, getSourceClaims, retractAcceptedCandidate, sourceMatchesAsset, sourceMatchesText } from '../src/services/intakeClient';
import { audioReviewConsentCopy, isAudioReviewProcessable, resolveStagedIntakeMediaType } from '../src/services/audioIntakePresentation.mjs';
import { findMisdatedAcceptedClaims, findMissingAcceptedClaims, findMissingRetractions } from '../src/services/sourceClaimReconciliation.mjs';
import { formatClaimSummaryValue, formatClaimValue } from '../src/services/claimValue.mjs';
import { processIntakeBatch } from '../src/services/intakeBatch.mjs';
import { appendIntakeActivity } from '../src/services/intakeActivity.mjs';
import { groupReviewClaims } from '../src/services/reviewClaimGroups.mjs';
import { analyzeIntakeBatch } from '../src/services/intakeBatchAnalysis.mjs';
import type { IntakeBatchFinding } from '../src/services/intakeBatchAnalysis.mjs';
import { commitReviewBatch } from '../src/services/reviewBatch.mjs';
import { isReviewableIntakeAsset } from '../src/services/reviewableIntakeAsset.mjs';
import { getHealthAreaContext } from '../src/services/healthAreaContext.mjs';

const supported = (asset: { name: string; mimeType?: string }) => Boolean(resolveStagedIntakeMediaType(asset));
type BatchSourceReview = { assetId: string; name: string; status: 'loading' | 'verified' | 'mismatch' | 'unavailable'; source?: LocalSource; claims: CandidateClaim[] };
type StagedReviewDecision = { decision: 'accept' | 'edit' | 'reject'; editedValue?: { label: string; value: string; unit: string; effectiveAt?: string } };

function isPendingReviewClaim(claim: CandidateClaim) {
  return claim.evidenceState === 'needs_review' || claim.evidenceState === 'candidate';
}

function isBuiltInLocalSample(asset: IntakeAsset) {
  return asset.kind === 'pdf' && isLocalSampleFixtureId(asset.localSampleFixtureId, asset.purpose ?? 'medical');
}

function groupIntakeActivity(items: IntakeActivity[]) {
  const groups = new Map<string, { assetId: string; originalName: string; items: IntakeActivity[] }>();
  for (const item of items) {
    const separator = item.id.indexOf(':');
    const assetId = separator > 0 ? item.id.slice(0, separator) : 'session';
    const labelSeparator = item.label.indexOf(' · ');
    const originalName = labelSeparator > 0 ? item.label.slice(0, labelSeparator) : 'Review status';
    const label = labelSeparator > 0 ? item.label.slice(labelSeparator + 3) : item.label;
    const group = groups.get(assetId) ?? { assetId, originalName, items: [] };
    group.items.push({ ...item, label });
    groups.set(assetId, group);
  }
  return [...groups.values()];
}

function IntakeActivityRow({ item, reducedMotion, latest }: { item: IntakeActivity; reducedMotion: boolean; latest: boolean }) {
  const [opacity] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  const [rise] = useState(() => new Animated.Value(reducedMotion ? 0 : 5));
  useEffect(() => {
    if (reducedMotion) { opacity.setValue(1); rise.setValue(0); return; }
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: motion.statusIn, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(rise, { toValue: 0, duration: motion.statusIn, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [item.id, opacity, reducedMotion, rise]);
  const active = latest && item.status === 'started';
  const activityMotion = activityMotionPresentation(active, reducedMotion);
  const resolved = !latest && item.status === 'started';
  const completed = item.status === 'complete' || item.status === 'progress' || resolved;
  const symbol = completed ? '✓' : item.status === 'failed' ? '!' : item.status === 'cancelled' ? '×' : '';
  return <Animated.View accessible accessibilityRole="text" accessibilityLabel={`File review: ${item.label}${active ? ' · in progress' : ''}`} accessibilityState={{ busy: activityMotion.busy }} accessibilityLiveRegion={latest ? 'polite' : 'none'} aria-live={latest ? 'polite' : 'off'} style={[styles.activityRow, { opacity, transform: [{ translateY: rise }] }]}>
    <Text style={[styles.activityMark, completed && styles.activityDone, item.status === 'failed' && styles.activityFailed, item.status === 'cancelled' && styles.activityCancelled]}>{symbol || '·'}</Text>
    <Text style={styles.activityText}>{item.label}</Text>
    {activityMotion.showSpinner && <ActivityIndicator size="small" color={colors.violet} />}
    {activityMotion.showStaticStatus && <Text style={styles.activityStaticStatus}>IN PROGRESS</Text>}
  </Animated.View>;
}

function ProcessingOrb({ reducedMotion }: { reducedMotion: boolean }) {
  const [rotation] = useState(() => new Animated.Value(0));
  const [counterRotation] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reducedMotion) { rotation.setValue(0); counterRotation.setValue(0); pulse.setValue(0); return; }
    const spin = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: animatedNativeDriver, isInteraction: false }));
    const counterSpin = Animated.loop(Animated.timing(counterRotation, { toValue: 1, duration: 3700, easing: Easing.linear, useNativeDriver: animatedNativeDriver, isInteraction: false }));
    const breathe = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: animatedNativeDriver, isInteraction: false }),
      Animated.timing(pulse, { toValue: 0, duration: 1050, easing: Easing.inOut(Easing.ease), useNativeDriver: animatedNativeDriver, isInteraction: false }),
    ]));
    spin.start(); counterSpin.start(); breathe.start();
    return () => { spin.stop(); counterSpin.stop(); breathe.stop(); };
  }, [counterRotation, pulse, reducedMotion, rotation]);
  const turn = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const counterTurn = counterRotation.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] });
  return <View testID="nura-processing-orb" accessibilityElementsHidden style={styles.processingOrb}>
    <Animated.View style={[styles.processingOrbit, { transform: [{ rotate: turn }] }]}><View style={styles.processingSpark} /></Animated.View>
    <Animated.View style={[styles.processingOrbitInner, { transform: [{ rotate: counterTurn }] }]}><View style={styles.processingSparkMint} /></Animated.View>
    <Animated.View style={{ transform: [{ scale }] }}><Orb size={39} state={reducedMotion ? 'idle' : 'thinking'} /></Animated.View>
  </View>;
}

export default function Review() {
  const params = useLocalSearchParams<{ purpose?: string; assetId?: string; sourceId?: string; claimId?: string; focusClaimId?: string; firstRun?: string; areaId?: string }>();
  const existingSourceId = typeof params.sourceId === 'string' ? params.sourceId : '';
  const requestedClaimId = typeof params.claimId === 'string' ? params.claimId : '';
  const focusClaimId = typeof params.focusClaimId === 'string' ? params.focusClaimId : '';
  const routeAssetId = typeof params.assetId === 'string' ? params.assetId : '';
  const [purpose, setPurpose] = useState<'medical' | 'insurance'>(params.purpose === 'insurance' ? 'insurance' : 'medical');
  const firstRun = params.firstRun === 'true';
  const { ready, assets, intakeNotes, facts, setupProgress, addFact, correctFact, retractFact, reconcileSourceFactDate, attachSourceToAsset, saveIntakeNote, linkIntakeNoteSource, commitIntakeNote, removeIntakeNote, resolveProfileSetupSection } = useNura();
  const readable = useMemo<IntakeAsset[]>(() => assets.filter((asset) => (asset.purpose ?? 'medical') === purpose && supported(asset) && isReviewableIntakeAsset(asset, purpose)), [assets, purpose]);
  const audioAssets = readable.filter((asset) => asset.kind === 'audio');
  const linkedSourceAssets = useMemo(() => readable.filter((asset) => isAudioReviewProcessable(asset) && Boolean(asset.serverSourceId)), [readable]);
  const [selectedId, setSelectedId] = useState(typeof params.assetId === 'string' ? params.assetId : readable[0]?.id ?? '');
  const selected = readable.find((asset) => asset.id === selectedId) ?? (existingSourceId ? undefined : readable[0]);
  const selectedAssetId = selected?.id ?? '';
  const areaContext = purpose === 'medical' ? getHealthAreaContext(selected?.healthAreaId || (typeof params.areaId === 'string' ? params.areaId : '')) : null;
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentAssetIds, setConsentAssetIds] = useState<string[]>([]);
  const [audioConsentAssetIds, setAudioConsentAssetIds] = useState<string[]>([]);
  const [selfReportConsentNoteId, setSelfReportConsentNoteId] = useState<string | null>(null);
  const [selfReportConsentChecked, setSelfReportConsentChecked] = useState(false);
  const [organizingNoteId, setOrganizingNoteId] = useState<string | null>(null);
  const [selectionChanged, setSelectionChanged] = useState(false);
  const [sourceOpenRevision, setSourceOpenRevision] = useState(0);
  const [fileStates, setFileStates] = useState<Record<string, { status: 'queued' | 'reading' | 'complete' | 'failed' | 'cancelled'; detail?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const extractionAbort = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [activity, setActivity] = useState<IntakeActivity[]>([]);
  const [motionPreference, setMotionPreference] = useState<boolean | null>(null);
  const reducedMotion = !shouldUseMotion(motionPreference);
  const [source, setSource] = useState<LocalSource | null>(null);
  const lastOpenedNoticeSourceId = useRef<string | null>(null);
  const [claims, setClaims] = useState<CandidateClaim[]>([]);
  const [batchReviewRun, setBatchReviewRun] = useState<{ key: string; reviews: BatchSourceReview[]; complete: boolean }>({ key: '', reviews: [], complete: false });
  const [expandedSourceQuoteIds, setExpandedSourceQuoteIds] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [retractConfirmId, setRetractConfirmId] = useState<string | null>(null);
  const pendingRetractionSyncs = useRef(new Set<string>());
  const [drafts, setDrafts] = useState<Record<string, { label: string; value: string; unit: string; effectiveAt: string }>>({});
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, StagedReviewDecision>>({});
  const [notesToInclude, setNotesToInclude] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [discardNoteId, setDiscardNoteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lastActivityAnnouncement = useRef('');
  const lastStatusAnnouncement = useRef('');
  const sourceNote = existingSourceId ? intakeNotes.find((note) => note.serverSourceId === existingSourceId) : undefined;
  const sourceFact = existingSourceId ? facts.find((fact) => fact.sourceId === existingSourceId && !fact.validUntil) : undefined;
  const selfReportConsentNote = selfReportConsentNoteId ? intakeNotes.find((note) => note.id === selfReportConsentNoteId) : undefined;
  const selfReportTextForSource = sourceNote?.text ?? sourceFact?.value ?? '';
  const sourceToOpen = selected?.kind === 'audio' ? '' : !selectionChanged && existingSourceId && (!routeAssetId || selected?.id === routeAssetId)
    ? existingSourceId
    : selected?.serverSourceId ?? '';
  const consentFiles = readable.filter((asset) => consentAssetIds.includes(asset.id));
  const localSampleConsentFiles = consentFiles.filter(isBuiltInLocalSample);
  const connectedConsentFiles = consentFiles.filter((asset) => !isBuiltInLocalSample(asset));
  const localSampleOnlyConsent = consentFiles.length > 0 && localSampleConsentFiles.length === consentFiles.length;
  const mixedProcessingConsent = localSampleConsentFiles.length > 0 && connectedConsentFiles.length > 0;
  const approvedConsentFiles = consentFiles.filter((asset) => asset.kind !== 'audio' || audioConsentAssetIds.includes(asset.id));
  const linkedSourceKey = useMemo(() => linkedSourceAssets.map((asset) => `${asset.id}:${asset.serverSourceId ?? ''}`).join('|'), [linkedSourceAssets]);
  const batchSourceReviews = useMemo(() => batchReviewRun.key === linkedSourceKey ? batchReviewRun.reviews : [], [batchReviewRun, linkedSourceKey]);
  const retryableSourceAssetIds = useMemo(() => new Set(batchSourceReviews.filter((review) => review.source?.state === 'extracted_empty' || review.source?.state === 'failed').map((review) => review.assetId)), [batchSourceReviews]);
  const filesNeedingReview = readable.filter((asset) => isAudioReviewProcessable(asset) && (!asset.serverSourceId || retryableSourceAssetIds.has(asset.id) || fileStates[asset.id]?.status === 'failed' || fileStates[asset.id]?.status === 'cancelled'));
  const needsAnotherTry = (assetId: string) => retryableSourceAssetIds.has(assetId) || fileStates[assetId]?.status === 'failed' || fileStates[assetId]?.status === 'cancelled';
  const batchFindings = useMemo<IntakeBatchFinding[]>(() => analyzeIntakeBatch(batchSourceReviews.filter((item) => item.status === 'verified' && item.source).map((item) => ({
    sourceId: item.source!.id, sourceName: item.name, documentDates: item.source!.documentContext?.dates ?? [], claims: item.claims,
  }))), [batchSourceReviews]);
  const batchComparisonComplete = linkedSourceKey !== '' && batchReviewRun.key === linkedSourceKey && batchReviewRun.complete;
  const stagedNoteIds = Object.keys(notesToInclude).filter((id) => notesToInclude[id] && intakeNotes.some((note) => note.id === id));
  const stagedReviewCount = Object.keys(reviewDecisions).length + stagedNoteIds.length;
  const allReviewClaims = useMemo(() => [...new Map([...claims, ...batchSourceReviews.flatMap((item) => item.claims)].map((claim) => [claim.id, claim])).values()], [batchSourceReviews, claims]);
  const reviewGroups = useMemo(() => groupReviewClaims(claims), [claims]);
  const undecidedClaimCount = allReviewClaims.filter((claim) => isPendingReviewClaim(claim) && !reviewDecisions[claim.id]).length;
  const canKeepReviewedSources = firstRun && linkedSourceAssets.length > 0
    && batchComparisonComplete && batchSourceReviews.length === linkedSourceAssets.length
    && batchSourceReviews.every((item) => item.status === 'verified')
    && undecidedClaimCount === 0 && stagedReviewCount === 0
    && (purpose === 'insurance' || intakeNotes.length === 0) && !busy;
  const [expandedClaimIds, setExpandedClaimIds] = useState<Record<string, boolean>>({});
  const sourceReviewSummary = [
    claims.filter((claim) => isPendingReviewClaim(claim) && !reviewDecisions[claim.id]).length ? `${claims.filter((claim) => isPendingReviewClaim(claim) && !reviewDecisions[claim.id]).length} need review` : '',
    Object.keys(reviewDecisions).filter((id) => claims.some((claim) => claim.id === id)).length ? `${Object.keys(reviewDecisions).filter((id) => claims.some((claim) => claim.id === id)).length} staged to save` : '',
    claims.filter((claim) => claim.evidenceState === 'user_confirmed').length ? `${claims.filter((claim) => claim.evidenceState === 'user_confirmed').length} in your record` : '',
    claims.filter((claim) => claim.evidenceState === 'rejected' || claim.evidenceState === 'user_retracted').length ? `${claims.filter((claim) => claim.evidenceState === 'rejected' || claim.evidenceState === 'user_retracted').length} dismissed or removed` : '',
  ].filter(Boolean).join(' · ');

  useEffect(() => () => extractionAbort.current?.abort(), []);

  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => { preferenceChanged = true; setMotionPreference(value); });
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active && !preferenceChanged) setMotionPreference(value); });
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    const latest = activity.at(-1);
    if (!latest || latest.status === 'progress') return;
    const key = `${latest.id}:${latest.status}`;
    if (lastActivityAnnouncement.current === key) return;
    lastActivityAnnouncement.current = key;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(`File review update. ${latest.label}`);
  }, [activity]);

  useEffect(() => {
    const announcement = error ? `Could not complete this step. ${error}` : notice ? `Review update. ${notice}` : '';
    if (!announcement) { lastStatusAnnouncement.current = ''; return; }
    if (lastStatusAnnouncement.current === announcement) return;
    lastStatusAnnouncement.current = announcement;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(announcement);
  }, [error, notice]);

  useEffect(() => {
    if (!sourceToOpen || !ready) return;
    if (!selected && !sourceNote && !sourceFact) return;
    let active = true;
    void getSourceClaims(sourceToOpen).then(async (result) => {
      if (!active) return;
      const matchesOriginal = selected
        ? await sourceMatchesAsset(selected, result.source)
        : result.source.origin === 'user_entered' && selfReportTextForSource.length > 0
          ? await sourceMatchesText(selfReportTextForSource, result.source)
          : false;
      if (!active) return;
      if (!matchesOriginal) {
        if (selectedAssetId && selected?.serverSourceId === result.source.id) await attachSourceToAsset(selectedAssetId, null, null);
        if (sourceNote?.serverSourceId === result.source.id) await linkIntakeNoteSource(sourceNote.id, null);
        if (!active) return;
        setSource(null); setClaims([]);
        setError(sourceNote || sourceFact ? 'This description no longer matches its saved source, so Nura hid the suggestions.' : 'These extracted details did not match the saved file, so Nura hid them. Review the original file again to create a correct match.');
        return;
      }
      if (!active) return;
      if (selectedAssetId && selected?.serverSourceId !== result.source.id) await attachSourceToAsset(selectedAssetId, result.source.id, result.source.documentContext?.documentType ?? null, result.source.documentPurpose);
      if (!active) return;
      const shouldAnnounceOpen = lastOpenedNoticeSourceId.current !== result.source.id;
      lastOpenedNoticeSourceId.current = result.source.id;
      setSource(result.source); setClaims(result.claims);
      setError('');
      if (shouldAnnounceOpen) setNotice(result.source.origin === 'user_entered' ? 'Opened the saved local organization of your description. No provider call was made.' : 'Opened the saved extraction for this file. The original was not sent again.');
      const requestedClaim = result.claims.find((claim) => claim.id === requestedClaimId && claim.evidenceState === 'user_confirmed');
      if (requestedClaim) {
        setDrafts((current) => ({ ...current, [requestedClaim.id]: { label: requestedClaim.label, value: requestedClaim.value, unit: requestedClaim.unit ?? '', effectiveAt: requestedClaim.effectiveAt ?? '' } }));
        setEditingId(requestedClaim.id);
      }
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : 'This source could not be opened.');
    });
    return () => { active = false; };
  }, [sourceToOpen, sourceOpenRevision, requestedClaimId, selected, selectedAssetId, ready, sourceNote, sourceFact, selfReportTextForSource, attachSourceToAsset, linkIntakeNoteSource]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    void (async () => {
      const reviews: BatchSourceReview[] = [];
      for (const asset of linkedSourceAssets) {
        let review: BatchSourceReview;
        try {
          if (!asset.serverSourceId) throw new Error('Source unavailable');
          const result = await getSourceClaims(asset.serverSourceId);
          const matches = await sourceMatchesAsset(asset, result.source);
          review = matches
            ? { assetId: asset.id, name: asset.name, status: 'verified', source: result.source, claims: result.claims }
            : { assetId: asset.id, name: asset.name, status: 'mismatch', claims: [] };
        } catch {
          review = { assetId: asset.id, name: asset.name, status: 'unavailable', claims: [] };
        }
        if (!active) return;
        reviews.push(review);
        setBatchReviewRun({ key: linkedSourceKey, reviews: [...reviews], complete: false });
      }
      if (active) setBatchReviewRun({ key: linkedSourceKey, reviews, complete: true });
    })();
    return () => { active = false; };
  }, [ready, linkedSourceAssets, linkedSourceKey]);

  const missingAccepted = useMemo(() => findMissingAcceptedClaims(claims, facts, source?.id), [claims, facts, source?.id]);
  const misdatedAccepted = useMemo(() => findMisdatedAcceptedClaims(claims, facts, source?.id), [claims, facts, source?.id]);
  const missingRetractions = useMemo(() => findMissingRetractions(claims, facts, source?.id), [claims, facts, source?.id]);
  useEffect(() => {
    if (!ready || !source) return;
    for (const item of misdatedAccepted) reconcileSourceFactDate(item.factId, source.id, item.claim.id, item.effectiveAt);
  }, [ready, source, misdatedAccepted, reconcileSourceFactDate]);
  useEffect(() => {
    if (!ready || !source?.id) return;
    for (const item of missingRetractions) {
      if (pendingRetractionSyncs.current.has(item.factId)) continue;
      pendingRetractionSyncs.current.add(item.factId);
      void retractFact(item.factId, item.retractedAt)
        .then((saved) => {
          if (saved) {
            setNotice('Profile updated. This detail is no longer active; its source history remains available.');
            setError('');
          } else setError('This source review is saved, but the active profile still needs to sync. Reopen this source review to try again.');
        })
        .catch(() => setError('This source review is saved, but the active profile still needs to sync. Reopen this source review to try again.'))
        .finally(() => pendingRetractionSyncs.current.delete(item.factId));
    }
  }, [ready, source?.id, missingRetractions, retractFact]);
  useEffect(() => {
    if (!ready || !source) return;
    if (!missingAccepted.length) return;
    for (const claim of missingAccepted) addFact(claim.label, formatClaimValue(claim.value, claim.unit), {
      category: purpose === 'insurance' ? 'Insurance coverage' : claim.kind,
      source: source.displayName,
      sourceId: claim.sourceId,
      sourceClaimId: claim.id,
      note: [describeSourceLocation(claim.sourceLocation, source.mediaType), claim.referenceRange ? `Reference range ${claim.referenceRange}` : null, claim.method ? `Method ${claim.method}` : null].filter(Boolean).join(' · '),
      eventDate: claim.effectiveAt, validFrom: new Date().toISOString(),
      validUntil: null,
      confidence: claim.confidence,
      permissionScope: 'profile_write',
    });
  }, [ready, source, missingAccepted, purpose, addFact]);

  async function readSelectedBatch() {
    const batch = consentAssetIds.map((id) => readable.find((asset) => asset.id === id)).filter((asset): asset is typeof readable[number] => Boolean(asset && isAudioReviewProcessable(asset) && (asset.kind !== 'audio' || audioConsentAssetIds.includes(asset.id)) && (!asset.serverSourceId || retryableSourceAssetIds.has(asset.id) || fileStates[asset.id]?.status === 'failed' || fileStates[asset.id]?.status === 'cancelled')));
    if (!batch.length || busy) return;
    const controller = new AbortController();
    extractionAbort.current = controller;
    const processingStartedAt = Date.now();
    setConsentOpen(false); setBusy(true); setExtracting(true); setError(''); setNotice(''); if (!selected?.serverSourceId) { setSource(null); setClaims([]); } setActivity([]);
    setFileStates((current) => ({ ...current, ...Object.fromEntries(batch.map((asset) => [asset.id, { status: 'queued' as const }])) }));
    try {
      const results = await processIntakeBatch(batch, async (asset) => {
        const result = await extractPickedFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size, localSampleFixtureId: asset.localSampleFixtureId }, (item) => setActivity((current) => appendIntakeActivity(current, item, asset.id, asset.name)), purpose, controller.signal, asset.healthAreaId, asset.kind === 'audio' && audioConsentAssetIds.includes(asset.id));
        const effectivePurpose = result.source.documentPurpose ?? purpose;
        await attachSourceToAsset(asset.id, result.source.id, result.source.documentContext?.documentType ?? null, effectivePurpose);
        if (effectivePurpose === 'insurance' && purpose === 'medical') {
          setPurpose('insurance');
          router.replace({ pathname: '/review', params: { purpose: 'insurance', assetId: asset.id } });
        }
        return { claimsCount: result.claims.length };
      }, { signal: controller.signal, onStatus: (event) => {
        if (event.status === 'reading') setFileStates((current) => ({ ...current, [event.assetId]: { status: 'reading' } }));
        if (event.status === 'failed') {
          const detail = event.error instanceof Error ? event.error.message : 'Could not process this file';
          setFileStates((current) => ({ ...current, [event.assetId]: { status: 'failed', detail } }));
          setActivity((current) => [...current, { id: `${event.assetId}:failure`, label: `${batch.find((asset) => asset.id === event.assetId)?.name ?? 'File'} · Could not finish; you can try again`, status: 'failed' }]);
        }
        if (event.status === 'cancelled') setFileStates((current) => ({ ...current, [event.assetId]: { status: 'cancelled', detail: 'Stopped at your request' } }));
      } });
      const completedResults = results.filter((result) => result.status === 'complete');
      const failed = results.filter((result) => result.status === 'failed').length;
      const completed = completedResults.length;
      for (const result of completedResults) setFileStates((current) => ({ ...current, [result.assetId]: { status: 'complete', detail: `${result.value.claimsCount} suggestions ready` } }));
      const lastCompletedId = completedResults.at(-1)?.assetId ?? '';
      const stopped = controller.signal.aborted || results.some((result) => result.status === 'cancelled');
      if (lastCompletedId) { setSelectedId(lastCompletedId); setSelectionChanged(true); }
      if (completed || failed) setNotice(`${completed} of ${batch.length} ${purpose === 'insurance' ? 'policy file' : 'health file'}${batch.length === 1 ? '' : 's'} ready. Review each file below${failed ? ` · ${failed} need another try` : ''}.`);
      if (!completed && failed) setError('Nura could not read the selected files. Each file’s status is shown above; you can retry the unprocessed files.');
      if (stopped) {
        setNotice(`Reading stopped at your request. ${completed} file${completed === 1 ? '' : 's'} finished and remain available to review; unstarted files are still ready.`);
        setActivity((current) => current.some((item) => item.status === 'cancelled') ? current : [...current, { id: `${Date.now()}-intake-cancelled`, label: 'Reading stopped at your request', status: 'cancelled' }]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This source could not be processed.');
    }
    finally {
      if (!controller.signal.aborted) {
        const visibleFor = Date.now() - processingStartedAt;
        if (visibleFor < 900) await new Promise((resolve) => setTimeout(resolve, 900 - visibleFor));
      }
      if (extractionAbort.current === controller) extractionAbort.current = null;
      setExtracting(false);
      setBusy(false);
    }
  }
  function reviewClaim(claim: CandidateClaim, decision: 'accept' | 'edit' | 'reject') {
    if (busy) return;
    if (purpose === 'insurance' && claim.kind !== 'coverage_term' && decision !== 'reject') { setError('Only explicit policy terms can be added to the Insurance Registry.'); return; }
    let editedValue: StagedReviewDecision['editedValue'];
    if (decision === 'edit') {
      const draft = drafts[claim.id] ?? { label: claim.label, value: claim.value, unit: claim.unit ?? '', effectiveAt: claim.effectiveAt ?? '' };
      if (!draft.label.trim() || !draft.value.trim()) { setError('Add a detail name and value before including this edit.'); return; }
      editedValue = { label: draft.label.trim(), value: draft.value.trim(), unit: draft.unit.trim() };
      if (purpose === 'medical') {
        const reviewedDate = normalizeReviewEventDate(draft.effectiveAt);
        if (!reviewedDate.ok) { setError('Use a real calendar date in YYYY-MM-DD format, or leave the result date blank.'); return; }
        editedValue.effectiveAt = reviewedDate.value ?? '';
      }
    }
    setError(''); setEditingId(null);
    setReviewDecisions((current) => ({ ...current, [claim.id]: { decision, ...(editedValue ? { editedValue } : {}) } }));
    setNotice('Your choice is staged. Nothing changes in your registry until you save the reviewed items.');
  }

  function undoReviewDecision(claim: CandidateClaim) {
    if (busy) return;
    setReviewDecisions((current) => {
      if (!current[claim.id]) return current;
      const next = { ...current };
      delete next[claim.id];
      return next;
    });
    if (editingId === claim.id) setEditingId(null);
    setNotice(`Your choice for ${claim.label} was removed. It remains pending and is not in your record.`);
  }

  function updateReviewedClaim(updated: CandidateClaim) {
    setClaims((items) => items.map((item) => item.id === updated.id ? updated : item));
    setBatchReviewRun((current) => ({ ...current, reviews: current.reviews.map((item) => ({
      ...item,
      claims: item.claims.map((claim) => claim.id === updated.id ? updated : claim),
    })) }));
  }

  async function saveReviewBatch() {
    if (busy || !stagedReviewCount) return;
    const allClaims = allReviewClaims;
    const operations = [
      ...Object.entries(reviewDecisions).map(([claimId, staged]) => ({
        id: `claim:${claimId}`, type: 'claim' as const, claimId, staged,
        claim: allClaims.find((item) => item.id === claimId),
        sourceName: batchSourceReviews.find((item) => item.source?.id === allClaims.find((claim) => claim.id === claimId)?.sourceId)?.name
          ?? (allClaims.find((claim) => claim.id === claimId)?.sourceId === source?.id ? source?.displayName : undefined)
          ?? 'Reviewed document',
      })),
      ...stagedNoteIds.map((noteId) => ({ id: `note:${noteId}`, type: 'note' as const, noteId })),
    ];
    setBusy(true); setError(''); setNotice('Saving your reviewed items…');
    try {
      const results = await commitReviewBatch(operations, async (operation) => {
        if (operation.type === 'note') {
          await commitIntakeNote(operation.noteId, noteDrafts[operation.noteId]);
          setNotesToInclude((current) => ({ ...current, [operation.noteId]: false }));
          return;
        }
        const claim = operation.claim;
        if (!claim) throw new Error('This source suggestion is no longer available. Reopen the file and review it again.');
        const result = await decideCandidate(claim.id, operation.staged.decision, operation.staged.decision === 'edit' ? operation.staged.editedValue : undefined);
        const expectedState = operation.staged.decision === 'reject' ? 'rejected' : 'user_confirmed';
        if (result.unchanged && result.claim.evidenceState !== expectedState) throw new Error('This suggestion changed while you were reviewing it. Reopen its source before saving.');
        updateReviewedClaim(result.claim);
        const claimSource = batchSourceReviews.find((item) => item.source?.id === result.claim.sourceId)?.source ?? (source?.id === result.claim.sourceId ? source : undefined);
        if (result.claim.evidenceState === 'user_confirmed' && !facts.some((fact) => fact.sourceClaimId === result.claim.id && !fact.validUntil)) {
          addFact(result.claim.label, formatClaimValue(result.claim.value, result.claim.unit), {
            category: purpose === 'insurance' ? 'Insurance coverage' : result.claim.kind,
            source: operation.sourceName, sourceId: result.claim.sourceId, sourceClaimId: result.claim.id,
            note: [describeSourceLocation(result.claim.sourceLocation, claimSource?.mediaType), result.claim.referenceRange ? `Reference range ${result.claim.referenceRange}` : null, result.claim.method ? `Method ${result.claim.method}` : null].filter(Boolean).join(' · '),
            eventDate: result.claim.effectiveAt, validFrom: new Date().toISOString(), validUntil: null,
            confidence: result.claim.confidence, permissionScope: 'profile_write',
          });
        }
        setReviewDecisions((current) => { const next = { ...current }; delete next[operation.claimId]; return next; });
      });
      const saved = results.filter((item) => item.status === 'saved').length;
      const failed = results.filter((item) => item.status === 'failed');
      const stagedClaimIds = new Set(operations.filter((item) => item.type === 'claim').map((item) => item.claimId));
      const leftPending = allClaims.filter((claim) => isPendingReviewClaim(claim) && !stagedClaimIds.has(claim.id)).length;
      const pendingCopy = leftPending ? ` ${leftPending} other suggestion${leftPending === 1 ? ' remains' : 's remain'} pending and was not added.` : '';
      const setupSection = purpose === 'insurance' ? 'insurance' : 'healthRecords';
      if (!failed.length && leftPending === 0 && (firstRun || setupProgress[setupSection] === 'deferred')) {
        await resolveProfileSetupSection(setupSection, 'saved');
      }
      setNotice(failed.length
        ? `${saved} item${saved === 1 ? '' : 's'} saved. ${failed.length} still need attention and remain ready to retry.${pendingCopy}`
        : `${saved} reviewed item${saved === 1 ? '' : 's'} saved to your ${purpose === 'insurance' ? 'Insurance Registry' : 'health record'}.${pendingCopy}`);
      if (failed.length) setError(failed.map((item) => item.message).join('\n'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your reviewed items could not be saved.');
      setNotice('Your choices are still staged. Try saving again when you’re ready.');
    } finally { setBusy(false); }
  }

  async function keepReviewedSources() {
    if (!canKeepReviewedSources || busy) return;
    setBusy(true); setError('');
    try {
      await resolveProfileSetupSection(purpose === 'insurance' ? 'insurance' : 'healthRecords', 'saved');
      router.replace('/setup');
    } catch {
      setError('The files were reviewed, but profile setup could not be updated. Please retry.');
    } finally { setBusy(false); }
  }
  async function continueWithPendingSuggestions() {
    if (!canDeferPendingSuggestions || busy) return;
    setBusy(true); setError('');
    try {
      await resolveProfileSetupSection(purpose === 'insurance' ? 'insurance' : 'healthRecords', 'deferred');
      router.replace('/setup');
    } catch {
      setError('Your unreviewed suggestions are still saved with their sources, but setup could not be updated. Please retry.');
    } finally { setBusy(false); }
  }
  async function saveClaimCorrection(claim: CandidateClaim) {
    if (busy || !claim.acceptedAssertionId) return;
    if (purpose === 'insurance' && claim.kind !== 'coverage_term') { setError('Only reviewed policy terms can be corrected in the Insurance Registry.'); return; }
    const draft = drafts[claim.id] ?? { label: claim.label, value: claim.value, unit: claim.unit ?? '', effectiveAt: claim.effectiveAt ?? '' };
    let correctedEventDate: string | undefined;
    if (purpose === 'medical') {
      const reviewedDate = normalizeReviewEventDate(draft.effectiveAt);
      if (!reviewedDate.ok) { setError('Use a real calendar date in YYYY-MM-DD format, or leave the result date blank.'); return; }
      correctedEventDate = reviewedDate.value ?? '';
    }
    setBusy(true); setError('');
    let sourceCorrectionSaved = false;
    try {
      const result = await correctCandidate(claim.id, claim.acceptedAssertionId, {
        label: draft.label, value: draft.value, unit: draft.unit,
        ...(purpose === 'medical' ? { effectiveAt: correctedEventDate } : {}),
      });
      sourceCorrectionSaved = true;
      setClaims((items) => items.map((item) => item.id === result.claim.id ? result.claim : item));
      const currentFact = facts.find((fact) => fact.sourceClaimId === claim.id && !fact.validUntil);
      const value = formatClaimValue(result.claim.value, result.claim.unit);
      if (currentFact) await correctFact(currentFact.id, result.claim.label, value, result.claim.effectiveAt ?? null);
      else addFact(result.claim.label, value, {
        category: purpose === 'insurance' ? 'Insurance coverage' : result.claim.kind,
        source: selected?.name ?? source?.displayName ?? 'Reviewed document', sourceId: result.claim.sourceId,
        sourceClaimId: result.claim.id,
        note: [describeSourceLocation(result.claim.sourceLocation, source?.mediaType), result.claim.effectiveAt ? `Record date ${result.claim.effectiveAt}` : null, result.claim.referenceRange ? `Reference range ${result.claim.referenceRange}` : null, result.claim.method ? `Method ${result.claim.method}` : null, 'Corrected by you; earlier versions are retained.'].filter(Boolean).join(' · '),
        eventDate: result.claim.effectiveAt, validFrom: new Date().toISOString(), validUntil: null,
        confidence: null, permissionScope: 'profile_write',
      });
      setEditingId(null);
      setNotice(`Saved as version ${result.assertion.version}. Version ${result.previousAssertion.version} remains in the source history.`);
    } catch (caught) { setError(sourceCorrectionSaved ? 'The source version was saved, but its matching profile timeline copy could not be saved on this device. Reopen this source to reconcile it.' : caught instanceof Error ? caught.message : 'The corrected version could not be saved.'); }
    finally { setBusy(false); }
  }
  async function retractClaim(claim: CandidateClaim) {
    if (busy || !claim.acceptedAssertionId) return;
    setBusy(true); setError('');
    try {
      const result = await retractAcceptedCandidate(claim.id, claim.acceptedAssertionId);
      const activeFact = facts.find((fact) => fact.sourceClaimId === claim.id && !fact.validUntil);
      let profileSynced = true;
      if (activeFact) {
        const retractedAt = result.claim.retractedAt ?? result.previousAssertion.validUntil ?? new Date().toISOString();
        try { profileSynced = await retractFact(activeFact.id, retractedAt); }
        catch { profileSynced = false; }
      }
      setClaims((items) => items.map((item) => item.id === result.claim.id ? result.claim : item));
      setRetractConfirmId(null);
      if (profileSynced) setNotice(purpose === 'insurance' ? 'Removed from your Insurance Registry. The original policy source and review history remain available.' : 'Removed from your active profile. The original source and review history remain available.');
      else setError(purpose === 'insurance' ? 'The source review is saved, but this device still needs to sync the Insurance Registry. Nura will retry while this source is open.' : 'The source review is saved, but this device still needs to sync the active profile. Nura will retry while this source is open.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : purpose === 'insurance' ? 'This policy term could not be removed from the Insurance Registry.' : 'This detail could not be removed from the active profile.');
    } finally { setBusy(false); }
  }
  function startEdit(claim: CandidateClaim) {
    const draft = reviewDecisions[claim.id]?.editedValue ?? drafts[claim.id] ?? { label: claim.label, value: claim.value, unit: claim.unit ?? '', effectiveAt: claim.effectiveAt ?? '' };
    setDrafts((current) => ({ ...current, [claim.id]: { ...draft, effectiveAt: draft.effectiveAt ?? claim.effectiveAt ?? '' } }));
    setEditingId(claim.id);
  }

  async function saveSelfReportDraft(noteId: string) {
    const note = intakeNotes.find((item) => item.id === noteId);
    if (!note || busy) return;
    setBusy(true); setError('');
    try {
      const saved = await saveIntakeNote({ id: note.id, text: noteDrafts[note.id] ?? note.text, topicId: note.topicId, topicLabel: note.topicLabel });
      if (!saved.serverSourceId) { setSource(null); setClaims([]); setActivity([]); }
      setNoteDrafts((current) => { const next = { ...current }; delete next[note.id]; return next; });
      setEditingNoteId(null);
      setNotice('Your description is saved for review in your own words.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Your note could not be saved.'); }
    finally { setBusy(false); }
  }

  function askToOrganizeSelfReport(noteId: string) {
    if (busy || !intakeNotes.some((note) => note.id === noteId)) return;
    setError(''); setNotice(''); setSelfReportConsentNoteId(noteId); setSelfReportConsentChecked(false);
  }

  async function organizeSelfReport(noteId: string) {
    const note = intakeNotes.find((item) => item.id === noteId);
    if (!note || busy || selfReportConsentNoteId !== noteId || !selfReportConsentChecked) return;
    setSelfReportConsentNoteId(null); setSelfReportConsentChecked(false);
    setBusy(true); setOrganizingNoteId(noteId); setError(''); setNotice(''); setClaims([]); setSource(null);
    setActivity([{ id: `${noteId}:organizing`, label: 'Organizing your description on this device', status: 'started' }]);
    try {
      const result = await analyzeSelfReport({
        noteId: note.id, text: note.text,
        topic: note.topicId && note.topicLabel ? { id: note.topicId, label: note.topicLabel } : undefined,
        consentForThisNote: true,
      });
      await linkIntakeNoteSource(note.id, result.source.id);
      setSource(result.source); setClaims(result.claims);
      setActivity([
        { id: `${noteId}:organizing`, label: 'Organized on the local preview service', status: 'complete' },
        { id: `${noteId}:quotes`, label: `${result.claims.length} quoted suggestion${result.claims.length === 1 ? '' : 's'} checked`, status: 'complete' },
      ]);
      const unknownCount = result.source.documentContext?.notes.filter((item) => item.kind === 'unresolved_self_report').length ?? 0;
      setNotice(result.claims.length
        ? `${result.claims.length} suggestions are ready to review${unknownCount ? ` · ${unknownCount} passage${unknownCount === 1 ? '' : 's'} remain unclear` : ''}. Nothing is in your record until you approve and save it.`
        : 'The local preview could not safely structure a detail from this description. It has not added anything to your record.');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The local description organizer could not complete this step.';
      setError(message);
      setActivity([{ id: `${noteId}:failed`, label: 'Local organization could not be completed', status: 'failed' }]);
    } finally { setOrganizingNoteId(null); setBusy(false); }
  }

  async function openSavedSelfReport(note: { id: string; text: string; serverSourceId?: string }) {
    if (!note.serverSourceId || busy) return;
    setBusy(true); setError(''); setNotice(''); setClaims([]); setSource(null);
    try {
      const result = await getSourceClaims(note.serverSourceId);
      if (result.source.origin !== 'user_entered' || !(await sourceMatchesText(note.text, result.source))) {
        await linkIntakeNoteSource(note.id, null);
        throw new Error('This description no longer matches its saved local source, so Nura hid the suggestions.');
      }
      setSource(result.source); setClaims(result.claims);
      setNotice('Opened the saved local organization. It was not sent to an AI provider or processed again.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'This local source could not be opened.'); }
    finally { setBusy(false); }
  }

  function addSelfReportToProfile(noteId: string) {
    if (busy || !intakeNotes.some((note) => note.id === noteId)) return;
    setNotesToInclude((current) => ({ ...current, [noteId]: !current[noteId] }));
    setNotice(notesToInclude[noteId]
      ? 'Your description was removed from the save list; it remains in review.'
      : 'Your description is included in the same save as the reviewed source details. It stays labelled as self-reported.');
  }

  async function discardSelfReport(noteId: string) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await removeIntakeNote(noteId);
      setDiscardNoteId(null);
      setNotice('The draft description was removed.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The draft note could not be removed.'); }
    finally { setBusy(false); }
  }

  const processingSettled = activity.length > 0 && activity.every((item) => item.status === 'complete' || item.status === 'failed' || item.status === 'cancelled');
  const processingFailed = activity.some((item) => item.status === 'failed');
  const processingCancelled = activity.some((item) => item.status === 'cancelled');
  const processingHeadline = extracting
    ? processingSettled ? 'Preparing your review' : localSampleOnlyConsent ? 'Nura is checking the example' : `Nura is reading ${consentAssetIds.length} ${consentAssetIds.length === 1 ? 'file' : 'files'}`
    : processingFailed ? 'Some files need another try' : processingCancelled ? 'Reading stopped' : 'Files ready to review';
  const processingDescription = extracting
    ? processingSettled ? 'File checks are complete. Getting your review ready.' : 'Reading each file and checking details against its source.'
    : notice || (processingFailed ? 'Open a file marked “Needs another try” to retry it.' : processingCancelled ? 'Finished files remain available to review.' : 'Review each file below.');
  const nextPendingClaim = allReviewClaims.find((claim) => isPendingReviewClaim(claim) && !reviewDecisions[claim.id]);
  const unorganizedDescription = purpose === 'medical' ? intakeNotes.find((note) => !note.serverSourceId) : undefined;
  const canDeferPendingSuggestions = firstRun && !busy && !unorganizedDescription && !filesNeedingReview.length
    && batchComparisonComplete && batchSourceReviews.length === linkedSourceAssets.length
    && batchSourceReviews.every((item) => item.status === 'verified')
    && undecidedClaimCount > 0 && stagedReviewCount === 0;
  function openConsentForAssets(ids: string[]) {
    setError('');
    setAudioConsentAssetIds([]);
    setConsentAssetIds(ids);
    setConsentOpen(true);
  }
  const setupAction = canKeepReviewedSources
    ? { label: 'Continue profile setup', onPress: () => void keepReviewedSources() }
    : stagedReviewCount > 0
      ? { label: 'Save reviewed items', onPress: () => void saveReviewBatch() }
      : filesNeedingReview.length > 0
        ? { label: filesNeedingReview.length === 1 ? needsAnotherTry(filesNeedingReview[0].id) ? 'Retry this file' : 'Review this file with Nura' : `Review ${filesNeedingReview.length} files with Nura`, onPress: () => openConsentForAssets(filesNeedingReview.map((asset) => asset.id)) }
        : unorganizedDescription
          ? { label: 'Review your description', onPress: () => askToOrganizeSelfReport(unorganizedDescription.id) }
          : nextPendingClaim
            ? canDeferPendingSuggestions
              ? { label: `Continue setup · ${undecidedClaimCount} left for later`, onPress: () => void continueWithPendingSuggestions() }
              : { label: 'Review remaining suggestions', onPress: () => scrollRef.current?.scrollToEnd({ animated: !reducedMotion }) }
            : { label: 'Continue profile setup', onPress: () => router.replace('/setup') };

  return <View style={styles.page}><Atmosphere /><StatusBar style="light" /><ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" accessibilityLabel={firstRun ? 'Back to profile setup' : 'Go back'} onPress={() => firstRun ? router.replace('/setup') : router.back()}><Text style={styles.back}>{firstRun ? '‹  Profile setup' : '‹  Back'}</Text></Pressable>
    {firstRun ? <ProfileSetupProgress step={purpose === 'insurance' ? 5 : 3} /> : null}
    <View style={styles.heading}><Orb size={36} state={busy ? 'thinking' : 'idle'} /><View style={{ flex: 1 }}><Label style={styles.pageLabel}>{purpose === 'insurance' ? 'YOUR POLICY · SOURCE REVIEW' : 'YOUR FILES · SOURCE REVIEW'}</Label><Text style={styles.title}>{purpose === 'insurance' ? 'Review policy terms.' : 'Review health details.'}</Text></View></View>
    <Text style={styles.intro}>{purpose === 'insurance' ? 'Check each quoted term against its policy page.' : 'Review each suggestion and choose what to keep.'}</Text>
    {extracting && <Surface tone="dark" style={styles.activity}>
      <View style={styles.activityStatusRow}><ProcessingOrb reducedMotion={reducedMotion} /><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>{processingHeadline}</Text><Text style={styles.noticeBody}>{processingDescription}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Stop file review" accessibilityHint="Stops processing. Finished files stay available to review." onPress={() => extractionAbort.current?.abort()} style={({ pressed }) => [styles.stop, pressed && (reducedMotion ? styles.stopPressedReduced : styles.stopPressed)]}><Text style={styles.stopText}>STOP</Text></Pressable></View>
      <Label style={styles.pageLabel}>LIVE FILE CHECKS</Label>
      {groupIntakeActivity(activity).map((group) => {
        const asset = readable.find((item) => item.id === group.assetId);
        const title = asset ? documentDisplayName(asset, facts) : group.originalName;
        return <View key={group.assetId} style={{ marginTop: 8, marginBottom: 6 }}>
          <Text style={styles.noticeTitle}>{title}</Text>
          {group.items.map((item) => <IntakeActivityRow key={item.id} item={item} reducedMotion={reducedMotion} latest={item.id === activity.at(-1)?.id} />)}
        </View>;
      })}
    </Surface>}
    {areaContext ? <Text style={styles.areaContextEyebrow}>FILED UNDER · {areaContext.label.toUpperCase()}</Text> : null}
    {purpose === 'medical' && intakeNotes.length > 0 && <View style={styles.selfReportSection}>
      <Label style={styles.pageLabel}>YOUR WORDS · {intakeNotes.length} DESCRIPTION{intakeNotes.length === 1 ? '' : 'S'}</Label>
      {intakeNotes.map((note) => <Surface tone="dark" key={note.id} style={styles.selfReportCard}>
        <View style={styles.selfReportHeader}><View style={{ flex: 1 }}><Text style={styles.selfReportTitle}>{note.topicLabel ? `${note.topicLabel} · your description` : 'Your health description'}</Text><Text style={styles.selfReportMeta}>Written by you · {new Date(note.createdAt).toLocaleDateString()}</Text></View><Text style={styles.selfReportState}>{note.serverSourceId ? 'SOURCE LINKED' : 'NEEDS YOUR REVIEW'}</Text></View>
        {editingNoteId === note.id ? <TextInput value={noteDrafts[note.id] ?? note.text} onChangeText={(text) => setNoteDrafts((current) => ({ ...current, [note.id]: text }))} multiline maxLength={2000} textAlignVertical="top" accessibilityLabel="Edit your health description" style={styles.selfReportInput} /> : <Text style={styles.selfReportText}>{noteDrafts[note.id] ?? note.text}</Text>}
        {discardNoteId === note.id ? <View style={styles.selfReportConfirm}><Text style={styles.selfReportFoot}>Remove this unsaved description from the review queue?</Text><View style={styles.actions}><Pressable disabled={busy} onPress={() => void discardSelfReport(note.id)} style={styles.reject}><Text style={styles.actionText}>{busy ? 'Removing…' : 'Remove draft'}</Text></Pressable><Pressable disabled={busy} onPress={() => setDiscardNoteId(null)} style={styles.edit}><Text style={styles.actionText}>Keep note</Text></Pressable></View></View> : <View style={styles.actions}>
          {editingNoteId === note.id ? <><Pressable disabled={busy} onPress={() => void saveSelfReportDraft(note.id)} style={styles.edit}><Text style={styles.actionText}>{busy ? 'Saving…' : 'Save changes'}</Text></Pressable><Pressable disabled={busy} onPress={() => { setEditingNoteId(null); setNoteDrafts((current) => { const next = { ...current }; delete next[note.id]; return next; }); }} style={styles.reject}><Text style={styles.actionText}>Cancel</Text></Pressable></> : <>
            <Pressable disabled={busy} onPress={() => addSelfReportToProfile(note.id)} style={styles.accept}><Text style={styles.actionOnText}>{notesToInclude[note.id] ? 'Included · Undo' : 'Include in save'}</Text></Pressable>
            <Pressable disabled={busy} onPress={() => { setNoteDrafts((current) => ({ ...current, [note.id]: note.text })); setEditingNoteId(note.id); }} style={styles.edit}><Text style={styles.actionText}>Edit</Text></Pressable>
            <Pressable disabled={busy} onPress={() => setDiscardNoteId(note.id)} style={styles.reject}><Text style={styles.actionText}>Remove</Text></Pressable>
          </>}
        </View>}
        {editingNoteId !== note.id && <View style={styles.selfReportActions}>
          <Pressable accessibilityRole="button" disabled={busy || Boolean(noteDrafts[note.id])} onPress={() => note.serverSourceId ? void openSavedSelfReport(note) : askToOrganizeSelfReport(note.id)} style={[styles.primarySmall, (busy || Boolean(noteDrafts[note.id])) && styles.disabled]}>
            <Text style={styles.primarySmallText}>{organizingNoteId === note.id ? 'Organizing…' : note.serverSourceId ? 'Open suggestions' : 'Organize note'}</Text>
          </Pressable>
        </View>}
      </Surface>)}
    </View>}
    {readable.length > 0 ? <View style={styles.files}><Label style={styles.pageLabel}>{purpose === 'insurance' ? 'POLICY FILES' : 'HEALTH FILES'} · {readable.length}</Label>{readable.map((asset) => { const run = fileStates[asset.id]; const status = asset.kind === 'audio' ? 'Stored here · needs separate approval' : needsAnotherTry(asset.id) ? 'Needs another try' : run?.status === 'reading' ? 'Reading now' : run?.status === 'complete' || asset.serverSourceId ? 'Ready to review' : 'Ready'; return <Pressable key={`${asset.id}:${asset.name}`} accessibilityRole="button" accessibilityLabel={`Open ${documentDisplayName(asset, facts)} · original file ${documentOriginalName(asset)}`} accessibilityHint={asset.kind === 'audio' ? 'Stored on this device. Open the separate approval step to send this recording for transcription.' : `${status}. Opens this file's source-linked review.`} accessibilityState={{ disabled: busy || asset.kind === 'audio', selected: selected?.id === asset.id, busy: run?.status === 'reading' }} disabled={busy || asset.kind === 'audio'} onPress={() => { if (asset.kind === 'audio') return; if (selected?.id === asset.id) { if (!source && asset.serverSourceId) { setError(''); setSourceOpenRevision((revision) => revision + 1); } return; } lastOpenedNoticeSourceId.current = null; setSelectionChanged(true); setSelectedId(asset.id); setSource(null); setClaims([]); setActivity([]); setNotice(''); setError(''); }}><Surface tone="dark" style={{ ...styles.file, ...(selected?.id === asset.id ? styles.fileSelected : {}) }}><Text style={styles.fileType}>{asset.kind.toUpperCase()}</Text><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.fileName}>{documentDisplayName(asset, facts)}</Text><Text style={styles.fileSub}>Original file · {documentOriginalName(asset)}{asset.healthAreaId && getHealthAreaContext(asset.healthAreaId) ? ` · ${getHealthAreaContext(asset.healthAreaId)!.label}` : ''} · {status}</Text>{run?.detail ? <Text numberOfLines={2} style={styles.fileSub}>{run.detail}</Text> : null}</View><Text style={styles.select}>{selected?.id === asset.id ? 'Selected' : 'Open'}</Text></Surface></Pressable>; })}</View> : null}
    {audioAssets.map((asset) => { const copy = audioReviewConsentCopy(asset.name); return <Surface key={`audio-local:${asset.id}`} tone="dark" style={styles.notice}><Label style={styles.pageLabel}>{copy.title}</Label><Text style={styles.noticeTitle}>{asset.name}</Text><Text style={styles.noticeBody}>{copy.body}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${copy.actionLabel} for ${asset.name}`} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => openConsentForAssets([asset.id])} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{copy.actionLabel}</Text><Text style={styles.arrow}>→</Text></Pressable></Surface>; })}
    {!readable.length && assets.length > 0 && <Surface tone="dark" style={styles.notice}><Text style={styles.noticeTitle}>{purpose === 'insurance' ? 'Choose a supported policy document or image' : 'Choose a supported health file'}</Text><Text style={styles.noticeBody}>{purpose === 'insurance' ? 'The Insurance Registry reads PDFs, Word, RTF, OpenDocument and TXT files, plus images. Video files are not used for policy review.' : 'Nura can review PDFs, Word, RTF, OpenDocument and TXT files, JPG, PNG and WebP images, and short MP4, MOV or WebM health videos.'}</Text></Surface>}
    {filesNeedingReview.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={filesNeedingReview.length === 1 ? needsAnotherTry(filesNeedingReview[0].id) ? 'Retry this file' : 'Review this file with Nura' : `Review ${filesNeedingReview.length} files with Nura`} accessibilityHint="Choose which files Nura can read." accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => openConsentForAssets(filesNeedingReview.map((asset) => asset.id))} style={[styles.primary, busy && styles.disabled]}><View style={{ flex: 1 }}><Text style={styles.primaryText}>{busy ? 'Reading files…' : filesNeedingReview.length === 1 ? needsAnotherTry(filesNeedingReview[0].id) ? 'Retry this file' : 'Review this file with Nura' : `Review ${filesNeedingReview.length} files with Nura`}</Text></View><Text style={styles.arrow}>→</Text></Pressable>}
    {linkedSourceAssets.length > 1 && <View style={styles.batchAnalysis}>
      <Label style={styles.pageLabel}>CHECKS ACROSS YOUR FILES · {linkedSourceAssets.length}</Label>
      <Text style={styles.batchIntro}>Nura checks the reports for matching results and dates.</Text>
      {!batchComparisonComplete ? <Surface tone="dark" style={styles.notice}><Text style={styles.noticeTitle}>Checking source-matched details</Text><Text style={styles.noticeBody}>Each result is checked against its original file before it is included.</Text></Surface> : null}
      {batchComparisonComplete && batchSourceReviews.some((item) => item.status !== 'verified') ? <Surface tone="dark" style={styles.error}><Text style={styles.noticeTitle}>Some files could not be compared</Text><Text style={styles.noticeBody}>{batchSourceReviews.filter((item) => item.status !== 'verified').map((item) => `${item.name} · ${item.status === 'mismatch' ? 'source did not match; suggestions hidden' : 'source review unavailable'}`).join('\n')} Open those files individually to review them.</Text></Surface> : null}
      {batchComparisonComplete && batchFindings.length === 0 && batchSourceReviews.every((item) => item.status === 'verified') ? <Surface tone="dark" style={styles.notice}><Text style={styles.noticeTitle}>No matching results</Text><Text style={styles.noticeBody}>No matching results were found across these reports.</Text></Surface> : null}
      {batchComparisonComplete && batchFindings.map((finding) => {
        const isConflict = finding.kind === 'same_date_difference';
        const dateNeedsReview = finding.kind === 'date_uncertain_difference';
        const headline = isConflict ? 'Different values for the same date' : dateNeedsReview ? 'Different values · date needs checking' : finding.kind === 'same_date_match' ? 'Possible repeat · same value and date' : 'Possible repeat · compare dates';
        const when = finding.eventDates.length ? `Result date ${finding.eventDates.join(', ')}` : 'Result date not stated';
        const values = finding.values.map((value) => `${value}${finding.unit ? ` ${finding.unit}` : ''}`).join(' / ');
        return <Surface tone="dark" key={finding.id} style={styles.batchFinding}>
          <Text style={[styles.batchFindingTitle, (isConflict || dateNeedsReview) && styles.batchConflictTitle]}>{headline}</Text>
          <Text style={styles.batchFindingBody}>{finding.label} · {values} · {when}</Text>
          {!finding.eventDates.length && finding.documentDates.length > 0 ? <Text style={styles.batchFindingBody}>Source dates found: {finding.documentDates.map((item) => `${item.sourceName} · ${item.kind === 'collected_at' ? 'Collected' : 'Report date'} ${item.value}`).join(' · ')}. These dates are not yet linked to this result.</Text> : null}
          <Text style={styles.batchFindingBody}>{isConflict ? 'Check each value against its report before keeping it.' : dateNeedsReview ? 'One result has no date. Check both reports before deciding whether these are separate results.' : 'Check both report dates before deciding whether these are the same result.'}</Text>
          <View style={styles.batchSources}>{finding.sources.map((item) => {
            const asset = batchSourceReviews.find((review) => review.source?.id === item.id);
            return <Pressable key={item.id} disabled={!asset} onPress={() => { if (!asset) return; if (selected?.id === asset.assetId) { if (!source && asset.source) { setError(''); setSourceOpenRevision((revision) => revision + 1); } return; } lastOpenedNoticeSourceId.current = null; setSelectionChanged(true); setSelectedId(asset.assetId); setSource(null); setClaims([]); setActivity([]); setError(''); setNotice(`Opened ${asset.name} to compare its original source.`); }} style={styles.batchSourceButton}>
              <Text style={styles.batchSourceText}>Open {item.name} ↗</Text>
            </Pressable>;
          })}</View>
        </Surface>;
      })}
    </View>}
    {stagedReviewCount > 0 && <Surface tone="dark" style={styles.batchSave}><Label style={styles.pageLabel}>{stagedReviewCount} ITEM{stagedReviewCount === 1 ? '' : 'S'} READY TO SAVE</Label><Text style={styles.batchIntro}>Only the choices you select will be saved. Suggestions left undecided stay pending.</Text><Pressable accessibilityRole="button" accessibilityLabel={`Save ${stagedReviewCount} reviewed item${stagedReviewCount === 1 ? '' : 's'}`} accessibilityHint="Saves only the choices you staged. Suggestions left undecided stay pending." accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void saveReviewBatch()} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Saving reviewed items…' : 'Save reviewed items'}</Text><Text style={styles.arrow}>→</Text></Pressable></Surface>}
    {Boolean(sourceToOpen) && !source && !error && <Surface tone="dark" style={styles.notice}><Text style={styles.noticeTitle}>Opening your saved review</Text><Text style={styles.noticeBody}>The suggestions for this file are loading. The original won’t be sent again.</Text></Surface>}
    {!extracting && activity.length > 0 && <Surface tone="dark" style={styles.activity}>
      <View style={styles.activityStatusRow}><View style={[styles.activitySettledIcon, processingFailed && styles.activitySettledWarning]}><Text style={styles.activitySettledText}>{processingFailed ? '!' : processingCancelled ? 'Ⅱ' : '✓'}</Text></View><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>{processingHeadline}</Text><Text style={styles.noticeBody}>{processingDescription}</Text></View></View>
      <Label style={styles.pageLabel}>FILE REVIEW ACTIVITY</Label>
      {groupIntakeActivity(activity).map((group) => {
        const asset = readable.find((item) => item.id === group.assetId);
        const title = asset ? documentDisplayName(asset, facts) : group.originalName;
        return <View key={group.assetId} style={{ marginTop: 8, marginBottom: 6 }}>
          <Text style={styles.noticeTitle}>{title}</Text>
          {group.items.map((item) => <IntakeActivityRow key={item.id} item={item} reducedMotion={reducedMotion} latest={item.id === activity.at(-1)?.id} />)}
        </View>;
      })}
    </Surface>}
    {notice && activity.length === 0 ? <Surface tone="dark" style={styles.notice}><Text style={styles.noticeTitle}>Review update</Text><Text accessibilityLiveRegion="polite" aria-live="polite" style={styles.noticeBody}>{notice}</Text></Surface> : null}
    {error ? <Surface tone="dark" style={styles.error}><Text style={styles.noticeTitle}>Could not complete this step</Text><Text accessibilityLiveRegion="assertive" aria-live="assertive" style={styles.noticeBody}>{error}</Text></Surface> : null}
    {Boolean(existingSourceId && ready && !selected) && <Surface tone="dark" style={styles.error}><Text style={styles.noticeTitle}>Original file unavailable</Text><Text style={styles.noticeBody}>Nura couldn’t match this extraction to its saved original. The extracted details stay hidden until the original file is available.</Text></Surface>}
    {source && <Surface tone="dark" style={styles.sourceCard}>
      <Label style={styles.pageLabel}>{source.origin === 'user_entered' ? 'YOUR DESCRIPTION' : 'YOUR SOURCE'} · {claims.length} DETAILS</Label>
      <Text style={styles.sourceName}>{selected ? documentDisplayName({ ...selected, documentType: source.documentContext?.documentType ?? selected.documentType }, facts) : source.displayName}</Text>
      {sourceReviewSummary ? <Text style={styles.sourceSub}>{sourceReviewSummary}</Text> : null}
      <Text style={styles.sourceSub}>{source.origin === 'user_entered' ? 'Written by you' : `Source file · ${documentOriginalName(selected)}`}</Text>
      {source.origin === 'user_entered' ? <View style={styles.unknownPassages}>
        {(source.documentContext?.notes ?? []).filter((item) => item.kind === 'unresolved_self_report').length > 0 ? <>
          <Text style={styles.historyTitle}>STILL UNCLEAR · NOT ADDED AS FACTS</Text>
          {(source.documentContext?.notes ?? []).filter((item) => item.kind === 'unresolved_self_report').map((item, index) => <View key={`${index}:${item.value}`} style={styles.unknownPassage}>
            <Text style={styles.quote}>“{item.quote ?? item.value}”</Text>
            <Text style={styles.sourceSub}>{item.value}</Text>
          </View>)}
        </> : <Text style={styles.sourceSub}>No passages were marked unclear by the local organizer.</Text>}
      </View> : <DocumentContextCard context={source.documentContext} compact />}
    </Surface>}
    {reviewGroups.map((group) => <View key={group.kind} style={styles.reviewGroup}>
      <View style={styles.reviewGroupHeading}><Text style={styles.reviewGroupTitle}>{group.title}</Text><Text style={styles.reviewGroupCount}>{group.claims.length}</Text></View>
      {group.claims.map((claim) => {
      const draft = drafts[claim.id] ?? { label: claim.label, value: claim.value, unit: claim.unit ?? '', effectiveAt: claim.effectiveAt ?? '' };
      const pending = isPendingReviewClaim(claim);
      const accepted = claim.evidenceState === 'user_confirmed';
      const retracted = claim.evidenceState === 'user_retracted';
      const correctingAccepted = accepted && editingId === claim.id;
      const stagedDecision = reviewDecisions[claim.id];
      const expanded = expandedClaimIds[claim.id] ?? (claim.id === focusClaimId);
      const compactStatus = stagedDecision ? stagedDecision.decision === 'accept' ? 'Included in save' : stagedDecision.decision === 'edit' ? 'Edit staged' : 'Dismiss on save' : pending ? 'Needs review' : accepted ? purpose === 'insurance' ? 'In policy record' : 'In your record' : retracted ? 'Removed' : claim.evidenceState === 'rejected' ? 'Dismissed' : claim.evidenceState === 'superseded' ? 'Superseded' : 'Needs review';
      const compactDate = claim.effectiveAt ? `${purpose === 'insurance' ? 'Policy' : 'Result'} date · ${claim.effectiveAt}` : '';
      return <View key={claim.id} onLayout={(event) => { if (claim.id === focusClaimId) scrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 20), animated: false }); }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${claim.label}, ${formatClaimSummaryValue(claim.label, claim.value, claim.unit)}, ${compactStatus}. ${expanded ? 'Hide' : 'Show'} source quote and review actions`} accessibilityHint="Opens the source quote, date context and review actions." accessibilityState={{ expanded }} onPress={() => setExpandedClaimIds((current) => ({ ...current, [claim.id]: !(current[claim.id] ?? (claim.id === focusClaimId)) }))} style={({ pressed }) => [styles.claimSummary, pressed && (reducedMotion ? styles.claimSummaryPressedReduced : styles.claimSummaryPressed)]}>
          <View style={styles.claimSummaryMain}><Text style={styles.claimSummaryLabel}>{claim.label}</Text><Text style={styles.claimSummaryValue}>{formatClaimSummaryValue(claim.label, claim.value, claim.unit)}</Text>{compactDate ? <Text style={styles.claimSummaryDate}>{compactDate}</Text> : null}</View>
          <View style={styles.claimSummaryAside}><Text style={[styles.claimSummaryStatus, accepted && styles.stateDone, retracted && styles.stateRemoved]}>{compactStatus}</Text><Text style={styles.claimSummaryDisclosure}>{expanded ? 'Hide details ↑' : 'Review details ↓'}</Text></View>
        </Pressable>
        {expanded ? <Surface tone="dark" style={claim.id === focusClaimId ? { ...styles.claim, ...styles.focusedClaim } : styles.claim}>
        {claim.referenceRange ? <Text style={styles.claimMeta}>Typical range · {claim.referenceRange}</Text> : null}
        {purpose === 'medical' && <View style={styles.dateReview}>
          <Text style={styles.dateReviewLabel}>RESULT DATE</Text>
          <Text style={styles.dateReviewValue}>{claim.effectiveAt ? claim.effectiveAt : 'Not stated in report'}</Text>
        </View>}
        {claim.id === focusClaimId && <Text style={styles.focusNotice}>OPENED FROM POLICY COMPARISON</Text>}
        {claim.sourceLocation.quote ? <View style={styles.sourceQuoteWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: Boolean(expandedSourceQuoteIds[claim.id]) }}
            accessibilityLabel={`${expandedSourceQuoteIds[claim.id] ? 'Hide' : 'View'} source wording for ${claim.label}${claim.sourceLocation.page ? `, page ${claim.sourceLocation.page}` : ''}`}
            onPress={() => setExpandedSourceQuoteIds((current) => ({ ...current, [claim.id]: !current[claim.id] }))}
            style={styles.sourceQuoteToggle}
          ><Text style={styles.sourceQuoteToggleText}>{expandedSourceQuoteIds[claim.id] ? 'HIDE SOURCE WORDING' : `VIEW SOURCE WORDING${claim.sourceLocation.page ? ` · PAGE ${claim.sourceLocation.page}` : typeof claim.sourceLocation.timestampSeconds === 'number' ? ` · ${formatVideoTimestamp(claim.sourceLocation.timestampSeconds)}` : ''}`}</Text></Pressable>
          {expandedSourceQuoteIds[claim.id] ? <Text style={styles.quote}>“{claim.sourceLocation.quote}”</Text> : null}
        </View> : <Text style={styles.confidence}>No source quote. Check the report before saving.</Text>}
        {pending && stagedDecision && <View><Text accessibilityLiveRegion="polite" aria-live="polite" style={styles.stagedHint}>{stagedDecision.decision === 'reject' ? 'Marked to dismiss when you save this review.' : stagedDecision.decision === 'edit' ? 'Your edited details are staged for save. The original quote stays attached.' : 'Marked to add when you save this review. It is not in your registry yet.'}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Undo staged choice for ${claim.label}`} accessibilityHint="Removes this choice and leaves the suggestion pending." accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => undoReviewDecision(claim)} style={styles.undoChoice}><Text style={styles.undoChoiceText}>Undo choice · leave pending</Text></Pressable></View>}
        {retracted && <View style={styles.retractedNote}><Text style={styles.retractedText}>{purpose === 'insurance' ? 'Removed from the Insurance Registry. The original policy file, source quote and review history remain available.' : 'Removed from your active profile. The original file, source quote and review history remain available.'}</Text></View>}
        {claim.originalExtraction && <View style={styles.versionHistory}><Text style={styles.historyTitle}>WHAT NURA FIRST READ</Text><Text style={styles.historyCopy}>{claim.originalExtraction.label}: {formatClaimValue(claim.originalExtraction.value, claim.originalExtraction.unit)} · kept with the source quote</Text></View>}
        {(claim.revisionHistory ?? []).length > 0 && <View style={styles.versionHistory}><Text style={styles.historyTitle}>EARLIER VERSIONS</Text>{[...(claim.revisionHistory ?? [])].reverse().map((version) => <Text key={version.assertionId} style={styles.historyCopy}>v{version.version} · {new Date(version.recordedAt).toLocaleDateString()} · {version.label}: {formatClaimValue(version.value, version.unit)}</Text>)}</View>}
        {pending && editingId === claim.id ? <View style={styles.editFields}><TextInput value={draft.label} onChangeText={(label) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, label } }))} placeholder="Detail name" accessibilityLabel={`${purpose === 'insurance' ? 'Policy term name' : 'Health detail name'} for ${claim.label}`} style={styles.input} /><TextInput value={draft.value} onChangeText={(value) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, value } }))} placeholder="Value" accessibilityLabel={`Value for ${claim.label}`} style={styles.input} /><TextInput value={draft.unit} onChangeText={(unit) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, unit } }))} placeholder="Unit (optional)" accessibilityLabel={`Unit for ${claim.label}, optional`} style={styles.input} />{purpose === 'medical' && <>
          <Text style={styles.dateInputLabel}>RESULT DATE · OPTIONAL</Text>
          <TextInput value={draft.effectiveAt} onChangeText={(effectiveAt) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, effectiveAt } }))} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} accessibilityLabel={`Result date for ${claim.label} in year-month-day format`} style={styles.input} />
          <Text style={styles.dateInputHelp}>Use the date for this result. Leave blank when unknown; a report date is not copied automatically.</Text>
        </>}<Pressable accessibilityRole="button" accessibilityLabel={`Stage edited details for ${claim.label}`} accessibilityHint="Stages this edit. It is not saved until you save reviewed items." accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => reviewClaim(claim, 'edit')} style={styles.primarySmall}><Text style={styles.primarySmallText}>{stagedDecision?.decision === 'edit' ? 'Update staged details' : 'Use edited details'}</Text></Pressable></View> : null}
        {correctingAccepted && <View style={styles.editFields}><Text style={styles.confidence}>Your correction creates a new version and keeps the earlier accepted value linked to this source.</Text><TextInput value={draft.label} onChangeText={(label) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, label } }))} placeholder="Detail name" accessibilityLabel={`${purpose === 'insurance' ? 'Policy term name' : 'Health detail name'} for ${claim.label}`} style={styles.input} /><TextInput value={draft.value} onChangeText={(value) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, value } }))} placeholder="Corrected value" accessibilityLabel={`Corrected value for ${claim.label}`} style={styles.input} /><TextInput value={draft.unit} onChangeText={(unit) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, unit } }))} placeholder="Unit (optional)" accessibilityLabel={`Unit for ${claim.label}, optional`} style={styles.input} />{purpose === 'medical' && <><Text style={styles.dateInputLabel}>RESULT DATE · OPTIONAL</Text><TextInput value={draft.effectiveAt} onChangeText={(effectiveAt) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, effectiveAt } }))} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} accessibilityLabel={`Result date for ${claim.label} in year-month-day format`} style={styles.input} /><Text style={styles.dateInputHelp}>Leave blank when the result date is unknown.</Text></>}<Pressable accessibilityRole="button" accessibilityLabel={`Save corrected version of ${claim.label}`} accessibilityHint="Saves a new version and keeps the prior version with its source." accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void saveClaimCorrection(claim)} style={styles.primarySmall}><Text style={styles.primarySmallText}>{busy ? 'Saving version…' : 'Save corrected version'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Cancel editing ${claim.label}`} disabled={busy} onPress={() => setEditingId(null)} style={styles.cancel}><Text style={styles.secondaryText}>Cancel</Text></Pressable></View>}
        {accepted && !correctingAccepted && <View style={styles.actions}><Pressable disabled={busy} accessibilityRole="button" onPress={() => startEdit(claim)} style={styles.edit}><Text style={styles.actionText}>{purpose === 'insurance' ? 'Correct this policy term' : 'Correct this detail'}</Text></Pressable><Pressable disabled={busy} accessibilityRole="button" onPress={() => setRetractConfirmId(claim.id)} style={styles.reject}><Text style={styles.actionText}>{purpose === 'insurance' ? 'Remove from registry' : 'Remove from profile'}</Text></Pressable></View>}
        {accepted && retractConfirmId === claim.id && <View style={styles.retractConfirm}><Text style={styles.retractConfirmText}>{purpose === 'insurance' ? 'Remove this policy term from your Insurance Registry? Its source quote, original policy file and review history will be kept.' : 'Remove this as a personal health fact? Its source quote, original file and review history will be kept.'}</Text><View style={styles.actions}><Pressable disabled={busy} accessibilityRole="button" onPress={() => void retractClaim(claim)} style={styles.removeConfirm}><Text style={styles.removeConfirmText}>{busy ? 'Removing…' : purpose === 'insurance' ? 'Remove policy term' : 'Remove from profile'}</Text></Pressable><Pressable disabled={busy} accessibilityRole="button" onPress={() => setRetractConfirmId(null)} style={styles.edit}><Text style={styles.actionText}>Keep it</Text></Pressable></View></View>}
        {pending && purpose === 'insurance' && claim.kind !== 'coverage_term' ? <View style={styles.actions}><Text style={styles.confidence}>This isn’t a policy term, so it can’t be added to your Insurance Registry.</Text><Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${claim.label}`} accessibilityHint="Keeps this suggestion out of the Insurance Registry when you save." accessibilityState={{ disabled: busy, selected: stagedDecision?.decision === 'reject', busy }} disabled={busy} onPress={() => reviewClaim(claim, 'reject')} style={styles.reject}><Text style={styles.actionText}>{stagedDecision?.decision === 'reject' ? 'Dismiss on save' : 'Dismiss'}</Text></Pressable></View> : null}
        {pending && editingId !== claim.id && (purpose !== 'insurance' || claim.kind === 'coverage_term') ? <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel={`${stagedDecision?.decision === 'accept' ? 'Included in save' : purpose === 'insurance' ? 'Include policy term' : 'Include'}: ${claim.label}`} accessibilityHint="Stages this suggestion for your record. It is not saved until you save reviewed items." accessibilityState={{ disabled: busy, selected: stagedDecision?.decision === 'accept', busy }} disabled={busy} onPress={() => reviewClaim(claim, 'accept')} style={[styles.accept, busy && styles.disabled]}><Text style={styles.actionOnText}>{stagedDecision?.decision === 'accept' ? 'Included in save' : purpose === 'insurance' ? 'Include policy term' : 'Include in save'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${editingId === claim.id ? 'Finish editing' : 'Edit'} ${claim.label}`} accessibilityHint="Opens the suggested name, value and result date for editing." accessibilityState={{ disabled: busy, selected: editingId === claim.id, busy }} disabled={busy} onPress={() => startEdit(claim)} style={[styles.edit, busy && styles.disabled]}><Text style={styles.actionText}>{stagedDecision?.decision === 'edit' ? 'Edit staged details' : 'Edit'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${claim.label}`} accessibilityHint="Keeps this suggestion out of your record when you save." accessibilityState={{ disabled: busy, selected: stagedDecision?.decision === 'reject', busy }} disabled={busy} onPress={() => reviewClaim(claim, 'reject')} style={[styles.reject, busy && styles.disabled]}><Text style={styles.actionText}>{stagedDecision?.decision === 'reject' ? 'Dismiss on save' : 'Dismiss'}</Text></Pressable></View> : null}
        </Surface> : null}
      </View>;
    })}
    </View>)}
    {canKeepReviewedSources ? <Surface tone="dark" style={styles.batchSave}><Label style={styles.pageLabel}>ALL FILES REVIEWED</Label><Text style={styles.batchIntro}>Your choices are saved with their source files.</Text><Pressable accessibilityRole="button" accessibilityLabel="Continue profile setup" onPress={() => void keepReviewedSources()} style={styles.primary}><Text style={styles.primaryText}>Continue profile setup</Text><Text style={styles.arrow}>→</Text></Pressable></Surface> : null}
    {canDeferPendingSuggestions ? <Surface tone="dark" style={styles.batchSave}><Label style={styles.pageLabel}>KEEP THESE SUGGESTIONS PENDING</Label><Text style={styles.batchIntro}>You can continue setup now. These {undecidedClaimCount} {undecidedClaimCount === 1 ? 'suggestion stays' : 'suggestions stay'} with the source file and will not be added to your profile until you approve them.</Text></Surface> : null}
    {!assets.length && !intakeNotes.length && <Surface tone="dark" style={styles.notice}><Text style={styles.noticeTitle}>No file or description selected</Text><Text style={styles.noticeBody}>{purpose === 'insurance' ? 'Choose a policy PDF, Word, RTF, OpenDocument or TXT file, or an image, to review its stated terms.' : 'Choose a PDF, Word, RTF, OpenDocument or TXT file, image or short health video, or add a short description, to begin a source-linked review.'}</Text></Surface>}
    <Pressable onPress={() => router.replace(firstRun ? '/setup' : purpose === 'insurance' ? '/insurance' : areaContext ? { pathname: '/registry', params: { topicId: areaContext.id } } : '/(tabs)/health')} style={styles.secondary}><Text style={styles.secondaryText}>{firstRun ? 'Continue profile setup' : purpose === 'insurance' ? 'Open Insurance Registry' : areaContext ? `Open ${areaContext.label} registry` : 'Open my registry'}</Text><Text style={styles.arrow}>→</Text></Pressable>
  </ScrollView>
  {firstRun && !consentOpen && !selfReportConsentNote ? <View style={styles.setupFooter}><Pressable accessibilityRole="button" accessibilityLabel="Back to profile setup" onPress={() => router.replace('/setup')} style={styles.setupFooterBack}><Text style={styles.setupFooterBackText}>‹  PROFILE SETUP</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={setupAction.label} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={setupAction.onPress} style={[styles.setupFooterPrimary, busy && styles.disabled]}><Text style={styles.setupFooterPrimaryText}>{busy ? extracting ? 'Nura is reading…' : 'Saving…' : setupAction.label}</Text><Text style={styles.setupFooterArrow}>→</Text></Pressable></View> : null}
  {consentOpen && <View style={styles.modalShade}><View style={styles.modal}>
    <Text style={styles.modalEyebrow}>REVIEW {consentFiles.length} FILE{consentFiles.length === 1 ? '' : 'S'}</Text>
    <Text style={styles.modalTitle}>{purpose === 'insurance' ? 'Read these policy files?' : 'Read these health files?'}</Text>
    <Text style={styles.modalBody}>{consentFiles.map((asset) => `• ${isBuiltInLocalSample(asset) ? 'Example' : 'Your file'} · ${asset.name}`).join('\n')}{consentFiles.some((asset) => asset.healthAreaId && getHealthAreaContext(asset.healthAreaId)) ? `\nFiled under ${consentFiles.map((asset) => asset.healthAreaId ? getHealthAreaContext(asset.healthAreaId)?.label : '').filter(Boolean).join(', ')} · used for organization` : ''}{consentFiles.some((asset) => asset.kind === 'video') ? '\nVideo review uses still images only; audio is not analyzed.' : ''}{localSampleOnlyConsent ? '\n\nExample files are checked on this device.' : mixedProcessingConsent ? '\n\nYour selected files are sent to Nura’s AI service; examples stay on this device.' : '\n\nYour selected files are sent to Nura’s AI service for reading.'}{consentFiles.some((asset) => asset.kind === 'audio') ? '\n\nOnly recordings you approve below are sent to OpenAI for transcription. The transcript is then used to suggest source-linked health details.' : ''}{'\nEach file gets its own review. Suggestions stay pending until you choose what to save.'}</Text>
    {consentFiles.filter((asset) => asset.kind === 'audio').map((asset) => {
      const checked = audioConsentAssetIds.includes(asset.id);
      return <Pressable key={`audio-consent:${asset.id}`} accessibilityRole="checkbox" accessibilityLabel={`Allow OpenAI to transcribe ${asset.name} and prepare health-detail suggestions`} accessibilityState={{ checked, disabled: busy }} disabled={busy} onPress={() => setAudioConsentAssetIds((ids) => checked ? ids.filter((id) => id !== asset.id) : [...ids, asset.id])} style={styles.consentCheckRow}>
        <View style={[styles.consentBox, checked && styles.consentBoxChecked]}><Text style={styles.consentCheckMark}>{checked ? '✓' : ''}</Text></View>
        <Text style={styles.consentCheckText}>I approve sending “{asset.name}” to OpenAI for transcription and health-detail suggestions. Its suggestions will need my review before anything is saved.</Text>
      </Pressable>;
    })}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !approvedConsentFiles.length, busy }} disabled={busy || !approvedConsentFiles.length} onPress={() => void readSelectedBatch()} style={[styles.primary, (busy || !approvedConsentFiles.length) && styles.disabled]}><Text style={styles.primaryText}>{localSampleOnlyConsent ? 'Approve and review examples' : 'Approve and review selected files'}</Text><Text style={styles.arrow}>→</Text></Pressable>
    <Pressable onPress={() => setConsentOpen(false)} style={styles.cancel}><Text style={styles.secondaryText}>Not now</Text></Pressable>
  </View></View>}
  {selfReportConsentNote && <View style={styles.modalShade}><View style={styles.modal}>
    <Text style={styles.modalEyebrow}>LOCAL NOTE REVIEW</Text>
    <Text style={styles.modalTitle}>Organize this note?</Text>
    <Text style={styles.modalBody}>Nura matches details on the local service. This note is not sent to an AI provider. Review each suggestion before saving.</Text>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selfReportConsentChecked, disabled: busy }} disabled={busy} onPress={() => setSelfReportConsentChecked((checked) => !checked)} style={styles.consentCheckRow}>
      <View style={[styles.consentBox, selfReportConsentChecked && styles.consentBoxChecked]}><Text style={styles.consentCheckMark}>{selfReportConsentChecked ? '✓' : ''}</Text></View>
      <Text style={styles.consentCheckText}>I want Nura to organize this note.</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !selfReportConsentChecked || busy, busy }} disabled={!selfReportConsentChecked || busy} onPress={() => void organizeSelfReport(selfReportConsentNote.id)} style={[styles.primary, (!selfReportConsentChecked || busy) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Organizing note…' : 'Organize note'}</Text><Text style={styles.arrow}>→</Text></Pressable>
    <Pressable disabled={busy} onPress={() => { setSelfReportConsentNoteId(null); setSelfReportConsentChecked(false); }} style={styles.cancel}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
  </View></View>}
  </View>;
}
const styles = StyleSheet.create({
  sceneGlow: { position: 'absolute', top: 0, right: 0, width: '100%', height: 320, opacity: .8 },
  pageLabel: { color: 'rgba(255,248,240,.70)' },
  areaContextCard: { marginTop: 12, marginBottom: 2, padding: 13, backgroundColor: 'rgba(120,85,150,.14)', borderColor: 'rgba(210,185,230,.4)' }, areaContextEyebrow: { color: '#D4D0DA', fontSize: 8, fontWeight: '800', letterSpacing: 1 }, areaContextBody: { color: 'rgba(255,248,240,.78)', fontSize: 11, lineHeight: 16, marginTop: 5 },
  page: { flex: 1, backgroundColor: '#211A17' }, setupFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.34)', backgroundColor: 'rgba(43,32,35,.9)', flexDirection: 'row', alignItems: 'center', gap: 10 }, setupFooterBack: { minHeight: 45, justifyContent: 'center', paddingHorizontal: 7 }, setupFooterBackText: { color: '#D5EEFF', fontSize: 8, fontWeight: '900', letterSpacing: .7 }, setupFooterPrimary: { flex: 1, minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.94)', backgroundColor: 'rgba(255,248,240,.97)', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, setupFooterPrimaryText: { flex: 1, color: '#382742', fontSize: 11, fontWeight: '800' }, setupFooterArrow: { color: '#1769E8', fontSize: 20, fontWeight: '800' }, content: { padding: 22, paddingTop: 38, paddingBottom: 132, maxWidth: 600, width: '100%', alignSelf: 'center' }, back: { color: 'rgba(255,248,240,.78)', fontSize: 15, marginBottom: 22 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, title: { color: '#FFF8F0', fontSize: 27, fontWeight: '300', marginTop: 6 }, intro: { color: 'rgba(255,248,240,.78)', fontSize: 13, lineHeight: 20, marginTop: 13, marginBottom: 17 }, files: { marginTop: 3, marginBottom: 12 }, file: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: radius.md, marginTop: 8, gap: 10 }, fileSelected: { borderColor: '#B7DDF0', borderWidth: 1.5 }, fileType: { color: '#91D7C0', fontSize: 9, fontWeight: '700', borderColor: 'rgba(255,255,255,.24)', borderWidth: 1, borderRadius: 9, padding: 8 }, fileName: { color: '#FFF8F0', fontSize: 12, fontWeight: '500' }, fileSub: { color: 'rgba(255,248,240,.60)', fontSize: 10, marginTop: 3 }, select: { color: '#B7DDF0', fontSize: 10, fontWeight: '600' }, notice: { marginTop: 12, borderColor: 'rgba(255,255,255,.24)' }, activity: { marginTop: 12, padding: 13 }, activityRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 9 }, activityMark: { color: 'rgba(255,248,240,.60)', fontSize: 14, width: 18, textAlign: 'center' }, activityDone: { color: '#A6E8C8' }, activityFailed: { color: '#F3B7AE' }, activityCancelled: { color: 'rgba(255,248,240,.78)' }, activityText: { color: 'rgba(255,248,240,.78)', fontSize: 10, flex: 1 }, noticeTitle: { color: '#FFF8F0', fontSize: 13, fontWeight: '600' }, noticeBody: { color: 'rgba(255,248,240,.78)', fontSize: 11, lineHeight: 17, marginTop: 5 }, stop: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.22)', backgroundColor: 'rgba(255,255,255,.08)' }, stopPressed: { opacity: .78, transform: [{ scale: .98 }] }, stopPressedReduced: { opacity: .78 }, stopText: { color: '#B7DDF0', fontSize: 9, fontWeight: '700', letterSpacing: .55 }, error: { marginTop: 12, borderColor: 'rgba(242,189,157,.44)', backgroundColor: 'rgba(211,101,95,.20)' }, primary: { backgroundColor: '#FFF8F0', borderRadius: radius.pill, minHeight: 53, marginTop: 13, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, disabled: { opacity: .6 }, primaryText: { color: '#4A3458', fontWeight: '600', fontSize: 13 }, arrow: { color: '#4A3458', fontSize: 19 }, sourceCard: { marginTop: 13 }, sourceName: { color: '#FFF8F0', fontSize: 15, fontWeight: '600', marginTop: 8 }, sourceSub: { color: 'rgba(255,248,240,.78)', fontSize: 10, lineHeight: 15, marginTop: 5 }, claim: { marginTop: 10, padding: 14 }, claimTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, claimLabel: { color: '#FFF8F0', fontSize: 14, fontWeight: '600' }, claimValue: { color: 'rgba(255,248,240,.78)', fontSize: 12, lineHeight: 18, marginTop: 4 }, claimMeta: { color: 'rgba(255,248,240,.60)', fontSize: 10, lineHeight: 15, marginTop: 4 }, dateReview: { marginTop: 9, padding: 10, borderRadius: 11, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' }, dateReviewLabel: { color: '#B7DDF0', fontSize: 8, fontWeight: '700', letterSpacing: .8 }, dateReviewValue: { color: '#FFF8F0', fontSize: 10, fontWeight: '600', marginTop: 4 }, dateReviewHelp: { color: 'rgba(255,248,240,.78)', fontSize: 9, lineHeight: 14, marginTop: 4 }, dateInputLabel: { color: '#B7DDF0', fontSize: 8, fontWeight: '700', letterSpacing: .8 }, dateInputHelp: { color: 'rgba(255,248,240,.60)', fontSize: 9, lineHeight: 13 }, state: { color: '#F1C28E', backgroundColor: 'rgba(242,189,157,.20)', overflow: 'hidden', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 7, fontSize: 8, fontWeight: '700' }, stateDone: { color: '#A6E8C8', backgroundColor: 'rgba(117,201,154,.22)' }, stateRemoved: { color: '#D4D0DA', backgroundColor: 'rgba(183,138,208,.20)' }, retractedNote: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.08)' }, retractedText: { color: '#D4D0DA', fontSize: 10, lineHeight: 15 }, retractConfirm: { marginTop: 10, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.20)', backgroundColor: 'rgba(255,255,255,.08)' }, retractConfirmText: { color: 'rgba(255,248,240,.78)', fontSize: 11, lineHeight: 16 }, removeConfirm: { flex: 1, borderRadius: 12, backgroundColor: 'rgba(211,101,95,.18)', padding: 10, alignItems: 'center' }, removeConfirmText: { color: '#F3B7AE', fontSize: 11, fontWeight: '600' }, sourceQuoteWrap: { marginTop: 7 }, sourceQuoteToggle: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 8 }, sourceQuoteToggleText: { color: '#AFCDFB', fontSize: 8, fontWeight: '800', letterSpacing: .7 }, quote: { color: 'rgba(255,248,240,.78)', fontSize: 11, lineHeight: 16, fontStyle: 'italic', marginTop: 3 }, confidence: { color: 'rgba(255,248,240,.60)', fontSize: 9, lineHeight: 14, marginTop: 7 }, actions: { flexDirection: 'row', gap: 7, marginTop: 12 }, accept: { flex: 1, borderRadius: 12, backgroundColor: 'rgba(117,201,154,.20)', padding: 10, alignItems: 'center' }, edit: { flex: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.08)', padding: 10, alignItems: 'center' }, reject: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.24)', padding: 10, alignItems: 'center' }, actionOnText: { color: '#A6E8C8', fontSize: 11, fontWeight: '600' }, actionText: { color: '#FFF8F0', fontSize: 11, fontWeight: '600' }, editFields: { gap: 7, marginTop: 10 }, input: { color: '#FFF8F0', fontSize: 12, backgroundColor: 'rgba(42,28,23,.45)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,.24)', paddingHorizontal: 10, paddingVertical: 9 }, primarySmall: { backgroundColor: '#B7DDF0', borderRadius: 11, padding: 11, alignItems: 'center' }, primarySmallText: { color: '#FFF', fontSize: 11, fontWeight: '600' }, secondary: { backgroundColor: 'rgba(66,43,35,.34)', borderWidth: 1, borderColor: 'rgba(255,255,255,.24)', borderRadius: radius.pill, minHeight: 48, marginTop: 17, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, secondaryText: { color: '#FFF8F0', fontWeight: '500', fontSize: 12 }, footer: { color: 'rgba(255,248,240,.60)', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 12 }, modalShade: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', backgroundColor: 'rgba(20,16,26,.45)' }, modal: { backgroundColor: '#30221D', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 21, paddingTop: 24, paddingBottom: 28 }, modalEyebrow: { color: '#B7DDF0', fontSize: 8, fontWeight: '700', letterSpacing: 1.2 }, modalTitle: { color: '#FFF8F0', fontSize: 21, fontWeight: '500', marginTop: 7 }, modalBody: { color: 'rgba(255,248,240,.78)', fontSize: 12, lineHeight: 18, marginTop: 9 }, cancel: { alignItems: 'center', padding: 12, marginTop: 4 },
  selfReportSection: { marginTop: 12, marginBottom: 10 }, selfReportCard: { marginTop: 9, padding: 13, borderColor: '#CDBDD6', backgroundColor: 'rgba(255,255,255,.08)' }, selfReportHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, selfReportTitle: { color: '#FFF8F0', fontSize: 13, fontWeight: '600' }, selfReportMeta: { color: 'rgba(255,248,240,.60)', fontSize: 10, marginTop: 4 }, selfReportState: { color: '#D4D0DA', fontSize: 8, fontWeight: '700', letterSpacing: 0.5 }, selfReportText: { color: 'rgba(255,248,240,.78)', fontSize: 12, lineHeight: 18, marginTop: 12 }, selfReportInput: { minHeight: 100, marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.24)', borderRadius: 12, backgroundColor: 'rgba(66,43,35,.34)', color: '#FFF8F0', padding: 11, fontSize: 12, lineHeight: 18 }, selfReportFoot: { color: 'rgba(255,248,240,.60)', fontSize: 10, lineHeight: 15, marginTop: 9 }, selfReportConfirm: { marginTop: 10, padding: 10, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,.20)', backgroundColor: 'rgba(255,255,255,.08)' }, selfReportActions: { marginTop: 5 }, unknownPassages: { marginTop: 12, padding: 10, borderRadius: 11, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' }, unknownPassage: { paddingTop: 7 }, consentCheckRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 17, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.24)', backgroundColor: 'rgba(66,43,35,.34)' }, consentBox: { width: 21, height: 21, borderRadius: 6, borderWidth: 1, borderColor: '#B7DDF0', alignItems: 'center', justifyContent: 'center' }, consentBoxChecked: { backgroundColor: '#B7DDF0' }, consentCheckMark: { color: '#FFF', fontSize: 14, fontWeight: '700' }, consentCheckText: { color: '#FFF8F0', fontSize: 11, lineHeight: 16, flex: 1 },
  versionHistory: { marginTop: 9, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' }, historyTitle: { color: '#B7DDF0', fontSize: 8, fontWeight: '700', letterSpacing: .8 }, historyCopy: { color: 'rgba(255,248,240,.78)', fontSize: 10, lineHeight: 15, marginTop: 5 },
  focusedClaim: { borderColor: '#B7DDF0', borderWidth: 2, backgroundColor: 'rgba(255,255,255,.08)' }, focusNotice: { color: '#B7DDF0', fontSize: 8, fontWeight: '800', letterSpacing: 0.7, marginTop: 9 }, stagedHint: { color: '#B7DDF0', fontSize: 10, lineHeight: 15, marginTop: 6 }, undoChoice: { alignSelf: 'flex-start', marginTop: 7, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,.24)' }, undoChoiceText: { color: '#B7DDF0', fontSize: 10, fontWeight: '600' },
  batchAnalysis: { marginTop: 16, marginBottom: 8 }, batchIntro: { color: 'rgba(255,248,240,.78)', fontSize: 11, lineHeight: 17, marginTop: 7, marginBottom: 3 }, firstRunSummary: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 5 }, firstRunSummaryText: { color: '#B7DDF0', fontSize: 11, fontWeight: '600' },
  batchSave: { marginTop: 14, padding: 14, borderColor: '#CDBDD6', backgroundColor: 'rgba(255,255,255,.08)' },
  batchFinding: { marginTop: 9, padding: 13, borderColor: '#D9C7A8', backgroundColor: 'rgba(255,255,255,.08)' }, batchFindingTitle: { color: '#F1C28E', fontSize: 12, fontWeight: '700' }, batchConflictTitle: { color: '#F3B7AE' }, batchFindingBody: { color: 'rgba(255,248,240,.78)', fontSize: 10, lineHeight: 15, marginTop: 6 },
  batchSources: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }, batchSourceButton: { borderRadius: 99, backgroundColor: 'rgba(231,213,241,.14)', paddingHorizontal: 10, paddingVertical: 7 }, batchSourceText: { color: '#B7DDF0', fontSize: 9, fontWeight: '600' },
  processingOrb: { position: 'relative', width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: 'rgba(255,255,255,.36)', backgroundColor: 'rgba(183,138,208,.16)', alignItems: 'center', justifyContent: 'center', shadowColor: '#D987BE', shadowOpacity: .35, shadowRadius: 15 }, processingOrbit: { position: 'absolute', top: 2, left: 2, width: 66, height: 66, borderRadius: 34, borderWidth: 1, borderColor: 'rgba(255,255,255,.30)', borderTopColor: '#F2BD9D', borderRightColor: 'rgba(217,135,190,.75)' }, processingOrbitInner: { position: 'absolute', top: 8, left: 8, width: 54, height: 54, borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,.16)', borderBottomColor: 'rgba(143,216,180,.76)' }, processingSpark: { position: 'absolute', top: 2, right: 11, width: 9, height: 9, borderRadius: 5, backgroundColor: '#FFD09E', shadowColor: '#F2BD9D', shadowOpacity: .95, shadowRadius: 9 }, processingSparkMint: { position: 'absolute', top: 5, left: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: '#8FD8B4', shadowColor: '#8FD8B4', shadowOpacity: .9, shadowRadius: 7 },
  activityStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }, activitySettledIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(143,216,180,.16)', borderWidth: 1, borderColor: 'rgba(143,216,180,.52)' }, activitySettledWarning: { backgroundColor: 'rgba(242,189,157,.16)', borderColor: 'rgba(242,189,157,.64)' }, activitySettledText: { color: '#C7F0D5', fontSize: 20, fontWeight: '700' }, activityStaticStatus: { color: '#A8D8FF', fontSize: 8, fontWeight: '800', letterSpacing: .6 },
  reviewGroup: { marginTop: 14 }, reviewGroupHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }, reviewGroupTitle: { color: '#FFF8F0', fontSize: 13, fontWeight: '700' }, reviewGroupCount: { minWidth: 26, overflow: 'hidden', textAlign: 'center', color: '#B7DDF0', backgroundColor: 'rgba(183,138,208,.20)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, fontSize: 10, fontWeight: '700' },
  claimSummary: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, padding: 12, backgroundColor: 'rgba(66,43,35,.34)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', borderRadius: 14 }, claimSummaryPressed: { backgroundColor: 'rgba(255,255,255,.08)', transform: [{ scale: 0.99 }] }, claimSummaryPressedReduced: { backgroundColor: 'rgba(255,255,255,.08)' }, claimSummaryMain: { flex: 1 }, claimSummaryLabel: { color: '#FFF8F0', fontSize: 13, fontWeight: '600' }, claimSummaryValue: { color: 'rgba(255,248,240,.78)', fontSize: 12, lineHeight: 17, marginTop: 3 }, claimSummaryDate: { color: 'rgba(255,248,240,.60)', fontSize: 10, lineHeight: 14, marginTop: 3 }, claimSummaryAside: { alignItems: 'flex-end', gap: 8 }, claimSummaryStatus: { maxWidth: 118, textAlign: 'right', color: '#B7DDF0', backgroundColor: 'rgba(183,138,208,.20)', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4, fontSize: 9, fontWeight: '700' }, claimSummaryDisclosure: { color: '#B7DDF0', fontSize: 10, fontWeight: '700' },
});
