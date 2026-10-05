import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextStyle } from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { motion, brandScenes } from '../theme';
import { GlassMaterial } from './GlassMaterial';
import { Atmosphere } from './ambient/Atmosphere';
import { StatusBar } from 'expo-status-bar';
import { parseHealthDate } from '../utils/healthDate';
import { registryBriefDisplayModel, registryBriefDisplayText, registryCitationTargetId, registryEvidenceSnapshot } from '../services/registryBrief.mjs';
import { getHealthAreaContext } from '../services/healthAreaContext.mjs';
import { documentDisplayName, documentIsInsurance } from '../services/documentPresentation.mjs';
import { canonicalHealthMarker, findHealthMarkerDiscrepancy, getHealthMarkerUnitOptions, getHealthMarkersForTopic, healthMarkerUnitNeedsReview, healthMarkerValueNeedsReview } from '../services/healthMarkers.mjs';
import { groupRegistryMarkerHistory } from '../services/registryMarkerHistory.mjs';
import { getRegistryFactVersionBadge } from '../services/registryFactVersion.mjs';
import type { HealthFact, HealthLink, HealthLinkRelation, HealthTopic, HealthVisit, IntakeAsset, RegistryBrief, TreatmentRecord } from '../state/NuraContext';

type RegistryItem = {
  id: string;
  kind: 'fact' | 'asset' | 'treatment' | 'visit';
  title: string;
  detail: string;
  date: string;
  category: string;
  source: string;
  status: string;
  versionLabel?: string;
  versionKind?: 'previous' | 'corrected' | 'retracted' | 'ended';
  versionRelatedId?: string;
  versionLinkLabel?: string;
  revision: string;
  sourceIdentity: string;
  areaTopicId?: string;
  areaTopicIds?: string[];
};
type RelationOption = { value: HealthLinkRelation; label: string; linkLabel: string };
type Props = {
  ready: boolean;
  topics: HealthTopic[];
  facts: HealthFact[];
  assets: IntakeAsset[];
  treatments: TreatmentRecord[];
  visits: HealthVisit[];
  links: HealthLink[];
  registryBriefs: RegistryBrief[];
  initialTopicId?: string;
  initialMarkerLabel?: string;
  firstRun?: boolean;
  addLink: (from: string, to: string, label: string, relationType?: HealthLinkRelation) => HealthLink | null;
  saveApprovedMemoryFact: (label: string, value: string, metadata?: { source?: string; category?: string; note?: string; eventDate?: string | null; validFrom?: string; validUntil?: string | null; confidence?: number | null; permissionScope?: string }) => Promise<HealthFact>;
  correctFact: (id: string, label: string, value: string, eventDate?: string | null, metadata?: { source?: string; category?: string; note?: string; sourceId?: string | null; sourceClaimId?: string | null; confidence?: number | null; permissionScope?: string }) => Promise<HealthFact | null>;
};

const C = {
  canvas: brandScenes.atmosphere.base, surface: 'rgba(255,249,246,.09)', ink: '#FFF9F3', muted: '#E7DBD4', faint: '#C2ADA4',
  border: 'rgba(255,241,230,.22)', cobalt: '#BBD3FF', bluePale: 'rgba(135,170,226,.18)', blueLine: 'rgba(183,208,255,.34)',
  plum: '#F2BFA5', primary: '#A65437', lilac: 'rgba(205,177,221,.18)', lilacInk: '#F0C1A7', mint: 'rgba(111,189,157,.19)', mintInk: '#BCE8D0',
  amber: 'rgba(232,174,112,.18)', amberInk: '#FFD39A', peach: '#F2BFA5', white: '#FFF9F3',
};
const relations: RelationOption[] = [
  { value: 'related_by_me', label: 'Related in my words', linkLabel: 'Linked by you as related' },
  { value: 'treatment_for', label: 'Treatment for this area', linkLabel: 'You linked this treatment to this area' },
];

function readableDate(value: string) {
  if (!value) return 'Date not recorded';
  const parsed = parseHealthDate(value);
  return parsed ? parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : value;
}
function todayDateInput() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}
function isValidDateInput(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
function TextReveal({ text, reduceMotion, style }: { text: string; reduceMotion: boolean; style?: TextStyle }) {
  const [visibleText, setVisibleText] = useState(reduceMotion ? text : '');
  useEffect(() => {
    if (reduceMotion) {
      const reveal = setTimeout(() => setVisibleText(text), 0);
      return () => clearTimeout(reveal);
    }
    let position = 0;
    const reset = setTimeout(() => setVisibleText(''), 0);
    const timer = setInterval(() => {
      position = Math.min(text.length, position + 2);
      setVisibleText(text.slice(0, position));
      if (position >= text.length) clearInterval(timer);
    }, 16);
    return () => { clearTimeout(reset); clearInterval(timer); };
  }, [reduceMotion, text]);
  return <Text accessibilityLabel={text} style={style}>{visibleText}</Text>;
}
function relationTint(kind: RegistryItem['kind']) {
  if (kind === 'treatment') return { node: '#D99374', pale: 'rgba(217,147,116,.18)', ink: '#F2C1A7' };
  if (kind === 'visit') return { node: '#BEA3D3', pale: 'rgba(190,163,211,.18)', ink: '#DDC3EE' };
  if (kind === 'asset') return { node: C.cobalt, pale: C.bluePale, ink: C.cobalt };
  return { node: '#7FC2AD', pale: 'rgba(127,194,173,.17)', ink: '#BCE8D0' };
}

export function MedicalRegistry({ ready, topics, facts, assets, treatments, visits, links, registryBriefs, initialTopicId, initialMarkerLabel, firstRun = false, addLink, saveApprovedMemoryFact, correctFact }: Props) {
  const [topicId, setTopicId] = useState(initialTopicId ?? topics[0]?.id ?? '');
  const [connectOpen, setConnectOpen] = useState(false);
  const [candidateId, setCandidateId] = useState('');
  const [relationType, setRelationType] = useState<HealthLinkRelation>('related_by_me');
  const [message, setMessage] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [fingerprint, setFingerprint] = useState<{ snapshot: string; signature: string }>({ snapshot: '', signature: '' });
  const [showEarlierBriefs, setShowEarlierBriefs] = useState(false);
  const [showFullBrief, setShowFullBrief] = useState(false);
  const [showOutdatedBrief, setShowOutdatedBrief] = useState(false);
  const [markerOpen, setMarkerOpen] = useState(false);
  const [markerLabel, setMarkerLabel] = useState('');
  const [markerUnit, setMarkerUnit] = useState('');
  const [markerValue, setMarkerValue] = useState('');
  const [markerDate, setMarkerDate] = useState(todayDateInput());
  const [markerError, setMarkerError] = useState('');
  const [markerNotice, setMarkerNotice] = useState('');
  const [markerChecking, setMarkerChecking] = useState(false);
  const [markerDiscrepancy, setMarkerDiscrepancy] = useState<ReturnType<typeof findHealthMarkerDiscrepancy> | null>(null);
  const [markerDismissed, setMarkerDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (active) setReducedMotion(enabled); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  const items = useMemo<RegistryItem[]>(() => {
    const topicIdsBySource = new Map<string, string[]>();
    for (const asset of assets) {
      const area = getHealthAreaContext(asset.healthAreaId ?? '');
      if (!area || !asset.serverSourceId) continue;
      const current = topicIdsBySource.get(asset.serverSourceId) ?? [];
      if (!current.includes(area.id)) topicIdsBySource.set(asset.serverSourceId, [...current, area.id]);
    }
    return [
    ...facts.map((fact) => {
      const version = getRegistryFactVersionBadge(fact, facts);
      return { id: `fact:${fact.id}`, kind: 'fact' as const, title: fact.label, detail: fact.value, date: fact.date, category: fact.category, source: fact.source, status: fact.reviewState === 'user_retracted' ? 'Retracted by you' : fact.reviewState === 'user_confirmed' ? 'Confirmed by you' : fact.status === 'reviewed' ? 'Reviewed' : 'Captured', versionLabel: version?.label, versionKind: version?.kind, versionRelatedId: version?.relatedFactId ?? undefined, versionLinkLabel: version?.kind === 'previous' ? 'OPEN CORRECTED ENTRY' : version?.kind === 'corrected' ? 'OPEN PREVIOUS VERSION' : undefined, revision: JSON.stringify([fact.value, fact.note ?? '', fact.source, fact.status, fact.reviewState ?? '', fact.validFrom ?? '', fact.validUntil ?? '', fact.sourceId ?? '', fact.sourceClaimId ?? '', fact.supersedesId ?? '']), sourceIdentity: fact.sourceId ?? fact.sourceClaimId ?? fact.source, areaTopicIds: topicIdsBySource.get(fact.sourceId ?? '') ?? [] };
    }),
    ...assets.map((asset) => { const area = getHealthAreaContext(asset.healthAreaId ?? ''); return { id: `asset:${asset.id}`, kind: 'asset' as const, title: documentDisplayName(asset, facts), detail: `${asset.kind.toUpperCase()} · source retained`, date: asset.addedAt, category: documentIsInsurance(asset) ? 'Insurance source' : area ? `Health record · ${area.label}` : 'Health record', source: asset.serverSourceId ? 'Source is linked to reviewed details' : 'Added by you · contents not analyzed', status: asset.possibleRepeat ? 'Possible duplicate · kept separate' : 'Original source', revision: JSON.stringify([asset.name, documentDisplayName(asset, facts), asset.kind, asset.size ?? '', asset.mimeType ?? '', asset.purpose ?? '', asset.healthAreaId ?? '', asset.serverSourceId ?? '', asset.possibleRepeat ?? false]), sourceIdentity: asset.serverSourceId ?? `${asset.name}|${asset.size ?? ''}|${asset.addedAt}`, areaTopicId: area?.id, areaTopicIds: area ? [area.id] : [] }; }),
    ...treatments.map((item) => ({ id: `treatment:${item.id}`, kind: 'treatment' as const, title: item.name, detail: [item.dose, item.schedule].filter(Boolean).join(' · ') || 'Dose and schedule not recorded', date: item.startedOn || item.createdAt, category: `Treatment · ${item.status}`, source: item.source, status: item.status === 'current' ? 'Current' : 'Past', revision: JSON.stringify([item.name, item.dose, item.schedule, item.purpose, item.prescriber, item.careLocation, item.pharmacy, item.status, item.startedOn, item.endedOn ?? '', item.updatedAt]), sourceIdentity: item.sourceId ?? item.source })),
    ...visits.map((item) => ({ id: `visit:${item.id}`, kind: 'visit' as const, title: item.purpose || 'Care visit', detail: [item.clinician, item.location].filter(Boolean).join(' · ') || 'Visit detail not recorded', date: item.appointmentAt || item.createdAt, category: 'Care visit', source: item.source, status: item.status === 'upcoming' ? 'Planned visit' : 'Visit record', revision: JSON.stringify([item.purpose, item.appointmentAt, item.clinician, item.location, item.status, item.outcome, item.followUp, item.updatedAt]), sourceIdentity: item.source })),
    ];
  }, [facts, assets, treatments, visits]);

  const selectedTopicId = topics.some((entry) => entry.id === topicId)
    ? topicId
    : topics.some((entry) => entry.id === initialTopicId) ? initialTopicId ?? '' : topics[0]?.id ?? '';
  const topic = topics.find((entry) => entry.id === selectedTopicId);
  const topicNodeId = topic ? `topic:${topic.id}` : '';
  const markerOptions = useMemo(() => getHealthMarkersForTopic(topic?.label ?? ''), [topic?.label]);
  const requestedMarker = markerOptions.find((item) => canonicalHealthMarker(item.label) === canonicalHealthMarker(initialMarkerLabel ?? ''));
  const markerAutoOpen = Boolean(ready && requestedMarker && !markerDismissed && !markerOpen);
  const markerVisible = markerOpen || markerAutoOpen;
  const markerFormLabel = markerAutoOpen ? requestedMarker?.label ?? markerLabel : markerLabel;
  const markerFormUnit = markerAutoOpen ? requestedMarker?.unit ?? markerUnit : markerUnit;
  const markerUnitOptions = useMemo(() => getHealthMarkerUnitOptions(markerFormLabel), [markerFormLabel]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const topicLinks = useMemo(() => links.filter((link) => link.from === topicNodeId || link.to === topicNodeId), [links, topicNodeId]);
  const connected = useMemo(() => {
    const explicitlyLinked = topicLinks.flatMap((link) => {
      const itemId = link.from === topicNodeId ? link.to : link.from;
      const item = itemById.get(itemId);
      return item ? [{ ...item, link }] : [];
    });
    const explicitlyLinkedIds = new Set(explicitlyLinked.map((item) => item.id));
    const filedByUser = items.filter((item) => item.areaTopicIds?.includes(selectedTopicId) && !explicitlyLinkedIds.has(item.id))
      .map((item) => ({ ...item, link: { id: `area-file:${item.id}`, from: topicNodeId, to: item.id, label: `Filed by you under ${topic?.label ?? 'this area'}`, relationType: 'related_by_me' as const, createdAt: item.date } }));
    return [...explicitlyLinked, ...filedByUser].sort((a, b) => (parseHealthDate(b.date)?.getTime() ?? 0) - (parseHealthDate(a.date)?.getTime() ?? 0));
  }, [items, itemById, selectedTopicId, topic, topicLinks, topicNodeId]);
  const connectedIds = useMemo(() => new Set([...topicLinks.map((link) => link.from === topicNodeId ? link.to : link.from), ...items.filter((item) => item.areaTopicIds?.includes(selectedTopicId)).map((item) => item.id)]), [items, selectedTopicId, topicLinks, topicNodeId]);
  const connectedDisplayGroups = useMemo(() => groupRegistryMarkerHistory(connected), [connected]);
  const sourceSnapshot = useMemo(() => registryEvidenceSnapshot(selectedTopicId, connected.map(({ id, kind, date, revision, status, sourceIdentity }) => ({ id, kind, date, revision, status, sourceIdentity })), topicLinks.map(({ id, relationType, label, createdAt }) => ({ id, relationType, label, createdAt }))), [selectedTopicId, connected, topicLinks]);
  useEffect(() => {
    let active = true;
    void Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, sourceSnapshot).then((signature) => { if (active) setFingerprint({ snapshot: sourceSnapshot, signature }); }).catch(() => { if (active) setFingerprint({ snapshot: sourceSnapshot, signature: '' }); });
    return () => { active = false; };
  }, [sourceSnapshot]);
  const sourceSignature = fingerprint.snapshot === sourceSnapshot ? fingerprint.signature : '';
  const topicBriefs = useMemo(() => registryBriefs.filter((brief) => brief.topicId === selectedTopicId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [registryBriefs, selectedTopicId]);
  const latestBrief = topicBriefs[0];
  const latestBriefDisplay = latestBrief ? registryBriefDisplayText(latestBrief.answer) : '';
  const briefDisplayModel = registryBriefDisplayModel(latestBrief, sourceSignature, connected);
  const briefIsCurrent = briefDisplayModel.mode === 'current';
  const availableItems = useMemo(() => items.filter((item) => !connectedIds.has(item.id)), [items, connectedIds]);
  const candidate = availableItems.find((item) => item.id === candidateId);
  const availableRelations = candidate ? relations.filter((item) => item.value === 'related_by_me' || (candidate.kind === 'treatment' && item.value === 'treatment_for')) : [];

  function selectTopic(id: string) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTopicId(id);
    setMessage('');
    setShowFullBrief(false);
    setShowOutdatedBrief(false);
    setShowEarlierBriefs(false);
    setMarkerNotice('');
  }
  function openMarkerEntry() {
    const first = markerOptions[0] ?? { label: 'Health marker', unit: '' };
    setMarkerDismissed(true);
    setMarkerLabel(first.label);
    setMarkerUnit(first.unit);
    setMarkerValue('');
    setMarkerDate(todayDateInput());
    setMarkerError('');
    setMarkerDiscrepancy(null);
    setMarkerOpen(true);
  }
  function activateMarkerForm() {
    if (markerAutoOpen && requestedMarker) {
      setMarkerLabel(requestedMarker.label);
      setMarkerUnit(requestedMarker.unit);
      setMarkerDate(todayDateInput());
    }
    setMarkerDismissed(true);
    setMarkerOpen(true);
  }
  function closeMarkerEntry() {
    setMarkerDismissed(true);
    setMarkerOpen(false);
    setMarkerDiscrepancy(null);
  }
  function selectMarker(label: string, unit: string) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMarkerDismissed(true);
    setMarkerOpen(true);
    setMarkerLabel(label);
    setMarkerUnit(unit);
    setMarkerError('');
  }
  async function persistManualMarker(replaces?: HealthFact) {
    if (!topic) return;
    const cleanLabel = markerFormLabel.trim();
    const cleanValue = markerValue.trim();
    const valueWithUnit = [cleanValue, markerFormUnit.trim()].filter(Boolean).join(' ');
    const now = new Date().toISOString();
    try {
      const metadata = {
        category: 'Manual health marker', source: 'Entered by you',
        note: replaces ? 'You selected this manual entry after comparing it with a different saved value. The earlier value and source remain in history.' : 'Entered by you and not extracted from a report.',
        validFrom: now, validUntil: null, eventDate: markerDate, confidence: 1, permissionScope: 'profile_write',
      };
      const fact = replaces
        ? await correctFact(replaces.id, cleanLabel, valueWithUnit, markerDate, { ...metadata, sourceId: null, sourceClaimId: null })
        : await saveApprovedMemoryFact(cleanLabel, valueWithUnit, metadata);
      if (!fact) throw new Error('The saved value changed before it could be updated. Reopen the registry and try again.');
      addLink(topicNodeId, `fact:${fact.id}`, `Entered by you under ${topic.label}`, 'related_by_me');
      if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
      setMarkerNotice(replaces ? `Your ${cleanLabel} value is now active. The earlier ${replaces.source} value remains in its history.` : `${cleanLabel} was added to your ${topic.label} registry.`);
      setMarkerOpen(false);
      setMarkerDismissed(true);
      setMarkerDiscrepancy(null);
      setMarkerError('');
      setMarkerValue('');
    } catch (error) {
      setMarkerError(error instanceof Error ? error.message : 'This marker could not be saved. Try again.');
    }
  }
  async function checkAndSaveMarker() {
    if (!topic || markerChecking) return;
    if (!markerFormLabel.trim() || !markerValue.trim() || !markerFormUnit.trim()) { setMarkerError('Add a marker name, value and unit before saving.'); return; }
    if (!isValidDateInput(markerDate)) { setMarkerError('Use a real measurement date in YYYY-MM-DD format.'); return; }
    setMarkerError('');
    setMarkerDiscrepancy(null);
    setMarkerChecking(true);
    setMarkerError(`Comparing ${markerFormLabel.trim()} with saved values…`);
    await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : 260));
    const discrepancy = findHealthMarkerDiscrepancy({ label: markerFormLabel, value: markerValue, unit: markerFormUnit, eventDate: markerDate, facts });
    setMarkerChecking(false);
    setMarkerError('');
    if (discrepancy) {
      if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
      setMarkerDiscrepancy(discrepancy);
      return;
    }
    await persistManualMarker();
  }
  function openConnect() {
    setCandidateId('');
    setRelationType('related_by_me');
    setMessage('');
    setConnectOpen(true);
  }
  function saveConnection() {
    if (!topic || !candidate) return;
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const relation = relations.find((item) => item.value === relationType) ?? relations[0];
    const saved = addLink(topicNodeId, candidate.id, relation.linkLabel, relation.value);
    if (!saved) {
      setMessage('These items are already connected. The saved record has not changed.');
      return;
    }
    setConnectOpen(false);
    setCandidateId('');
  }
  function openHistory(itemId?: string) {
    router.push({ pathname: '/(tabs)/health', params: itemId ? { focusId: itemId } : {} });
  }
  function askAboutTopic() {
    if (!topic) return;
    router.push({
      pathname: '/ask',
      params: {
        context: topic.label,
        recordId: topicNodeId,
        question: `What have I recorded about ${topic.label}? Show the dated records and their sources, and separate confirmed details from what is still unknown.`,
      },
    });
  }
  function createRegistryBrief() {
    if (!topic || !connected.length || !/^[a-f0-9]{64}$/i.test(sourceSignature)) return;
    router.push({ pathname: '/ask', params: {
      context: topic.label,
      recordId: topicNodeId,
      question: `Create a concise, source-only Medical Registry summary for ${topic.label}. Organize the dated records, state what is confirmed and what remains unknown, and cite every factual statement using the retrieved sources. Do not diagnose, infer causation, or give medical advice.`,
      registryBriefTopicId: topic.id,
      registryBriefTopicLabel: topic.label,
      registrySourceSignature: sourceSignature,
    } });
  }

  return <View style={s.page}><Atmosphere /><StatusBar style="light" />
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={firstRun ? 'Back to profile setup' : 'Back to health history'} onPress={() => firstRun ? router.back() : openHistory()} style={({ pressed }) => [s.backButton, pressed && s.pressed]}><Text style={s.backGlyph}>‹</Text><Text style={s.backText}>{firstRun ? 'Setup' : 'History'}</Text></Pressable>
        <View style={s.brand}><Text style={s.wordmark}>nura</Text><Text style={s.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View>
      </View>
      <Text style={s.eyebrow}>MEDICAL REGISTRY</Text>
      <Text style={s.title}>Your health wiki.</Text>
      <Text style={s.subtitle}>Each area gathers the records you connect, with dates and original sources kept close.</Text>

      {!ready && <View style={s.notice}><GlassMaterial tone="dark" radius={15} intensity={24} /><Text style={s.noticeTitle}>Opening your saved registry…</Text><Text style={s.body}>Your confirmed information will appear when the local profile has loaded.</Text></View>}
      {topics.length > 0 ? <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.topicRail}>
          {topics.map((entry) => <Pressable key={entry.id} accessibilityRole="button" accessibilityState={{ selected: topic?.id === entry.id }} onPress={() => selectTopic(entry.id)} style={({ pressed }) => [s.topicChip, topic?.id === entry.id && s.topicChipSelected, pressed && s.pressed]}><View style={[s.topicDot, topic?.id === entry.id && s.topicDotSelected]} /><Text style={[s.topicText, topic?.id === entry.id && s.topicTextSelected]}>{entry.label}</Text></Pressable>)}
        </ScrollView>
        {topic && <>
          <View style={s.topicHero}><GlassMaterial tone="dark" radius={23} intensity={28} />
            <View style={s.heroTop}><View style={s.heroIcon}><Text style={s.heroIconText}>✳</Text></View><View style={s.heroBadge}><View style={s.badgeDot} /><Text style={s.badgeText}>SELECTED BY YOU</Text></View></View>
            <Text style={s.topicTitle}>{topic.label}</Text>
            <Text style={s.topicCaveat}>A focus area you chose. This is not a diagnosis or an inferred medical condition.</Text>
            <View style={s.statsRow}><View style={s.stat}><Text style={s.statValue}>{connected.length}</Text><Text style={s.statLabel}>LINKED RECORDS</Text></View><View style={s.statRule} /><View style={s.stat}><Text style={s.statValue}>{new Set(connected.map((item) => item.source)).size}</Text><Text style={s.statLabel}>SOURCES</Text></View><View style={s.statRule} /><View style={s.stat}><Text style={s.statValue}>{topicLinks.length}</Text><Text style={s.statLabel}>YOUR LINKS</Text></View></View>
            <View style={s.heroActions}><Pressable accessibilityRole="button" onPress={askAboutTopic} style={({ pressed }) => [s.askButton, pressed && s.pressed]}><Text style={s.askButtonText}>Ask Nura about this history  ↗</Text></Pressable><Pressable accessibilityRole="button" onPress={openMarkerEntry} style={({ pressed }) => [s.markerButton, pressed && s.pressed]}><Text style={s.markerButtonText}>＋ Record a health marker</Text></Pressable><Pressable accessibilityRole="button" onPress={openConnect} style={({ pressed }) => [s.connectButton, pressed && s.pressed]}><Text style={s.connectButtonText}>＋ Connect a record</Text></Pressable></View>
            {markerNotice ? <View accessibilityLiveRegion="polite" aria-live="polite" style={s.markerNotice}><Text style={s.markerNoticeText}>{markerNotice}</Text></View> : null}
          </View>

          <View style={s.briefCard}><GlassMaterial tone="dark" radius={20} intensity={26} />
            <View style={s.briefTop}><View style={{ flex: 1 }}><Text style={s.briefKicker}>SOURCE-LINKED WIKI</Text><Text style={s.briefTitle}>Your {topic.label} summary</Text></View><View style={[s.briefStatus, latestBrief && briefIsCurrent ? s.briefFresh : latestBrief && briefDisplayModel.mode === 'checking' ? s.briefReady : latestBrief ? s.briefStale : connected.length ? s.briefReady : s.briefEmpty]}><Text style={[s.briefStatusText, latestBrief && briefIsCurrent ? s.briefFreshText : latestBrief && briefDisplayModel.mode === 'checking' ? s.briefReadyText : latestBrief ? s.briefStaleText : connected.length ? s.briefReadyText : s.briefEmptyText]}>{latestBrief ? (briefIsCurrent ? 'CURRENT' : briefDisplayModel.mode === 'checking' ? 'CHECKING EVIDENCE' : 'EVIDENCE CHANGED') : connected.length ? 'READY TO CREATE' : 'NEEDS RECORDS'}</Text></View></View>
            {latestBrief ? <>
              <Text style={s.briefDate}>Last summarized {readableDate(latestBrief.createdAt)} · {latestBrief.citations.length} cited source{latestBrief.citations.length === 1 ? '' : 's'}</Text>
              {briefIsCurrent ? <>
                <Text numberOfLines={showFullBrief ? undefined : 8} style={s.briefAnswer}>{latestBriefDisplay}</Text>
                {latestBriefDisplay.length > 360 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFullBrief }} onPress={() => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowFullBrief((value) => !value); }} style={s.summaryToggle}><Text style={s.earlierToggleText}>{showFullBrief ? 'SHOW LESS' : 'READ FULL SUMMARY'}</Text></Pressable>}
                {latestBrief.unknowns.length > 0 && <View style={s.briefUnknowns}><Text style={s.briefUnknownTitle}>STILL UNKNOWN</Text><Text style={s.briefUnknownText}>{latestBrief.unknowns.join(' · ')}</Text></View>}
                <Text style={s.briefSourcesTitle}>CITED SOURCES</Text>
                {latestBrief.citations.map((citation) => <Pressable key={`${latestBrief.id}:${citation.id}`} accessibilityRole="button" accessibilityLabel={`Open cited source ${citation.title} in health history`} onPress={() => openHistory(registryCitationTargetId(citation, connected) ?? undefined)} style={({ pressed }) => [s.briefCitation, pressed && s.pressed]}><Text style={s.briefCitationRef}>{citation.reference}</Text><View style={{ flex: 1 }}><Text style={s.briefCitationTitle}>{citation.title}</Text><Text style={s.briefCitationDetail}>{citation.source}{citation.date ? ` · ${citation.date}` : ''}</Text></View><Text style={s.briefArrow}>›</Text></Pressable>)}
              </> : <>
                <Text style={s.briefWarning}>{briefDisplayModel.mode === 'checking' ? 'Checking whether your linked records have changed. Showing the saved records while that check completes.' : 'This summary needs refreshing because a linked record or relationship changed. The current saved records are shown here.'}</Text>
                {briefDisplayModel.evidence.length ? <View style={s.currentEvidenceList}>
                  <Text style={s.currentEvidenceTitle}>CURRENT LINKED RECORDS</Text>
                  {briefDisplayModel.evidence.slice(0, 3).map((record) => <Pressable key={`fallback:${record.id}`} accessibilityRole="button" accessibilityLabel={`Open current ${record.title}, ${record.category}, dated ${record.date || 'date not recorded'}, source ${record.source}`} onPress={() => openHistory(record.id)} style={({ pressed }) => [s.currentEvidenceRow, pressed && s.pressed]}>
                    <View style={{ flex: 1 }}><Text style={s.currentEvidenceName}>{record.title}</Text><Text style={s.currentEvidenceDetail}>{record.detail}</Text><Text style={s.currentEvidenceMeta}>{record.category} · {readableDate(record.date)} · {record.status}</Text><Text style={s.currentEvidenceSource}>{record.source}</Text></View><Text style={s.briefArrow}>›</Text>
                  </Pressable>)}
                  {briefDisplayModel.evidence.length > 3 && <Pressable accessibilityRole="button" onPress={() => openHistory()} style={s.viewAllEvidence}><Text style={s.earlierToggleText}>VIEW ALL {briefDisplayModel.evidence.length} RECORDS IN TIMELINE ↗</Text></Pressable>}
                </View> : <Text style={s.briefIntro}>No records are currently linked to this topic. Review the history below or connect the evidence you want included.</Text>}
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: showOutdatedBrief }} onPress={() => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowOutdatedBrief((value) => !value); }} style={s.summaryToggle}><Text style={s.earlierToggleText}>{showOutdatedBrief ? 'HIDE SAVED SUMMARY' : 'VIEW SAVED SUMMARY · OUT OF DATE'}</Text></Pressable>
                {showOutdatedBrief && <View style={s.outdatedBrief}><Text style={s.outdatedBriefLabel}>OLDER SUMMARY · NOT REFRESHED</Text><Text style={s.earlierAnswer}>{latestBriefDisplay}</Text></View>}
              </>}
              {topicBriefs.length > 1 && <><Pressable accessibilityRole="button" accessibilityState={{ expanded: showEarlierBriefs }} onPress={() => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowEarlierBriefs((value) => !value); }} style={s.earlierToggle}><Text style={s.earlierToggleText}>{showEarlierBriefs ? 'Hide earlier summaries' : `Earlier summaries · ${topicBriefs.length - 1}`}</Text></Pressable>{showEarlierBriefs && topicBriefs.slice(1).map((brief) => <View key={brief.id} style={s.earlierBrief}><Text style={s.earlierDate}>{readableDate(brief.createdAt)} · {brief.citations.length} sources</Text><Text style={s.earlierAnswer}>{registryBriefDisplayText(brief.answer)}</Text></View>)}</>}
            </> : <Text style={s.briefIntro}>{connected.length ? `Nura can summarize only the ${connected.length} record${connected.length === 1 ? '' : 's'} you linked here. You review the cited result before it is saved.` : 'Connect a source record to this topic first. Nura will use only linked evidence and show its citations.'}</Text>}
            <Pressable accessibilityRole="button" disabled={!connected.length || !sourceSignature} onPress={createRegistryBrief} style={({ pressed }) => [s.briefAction, (!connected.length || !sourceSignature) && s.briefActionDisabled, pressed && connected.length > 0 && s.pressed]}><Text style={s.briefActionText}>{latestBrief ? (briefIsCurrent ? 'REBUILD FROM LINKED RECORDS' : 'REFRESH FROM CURRENT EVIDENCE') : 'CREATE WITH ASK NURA'}</Text></Pressable>
          </View>

          <View style={s.sectionHead}><View><Text style={s.sectionKicker}>SOURCE-LINKED HISTORY</Text><Text style={s.sectionTitle}>{connected.length ? `${connected.length} item${connected.length === 1 ? '' : 's'} connected` : 'Build this record'}</Text></View><Pressable accessibilityRole="button" onPress={() => openHistory()} style={s.openHistory}><Text style={s.openHistoryText}>FULL TIMELINE ↗</Text></Pressable></View>
          {connected.length ? <View style={s.recordList}>
            {connectedDisplayGroups.map((group, index) => {
              const item = group.records[0];
              const tint = relationTint(item.kind as RegistryItem['kind']);
              return <View key={group.id} style={s.recordRow}>
                <View style={s.axis}><View style={[s.axisLine, index === connectedDisplayGroups.length - 1 && s.axisLast]} /><View style={[s.nodeHalo, { backgroundColor: tint.pale }]}><View style={[s.node, { backgroundColor: tint.node }]}><Text style={s.nodeGlyph}>{item.kind === 'treatment' ? '＋' : item.kind === 'visit' ? '⌂' : item.kind === 'asset' ? '▤' : '✳'}</Text></View></View></View>
                <View testID={group.marker ? `registry-marker-history-${group.marker}` : undefined} style={s.recordCard}><GlassMaterial tone="dark" radius={18} intensity={24} />
                  <View style={s.recordMeta}><Text style={[s.kindLabel, { color: tint.ink }]}>{group.marker ? `${group.records.length} SAVED ${group.records.length === 1 ? 'READING' : 'READINGS'}` : item.category.toUpperCase()}</Text><Text style={s.recordDate}>{group.marker ? `${new Set(group.records.map((record) => record.date)).size} dates` : readableDate(item.date)}</Text></View>
                  <Text style={s.recordTitle}>{group.title}</Text>
                  {group.marker ? <>
                    <Text style={s.recordDetail}>One marker history · each value keeps its own date and source. No values are converted or combined.</Text>
                    {group.hasSameDayDifferences ? <Text style={s.markerHistoryReview}>More than one value is recorded on the same date. Check the original report to confirm whether one corrects another; both entries stay saved until verified.</Text> : null}
                    <View style={s.markerHistoryList}>{group.records.map((record) => {
                      const parsedValue = record.detail.trim().match(/^-?\d+(?:[.,]\d+)?\s*(.*)$/);
                      const unitNeedsReview = healthMarkerUnitNeedsReview(record.title, parsedValue?.[1] ?? '');
                      const valueNeedsReview = healthMarkerValueNeedsReview(record.title, record.detail);
                      const reviewLabel = unitNeedsReview ? 'UNIT TO CHECK' : valueNeedsReview ? 'VALUE TO CHECK' : '';
                      return <View key={record.id} style={s.markerHistoryRow}>
                        <View style={s.markerHistoryCopy}>
                          <Text style={s.markerHistoryValue}>{record.detail}</Text>
                          <Text style={s.markerHistoryMeta}>{readableDate(record.date)} · {record.source}</Text>
                          <Text style={s.markerHistoryMeta}>{record.status} · {record.link.label}</Text>
                          {reviewLabel ? <Text style={s.markerHistoryReviewLabel}>{reviewLabel} · CHECK THE ORIGINAL REPORT</Text> : null}
                          {record.versionLabel ? <Text style={s.markerHistoryMeta}>{record.versionLabel}</Text> : null}
                          {record.versionRelatedId && record.versionLinkLabel ? <Pressable accessibilityRole="button" accessibilityLabel={`${record.versionLinkLabel === 'OPEN CORRECTED ENTRY' ? 'Open corrected entry' : 'Open previous version'} of ${record.title}`} onPress={() => openHistory(`fact:${record.versionRelatedId}`)} style={{ alignSelf: 'flex-start', paddingVertical: 5, paddingRight: 8 }}><Text style={{ color: C.cobalt, fontSize: 7.5, fontWeight: '800', letterSpacing: .45 }}>{record.versionLinkLabel} ↗</Text></Pressable> : null}
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${group.title} reading ${record.detail}, dated ${readableDate(record.date)}, from ${record.source}`} onPress={() => openHistory(record.id)} style={({ pressed }) => [s.markerHistoryAction, pressed && s.pressed]}><Text style={s.markerHistoryActionText}>SOURCE ↗</Text></Pressable>
                      </View>;
                    })}</View>
                  </> : <>
                    <Text style={s.recordDetail}>{item.detail}</Text>
                    {item.versionLabel ? <View style={{ alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4, marginTop: 6, backgroundColor: item.versionKind === 'previous' || item.versionKind === 'ended' ? 'rgba(255,211,154,.13)' : item.versionKind === 'retracted' ? 'rgba(255,150,142,.14)' : 'rgba(188,232,208,.14)' }}><Text style={{ color: item.versionKind === 'previous' || item.versionKind === 'ended' ? C.amberInk : item.versionKind === 'retracted' ? '#FFC0B8' : C.mintInk, fontSize: 6.5, fontWeight: '800', letterSpacing: .65 }}>{item.versionLabel}</Text></View> : null}
                    {item.versionRelatedId && item.versionLinkLabel ? <Pressable accessibilityRole="button" accessibilityLabel={`${item.versionLinkLabel === 'OPEN CORRECTED ENTRY' ? 'Open corrected entry' : 'Open previous version'} of ${item.title}`} onPress={() => openHistory(`fact:${item.versionRelatedId}`)} style={{ alignSelf: 'flex-start', paddingVertical: 5, paddingRight: 8 }}><Text style={{ color: C.cobalt, fontSize: 7.5, fontWeight: '800', letterSpacing: .45 }}>{item.versionLinkLabel} ↗</Text></Pressable> : null}
                    <View style={s.recordSource}><Text style={s.sourceGlyph}>▤</Text><Text style={s.sourceText}>{item.source}</Text></View>
                    <View style={s.linkMeaning}><Text style={s.linkMeaningText}>{item.link.label}</Text></View>
                    <View style={s.recordFooter}><View style={[s.statusPill, item.status === 'Confirmed by you' ? s.statusConfirmed : null]}><Text style={[s.statusText, item.status === 'Confirmed by you' ? s.statusConfirmedText : null]}>{item.status}</Text></View><Pressable accessibilityRole="button" onPress={() => openHistory(item.id)} style={({ pressed }) => [s.sourceAction, pressed && s.pressed]}><Text style={s.sourceActionText}>Source + timeline ↗</Text></Pressable></View>
                  </>}
                </View>
              </View>;
            })}
          </View> : <View style={s.emptyCard}><GlassMaterial tone="dark" radius={20} intensity={26} /><View style={s.emptyNode}><Text style={s.emptyGlyph}>＋</Text></View><Text style={s.emptyTitle}>No records connected to {topic.label} yet</Text><Text style={s.emptyBody}>Your saved information stays in the timeline until you explicitly connect a record here. Nura will not guess that a record belongs to this area.</Text><Pressable accessibilityRole="button" onPress={openConnect} style={s.emptyPrimary}><Text style={s.emptyPrimaryText}>CONNECT AN EXISTING RECORD</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/intake')} style={s.emptySecondary}><Text style={s.emptySecondaryText}>Add a health record</Text></Pressable></View>}
          <View style={s.note}><Text style={s.noteMark}>i</Text><Text style={s.noteText}>Lines and labels record associations you made. They do not mean one event caused another.</Text></View>
        </>}
      </> : <View style={s.emptyCard}><GlassMaterial tone="dark" radius={20} intensity={26} /><View style={s.emptyNode}><Text style={s.emptyGlyph}>✳</Text></View><Text style={s.emptyTitle}>Choose a health area to start</Text><Text style={s.emptyBody}>Your registry organizes only the focus areas you select. Add one from profile setup, or place a health record in your timeline first.</Text><Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/profile')} style={s.emptyPrimary}><Text style={s.emptyPrimaryText}>OPEN YOUR PROFILE</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/intake')} style={s.emptySecondary}><Text style={s.emptySecondaryText}>Add a health record</Text></Pressable></View>}
    </ScrollView>

    <Modal visible={connectOpen} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setConnectOpen(false)}>
      <View style={s.modalShade}><View style={s.modalCard}><GlassMaterial tone="dark" radius={24} intensity={28} /><View style={s.modalHandle} /><View style={s.modalHead}><View style={{ flex: 1 }}><Text style={s.modalKicker}>MAKE AN EXPLICIT LINK</Text><Text style={s.modalTitle}>Connect to {topic?.label ?? 'this area'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close connect record sheet" onPress={() => setConnectOpen(false)} style={s.closeButton}><Text style={s.closeText}>×</Text></Pressable></View>
        <Text style={s.modalHelp}>Choose one saved item. Nura will preserve your label and date; it will not infer a medical cause.</Text>
        <ScrollView style={s.choiceList} keyboardShouldPersistTaps="handled">
          {availableItems.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: candidateId === item.id }} onPress={() => { setCandidateId(item.id); setMessage(''); if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); }} style={({ pressed }) => [s.choice, candidateId === item.id && s.choiceSelected, pressed && s.pressed]}><View style={[s.choiceNode, { backgroundColor: relationTint(item.kind).node }]}><Text style={s.choiceNodeGlyph}>{item.kind === 'treatment' ? '＋' : item.kind === 'visit' ? '⌂' : item.kind === 'asset' ? '▤' : '✳'}</Text></View><View style={{ flex: 1 }}><Text style={s.choiceTitle}>{item.title}</Text><Text style={s.choiceDetail}>{item.category} · {readableDate(item.date)}</Text><Text style={s.choiceSource}>{item.source}</Text></View><Text style={s.choiceCheck}>{candidateId === item.id ? '✓' : '›'}</Text></Pressable>)}
          {availableItems.length === 0 && <View style={s.noChoices}><Text style={s.choiceTitle}>No other saved records yet</Text><Text style={s.choiceDetail}>Add a record first, then return here to connect it.</Text><Pressable accessibilityRole="button" onPress={() => { setConnectOpen(false); router.push('/intake'); }}><Text style={s.emptySecondaryText}>Add a health record ↗</Text></Pressable></View>}
        </ScrollView>
        {candidate && <View style={s.relationBox}><Text style={s.modalKicker}>HOW DO YOU WANT TO LINK IT?</Text><View style={s.relationWrap}>{availableRelations.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: relationType === item.value }} onPress={() => setRelationType(item.value)} style={[s.relationChip, relationType === item.value && s.relationSelected]}><Text style={[s.relationText, relationType === item.value && s.relationTextSelected]}>{item.label}</Text></Pressable>)}</View><Text style={s.previewText}>Your link will read: “{(relations.find((item) => item.value === relationType) ?? relations[0]).linkLabel}.”</Text></View>}
        {message ? <Text style={s.modalError}>{message}</Text> : null}
        <Pressable accessibilityRole="button" disabled={!candidate} onPress={saveConnection} style={({ pressed }) => [s.modalSave, !candidate && s.disabled, pressed && candidate && s.pressed]}><Text style={s.modalSaveText}>SAVE THIS LINK</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setConnectOpen(false)} style={s.modalCancel}><Text style={s.modalCancelText}>Cancel</Text></Pressable>
      </View></View>
    </Modal>
    <Modal visible={markerVisible} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={closeMarkerEntry}>
      <View style={s.modalShade}><View style={s.modalCard}><GlassMaterial tone="dark" radius={24} intensity={28} /><View style={s.modalHandle} /><View style={s.modalHead}><View style={{ flex: 1 }}><Text style={s.modalKicker}>ADD A DATED VALUE</Text><Text style={s.modalTitle}>Record a {topic?.label ?? 'health'} marker</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close health marker form" onPress={closeMarkerEntry} style={s.closeButton}><Text style={s.closeText}>×</Text></Pressable></View>
        <Text style={s.modalHelp}>Enter a value from a measurement you took or a report you reviewed. Nura keeps its source as “Entered by you.”</Text>
        <ScrollView style={s.markerForm} keyboardShouldPersistTaps="handled">
          <Text style={s.markerFieldLabel}>CHOOSE A MARKER</Text>
          <View style={s.markerOptions}>{markerOptions.map((item) => <Pressable key={item.label} accessibilityRole="button" accessibilityState={{ selected: markerFormLabel === item.label }} onPress={() => selectMarker(item.label, item.unit)} style={[s.markerOption, markerFormLabel === item.label && s.markerOptionSelected]}><Text style={[s.markerOptionText, markerFormLabel === item.label && s.markerOptionTextSelected]}>{item.label}</Text></Pressable>)}</View>
          <Text style={s.markerFieldLabel}>MARKER NAME</Text>
          <TextInput value={markerFormLabel} onChangeText={(text) => { activateMarkerForm(); setMarkerLabel(text); const options = getHealthMarkerUnitOptions(text); setMarkerUnit(options.includes(markerUnit) ? markerUnit : options[0] ?? ''); }} placeholder="For example, LDL cholesterol" placeholderTextColor={C.faint} accessibilityLabel="Health marker name" style={s.markerInput} />
          <Text style={s.markerFieldLabel}>VALUE</Text>
          <TextInput value={markerValue} onChangeText={setMarkerValue} placeholder="For example, 104" placeholderTextColor={C.faint} keyboardType="decimal-pad" accessibilityLabel={`Value for ${markerFormLabel || 'health marker'}`} style={s.markerInput} />
          <Text style={s.markerFieldLabel}>UNIT ON YOUR REPORT</Text>
          {markerUnitOptions.length ? <View style={s.markerOptions}>{markerUnitOptions.map((unit) => <Pressable key={unit} accessibilityRole="button" accessibilityLabel={`Select ${unit} for ${markerFormLabel}`} accessibilityState={{ selected: markerFormUnit === unit }} onPress={() => { activateMarkerForm(); setMarkerUnit(unit); }} style={[s.markerOption, markerFormUnit === unit && s.markerOptionSelected]}><Text style={[s.markerOptionText, markerFormUnit === unit && s.markerOptionTextSelected]}>{unit}</Text></Pressable>)}</View> : <TextInput value={markerFormUnit} onChangeText={(text) => { activateMarkerForm(); setMarkerUnit(text); }} placeholder="Enter the unit as shown" placeholderTextColor={C.faint} accessibilityLabel={`Unit for ${markerFormLabel || 'health marker'}`} style={s.markerInput} />}
          <Text style={s.body}>Choose the unit printed on the report. Nura saves the value as entered.</Text>
          <Text style={s.markerFieldLabel}>MEASURED ON · YYYY-MM-DD</Text>
          <TextInput value={markerDate} onChangeText={setMarkerDate} placeholder="YYYY-MM-DD" placeholderTextColor={C.faint} keyboardType="numbers-and-punctuation" maxLength={10} accessibilityLabel="Health marker measurement date in year-month-day format" style={s.markerInput} />
          {markerChecking ? <View accessibilityLiveRegion="polite" aria-live="polite" style={s.markerChecking}><Text style={s.markerCheckingGlyph}>✦</Text><Text style={s.markerCheckingText}>{markerError}</Text></View> : null}
          {markerDiscrepancy ? <View style={s.markerConflict}>
            <TextReveal text="A saved record has a different value." reduceMotion={reducedMotion} style={s.markerConflictTitle} />
            <Text style={s.markerConflictBody}>Both entries are for {markerDiscrepancy.date}. Nura can’t tell which is right from the numbers alone. Check the report and choose the value to keep active.</Text>
            <View style={s.markerCompareRow}><View style={s.markerCompareCell}><Text style={s.markerCompareLabel}>YOU ENTERED</Text><Text style={s.markerCompareValue}>{[markerValue, markerFormUnit].filter(Boolean).join(' ')}</Text></View><View style={s.markerCompareCell}><Text style={s.markerCompareLabel}>SAVED · {markerDiscrepancy.fact.source.toUpperCase()}</Text><Text style={s.markerCompareValue}>{markerDiscrepancy.fact.value}</Text></View></View>
            <Pressable accessibilityRole="button" disabled={markerChecking} onPress={() => void persistManualMarker(markerDiscrepancy.fact)} style={s.markerResolvePrimary}><Text style={s.markerResolvePrimaryText}>USE MY VALUE · KEEP THE OLD ENTRY IN HISTORY</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setMarkerDismissed(true); setMarkerOpen(false); setMarkerDiscrepancy(null); setMarkerNotice(`Kept the saved ${markerDiscrepancy.fact.label} value. Your new entry was not saved.`); }} style={s.markerResolveSecondary}><Text style={s.markerResolveSecondaryText}>KEEP THE SAVED VALUE</Text></Pressable>
          </View> : null}
          {markerError && !markerChecking ? <Text accessibilityRole="alert" style={s.modalError}>{markerError}</Text> : null}
        </ScrollView>
        {!markerDiscrepancy ? <Pressable accessibilityRole="button" disabled={markerChecking} onPress={() => void checkAndSaveMarker()} style={({ pressed }) => [s.modalSave, markerChecking && s.disabled, pressed && !markerChecking && s.pressed]}><Text style={s.modalSaveText}>{markerChecking ? 'CHECKING YOUR RECORD…' : 'CHECK AND SAVE VALUE'}</Text></Pressable> : null}
        <Pressable accessibilityRole="button" onPress={closeMarkerEntry} style={s.modalCancel}><Text style={s.modalCancelText}>Cancel</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'transparent' }, content: { paddingHorizontal: 20, paddingTop: 43, paddingBottom: 32, maxWidth: 580, width: '100%', alignSelf: 'center' },
  topbar: { minHeight: 42, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 23 }, backButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, backGlyph: { color: C.plum, fontSize: 23, lineHeight: 25 }, backText: { color: C.muted, fontSize: 10, fontWeight: '600' }, brand: { alignItems: 'flex-end' }, wordmark: { color: C.plum, fontSize: 19, fontWeight: '700', letterSpacing: -.4 }, tagline: { color: C.faint, fontSize: 6.5, fontWeight: '700', letterSpacing: 1.35, marginTop: 2 },
  eyebrow: { color: C.lilacInk, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 }, title: { color: C.ink, fontSize: 31, lineHeight: 37, fontWeight: '400', letterSpacing: -1, marginTop: 6 }, subtitle: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, notice: { position: 'relative', overflow: 'hidden', backgroundColor: C.surface, borderRadius: 15, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 19 }, noticeTitle: { color: C.ink, fontSize: 12, fontWeight: '600' }, body: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  topicRail: { flexDirection: 'row', gap: 8, paddingTop: 20, paddingBottom: 13 }, topicChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, topicChipSelected: { backgroundColor: 'rgba(255,249,246,.14)', borderColor: C.border }, topicDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,249,246,.28)' }, topicDotSelected: { backgroundColor: C.plum }, topicText: { color: C.muted, fontSize: 10, fontWeight: '500' }, topicTextSelected: { color: C.plum, fontWeight: '700' },
  topicHero: { position: 'relative', overflow: 'hidden', backgroundColor: C.surface, borderRadius: 23, borderWidth: 1, borderColor: C.border, padding: 17, marginTop: 4, shadowColor: '#0C0908', shadowOpacity: .04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, heroIcon: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.lilac, borderWidth: 1, borderColor: C.border }, heroIconText: { color: C.lilacInk, fontSize: 20 }, heroBadge: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 15, backgroundColor: 'rgba(255,249,246,.10)', borderWidth: 1, borderColor: C.border }, badgeDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: C.lilacInk }, badgeText: { color: C.lilacInk, fontSize: 7, fontWeight: '800', letterSpacing: .8 }, topicTitle: { color: C.ink, fontSize: 25, fontWeight: '500', marginTop: 13 }, topicCaveat: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }, statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 17, paddingTop: 13, borderTopWidth: 1, borderTopColor: C.border }, stat: { flex: 1, alignItems: 'center', gap: 2 }, statValue: { color: C.ink, fontSize: 18, fontWeight: '500' }, statLabel: { color: C.faint, fontSize: 6.5, fontWeight: '800', letterSpacing: .7, textAlign: 'center' }, statRule: { width: 1, height: 29, backgroundColor: C.border }, heroActions: { gap: 8, marginTop: 15 }, askButton: { minHeight: 44, borderRadius: 15, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, askButtonText: { color: C.white, fontSize: 11, fontWeight: '700' }, markerButton: { minHeight: 42, borderRadius: 15, backgroundColor: C.mint, borderWidth: 1, borderColor: 'rgba(188,232,208,.38)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, markerButtonText: { color: C.mintInk, fontSize: 10, fontWeight: '700' }, connectButton: { minHeight: 42, borderRadius: 15, backgroundColor: C.bluePale, borderWidth: 1, borderColor: 'rgba(187,211,255,.38)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, connectButtonText: { color: C.cobalt, fontSize: 10, fontWeight: '700' }, markerNotice: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(188,232,208,.32)', backgroundColor: C.mint, padding: 10, marginTop: 9 }, markerNoticeText: { color: C.mintInk, fontSize: 9, lineHeight: 14 },
  briefCard: { position: 'relative', overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 15, marginTop: 13, shadowColor: '#0C0908', shadowOpacity: .035, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }, briefTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, briefKicker: { color: C.cobalt, fontSize: 7, fontWeight: '800', letterSpacing: 1.1 }, briefTitle: { color: C.ink, fontSize: 16, fontWeight: '600', marginTop: 4 }, briefStatus: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1 }, briefFresh: { backgroundColor: C.mint, borderColor: 'rgba(188,232,208,.34)' }, briefFreshText: { color: C.mintInk }, briefStale: { backgroundColor: C.amber, borderColor: 'rgba(255,211,154,.35)' }, briefStaleText: { color: C.amberInk }, briefReady: { backgroundColor: C.bluePale, borderColor: 'rgba(187,211,255,.35)' }, briefReadyText: { color: C.cobalt }, briefEmpty: { backgroundColor: 'rgba(255,249,246,.08)', borderColor: C.border }, briefEmptyText: { color: C.muted }, briefStatusText: { fontSize: 6.5, fontWeight: '800', letterSpacing: .5 }, briefDate: { color: C.faint, fontSize: 8, marginTop: 7 }, briefWarning: { color: C.amberInk, fontSize: 9, lineHeight: 14, backgroundColor: 'rgba(255,211,154,.11)', borderRadius: 10, padding: 9, marginTop: 9 }, briefAnswer: { color: C.ink, fontSize: 10, lineHeight: 16, marginTop: 10 }, summaryToggle: { minHeight: 34, justifyContent: 'center' }, briefUnknowns: { backgroundColor: 'rgba(255,211,154,.11)', borderRadius: 10, padding: 9, marginTop: 9 }, briefUnknownTitle: { color: C.amberInk, fontSize: 7, fontWeight: '800', letterSpacing: .75 }, briefUnknownText: { color: C.ink, fontSize: 9, lineHeight: 14, marginTop: 4 }, briefSourcesTitle: { color: C.lilacInk, fontSize: 7, fontWeight: '800', letterSpacing: .9, marginTop: 12, marginBottom: 2 }, briefCitation: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.bluePale, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginTop: 5 }, briefCitationRef: { width: 21, color: C.cobalt, fontSize: 8, fontWeight: '800' }, briefCitationTitle: { color: C.ink, fontSize: 9, fontWeight: '600' }, briefCitationDetail: { color: C.muted, fontSize: 7, marginTop: 2 }, briefArrow: { color: C.cobalt, fontSize: 17 }, briefIntro: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 9 }, earlierToggle: { minHeight: 34, justifyContent: 'center', marginTop: 3 }, earlierToggleText: { color: C.cobalt, fontSize: 8, fontWeight: '600' }, earlierBrief: { backgroundColor: 'rgba(255,249,246,.08)', borderRadius: 10, padding: 9, marginTop: 6 }, earlierDate: { color: C.faint, fontSize: 7 }, earlierAnswer: { color: C.muted, fontSize: 8, lineHeight: 13, marginTop: 4 }, briefAction: { minHeight: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 13, marginTop: 11, paddingHorizontal: 10 }, briefActionDisabled: { backgroundColor: 'rgba(255,249,246,.20)' }, briefActionText: { color: C.white, fontSize: 7.5, fontWeight: '800', letterSpacing: .6 },
  currentEvidenceList: { backgroundColor: 'rgba(255,249,246,.06)', borderRadius: 12, padding: 9, marginTop: 9 }, currentEvidenceTitle: { color: C.mintInk, fontSize: 7, fontWeight: '800', letterSpacing: .75, marginBottom: 4 }, currentEvidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingVertical: 8 }, currentEvidenceName: { color: C.ink, fontSize: 9, fontWeight: '700' }, currentEvidenceDetail: { color: C.ink, fontSize: 9, lineHeight: 13, marginTop: 2 }, currentEvidenceMeta: { color: C.muted, fontSize: 7, lineHeight: 11, marginTop: 3 }, currentEvidenceSource: { color: C.faint, fontSize: 7, lineHeight: 11, marginTop: 2 }, viewAllEvidence: { minHeight: 32, justifyContent: 'center' }, outdatedBrief: { backgroundColor: 'rgba(255,211,154,.08)', borderWidth: 1, borderColor: 'rgba(255,211,154,.2)', borderRadius: 10, padding: 9 }, outdatedBriefLabel: { color: C.amberInk, fontSize: 7, fontWeight: '800', letterSpacing: .75 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 23, marginBottom: 11 }, sectionKicker: { color: C.lilacInk, fontSize: 7.5, fontWeight: '800', letterSpacing: 1.25 }, sectionTitle: { color: C.ink, fontSize: 16, fontWeight: '500', marginTop: 4 }, openHistory: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, openHistoryText: { color: C.cobalt, fontSize: 7.5, fontWeight: '800', letterSpacing: .5 }, recordList: { gap: 0 }, markerHistoryList: { marginTop: 9 }, markerHistoryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,249,246,.14)', paddingTop: 9, paddingBottom: 8 }, markerHistoryCopy: { flex: 1 }, markerHistoryValue: { color: C.ink, fontSize: 13, lineHeight: 18, fontWeight: '700' }, markerHistoryMeta: { color: C.muted, fontSize: 8.5, lineHeight: 13, marginTop: 3 }, markerHistoryReview: { color: C.amberInk, fontSize: 9, lineHeight: 14, borderWidth: 1, borderColor: 'rgba(255,211,154,.30)', backgroundColor: 'rgba(232,174,112,.10)', borderRadius: 10, padding: 9, marginTop: 9 }, markerHistoryReviewLabel: { color: C.amberInk, fontSize: 7, fontWeight: '800', letterSpacing: .45, marginTop: 4 }, markerHistoryAction: { alignSelf: 'center', minHeight: 32, justifyContent: 'center', paddingHorizontal: 5 }, markerHistoryActionText: { color: C.cobalt, fontSize: 7, fontWeight: '800', letterSpacing: .35 },  recordRow: { flexDirection: 'row', alignItems: 'stretch', gap: 9 }, axis: { width: 37, alignItems: 'center', position: 'relative' }, axisLine: { position: 'absolute', top: 0, bottom: -4, width: 2, backgroundColor: C.blueLine }, axisLast: { bottom: '50%' }, nodeHalo: { width: 37, height: 37, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginTop: 10, zIndex: 1, borderWidth: 1, borderColor: 'rgba(255,249,246,.70)' }, node: { width: 28, height: 28, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.65)' }, nodeGlyph: { color: C.white, fontSize: 13, fontWeight: '600' }, recordCard: { position: 'relative', overflow: 'hidden', flex: 1, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 13, marginBottom: 11 }, recordMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, kindLabel: { flex: 1, fontSize: 7, fontWeight: '800', letterSpacing: .8 }, recordDate: { color: C.faint, fontSize: 8 }, recordTitle: { color: C.ink, fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 6 }, recordDetail: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, recordSource: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 9 }, sourceGlyph: { color: C.cobalt, fontSize: 10 }, sourceText: { color: C.muted, flex: 1, fontSize: 8.5, lineHeight: 13 }, linkMeaning: { backgroundColor: 'rgba(255,249,246,.08)', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginTop: 8 }, linkMeaningText: { color: C.lilacInk, fontSize: 8, lineHeight: 12 }, recordFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,249,246,.12)' }, statusPill: { maxWidth: '51%', borderRadius: 12, backgroundColor: 'rgba(255,249,246,.11)', paddingHorizontal: 8, paddingVertical: 5 }, statusText: { color: C.muted, fontSize: 7, fontWeight: '700' }, statusConfirmed: { backgroundColor: C.mint }, statusConfirmedText: { color: C.mintInk }, sourceAction: { paddingVertical: 5, paddingHorizontal: 7 }, sourceActionText: { color: C.cobalt, fontSize: 8, fontWeight: '700' }, pressed: { opacity: .86, transform: [{ scale: motion.pressScale }] },
  emptyCard: { position: 'relative', overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 19, alignItems: 'center', marginTop: 6 }, emptyNode: { width: 45, height: 45, borderRadius: 23, backgroundColor: C.bluePale, alignItems: 'center', justifyContent: 'center' }, emptyGlyph: { color: C.cobalt, fontSize: 22, fontWeight: '300' }, emptyTitle: { color: C.ink, fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'center', marginTop: 11 }, emptyBody: { color: C.muted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 6 }, emptyPrimary: { minHeight: 42, width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: C.primary, marginTop: 13, paddingHorizontal: 12 }, emptyPrimaryText: { color: C.white, fontSize: 8, fontWeight: '800', letterSpacing: .7 }, emptySecondary: { paddingVertical: 11, paddingHorizontal: 12 }, emptySecondaryText: { color: C.cobalt, fontSize: 10, fontWeight: '600' }, note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(255,249,246,.08)', borderRadius: 13, padding: 11, marginTop: 13 }, noteMark: { width: 17, height: 17, borderRadius: 9, textAlign: 'center', lineHeight: 17, color: C.lilacInk, backgroundColor: 'rgba(205,177,221,.20)', fontSize: 9, fontWeight: '700' }, noteText: { color: C.muted, flex: 1, fontSize: 8, lineHeight: 13 },
  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(28,23,34,.46)' }, modalCard: { position: 'relative', overflow: 'hidden', width: '100%', maxWidth: 480, maxHeight: '90%', alignSelf: 'center', backgroundColor: 'rgba(33,26,23,.92)', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24 }, modalHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,249,246,.32)', alignSelf: 'center', marginBottom: 15 }, modalHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, modalKicker: { color: C.lilacInk, fontSize: 7, fontWeight: '800', letterSpacing: 1.1 }, modalTitle: { color: C.ink, fontSize: 20, fontWeight: '500', marginTop: 4 }, closeButton: { width: 31, height: 31, borderRadius: 16, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }, closeText: { color: C.muted, fontSize: 22, lineHeight: 24 }, modalHelp: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 7, marginBottom: 8 }, choiceList: { maxHeight: 290 }, choice: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 10, marginTop: 6 }, choiceSelected: { borderColor: C.cobalt, backgroundColor: 'rgba(187,211,255,.18)' }, choiceNode: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, choiceNodeGlyph: { color: C.white, fontSize: 13 }, choiceTitle: { color: C.ink, fontSize: 10, fontWeight: '600' }, choiceDetail: { color: C.muted, fontSize: 8, marginTop: 3 }, choiceSource: { color: C.faint, fontSize: 7.5, marginTop: 3 }, choiceCheck: { width: 20, textAlign: 'center', color: C.cobalt, fontSize: 16 }, noChoices: { backgroundColor: C.surface, padding: 13, borderRadius: 14, marginTop: 7 }, relationBox: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 11, marginTop: 10 }, relationWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }, relationChip: { borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.canvas, paddingHorizontal: 9, paddingVertical: 7 }, relationSelected: { borderColor: 'rgba(187,211,255,.5)', backgroundColor: C.bluePale }, relationText: { color: C.muted, fontSize: 7.5 }, relationTextSelected: { color: C.cobalt, fontWeight: '700' }, previewText: { color: C.muted, fontSize: 8, lineHeight: 12, marginTop: 8 }, modalError: { color: '#FFD0C8', fontSize: 9, lineHeight: 14, marginTop: 8 }, modalSave: { minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: C.primary, marginTop: 12 }, modalSaveText: { color: C.white, fontSize: 8, fontWeight: '800', letterSpacing: .75 }, disabled: { opacity: .38 }, modalCancel: { minHeight: 38, alignItems: 'center', justifyContent: 'center' }, modalCancelText: { color: C.muted, fontSize: 10 }, markerForm: { maxHeight: 430 }, markerFieldLabel: { color: C.lilacInk, fontSize: 7, fontWeight: '800', letterSpacing: .8, marginTop: 10, marginBottom: 6 }, markerOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, markerOption: { borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: 'rgba(255,249,246,.07)', paddingHorizontal: 9, paddingVertical: 7 }, markerOptionSelected: { backgroundColor: C.mint, borderColor: 'rgba(188,232,208,.50)' }, markerOptionText: { color: C.muted, fontSize: 8 }, markerOptionTextSelected: { color: C.mintInk, fontWeight: '700' }, markerInput: { minHeight: 41, borderRadius: 12, borderWidth: 1, borderColor: C.border, color: C.ink, backgroundColor: 'rgba(255,249,246,.08)', paddingHorizontal: 11, fontSize: 10 }, markerInputRow: { flexDirection: 'row', gap: 8 }, markerChecking: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 11, backgroundColor: C.bluePale, padding: 10, marginTop: 9 }, markerCheckingGlyph: { color: C.cobalt, fontSize: 13 }, markerCheckingText: { color: C.cobalt, fontSize: 9 }, markerConflict: { borderWidth: 1, borderColor: 'rgba(255,211,154,.58)', borderRadius: 15, backgroundColor: 'rgba(232,174,112,.13)', padding: 12, marginTop: 10 }, markerConflictTitle: { color: C.amberInk, fontSize: 12, fontWeight: '700' }, markerConflictBody: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 5 }, markerCompareRow: { gap: 6, marginTop: 9 }, markerCompareCell: { borderRadius: 10, backgroundColor: 'rgba(255,249,246,.07)', padding: 8 }, markerCompareLabel: { color: C.lilacInk, fontSize: 6.5, fontWeight: '800', letterSpacing: .7 }, markerCompareValue: { color: C.ink, fontSize: 11, fontWeight: '600', marginTop: 3 }, markerResolvePrimary: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: C.primary, paddingHorizontal: 9, marginTop: 9 }, markerResolvePrimaryText: { color: C.white, fontSize: 7, fontWeight: '800', letterSpacing: .3, textAlign: 'center' }, markerResolveSecondary: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.border, marginTop: 6 }, markerResolveSecondaryText: { color: C.muted, fontSize: 8, fontWeight: '700' },
});
