import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Animated, Easing, Image, LayoutAnimation, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { parseHealthDate } from '../utils/healthDate';
import { colors, motion, timelineColors } from '../theme';
import type { HealthFact, HealthLink, HealthLinkRelation, HealthTopic, HealthVisit, IntakeAsset, TreatmentRecord } from '../state/NuraContext';
import { getSourceClaims, sourceMatchesAsset, type CandidateClaim, type LocalSource } from '../services/intakeClient';
import { findMisdatedAcceptedClaims } from '../services/sourceClaimReconciliation.mjs';
import { DocumentContextCard } from './DocumentContextCard';
import { Orb } from './Orb';

type Entry = { id: string; nodeId: string; kind: 'fact' | 'asset' | 'treatment' | 'visit'; title: string; detail: string; date: string; timestamp: number; source: string; category: string; note?: string; repeat?: boolean; supersedesId?: string; validUntil?: string | null; sourceId?: string; sourceClaimId?: string };
type ProfileDomainId = 'biometrics' | 'medical-history' | 'records' | 'treatment' | 'lifestyle' | 'care-insurance';
type ProfileDomainDefinition = { id: ProfileDomainId; label: string; glyph: string; actionLabel: string; route: '/profile' | '/registry' | '/intake' | '/treatment' | '/insurance' };
type ProfileDomainState = ProfileDomainDefinition & { entries: Entry[]; topics: HealthTopic[] };
type Choice = { id: string; title: string; detail: string };
type SourceDetail = { requestId: string; asset: IntakeAsset | null; sourceId: string | null; claimId: string | null; source: LocalSource | null; claims: CandidateClaim[]; loading: boolean; error: string | null };
function SheetLayer({ visible, reducedMotion, onClose, children }: { visible: boolean; reducedMotion: boolean; onClose: () => void; children: React.ReactNode }) {
  if (Platform.OS === 'web') return visible ? <View style={s.webModalShade}>{children}</View> : null;
  return <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose}><View style={s.modalShade}>{children}</View></Modal>;
}
type Props = { name: string; ready: boolean; storageError: string | null; facts: HealthFact[]; assets: IntakeAsset[]; treatments: TreatmentRecord[]; visits: HealthVisit[]; topics: HealthTopic[]; links: HealthLink[]; addLink: (from: string, to: string, label: string, relationType?: HealthLinkRelation) => HealthLink | null; removeLink: (id: string) => void; correctFact: (id: string, label: string, value: string) => Promise<HealthFact | null>; reconcileSourceFactDate: (factId: string, sourceId: string, sourceClaimId: string, effectiveAt: string) => boolean; attachSourceToAsset: (assetId: string, sourceId: string | null) => void; initialFocusId?: string; initialFilter?: HealthHistoryFilter };
const C = { canvas: colors.bg, white: colors.surface, ink: colors.ink, muted: colors.muted, faint: colors.quiet, border: colors.border, cobalt: colors.aqua, cobaltDeep: '#1557B7', blueLine: '#B6A6BE', bluePale: '#EAE3EF', plum: colors.plum, lilac: colors.lilac, lilacInk: colors.violet, mint: colors.mint, peach: colors.peach, track: '#E7DDE9' };
const domains: ProfileDomainDefinition[] = [
  { id: 'biometrics', label: 'Biometrics', glyph: '↕', actionLabel: 'ADD BIOMETRICS', route: '/profile' },
  { id: 'medical-history', label: 'Medical history', glyph: '✳', actionLabel: 'OPEN MEDICAL REGISTRY', route: '/registry' },
  { id: 'records', label: 'Records', glyph: '▤', actionLabel: 'ADD A RECORD', route: '/intake' },
  { id: 'treatment', label: 'Treatment', glyph: '✚', actionLabel: 'OPEN TREATMENT', route: '/treatment' },
  { id: 'lifestyle', label: 'Lifestyle', glyph: '☾', actionLabel: 'ADD A HEALTH RECORD', route: '/intake' },
  { id: 'care-insurance', label: 'Care + insurance', glyph: '⌂', actionLabel: 'REVIEW INSURANCE', route: '/insurance' },
];
export const HEALTH_HISTORY_FILTERS = ['Everything', 'Documents', 'Care', 'Treatment', 'Vitals', 'History', 'Lifestyle'] as const;
export type HealthHistoryFilter = typeof HEALTH_HISTORY_FILTERS[number];
const timelineFilters = HEALTH_HISTORY_FILTERS;
const relationOptions: { id: HealthLinkRelation; label: string }[] = [
  { id: 'same_source', label: 'Same source' },
  { id: 'happened_around', label: 'Around the same time' },
  { id: 'measured_during', label: 'Measured at this visit' },
  { id: 'treatment_for', label: 'Treatment for this' },
  { id: 'related_by_me', label: 'Related in my words' },
  { id: 'user_note', label: 'Other note' },
];
function relationLabel(value: HealthLinkRelation) { return relationOptions.find((item) => item.id === value)?.label ?? 'Other note'; }
type TimelineFilter = typeof timelineFilters[number];
type NodePalette = { node: string; pale: string; line: string; accent: string };
const NODE_COLORS = timelineColors satisfies Record<'record' | 'care' | 'treatment' | 'vitals' | 'life' | 'topic', NodePalette>;
const PROFILE_PALETTES: Record<ProfileDomainId, NodePalette> = {
  biometrics: NODE_COLORS.vitals,
  'medical-history': NODE_COLORS.topic,
  records: NODE_COLORS.record,
  treatment: NODE_COLORS.treatment,
  lifestyle: NODE_COLORS.life,
  'care-insurance': NODE_COLORS.care,
};
const topicPatterns: Record<Exclude<ProfileDomainId, 'records' | 'medical-history'>, RegExp> = {
  biometrics: /blood pressure|cholesterol|blood sugar|glucose|lipid|triglyceride|hdl|ldl|weight|height|heart rate|biometric|lab result/i,
  treatment: /medicine|medication|prescription|treatment|dose/i,
  lifestyle: /sleep|lifestyle|routine|wellbeing|stress|activity|exercise|nutrition|diet/i,
  'care-insurance': /care|doctor|clinic|visit|appointment|insurance|coverage|provider|hospital/i,
};
function topicMatchesDomain(label: string, domainId: ProfileDomainId) {
  if (domainId === 'records') return false;
  if (domainId === 'medical-history') return !Object.values(topicPatterns).some((pattern) => pattern.test(label));
  return topicPatterns[domainId].test(label);
}
function entryPalette(entry: Entry): NodePalette {
  if (entry.kind === 'asset') return NODE_COLORS.record;
  if (entry.kind === 'visit') return NODE_COLORS.care;
  if (entry.kind === 'treatment') return NODE_COLORS.treatment;
  const category = `${entry.kind} ${entry.category} ${entry.title}`.toLowerCase();
  if (/care|visit|clinic|doctor|appointment/.test(category)) return NODE_COLORS.care;
  if (/treatment|medicine|medication|prescription/.test(category)) return NODE_COLORS.treatment;
  if (/vital|biometric|measurement|blood pressure|blood sugar|cholesterol|weight|height|lab|result|lipid|triglyceride|glucose|\bhdl\b|\bldl\b/.test(category)) return NODE_COLORS.vitals;
  if (/life|wellbeing|routine|sleep/.test(category)) return NODE_COLORS.life;
  return NODE_COLORS.record;
}
function connectionPalette(id: string, entries: Entry[], topics: HealthTopic[]): NodePalette {
  const entry = entries.find((item) => item.nodeId === id);
  if (entry) return entryPalette(entry);
  const topic = topics.find((item) => `topic:${item.id}` === id)?.label.toLowerCase() ?? '';
  if (/medicine|treatment/.test(topic)) return NODE_COLORS.treatment;
  if (/family|care/.test(topic)) return NODE_COLORS.care;
  if (/sleep|routine|lifestyle/.test(topic)) return NODE_COLORS.life;
  if (/blood|cholesterol|heart|joint/.test(topic)) return NODE_COLORS.vitals;
  return NODE_COLORS.topic;
}
function connectionGlyph(id: string, entries: Entry[], topics: HealthTopic[]) {
  const entry = entries.find((item) => item.nodeId === id);
  if (entry?.kind === 'asset') return assetGlyph(assetsKindForEntry(entry));
  if (entry?.kind === 'treatment') return '✚';
  if (entry?.kind === 'visit') return '⌂';
  if (entry) return '✳';
  const topic = topics.find((item) => `topic:${item.id}` === id)?.label.toLowerCase() ?? '';
  if (/sleep/.test(topic)) return '☾';
  if (/medicine|treatment/.test(topic)) return '✚';
  if (/family|care/.test(topic)) return '⌂';
  return '✳';
}
function assetsKindForEntry(entry: Entry): IntakeAsset['kind'] {
  const category = entry.category.toLowerCase();
  if (category.includes('image')) return 'image';
  if (category.includes('video')) return 'video';
  return 'pdf';
}
function connectionMeta(id: string, entries: Entry[]) {
  const entry = entries.find((item) => item.nodeId === id);
  return entry ? `${entry.category.toUpperCase()} · ${entry.date.toUpperCase()}` : 'CHOSEN HEALTH AREA · SELECTED BY YOU';
}
function dateTime(value: string) { return parseHealthDate(value)?.getTime() ?? 0; }
function readableDate(value: string) { const parsed = parseHealthDate(value); return parsed ? parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : value; }
function dateParts(value: string) { const parsed = parseHealthDate(value); if (!parsed) return { day: '—', month: 'DATE' }; return { day: String(parsed.getDate()).padStart(2, '0'), month: parsed.toLocaleDateString(undefined, { month: 'short' }).toUpperCase() }; }
function assetGlyph(kind: IntakeAsset['kind']) { return kind === 'pdf' ? '▤' : kind === 'image' ? '▧' : kind === 'video' ? '▶' : '▤'; }
function nodeTitle(id: string, entries: Entry[], topics: HealthTopic[]) { if (id.startsWith('fact:')) return entries.find((item) => item.nodeId === id)?.title ?? 'Health detail'; if (id.startsWith('asset:')) return entries.find((item) => item.nodeId === id)?.title ?? 'Saved file'; if (id.startsWith('treatment:')) return entries.find((item) => item.nodeId === id)?.title ?? 'Treatment record'; if (id.startsWith('visit:')) return entries.find((item) => item.nodeId === id)?.title ?? 'Care visit'; if (id.startsWith('topic:')) return topics.find((item) => `topic:${item.id}` === id)?.label ?? 'Chosen health area'; return 'Saved item'; }
export function HealthHistory({ name, ready, storageError, facts, assets, treatments, visits, topics, links, addLink, removeLink, correctFact, reconcileSourceFactDate, attachSourceToAsset, initialFocusId, initialFilter }: Props) {
  const [view, setView] = useState<'timeline' | 'connections' | 'map'>('timeline');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState(''); const [editValue, setEditValue] = useState('');
  const [savingFactCorrection, setSavingFactCorrection] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filter, setFilter] = useState<TimelineFilter>(initialFilter ?? 'Everything');
  const [modal, setModal] = useState(false);
  const [step, setStep] = useState<'first' | 'second' | 'details'>('first');
  const [first, setFirst] = useState(''); const [second, setSecond] = useState(''); const [label, setLabel] = useState('');
  const [relationType, setRelationType] = useState<HealthLinkRelation>('related_by_me');
  const [sourceDetail, setSourceDetail] = useState<SourceDetail | null>(null);
  const [removingLink, setRemovingLink] = useState<HealthLink | null>(null);
  const [transition] = useState(() => new Animated.Value(1));
  const [routeMotion] = useState(() => new Animated.Value(0));
  const nodeScales = useRef(new Map<string, Animated.Value>());
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    for (const [nodeId, scale] of nodeScales.current) {
      const target = nodeId === selectedNode ? 1.08 : 1;
      if (reducedMotion) scale.setValue(target);
      else Animated.timing(scale, { toValue: target, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }).start();
    }
  }, [selectedNode, reducedMotion]);
  function nodeScaleFor(nodeId: string) {
    let scale = nodeScales.current.get(nodeId);
    if (!scale) { scale = new Animated.Value(1); nodeScales.current.set(nodeId, scale); }
    return scale;
  }
  function changeView(next: 'timeline' | 'connections' | 'map') {
    if (next === view) return;
    if (reducedMotion) transition.setValue(1);
    else {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      transition.setValue(0.72);
      Animated.timing(transition, { toValue: 1, duration: motion.standard, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }).start();
    }
    if (next === 'connections') {
      routeMotion.setValue(reducedMotion ? 1 : 0);
      if (!reducedMotion) Animated.timing(routeMotion, { toValue: 1, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }).start();
    }
    setView(next);
  }
  const entries = useMemo<Entry[]>(() => [
    ...facts.map((fact) => ({ id: `fact:${fact.id}`, nodeId: `fact:${fact.id}`, kind: 'fact' as const, title: fact.label, detail: fact.value, date: readableDate(fact.date), timestamp: dateTime(fact.date), source: fact.source, category: fact.category, note: fact.note, supersedesId: fact.supersedesId, validUntil: fact.validUntil, sourceId: fact.sourceId, sourceClaimId: fact.sourceClaimId })),
    ...assets.map((asset) => ({ id: `asset:${asset.id}`, nodeId: `asset:${asset.id}`, kind: 'asset' as const, title: asset.name, detail: `${asset.kind.toUpperCase()} · saved privately`, date: readableDate(asset.addedAt), timestamp: dateTime(asset.addedAt), source: 'Added by you', category: asset.kind.toUpperCase(), note: asset.possibleRepeat ? 'This looks similar to another file you added. It has not been removed or merged.' : undefined, repeat: asset.possibleRepeat })),
    ...treatments.map((item) => ({ id: `treatment:${item.id}`, nodeId: `treatment:${item.id}`, kind: 'treatment' as const, title: item.name, detail: [item.dose, item.schedule].filter(Boolean).join(' · ') || 'Dose and schedule not provided', date: item.startedOn ? readableDate(item.startedOn) : readableDate(item.createdAt), timestamp: dateTime(item.startedOn || item.createdAt), source: item.source, category: 'Treatment', note: `${item.status === 'current' ? 'Current record' : `Past record${item.endedOn ? ` · marked ${readableDate(item.endedOn)}` : ''}`} · ${item.purpose || 'Purpose not provided'}` })),
    ...visits.map((item) => ({ id: `visit:${item.id}`, nodeId: `visit:${item.id}`, kind: 'visit' as const, title: item.purpose || 'Care visit', detail: [item.clinician, item.location].filter(Boolean).join(' · ') || (item.status === 'upcoming' ? 'Visit planned' : 'Visit captured'), date: item.appointmentAt ? readableDate(item.appointmentAt) : 'Unscheduled', timestamp: dateTime(item.appointmentAt || item.createdAt), source: item.source, category: 'Care visit', note: item.outcome || item.followUp || (item.status === 'upcoming' ? `${item.questions.length} questions saved · ${item.briefFactIds.length + item.briefAssetIds.length + item.briefTreatmentIds.length} records selected for the brief` : 'Outcome not added yet') })),
  ].sort((a, b) => b.timestamp - a.timestamp), [facts, assets, treatments, visits]);
  const profileDomains = useMemo<ProfileDomainState[]>(() => {
    const currentFacts = entries.filter((entry) => entry.kind === 'fact' && !entry.validUntil);
    const biometrics = currentFacts.filter((entry) => topicPatterns.biometrics.test(entry.category + ' ' + entry.title));
    const lifestyle = currentFacts.filter((entry) => topicPatterns.lifestyle.test(entry.category + ' ' + entry.title));
    const treatmentsForProfile = entries.filter((entry) => entry.kind === 'treatment' || entry.kind === 'fact' && topicPatterns.treatment.test(entry.category + ' ' + entry.title));
    const insuranceAssetIds = new Set(assets.filter((asset) => asset.purpose === 'insurance').map((asset) => 'asset:' + asset.id));
    const careAndInsurance = entries.filter((entry) => entry.kind === 'visit' || entry.kind === 'asset' && insuranceAssetIds.has(entry.nodeId) || entry.kind === 'fact' && topicPatterns['care-insurance'].test(entry.category + ' ' + entry.title));
    return domains.map((domain): ProfileDomainState => {
      let domainEntries: Entry[];
      if (domain.id === 'biometrics') domainEntries = biometrics;
      else if (domain.id === 'medical-history') domainEntries = currentFacts.filter((entry) => !biometrics.includes(entry) && !lifestyle.includes(entry) && !topicPatterns.treatment.test(entry.category + ' ' + entry.title) && !topicPatterns['care-insurance'].test(entry.category + ' ' + entry.title));
      else if (domain.id === 'records') domainEntries = entries.filter((entry) => entry.kind === 'asset');
      else if (domain.id === 'treatment') domainEntries = treatmentsForProfile;
      else if (domain.id === 'lifestyle') domainEntries = lifestyle;
      else domainEntries = careAndInsurance;
      return { ...domain, entries: domainEntries, topics: topics.filter((topic) => topicMatchesDomain(topic.label, domain.id)) };
    });
  }, [assets, entries, topics]);
  useEffect(() => {
    if (!initialFilter) return;
    setFilter(initialFilter);
    setExpanded(null);
  }, [initialFilter]);
  useEffect(() => {
    if (!initialFocusId || !ready) return;
    const entry = entries.find((item) => item.nodeId === initialFocusId);
    if (!entry) return;
    setView('timeline');
    setSelectedNode(initialFocusId);
    setExpanded(initialFocusId);
  }, [initialFocusId, ready, entries]);
  const filterOrder = useMemo<HealthHistoryFilter[]>(() => {
    if (!initialFilter || initialFilter === 'Everything') return [...timelineFilters];
    return ['Everything', initialFilter, ...timelineFilters.filter((item) => item !== 'Everything' && item !== initialFilter)];
  }, [initialFilter]);
  const visibleEntries = useMemo(() => entries.filter((entry) => {
    if (filter === 'Documents') return entry.kind === 'asset';
    if (filter === 'Care') return /care|visit|clinic|doctor|appointment/i.test(`${entry.category} ${entry.title}`);
    if (filter === 'Treatment') return /treatment|medicine|medication|prescription/i.test(`${entry.category} ${entry.title}`);
    if (filter === 'Vitals') return /vital|biometric|blood pressure|lab|result|measurement/i.test(`${entry.category} ${entry.title}`);
    if (filter === 'History') return /condition|history|family|symptom|diagnos/i.test(`${entry.category} ${entry.title}`);
    if (filter === 'Lifestyle') return /lifestyle|sleep|activity|routine|wellbeing|diet/i.test(`${entry.category} ${entry.title}`);
    return true;
  }), [entries, filter]);
  const choices = useMemo<Choice[]>(() => [
    ...entries.map((item) => ({ id: item.nodeId, title: item.title, detail: `${item.category} · ${item.date}` })),
    ...topics.map((topic) => ({ id: `topic:${topic.id}`, title: topic.label, detail: 'Chosen health area' })),
  ], [entries, topics]);
  const captured = entries.length;
  const firstChoice = choices.find((item) => item.id === first); const secondChoice = choices.find((item) => item.id === second);
  function openLinkFlow() { setFirst(''); setSecond(''); setLabel(''); setRelationType('related_by_me'); setStep('first'); setModal(true); }
  function chooseItem(id: string) { if (step === 'first') { setFirst(id); setStep('second'); } else if (step === 'second' && id !== first) { setSecond(id); setStep('details'); } }
  function chooseRelation(value: HealthLinkRelation) { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setRelationType(value); }
  function saveLink() { if (!first || !second) return; const result = addLink(first, second, label.trim() || 'Connected by you', relationType); if (!result) return; setModal(false); changeView('connections'); }
  function toggleDetails(id: string) { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedNode(id); setExpanded((current) => current === id ? null : id); }
  function focusLinkedItem(id: string) { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setView('timeline'); setSelectedNode(id); setExpanded(id.startsWith('topic:') ? null : id); }
  function askAbout(entry: Entry) { router.push({ pathname: '/ask', params: { context: entry.title, recordId: entry.nodeId } }); }
  async function openSource(entry: Entry) {
    const fact = entry.kind === 'fact' ? facts.find((item) => `fact:${item.id}` === entry.nodeId) : undefined;
    const treatment = entry.kind === 'treatment' ? treatments.find((item) => `treatment:${item.id}` === entry.nodeId) : undefined;
    const asset = entry.kind === 'asset'
      ? assets.find((item) => `asset:${item.id}` === entry.nodeId) ?? null
      : assets.find((item) => (Boolean(fact?.sourceId) && item.serverSourceId === fact?.sourceId) || (Boolean(treatment?.sourceId) && (item.id === treatment?.sourceId || item.serverSourceId === treatment?.sourceId))) ?? null;
    const sourceId = asset?.serverSourceId ?? fact?.sourceId ?? null;
    const requestId = `${sourceId ?? asset?.id ?? entry.id}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    setSourceDetail({ requestId, asset, sourceId, claimId: fact?.sourceClaimId ?? null, source: null, claims: [], loading: Boolean(sourceId), error: null });
    if (!sourceId) return;
    try {
      const result = await getSourceClaims(sourceId);
      if (asset && !(await sourceMatchesAsset(asset, result.source))) {
        attachSourceToAsset(asset.id, null);
        setSourceDetail((current) => current?.requestId === requestId ? { ...current, sourceId: null, source: null, claims: [], loading: false, error: 'These extracted details did not match this file, so Nura hid them and removed the source link. Review the file again to create a correct match.' } : current);
        return;
      }
      if (asset) {
        for (const item of findMisdatedAcceptedClaims(result.claims, facts, result.source.id)) {
          reconcileSourceFactDate(item.factId, result.source.id, item.claim.id, item.effectiveAt);
        }
      }
      setSourceDetail((current) => current?.requestId === requestId ? { ...current, source: result.source, claims: result.claims, loading: false } : current);
    } catch (error) {
      setSourceDetail((current) => current?.requestId === requestId ? { ...current, loading: false, error: error instanceof Error ? error.message : 'Source details could not be opened.' } : current);
    }
  }
  async function openOriginal(asset: IntakeAsset | null) {
    if (!asset?.uri || asset.uri.startsWith('demo://')) {
      Alert.alert('Original file is not available', 'This sample record has no local original attached.');
      return;
    }
    try { await Linking.openURL(asset.uri); }
    catch { Alert.alert('Could not open the original', 'The file is still saved in your registry, but this device could not open it in another viewer.'); }
  }
  function reviewSource(detail: SourceDetail, claimId?: string) {
    if (!detail.sourceId) return;
    setSourceDetail(null);
    router.push({ pathname: '/review', params: { purpose: detail.asset?.purpose ?? 'medical', ...(detail.asset ? { assetId: detail.asset.id } : {}), sourceId: detail.sourceId, ...(claimId ? { claimId } : {}) } });
  }
  function reviewLocalAsset(detail: SourceDetail) {
    if (!detail.asset) return;
    setSourceDetail(null);
    router.push({ pathname: '/review', params: { purpose: detail.asset.purpose ?? 'medical', assetId: detail.asset.id } });
  }
  function reviewFactCorrection(entry: Entry) {
    if (entry.sourceClaimId && entry.sourceId) {
      const asset = assets.find((item) => item.serverSourceId === entry.sourceId);
      const purpose = asset?.purpose ?? (/insurance/i.test(entry.category) ? 'insurance' : 'medical');
      router.push({ pathname: '/review', params: { purpose, ...(asset ? { assetId: asset.id } : {}), sourceId: entry.sourceId, claimId: entry.sourceClaimId } });
      return;
    }
    setEditingFactId(entry.nodeId.slice('fact:'.length)); setEditLabel(entry.title); setEditValue(entry.detail);
  }
  async function saveFactCorrection() {
    if (!editingFactId || !editValue.trim() || savingFactCorrection) return;
    setSavingFactCorrection(true);
    try {
      const corrected = await correctFact(editingFactId, editLabel, editValue);
      if (!corrected) return;
      const nextId = `fact:${corrected.id}`;
      setEditingFactId(null); setSelectedNode(nextId); setExpanded(nextId);
    } catch {
      Alert.alert('Could not save this correction', 'The earlier value is still in your history. Please try again when private storage is available.');
    } finally { setSavingFactCorrection(false); }
  }
  function confirmRemove(link: HealthLink) { setRemovingLink(link); }
  function removeSelectedLink() { if (!removingLink) return; removeLink(removingLink.id); setRemovingLink(null); }

  return <View style={s.page}><ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View style={s.brandRow}><View><Text style={s.brand}>nura</Text><Text style={s.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View><View style={s.topActions}><Pressable accessibilityRole="button" accessibilityLabel="View health connections" style={s.topIcon} onPress={() => changeView('connections')}><Text style={s.topIconText}>↔</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="View 720 profile" style={s.topIcon} onPress={() => changeView('map')}><Text style={s.topIconText}>···</Text></Pressable></View></View>
    <Text style={s.eyebrow}>YOUR HEALTH JOURNEY</Text>
    <View style={s.heroRow}><View style={s.heroText}><Text style={s.title}>{view === 'map' ? 'Your 720 profile' : view === 'connections' ? 'Connections' : 'Timeline'}</Text><Text style={s.subtitle}>{view === 'map' ? 'A clear view of what is here and what can be added.' : view === 'connections' ? 'See the links you have made between saved information.' : 'A history of records and health details.'}</Text></View>{view === 'map' && <Pressable style={s.backPill} onPress={() => changeView('timeline')}><Text style={s.backText}>BACK</Text></Pressable>}</View>
    {view !== 'map' && <View style={s.segment}><Pressable onPress={() => changeView('timeline')} style={[s.segmentButton, view === 'timeline' && s.segmentSelected]}><Text style={[s.segmentText, view === 'timeline' && s.segmentTextSelected]}>Timeline</Text></Pressable><Pressable onPress={() => changeView('connections')} style={[s.segmentButton, view === 'connections' && s.segmentSelected]}><Text style={[s.segmentText, view === 'connections' && s.segmentTextSelected]}>Connections</Text></Pressable></View>}
    {storageError && <View style={s.warning}><Text style={s.warningText}>Private storage needs attention. This screen may not retain changes on this device.</Text></View>}
    <Animated.View style={{ opacity: transition, transform: [{ translateY: transition.interpolate({ inputRange: [0.72, 1], outputRange: [7, 0] }) }] }}>
    {view === 'timeline' && <>
      <View style={[s.profileCard, { backgroundColor: C.white, borderColor: C.border }]}><View style={s.profileCopy}><Text style={s.profileOverline}>YOUR HEALTH HISTORY</Text><Text style={s.profileTitle}>{captured ? `${captured} captured ${captured === 1 ? 'item' : 'items'}` : 'Your story starts here'}</Text><Text style={s.profileDetail}>{name.trim() ? `A growing record for ${name.trim()}.` : 'Records and details you add will appear here, with their source.'}</Text></View><Pressable style={s.profileOrb} onPress={() => changeView('map')}><View style={[s.orbRing, { backgroundColor: '#F7EDF1', borderColor: '#DFC9D5' }]}><Orb size={36} state="idle" /></View></Pressable></View>
      <View style={s.filterRow}><View><Text style={s.filterTitle}>RECORD HISTORY</Text><Text style={s.filterSub}>{captured ? `${visibleEntries.length} of ${captured} captured items · newest first` : 'Ready when you are'}</Text></View><Pressable accessibilityRole="button" style={[s.filterButton, s.registryButton]} onPress={() => router.push('/registry')}><Text style={[s.filterButtonText, s.registryButtonText]}>Medical registry  ↗</Text></Pressable></View>
      <View style={s.filterChips}>{filterOrder.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: filter === item }} onPress={() => { setFilter(item); setExpanded(null); }} style={[s.filterChip, filter === item && s.filterChipSelected]}><Text style={[s.filterChipText, filter === item && s.filterChipTextSelected]}>{item}</Text></Pressable>)}</View>
      {!ready && <View style={s.emptyCard}><Text style={s.emptyTitle}>Opening your saved health history…</Text></View>}
      {ready && captured === 0 && <View style={s.emptyCard}><View style={s.emptyIcon}><Text style={s.emptyIconText}>＋</Text></View><Text style={s.emptyTitle}>Start with one piece of your story</Text><Text style={s.emptyBody}>Add a health detail or a record. Nura will show what was saved and where it came from.</Text><Pressable style={s.primaryButton} onPress={() => router.push('/intake')}><Text style={s.primaryButtonText}>ADD A HEALTH RECORD</Text></Pressable></View>}
      {ready && captured > 0 && visibleEntries.length === 0 && <View style={s.emptyCard}><Text style={s.emptyTitle}>No {filter.toLowerCase()} in this history yet</Text><Text style={s.emptyBody}>Try another filter, or add a record when you are ready.</Text><Pressable style={s.primaryButton} onPress={() => { setFilter('Everything'); router.push('/intake'); }}><Text style={s.primaryButtonText}>ADD A HEALTH RECORD</Text></Pressable></View>}
      {visibleEntries.map((entry, index) => {
        const tint = entryPalette(entry);
        const selected = selectedNode === entry.nodeId;
        const entryAsset = entry.kind === 'asset' ? assets.find((asset) => `asset:${asset.id}` === entry.nodeId) : undefined;
        const entryYear = entry.kind === 'asset' ? new Date(entryAsset?.addedAt ?? '').getFullYear() || '' : entry.kind === 'treatment' ? new Date(treatments.find((item) => `treatment:${item.id}` === entry.nodeId)?.startedOn || '').getFullYear() || '' : entry.kind === 'visit' ? new Date(visits.find((item) => `visit:${item.id}` === entry.nodeId)?.appointmentAt || '').getFullYear() || '' : '';
        const glyph = entry.kind === 'fact' ? '✳' : entry.kind === 'treatment' ? '✚' : entry.kind === 'visit' ? '⌂' : assetGlyph(entryAsset?.kind ?? 'file');
        return <View key={entry.id} style={s.timelineRow}>
          <View style={s.dateCol}><Text style={s.dateDay}>{dateParts(entry.date).day}</Text><Text style={s.dateMonth}>{dateParts(entry.date).month}</Text><Text style={s.dateYear}>{entryYear}</Text></View>
          <View style={s.axis}><View style={[s.axisLine, { backgroundColor: tint.line }]} /><Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${selected ? 'Selected' : 'Select'} ${entry.title}`} onPress={() => toggleDetails(entry.id)} style={({ pressed }) => [s.nodeHalo, { backgroundColor: tint.pale, borderColor: selected ? tint.accent : '#FFFFFF', borderWidth: selected ? 2 : 1 }, pressed && s.nodePressed]}><Animated.View style={[s.node, { backgroundColor: tint.node, borderColor: tint.line, shadowColor: tint.accent, transform: [{ scale: nodeScaleFor(entry.nodeId) }] }]}><Text style={s.nodeGlyph}>{glyph}</Text></Animated.View></Pressable></View>
          <View style={s.eventWrap}><View style={[s.eventCard, { backgroundColor: C.white, borderColor: tint.line, borderLeftColor: tint.node, borderLeftWidth: 3 }, selected && { borderColor: tint.node, backgroundColor: '#FBF6FA' }]}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === entry.id, selected }} onPress={() => toggleDetails(entry.id)} style={({ pressed }) => [s.eventSummary, pressed && { opacity: .92 }]}>
              <View style={s.eventMeta}><View style={[s.kindDot, { backgroundColor: tint.node }]} /><Text style={[s.eventKind, { color: tint.accent, backgroundColor: tint.pale }]}>{entry.kind === 'fact' ? entry.category.toUpperCase() : `${entry.category} · SAVED`}</Text>{entry.kind === 'fact' && entry.validUntil && <Text style={s.versionBadge}>PREVIOUS VERSION</Text>}{entry.kind === 'fact' && entry.supersedesId && <Text style={s.versionBadge}>CORRECTED BY YOU</Text>}<Text style={s.eventDate}>{entry.date}</Text></View>
              <Text style={s.eventTitle}>{entry.title}</Text><Text style={s.eventDetail} numberOfLines={expanded === entry.id ? undefined : 2}>{entry.detail}</Text>
              {entry.kind === 'asset' && <Text style={s.notAnalyzed}>{entryAsset?.serverSourceId ? 'Source analyzed · open to view extracted details' : 'Saved on this device · contents not analyzed'}</Text>}
              {entry.repeat && <Text style={s.repeatText}>Possible duplicate · kept as a separate source</Text>}
              {expanded !== entry.id && <Text style={s.viewDetails}>VIEW DETAILS  ↓</Text>}
            </Pressable>
            {expanded === entry.id && <View style={s.expanded}><View style={s.divider} /><Text style={s.sourceLabel}>{entry.kind === 'visit' ? 'VISIT SOURCE' : 'SOURCE'}</Text><Text style={s.sourceText}>{entry.source} · {entry.date}</Text>{entry.note && <Text style={s.noteText}>{entry.note}</Text>}
              {entry.kind === 'fact' && entry.validUntil && <Text style={s.versionNote}>This earlier value was kept when you corrected the record.</Text>}
              {entry.kind === 'fact' && entry.supersedesId && <Text style={s.versionNote}>This is your current correction. The earlier value and its source remain in history.</Text>}
              {entry.kind === 'fact' && editingFactId === entry.nodeId.slice('fact:'.length) && !entry.sourceClaimId && <View style={s.correctionBox}><Text style={s.sourceLabel}>SAVE A CORRECTED VERSION</Text><Text style={s.correctionHelp}>The current value will remain as an earlier version in your timeline.</Text><TextInput value={editLabel} onChangeText={setEditLabel} placeholder="Detail name" placeholderTextColor={C.faint} style={s.correctionInput} maxLength={120} /><TextInput value={editValue} onChangeText={setEditValue} placeholder="Corrected value" placeholderTextColor={C.faint} style={s.correctionInput} maxLength={500} multiline /><View style={s.correctionActions}><Pressable accessibilityRole="button" disabled={savingFactCorrection} onPress={() => void saveFactCorrection()} style={[s.correctionSave, savingFactCorrection && { opacity: .55 }]}><Text style={s.correctionSaveText}>{savingFactCorrection ? 'SAVING VERSION…' : 'SAVE NEW VERSION'}</Text></Pressable><Pressable accessibilityRole="button" disabled={savingFactCorrection} onPress={() => setEditingFactId(null)} style={s.correctionCancel}><Text style={s.correctionCancelText}>Cancel</Text></Pressable></View></View>}
              <View style={s.cardActions}>
                {entry.kind === 'treatment' && <Pressable style={[s.actionButton, s.sourceDetailAction]} onPress={() => router.push({ pathname: '/treatment', params: { treatmentId: entry.nodeId.slice('treatment:'.length) } })}><Text style={s.actionText}>OPEN TREATMENT HISTORY  ↗</Text></Pressable>}
                {entry.kind === 'fact' && !entry.validUntil && <Pressable accessibilityRole="button" style={[s.actionButton, s.sourceDetailAction]} onPress={() => reviewFactCorrection(entry)}><Text style={s.actionText}>{entry.sourceClaimId ? 'CORRECT EXTRACTED DETAIL · KEEP SOURCE VERSIONS' : 'CORRECT THIS DETAIL · KEEP HISTORY'}</Text></Pressable>}
                {entry.kind === 'visit' && <Pressable style={[s.actionButton, s.sourceDetailAction]} onPress={() => router.push({ pathname: '/visits', params: { visitId: entry.nodeId.slice('visit:'.length) } })}><Text style={s.actionText}>OPEN VISIT + SELECTED SOURCES  ↗</Text></Pressable>}
                {(entry.kind === 'fact' || entry.kind === 'asset') && <Pressable style={[s.actionButton, s.sourceDetailAction]} onPress={() => void openSource(entry)}><Text style={s.actionText}>VIEW SOURCE + CAPTURED DETAILS</Text></Pressable>}
                {entry.kind === 'fact' && entry.supersedesId && <Pressable accessibilityRole="button" style={[s.actionButton, s.sourceDetailAction]} onPress={() => focusLinkedItem(`fact:${entry.supersedesId}`)}><Text style={s.actionText}>VIEW PREVIOUS VALUE + SOURCE  ↗</Text></Pressable>}
                <View style={s.secondaryCardActions}><Pressable style={s.actionButton} onPress={() => openLinkFlow()}><Text style={s.actionText}>＋ Connect</Text></Pressable>{(entry.kind === 'asset' || entry.kind === 'fact' && !entry.validUntil) && <Pressable style={s.actionButton} onPress={() => askAbout(entry)}><Text style={s.actionText}>Ask Nura  ↗</Text></Pressable>}</View>
              </View>
            </View>}
          </View></View>
          {index < visibleEntries.length - 1 && <View style={s.rowSpacer} />}
        </View>;
      })}
      {topics.length > 0 && <View style={s.focusSection}><View style={s.focusHeader}><Text style={s.sectionLabel}>YOUR CHOSEN HEALTH AREAS</Text><Pressable accessibilityRole="button" onPress={() => { const selectedTopic = selectedNode?.startsWith('topic:') ? selectedNode.slice('topic:'.length) : topics[0]?.id; router.push({ pathname: '/registry', params: selectedTopic ? { topicId: selectedTopic } : {} }); }}><Text style={s.focusOpenText}>OPEN WIKI ↗</Text></Pressable></View><Text style={s.focusIntro}>These are topics you selected, shown separately from dated records.</Text><View style={s.topicWrap}>{topics.map((topic, index) => { const topicId = `topic:${topic.id}`; const selected = selectedNode === topicId; return <Pressable key={topic.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedNode(selected ? null : topicId); setExpanded(null); }} style={[s.topicChip, index % 3 === 1 && s.topicChipLilac, index % 3 === 2 && s.topicChipMint, selected && s.topicChipActive]}><Text style={s.topicChipText}>{topic.label}</Text></Pressable>; })}</View></View>}
      <Pressable style={s.addRecord} onPress={() => router.push('/intake')}><Text style={s.addRecordPlus}>＋</Text><Text style={s.addRecordText}>Add a health record</Text><Text style={s.addRecordArrow}>↗</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Ask Nura about your whole health history" style={s.askHistory} onPress={() => router.push({ pathname: '/ask', params: { context: 'My complete saved health history' } })}><View style={s.askMark}><Text style={s.askMarkText}>✦</Text></View><View style={{ flex: 1 }}><Text style={s.askTitle}>Ask about this history</Text><Text style={s.askSub}>Nura will use your saved health context</Text></View><Text style={s.askArrow}>↑</Text></Pressable>
    </>}
    {view === 'connections' && <>
      <View style={s.connectionIntro}><View style={s.connectionBadge}><Text style={s.connectionBadgeText}>↔</Text></View><View style={{ flex: 1 }}><Text style={s.connectionIntroTitle}>{links.length ? `${links.length} connection${links.length === 1 ? '' : 's'} you made` : 'Make your history easier to understand'}</Text><Text style={s.connectionIntroBody}>Nura never invents relationships. Links here are only the ones you choose to make.</Text></View></View>
      <Pressable style={s.primaryButton} onPress={openLinkFlow}><Text style={s.primaryButtonText}>＋  CONNECT SAVED ITEMS</Text></Pressable>
      {links.length === 0 && <View style={s.emptyCard}><View style={s.emptyIcon}><Text style={s.emptyIconText}>↔</Text></View><Text style={s.emptyTitle}>No connections yet</Text><Text style={s.emptyBody}>Choose two saved items and describe how they relate in your own words. Nura will keep that note with your history.</Text></View>}
      {links.map((link) => {
        const fromPalette = connectionPalette(link.from, entries, topics);
        const toPalette = connectionPalette(link.to, entries, topics);
        return <View key={link.id} style={s.linkCard}>
          <View style={s.linkDiagram}>
            <View style={s.linkRail}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${nodeTitle(link.from, entries, topics)} in history`} onPress={() => focusLinkedItem(link.from)} style={s.connectionNodeTouch}>
              <View style={[s.connectionNodeHalo, { backgroundColor: fromPalette.pale, borderColor: fromPalette.line }]}><View style={[s.connectionNodeCore, { backgroundColor: fromPalette.node, borderColor: fromPalette.line }]}><Text style={s.connectionNodeGlyph}>{connectionGlyph(link.from, entries, topics)}</Text></View></View>
              </Pressable>
              <View style={s.linkRailGap}><Animated.View style={[s.linkRailLine, { transform: [{ scaleY: routeMotion }] }]}><View style={{ flex: 1, backgroundColor: fromPalette.node }} /><View style={{ flex: 1, backgroundColor: toPalette.node }} /></Animated.View><View style={[s.linkRailDot, { backgroundColor: fromPalette.accent, borderColor: toPalette.pale }]} /></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${nodeTitle(link.to, entries, topics)} in history`} onPress={() => focusLinkedItem(link.to)} style={s.connectionNodeTouch}>
              <View style={[s.connectionNodeHalo, { backgroundColor: toPalette.pale, borderColor: toPalette.line }]}><View style={[s.connectionNodeCore, { backgroundColor: toPalette.node, borderColor: toPalette.line }]}><Text style={s.connectionNodeGlyph}>{connectionGlyph(link.to, entries, topics)}</Text></View></View>
              </Pressable>
            </View>
            <View style={s.linkContent}>
              <Pressable accessibilityRole="button" onPress={() => focusLinkedItem(link.from)} style={s.linkEndpoint}>
                <Text style={[s.linkEndpointMeta, { color: fromPalette.accent }]}>{connectionMeta(link.from, entries)}</Text>
                <Text style={s.linkEndpointTitle} numberOfLines={2}>{nodeTitle(link.from, entries, topics)}</Text>
                <Text style={s.linkEndpointAction}>OPEN IN HISTORY  ›</Text>
              </Pressable>
              <View style={s.linkRelation}>
                <View style={s.linkRelationTag}><View style={s.linkRelationDot} /><Text style={s.linkRelationTagText}>YOUR CONNECTION</Text></View>
                <Text style={s.linkLabelOverline}>{relationLabel(link.relationType).toUpperCase()}</Text>
                <Text style={s.linkLabelText}>{link.label}</Text>
                <Text style={s.linkCaveat}>A link you chose · Nura does not infer cause</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => focusLinkedItem(link.to)} style={s.linkEndpoint}>
                <Text style={[s.linkEndpointMeta, { color: toPalette.accent }]}>{connectionMeta(link.to, entries)}</Text>
                <Text style={s.linkEndpointTitle} numberOfLines={2}>{nodeTitle(link.to, entries, topics)}</Text>
                <Text style={s.linkEndpointAction}>OPEN IN HISTORY  ›</Text>
              </Pressable>
            </View>
          </View>
          <View style={s.linkFooter}><Text style={s.linkDate}>Added {readableDate(link.createdAt)}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remove connection between ${nodeTitle(link.from, entries, topics)} and ${nodeTitle(link.to, entries, topics)}`} onPress={() => confirmRemove(link)}><Text style={s.removeLink}>REMOVE LINK</Text></Pressable></View>
        </View>;
      })}
    </>}
    {view === 'map' && <View style={s.mapPanel}>
      <View style={s.mapHero}>
        <View style={s.mapOrb}><View style={s.orbCore} /></View>
        <Text style={s.mapName}>{name.trim() || 'You'}</Text>
        <Text style={s.mapCaption}>YOUR PROFILE · BUILT FROM YOUR INPUT</Text>
        <Text style={s.mapSummary}>{profileDomains.filter((domain) => domain.entries.length + domain.topics.length > 0).length} of 6 areas have saved information · {entries.filter((entry) => !entry.validUntil).length} current items</Text>
      </View>
      <View style={s.domainGraph}>
        <View pointerEvents="none" style={s.domainSpine} />
        {profileDomains.map((domain) => {
          const domainNodeId = 'profile-domain:' + domain.id;
          const domainPalette = PROFILE_PALETTES[domain.id];
          const selected = selectedNode === domainNodeId;
          const count = domain.entries.length + domain.topics.length;
          const detail = domain.entries.length + ' saved record' + (domain.entries.length === 1 ? '' : 's') + (domain.topics.length ? ' · ' + domain.topics.length + ' chosen area' + (domain.topics.length === 1 ? '' : 's') : '');
          return <View key={domain.id} style={s.domainBlock}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected, expanded: selected }} accessibilityLabel={domain.label + ', ' + (count ? detail : 'no saved information yet')} onPress={() => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedNode(selected ? null : domainNodeId); setExpanded(null); }} style={({ pressed }) => [s.domainButton, selected && { backgroundColor: domainPalette.pale }, pressed && s.choicePressed]}>
              <View style={[s.domainNodeHalo, { backgroundColor: domainPalette.pale, borderColor: domainPalette.line }]}><Animated.View style={[s.domainNodeCore, { backgroundColor: domainPalette.node, borderColor: domainPalette.line, shadowColor: domainPalette.accent, transform: [{ scale: nodeScaleFor(domainNodeId) }] }]}><Text style={s.domainGlyph}>{domain.glyph}</Text></Animated.View></View>
              <View style={s.domainCopy}><Text style={s.domainTitle}>{domain.label}</Text><Text style={s.domainSub}>{count ? detail : 'Add when you are ready'}</Text></View>
              <Text style={s.domainExpand}>{selected ? '−' : '＋'}</Text>
            </Pressable>
            {selected && <View style={s.domainDetails}>
              {domain.entries.length > 0 && <Text style={s.domainDetailLabel}>SAVED RECORDS</Text>}
              {domain.entries.slice(0, 4).map((entry) => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={'Open ' + entry.title + ' in your timeline'} onPress={() => { setFilter('Everything'); changeView('timeline'); focusLinkedItem(entry.nodeId); }} style={s.domainItem}>
                <Text style={s.domainItemTitle} numberOfLines={1}>{entry.title}</Text><Text style={s.domainItemMeta} numberOfLines={1}>{entry.date} · {entry.source}</Text>
              </Pressable>)}
              {domain.entries.length > 4 && <Text style={s.domainMore}>+{domain.entries.length - 4} more in your timeline</Text>}
              {domain.topics.length > 0 && <Text style={s.domainDetailLabel}>AREAS YOU CHOSE</Text>}
              {domain.topics.map((topic) => <Pressable key={topic.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/registry', params: { topicId: topic.id } })} style={s.domainItem}>
                <Text style={s.domainItemTitle}>{topic.label}</Text><Text style={s.domainItemMeta}>Chosen by you · opens the Medical Registry</Text>
              </Pressable>)}
              {count === 0 && <Text style={s.domainEmpty}>Nothing is saved in this area yet. Your other health information stays as it is.</Text>}
              <Pressable accessibilityRole="button" onPress={() => router.push(domain.route)} style={s.domainAction}><Text style={s.domainActionText}>{domain.actionLabel}  ↗</Text></Pressable>
              {domain.id === 'care-insurance' && <Pressable accessibilityRole="button" onPress={() => router.push('/visits')} style={s.domainSecondaryAction}><Text style={s.domainSecondaryText}>OPEN VISITS  ↗</Text></Pressable>}
            </View>}
          </View>;
        })}
      </View>
      <Text style={s.mapFootnote}>A record may appear in more than one area. Lines show how your profile is organised; they do not mean that Nura inferred a medical cause or connection.</Text>
    </View>}
    </Animated.View>
    <View style={s.bottomNote}><Text style={s.bottomNoteText}>Your information stays traceable to its source. Saved files are not analyzed unless the app tells you they were.</Text></View>
  </ScrollView>
  <SheetLayer visible={modal} reducedMotion={reducedMotion} onClose={() => setModal(false)}><View style={s.modalCard}><View style={s.modalHandle} /><View style={s.modalTop}><View style={{ flex: 1 }}><Text style={s.modalEyebrow}>CREATE A CONNECTION</Text><Text style={s.modalTitle}>{step === 'first' ? 'Choose the first item' : step === 'second' ? 'Choose the second item' : 'Describe your connection'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close connection builder" style={s.modalClose} onPress={() => setModal(false)}><Text style={s.modalCloseText}>×</Text></Pressable></View>{step !== 'details' ? <><Text style={s.modalHelp}>{step === 'first' ? 'Select a saved fact, file, or focus area.' : `First item: ${firstChoice?.title ?? ''}`}</Text><ScrollView style={s.choiceList} keyboardShouldPersistTaps="handled">{choices.map((choice) => { const selected = choice.id === first; const disabled = step === 'second' && selected; return <Pressable key={choice.id} accessibilityRole="button" accessibilityLabel={`${choice.title}, ${choice.detail}`} accessibilityState={{ selected: selected || choice.id === second, disabled }} disabled={disabled} onPress={() => chooseItem(choice.id)} style={({ pressed }) => [s.choiceRow, (selected || choice.id === second) && s.choiceSelected, disabled && s.choiceDisabled, pressed && !disabled && s.choicePressed]}><View style={s.choiceNode}><Text style={s.choiceNodeText}>{selected ? '✓' : '•'}</Text></View><View style={{ flex: 1 }}><Text style={s.choiceTitle}>{choice.title}</Text><Text style={s.choiceDetail}>{choice.detail}</Text></View><Text style={s.choiceArrow}>{selected ? '✓' : '›'}</Text></Pressable>})}{choices.length === 0 && <Text style={s.modalHelp}>Add a health detail or record first, then you can connect it here.</Text>}</ScrollView></> : <><View style={s.selectedPair}><Text style={s.selectedTitle}>{firstChoice?.title}</Text><View style={s.pairLine}><View style={s.pairDot} /><View style={s.pairDash} /><View style={s.pairDot} /></View><Text style={s.selectedTitle}>{secondChoice?.title}</Text></View><Text style={s.modalHelp}>Choose a relationship label and add a note if useful. This is your association, not a medical conclusion.</Text><View style={s.relationOptions}>{relationOptions.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: relationType === item.id }} onPress={() => chooseRelation(item.id)} style={({ pressed }) => [s.relationOption, relationType === item.id && s.relationOptionSelected, pressed && s.choicePressed]}><Text style={[s.relationOptionText, relationType === item.id && s.relationOptionTextSelected]}>{item.label}</Text></Pressable>)}</View><TextInput value={label} onChangeText={setLabel} placeholder="Add a short note (optional detail)" placeholderTextColor={C.faint} style={s.labelInput} multiline maxLength={140} autoFocus /><Pressable accessibilityRole="button" onPress={() => saveLink()} style={s.primaryButton}><Text style={s.primaryButtonText}>SAVE MY CONNECTION</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { setStep('second'); setSecond(''); }} style={s.editSelection}><Text style={s.editSelectionText}>Change the second item</Text></Pressable></>}</View></SheetLayer>
  <SheetLayer visible={Boolean(removingLink)} reducedMotion={reducedMotion} onClose={() => setRemovingLink(null)}>{removingLink && <View style={s.modalCard} accessibilityViewIsModal><View style={s.modalHandle} /><View style={s.removeConfirmIcon}><Text style={s.removeConfirmIconText}>↔</Text></View><Text style={s.modalEyebrow}>YOUR HEALTH HISTORY</Text><Text style={s.modalTitle}>Remove this connection?</Text><Text style={s.modalHelp}>“{nodeTitle(removingLink.from, entries, topics)}” and “{nodeTitle(removingLink.to, entries, topics)}” will stay in your history. Only the link you made between them will be removed.</Text><View style={s.removeConfirmActions}><Pressable accessibilityRole="button" onPress={() => setRemovingLink(null)} style={s.removeKeep}><Text style={s.removeKeepText}>KEEP CONNECTION</Text></Pressable><Pressable accessibilityRole="button" onPress={removeSelectedLink} style={s.removeConfirmButton}><Text style={s.removeConfirmButtonText}>REMOVE LINK</Text></Pressable></View></View>}</SheetLayer>
  <SheetLayer visible={Boolean(sourceDetail)} reducedMotion={reducedMotion} onClose={() => setSourceDetail(null)}>{sourceDetail && <View style={s.modalCard}><View style={s.modalHandle} /><View style={s.modalTop}><View style={{ flex: 1 }}><Text style={s.modalEyebrow}>SOURCE & PROFILE LINKS</Text><Text style={s.modalTitle}>{sourceDetail.source?.displayName ?? sourceDetail.asset?.name ?? 'Saved health detail'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close source details" style={s.modalClose} onPress={() => setSourceDetail(null)}><Text style={s.modalCloseText}>×</Text></Pressable></View>
      <ScrollView style={s.sourceScroll} contentContainerStyle={s.sourceContent}>
        <Text style={s.modalHelp}>{sourceDetail.source?.state ? `Source status · ${sourceDetail.source.state.replaceAll('_', ' ')}` : sourceDetail.sourceId ? 'Original retained on this device. Extracted details are linked to this source.' : 'No extracted source is attached to this item.'}</Text>
        {sourceDetail.asset?.mimeType?.startsWith('image/') && !sourceDetail.asset.uri.startsWith('demo://') && <View style={s.sourceImageWrap}><Image source={{ uri: sourceDetail.asset.uri }} resizeMode="contain" style={s.sourceImage} /></View>}
        {sourceDetail.asset && <Pressable accessibilityRole="button" onPress={() => void openOriginal(sourceDetail.asset)} style={s.sourceOpen}><Text style={s.sourceOpenText}>OPEN ORIGINAL ON THIS DEVICE  ↗</Text></Pressable>}
        {sourceDetail.loading && <View style={s.sourceLoading}><ActivityIndicator color={C.cobalt} /><Text style={s.sourceLoadingText}>Loading source-linked details…</Text></View>}
        {sourceDetail.error && <View style={s.sourceError}><Text style={s.sourceErrorText}>{sourceDetail.error}</Text></View>}
        {sourceDetail.sourceId && !sourceDetail.loading && !sourceDetail.error && <>
          <DocumentContextCard context={sourceDetail.source?.documentContext} />
          <Text style={s.sourceSection}>EXTRACTED DETAILS · {sourceDetail.claims.length}</Text>
          {sourceDetail.claims.length === 0 && <Text style={s.modalHelp}>No clear details were extracted from this source. Nothing was added to the profile.</Text>}
          {sourceDetail.claims.map((claim) => {
            const state = claim.evidenceState === 'user_confirmed' ? 'Accepted by you' : claim.evidenceState === 'rejected' ? 'Rejected by you' : claim.evidenceState === 'superseded' ? 'Superseded' : 'Needs your review';
            const stateStyle = claim.evidenceState === 'user_confirmed' ? s.claimAccepted : claim.evidenceState === 'rejected' || claim.evidenceState === 'superseded' ? s.claimRejected : s.claimPending;
            return <View key={claim.id} style={[s.sourceClaim, sourceDetail.claimId === claim.id && s.sourceClaimSelected]}>
              {sourceDetail.claimId === claim.id && <Text style={s.sourceSelectedLabel}>THIS TIMELINE DETAIL</Text>}
              <View style={s.sourceClaimTop}><View style={{ flex: 1 }}><Text style={s.choiceTitle}>{claim.label}</Text><Text style={s.sourceClaimValue}>{claim.value}{claim.unit ? ` ${claim.unit}` : ''}{claim.effectiveAt ? ` · ${readableDate(claim.effectiveAt)}` : ''}</Text>{(claim.referenceRange || claim.method) && <Text style={s.sourceQuote}>{[claim.referenceRange ? `Reference range ${claim.referenceRange}` : null, claim.method ? `Method ${claim.method}` : null].filter(Boolean).join(' · ')}</Text>}</View><Text style={[s.claimState, stateStyle]}>{state}</Text></View>
              {claim.sourceLocation.quote ? <Text style={s.sourceQuote}>“{claim.sourceLocation.quote}”{claim.sourceLocation.page ? ` · page ${claim.sourceLocation.page}` : ''}</Text> : <Text style={s.sourceQuoteMissing}>No supporting quote was returned for this detail.</Text>}
              {claim.originalExtraction && <View style={s.versionNote}><Text style={s.sourceLabel}>ORIGINAL EXTRACTION</Text><Text style={s.sourceText}>{claim.originalExtraction.label}: {claim.originalExtraction.value}{claim.originalExtraction.unit ? ` ${claim.originalExtraction.unit}` : ''}</Text></View>}
              {(claim.revisionHistory ?? []).map((version) => <View key={version.assertionId} style={s.versionNote}><Text style={s.sourceLabel}>EARLIER VERSION {version.version} · {readableDate(version.recordedAt)}</Text><Text style={s.sourceText}>{version.label}: {version.value}{version.unit ? ` ${version.unit}` : ''}</Text></View>)}
              {claim.evidenceState === 'user_confirmed' && sourceDetail.sourceId && <Pressable accessibilityRole="button" onPress={() => reviewSource(sourceDetail, claim.id)} style={s.sourceDetailAction}><Text style={s.viewDetails}>CORRECT THIS DETAIL · KEEP VERSION HISTORY ↗</Text></Pressable>}
            </View>;
          })}
          {sourceDetail.asset && sourceDetail.claims.some((claim) => claim.evidenceState === 'needs_review' || claim.evidenceState === 'candidate') && <Pressable accessibilityRole="button" onPress={() => reviewSource(sourceDetail)} style={s.primaryButton}><Text style={s.primaryButtonText}>REVIEW PENDING DETAILS</Text></Pressable>}
        </>}
        {!sourceDetail.sourceId && <>
          <Text style={s.modalHelp}>{sourceDetail.asset ? 'This file has not been analyzed. Nura will ask for your permission before sending it for extraction.' : 'This detail was entered by you and has no extracted document claim attached.'}</Text>
          {sourceDetail.asset && <Pressable accessibilityRole="button" onPress={() => reviewLocalAsset(sourceDetail)} style={s.primaryButton}><Text style={s.primaryButtonText}>REVIEW THIS FILE WITH NURA</Text></Pressable>}
        </>}
        <Text style={s.sourceFootnote}>Candidate details stay out of your profile until you accept or edit them. Source quotes and page references are shown when available.</Text>
      </ScrollView>
    </View>}</SheetLayer>
  </View>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.canvas }, content: { paddingHorizontal: 20, paddingTop: 46, paddingBottom: 36, maxWidth: 600, width: '100%', alignSelf: 'center' },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 23 }, brand: { color: C.plum, fontSize: 22, fontWeight: '700', letterSpacing: -1 }, tagline: { color: C.faint, fontSize: 8, letterSpacing: 2.1, fontWeight: '700', marginTop: 3 }, topActions: { flexDirection: 'row', gap: 9 }, topIcon: { width: 39, height: 39, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }, topIconText: { color: C.plum, fontSize: 20, lineHeight: 24 },
  eyebrow: { color: C.lilacInk, fontSize: 9, letterSpacing: 2.4, fontWeight: '700', marginBottom: 7 }, heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, heroText: { flex: 1 }, title: { color: C.ink, fontSize: 39, lineHeight: 45, fontWeight: '400', letterSpacing: -1.6 }, subtitle: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 2 }, backPill: { borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: C.white, borderWidth: 1, borderColor: C.border }, backText: { color: C.plum, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  segment: { flexDirection: 'row', borderRadius: 17, padding: 4, backgroundColor: '#EDEAF0', marginTop: 20, borderWidth: 1, borderColor: C.border }, segmentButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 13 }, segmentSelected: { backgroundColor: C.plum, shadowColor: C.plum, shadowOpacity: 0.14, shadowRadius: 7, shadowOffset: { width: 0, height: 3 } }, segmentText: { color: C.muted, fontSize: 13, fontWeight: '500' }, segmentTextSelected: { color: C.white }, warning: { backgroundColor: '#FFF4E5', borderRadius: 12, padding: 12, marginTop: 14 }, warningText: { color: '#80551D', fontSize: 11, lineHeight: 16 },
  profileCard: { backgroundColor: '#EEE3F0', borderRadius: 21, padding: 16, marginTop: 18, borderWidth: 1, borderColor: '#D8C7DF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' }, profileCopy: { flex: 1, paddingRight: 8 }, profileOverline: { color: C.lilacInk, fontSize: 8, fontWeight: '700', letterSpacing: 1.6 }, profileTitle: { color: C.ink, fontSize: 18, fontWeight: '600', marginTop: 7 }, profileDetail: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4, maxWidth: 240 }, profileOrb: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center' }, orbRing: { width: 67, height: 67, borderRadius: 36, borderWidth: 1, borderColor: '#D7C4E0', backgroundColor: '#F8EFF4', alignItems: 'center', justifyContent: 'center' }, orbCore: { width: 34, height: 34, borderRadius: 18, backgroundColor: '#8B63A0', borderWidth: 2, borderColor: '#D6BDDF', shadowColor: '#8B63A0', shadowOpacity: .25, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }, filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 8 }, filterTitle: { color: C.ink, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 }, filterSub: { color: C.faint, fontSize: 10, marginTop: 4 }, filterButton: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8 }, filterButtonText: { color: C.lilacInk, fontSize: 10, fontWeight: '600' }, filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingBottom: 13 }, filterChip: { minHeight: 44, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: '#FAF7FB' }, filterChipSelected: { backgroundColor: '#EFE5F0', borderColor: '#D2BDD5' }, filterChipText: { color: C.muted, fontSize: 10, fontWeight: '500' }, filterChipTextSelected: { color: C.plum, fontWeight: '700' },
  timelineRow: { flexDirection: 'row', alignItems: 'stretch', minHeight: 116 }, dateCol: { width: 48, paddingTop: 10, alignItems: 'flex-start' }, dateDay: { color: C.ink, fontSize: 16, fontWeight: '600', letterSpacing: -.4 }, dateMonth: { color: C.muted, fontSize: 9, fontWeight: '600', letterSpacing: 1, marginTop: 1 }, dateYear: { color: C.faint, fontSize: 9, marginTop: 5 }, axis: { width: 48, alignItems: 'center', position: 'relative' }, axisLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#94B3EB' }, nodeHalo: { marginTop: 4, width: 48, height: 48, borderRadius: 25, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center', zIndex: 1 }, nodePressed: { transform: [{ scale: motion.pressScale }] }, node: { width: 37, height: 37, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cobalt, borderWidth: 1.5, borderColor: '#8DB4FF', shadowColor: C.cobalt, shadowOpacity: .23, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }, nodeGlyph: { color: C.white, fontSize: 17, fontWeight: '500' }, eventWrap: { flex: 1, paddingBottom: 13 }, eventCard: { backgroundColor: C.white, borderColor: C.border, borderWidth: 1, borderRadius: 17, paddingHorizontal: 13, paddingVertical: 12, shadowColor: '#30263D', shadowOpacity: .035, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, eventCardOpen: { borderColor: '#CBB9D2', shadowOpacity: .08 }, eventSummary: { borderRadius: 12 }, cardPressed: { opacity: .96, transform: [{ scale: motion.pressScale }] }, eventMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }, kindDot: { width: 7, height: 7, borderRadius: 4 }, kindFact: { backgroundColor: C.cobalt }, kindFile: { backgroundColor: '#8B6CAB' }, eventKind: { color: C.lilacInk, fontSize: 8, fontWeight: '700', letterSpacing: .65, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 9, overflow: 'hidden' }, eventDate: { color: C.faint, fontSize: 8, marginLeft: 'auto' }, eventTitle: { color: C.ink, fontSize: 15, fontWeight: '600', lineHeight: 20, marginTop: 7 }, eventDetail: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 3 }, versionBadge: { color: '#7A5C84', fontSize: 6, fontWeight: '800', letterSpacing: .5, backgroundColor: '#F0E8F4', overflow: 'hidden', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 4 }, versionNote: { color: '#705583', fontSize: 9, lineHeight: 14, marginTop: 6, backgroundColor: '#F5EFF8', padding: 8, borderRadius: 10 }, correctionBox: { backgroundColor: '#F7F5FA', borderColor: '#E4DCE9', borderWidth: 1, borderRadius: 13, padding: 10, marginTop: 10 }, correctionHelp: { color: C.muted, fontSize: 9, lineHeight: 13, marginTop: 4 }, correctionInput: { minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, paddingHorizontal: 10, paddingVertical: 8, color: C.ink, fontSize: 10, marginTop: 7 }, correctionActions: { gap: 7, marginTop: 8 }, correctionSave: { minHeight: 39, borderRadius: 11, backgroundColor: C.cobalt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }, correctionSaveText: { color: C.white, fontSize: 8, fontWeight: '800', letterSpacing: .6 }, correctionCancel: { minHeight: 33, alignItems: 'center', justifyContent: 'center' }, correctionCancelText: { color: C.muted, fontSize: 9 }, notAnalyzed: { color: '#8A7298', fontSize: 9, marginTop: 6 }, repeatText: { color: '#9B651D', fontSize: 9, lineHeight: 14, marginTop: 5 }, viewDetails: { color: C.cobaltDeep, fontSize: 8, letterSpacing: .9, fontWeight: '700', marginTop: 11 }, expanded: { marginTop: 10 }, divider: { height: 1, backgroundColor: C.border, marginBottom: 9 }, sourceLabel: { color: C.faint, fontSize: 8, fontWeight: '700', letterSpacing: 1.2 }, sourceText: { color: C.muted, fontSize: 10, marginTop: 4 }, noteText: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 6 }, cardActions: { gap: 8, marginTop: 12 }, sourceDetailAction: { alignItems: 'center' }, secondaryCardActions: { flexDirection: 'row', gap: 8 }, actionButton: { backgroundColor: C.bluePale, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14 }, actionText: { color: C.cobaltDeep, fontSize: 10, fontWeight: '600' }, rowSpacer: { height: 1 },
  focusSection: { marginTop: 14, padding: 15, borderRadius: 18, backgroundColor: '#F1EEF5', borderWidth: 1, borderColor: '#E4DCE9' }, sectionLabel: { color: C.lilacInk, fontSize: 9, fontWeight: '700', letterSpacing: 1.15 }, focusIntro: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 5 }, topicWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }, topicChip: { backgroundColor: C.bluePale, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' }, topicChipLilac: { backgroundColor: C.lilac }, topicChipMint: { backgroundColor: C.mint }, topicChipActive: { borderColor: C.cobalt, backgroundColor: '#FFFFFF' }, topicChipText: { color: C.plum, fontSize: 10, fontWeight: '500' }, addRecord: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 13, borderWidth: 1, borderColor: C.border, marginTop: 17 }, addRecordPlus: { color: C.cobalt, fontSize: 21, fontWeight: '300' }, addRecordText: { flex: 1, color: C.ink, fontSize: 13, fontWeight: '600' }, addRecordArrow: { color: C.lilacInk, fontSize: 17 }, askHistory: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F0EAF5', borderRadius: 18, borderWidth: 1, borderColor: '#E0D5E9', padding: 12, marginTop: 9 }, askMark: { width: 34, height: 34, borderRadius: 13, backgroundColor: '#F4E1D7', alignItems: 'center', justifyContent: 'center' }, askMarkText: { color: C.lilacInk, fontSize: 18 }, askTitle: { color: C.ink, fontSize: 12, fontWeight: '600' }, askSub: { color: C.muted, fontSize: 9, marginTop: 3 }, askArrow: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.plum, color: C.white, textAlign: 'center', textAlignVertical: 'center', fontSize: 18, overflow: 'hidden' },
  connectionIntro: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderRadius: 18, padding: 15, borderWidth: 1, borderColor: C.border, marginTop: 19, marginBottom: 12 }, connectionBadge: { width: 41, height: 41, borderRadius: 15, backgroundColor: C.lilac, alignItems: 'center', justifyContent: 'center' }, connectionBadgeText: { color: C.lilacInk, fontSize: 21 }, connectionIntroTitle: { color: C.ink, fontSize: 14, fontWeight: '600' }, connectionIntroBody: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }, primaryButton: { borderRadius: 15, backgroundColor: C.cobalt, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 12, shadowColor: C.cobalt, shadowOpacity: .16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, primaryButtonText: { color: C.white, fontSize: 10, fontWeight: '700', letterSpacing: .9 }, buttonDisabled: { opacity: .45 }, emptyCard: { backgroundColor: C.white, borderRadius: 20, padding: 20, borderColor: C.border, borderWidth: 1, alignItems: 'center', marginTop: 16 }, emptyIcon: { width: 48, height: 48, borderRadius: 25, backgroundColor: C.bluePale, alignItems: 'center', justifyContent: 'center', marginBottom: 11 }, emptyIconText: { color: C.cobalt, fontSize: 24, fontWeight: '300' }, emptyTitle: { color: C.ink, fontSize: 15, fontWeight: '600', textAlign: 'center' }, emptyBody: { color: C.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7 },
  relationOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 5, marginBottom: 8 }, relationOption: { borderRadius: 16, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 8 }, relationOptionSelected: { backgroundColor: C.bluePale, borderColor: C.cobalt }, relationOptionText: { color: C.muted, fontSize: 9, fontWeight: '500' }, relationOptionTextSelected: { color: C.cobaltDeep, fontWeight: '700' },
  linkCard: { backgroundColor: C.white, borderRadius: 20, padding: 13, borderWidth: 1, borderColor: C.border, marginTop: 12, shadowColor: '#30263D', shadowOpacity: .04, shadowRadius: 9, shadowOffset: { width: 0, height: 3 } },
  linkDiagram: { flexDirection: 'row', alignItems: 'stretch', gap: 8 }, linkRail: { width: 46, alignItems: 'center' }, connectionNodeTouch: { width: 46, height: 54, alignItems: 'center', justifyContent: 'center', zIndex: 1 }, connectionNodeHalo: { width: 42, height: 42, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }, connectionNodeCore: { width: 31, height: 31, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, shadowColor: '#27385A', shadowOpacity: .17, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } }, connectionNodeGlyph: { color: C.white, fontSize: 14, fontWeight: '600' }, linkRailGap: { minHeight: 62, flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' }, linkRailLine: { position: 'absolute', top: 0, bottom: 0, width: 3, borderRadius: 2, overflow: 'hidden' }, linkRailDot: { width: 8, height: 8, borderRadius: 5, backgroundColor: C.cobalt, borderWidth: 2, borderColor: C.white, zIndex: 1 }, linkContent: { flex: 1 }, linkEndpoint: { minHeight: 54, justifyContent: 'center', paddingVertical: 4 }, linkEndpointTitle: { color: C.ink, fontSize: 12, fontWeight: '600', lineHeight: 16, marginTop: 2 }, linkEndpointMeta: { color: C.cobaltDeep, fontSize: 7, fontWeight: '700', letterSpacing: .75 }, linkEndpointAction: { color: C.faint, fontSize: 7, fontWeight: '700', letterSpacing: .6, marginTop: 3 }, linkRelation: { minHeight: 62, justifyContent: 'center', backgroundColor: '#F4F7FC', borderRadius: 12, borderWidth: 1, borderColor: '#E4EAF3', paddingHorizontal: 10, paddingVertical: 8 }, linkRelationTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }, linkRelationDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: C.lilacInk }, linkRelationTagText: { color: C.lilacInk, fontSize: 7, fontWeight: '800', letterSpacing: .8 }, linkLabelOverline: { color: C.cobaltDeep, fontSize: 7, fontWeight: '700', letterSpacing: .65 }, linkLabelText: { color: C.ink, fontSize: 10, lineHeight: 14, marginTop: 2 }, linkCaveat: { color: C.muted, fontSize: 7, lineHeight: 10, marginTop: 3 }, linkFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 11, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 9 }, linkDate: { color: C.faint, fontSize: 9 }, removeLink: { color: '#8D6474', fontSize: 8, fontWeight: '700', letterSpacing: .5 }, removeConfirmIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#F3E8EE', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, removeConfirmIconText: { color: '#8D6474', fontSize: 21 }, removeConfirmActions: { flexDirection: 'row', gap: 8, marginTop: 17 }, removeKeep: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }, removeKeepText: { color: C.muted, fontSize: 8, fontWeight: '700', letterSpacing: .6 }, removeConfirmButton: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: '#8D6474', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }, removeConfirmButtonText: { color: C.white, fontSize: 8, fontWeight: '700', letterSpacing: .6 },
  mapSummary: { color: C.muted, fontSize: 9, marginTop: 7 }, domainGraph: { position: 'relative', marginTop: 4, paddingHorizontal: 2 }, domainSpine: { position: 'absolute', left: 22, top: 22, bottom: 23, width: 2, backgroundColor: '#94B3EB' }, domainBlock: { borderBottomWidth: 1, borderBottomColor: '#E5DEE9' }, domainButton: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, borderRadius: 14 }, domainButtonSelected: { backgroundColor: '#F4F8FF' }, domainNodeHalo: { width: 44, height: 44, borderRadius: 23, backgroundColor: C.bluePale, borderWidth: 1.5, borderColor: '#C8DCFF', alignItems: 'center', justifyContent: 'center', zIndex: 1 }, domainNodeCore: { width: 32, height: 32, borderRadius: 17, backgroundColor: '#1767E9', borderWidth: 1, borderColor: '#8DB4FF', alignItems: 'center', justifyContent: 'center' }, domainGlyph: { color: C.white, fontSize: 15, fontWeight: '600' }, domainCopy: { flex: 1, minWidth: 0 }, domainExpand: { color: C.cobaltDeep, fontSize: 18, paddingHorizontal: 3 }, domainDetails: { marginLeft: 55, paddingBottom: 13 }, domainDetailLabel: { color: C.lilacInk, fontSize: 8, fontWeight: '700', letterSpacing: 1, marginTop: 6, marginBottom: 2 }, domainItem: { minHeight: 44, justifyContent: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F0EDF2' }, domainItemTitle: { color: C.ink, fontSize: 11, fontWeight: '600' }, domainItemMeta: { color: C.muted, fontSize: 9, marginTop: 3 }, domainMore: { color: C.cobaltDeep, fontSize: 9, marginTop: 7 }, domainEmpty: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 8 }, domainAction: { minHeight: 42, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bluePale, borderRadius: 12, paddingHorizontal: 9, marginTop: 10 }, domainActionText: { color: C.cobaltDeep, fontSize: 8, fontWeight: '700', letterSpacing: .6 }, domainSecondaryAction: { minHeight: 38, justifyContent: 'center', alignItems: 'center', marginTop: 3 }, domainSecondaryText: { color: C.cobaltDeep, fontSize: 8, fontWeight: '700', letterSpacing: .5 },
  mapPanel: { backgroundColor: C.white, borderRadius: 21, borderWidth: 1, borderColor: C.border, padding: 16, marginTop: 19 }, mapHero: { backgroundColor: '#F2EAF3', borderRadius: 18, paddingVertical: 20, alignItems: 'center', marginBottom: 9 }, mapOrb: { width: 65, height: 65, borderRadius: 34, borderWidth: 1, borderColor: '#D8C6E0', backgroundColor: '#FBF3F0', alignItems: 'center', justifyContent: 'center' }, mapName: { color: C.ink, fontSize: 17, fontWeight: '600', marginTop: 8 }, mapCaption: { color: C.faint, fontSize: 7, fontWeight: '700', letterSpacing: 1.1, marginTop: 4 }, domainRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: '#F0EDF2' }, domainNode: { width: 30, height: 30, borderRadius: 16, backgroundColor: '#F0EDF2', alignItems: 'center', justifyContent: 'center' }, domainNodeActive: { backgroundColor: C.bluePale }, domainNumber: { color: C.faint, fontSize: 8, fontWeight: '700' }, domainNumberActive: { color: C.cobalt }, domainTitle: { color: C.ink, fontSize: 11, fontWeight: '600' }, domainSub: { color: C.faint, fontSize: 9, marginTop: 3 }, domainTrack: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#D8D3DD' }, domainTrackActive: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.cobalt }, mapFootnote: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 12 }, bottomNote: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }, bottomNoteText: { color: C.faint, fontSize: 9, lineHeight: 14, textAlign: 'center' },
  webModalShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'center', alignItems: 'center', padding: 12, backgroundColor: 'rgba(28,23,34,.42)' }, modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(28,23,34,.42)' }, modalCard: { width: '100%', maxWidth: 390, alignSelf: 'center', backgroundColor: C.canvas, borderRadius: 25, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30, maxHeight: '88%' }, modalHandle: { width: 40, height: 4, borderRadius: 3, backgroundColor: '#D2CDD7', alignSelf: 'center', marginBottom: 16 }, modalTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }, modalEyebrow: { color: C.lilacInk, fontSize: 8, fontWeight: '700', letterSpacing: 1.4 }, modalTitle: { color: C.ink, fontSize: 22, fontWeight: '500', marginTop: 5 }, modalClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }, modalCloseText: { color: C.muted, fontSize: 22, lineHeight: 25 }, modalHelp: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 8 }, choiceList: { maxHeight: 330 }, choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 14, backgroundColor: C.white, marginTop: 7, borderWidth: 1, borderColor: C.border }, choiceSelected: { borderColor: C.cobalt, backgroundColor: C.bluePale }, choiceDisabled: { opacity: .45 }, choicePressed: { opacity: .9, transform: [{ scale: .985 }] }, choiceNode: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cobalt }, choiceNodeText: { color: C.white, fontSize: 13 }, choiceTitle: { color: C.ink, fontSize: 11, fontWeight: '600' }, choiceDetail: { color: C.faint, fontSize: 9, marginTop: 3 }, choiceArrow: { color: C.cobalt, fontSize: 20 }, selectedPair: { backgroundColor: C.white, borderRadius: 16, padding: 12, marginTop: 10, borderWidth: 1, borderColor: C.border }, selectedTitle: { color: C.ink, fontSize: 12, fontWeight: '600' }, pairLine: { height: 21, flexDirection: 'row', alignItems: 'center', marginLeft: 5 }, pairDot: { width: 8, height: 8, borderRadius: 5, backgroundColor: C.cobalt }, pairDash: { width: 2, height: 16, backgroundColor: C.blueLine, marginLeft: 3 }, labelInput: { minHeight: 78, maxHeight: 120, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, paddingHorizontal: 13, paddingVertical: 11, color: C.ink, fontSize: 12, textAlignVertical: 'top', marginTop: 5 }, editSelection: { alignItems: 'center', paddingVertical: 12 }, editSelectionText: { color: C.lilacInk, fontSize: 10, fontWeight: '600' },
  sourceScroll: { maxHeight: '82%' }, sourceContent: { paddingBottom: 8 }, sourceImageWrap: { backgroundColor: C.white, borderRadius: 15, borderWidth: 1, borderColor: C.border, padding: 7, marginVertical: 9 }, sourceImage: { width: '100%', height: 190 }, sourceOpen: { alignItems: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#C8DBFF', backgroundColor: C.bluePale, padding: 12, marginTop: 8 }, sourceOpenText: { color: C.cobaltDeep, fontSize: 9, fontWeight: '700', letterSpacing: .6 }, sourceLoading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 16 }, sourceLoadingText: { color: C.muted, fontSize: 10 }, sourceError: { backgroundColor: '#FFF2EE', borderWidth: 1, borderColor: '#F1D1C9', borderRadius: 12, padding: 12, marginTop: 10 }, sourceErrorText: { color: '#8F4639', fontSize: 10, lineHeight: 15 }, sourceSection: { color: C.lilacInk, fontSize: 8, fontWeight: '700', letterSpacing: 1.1, marginTop: 14, marginBottom: 5 }, sourceClaim: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 11, marginTop: 7 }, sourceClaimSelected: { borderColor: C.cobalt, backgroundColor: '#F4F8FF' }, sourceSelectedLabel: { color: C.cobaltDeep, fontSize: 7, fontWeight: '700', letterSpacing: .8, marginBottom: 6 }, sourceClaimTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, sourceClaimValue: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }, claimState: { overflow: 'hidden', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, fontSize: 8, fontWeight: '700' }, claimAccepted: { color: '#327457', backgroundColor: C.mint }, claimRejected: { color: C.muted, backgroundColor: '#F0EEF2' }, claimPending: { color: '#8A5C14', backgroundColor: '#FFF0D4' }, sourceQuote: { color: C.muted, fontSize: 10, lineHeight: 15, fontStyle: 'italic', marginTop: 8 }, sourceQuoteMissing: { color: C.faint, fontSize: 9, lineHeight: 14, marginTop: 8 }, sourceFootnote: { color: C.faint, fontSize: 9, lineHeight: 14, marginTop: 13 },
  registryButton: { backgroundColor: C.bluePale, borderColor: '#D6E4FF' }, registryButtonText: { color: C.cobaltDeep, fontSize: 8.5, fontWeight: '700' }, focusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, focusOpenText: { color: C.cobaltDeep, fontSize: 8, fontWeight: '800', letterSpacing: .55 },
});
