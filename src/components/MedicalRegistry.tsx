import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { colors, motion, timelineColors } from '../theme';
import { parseHealthDate } from '../utils/healthDate';
import { registryBriefDisplayText, registryBriefIsCurrent, registryCitationTargetId, registryEvidenceSnapshot } from '../services/registryBrief.mjs';
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
  revision: string;
  sourceIdentity: string;
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
  addLink: (from: string, to: string, label: string, relationType?: HealthLinkRelation) => HealthLink | null;
};

const C = {
  canvas: colors.bg, white: colors.surface, ink: colors.ink, muted: colors.muted, faint: colors.quiet,
  border: colors.border, cobalt: colors.cobalt, bluePale: colors.bluePale, blueLine: timelineColors.record.line,
  plum: colors.plum, lilac: colors.lilac, lilacInk: colors.violet, mint: colors.mint, mintInk: colors.success,
  amber: '#FFF0D6', amberInk: colors.warning, peach: colors.peach,
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
function relationTint(kind: RegistryItem['kind']) {
  if (kind === 'treatment') return { node: timelineColors.treatment.node, pale: timelineColors.treatment.pale, ink: timelineColors.treatment.accent };
  if (kind === 'visit') return { node: timelineColors.care.node, pale: timelineColors.care.pale, ink: timelineColors.care.accent };
  if (kind === 'asset') return { node: C.cobalt, pale: C.bluePale, ink: C.cobalt };
  return { node: timelineColors.vitals.node, pale: timelineColors.vitals.pale, ink: timelineColors.vitals.accent };
}

export function MedicalRegistry({ ready, topics, facts, assets, treatments, visits, links, registryBriefs, initialTopicId, addLink }: Props) {
  const [topicId, setTopicId] = useState(initialTopicId ?? topics[0]?.id ?? '');
  const [connectOpen, setConnectOpen] = useState(false);
  const [candidateId, setCandidateId] = useState('');
  const [relationType, setRelationType] = useState<HealthLinkRelation>('related_by_me');
  const [message, setMessage] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [fingerprint, setFingerprint] = useState<{ snapshot: string; signature: string }>({ snapshot: '', signature: '' });
  const [showEarlierBriefs, setShowEarlierBriefs] = useState(false);
  const [showFullBrief, setShowFullBrief] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (active) setReducedMotion(enabled); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  const items = useMemo<RegistryItem[]>(() => [
    ...facts.map((fact) => ({ id: `fact:${fact.id}`, kind: 'fact' as const, title: fact.label, detail: fact.value, date: fact.date, category: fact.category, source: fact.source, status: fact.reviewState === 'user_confirmed' ? 'Confirmed by you' : fact.status === 'reviewed' ? 'Reviewed' : 'Captured', revision: JSON.stringify([fact.value, fact.note ?? '', fact.source, fact.status, fact.reviewState ?? '', fact.validFrom ?? '', fact.validUntil ?? '', fact.sourceId ?? '', fact.sourceClaimId ?? '', fact.supersedesId ?? '']), sourceIdentity: fact.sourceId ?? fact.sourceClaimId ?? fact.source })),
    ...assets.map((asset) => ({ id: `asset:${asset.id}`, kind: 'asset' as const, title: asset.name, detail: asset.kind === 'video' ? 'Saved video · analysis status shown with the source' : `${asset.kind.toUpperCase()} · original source retained`, date: asset.addedAt, category: asset.purpose === 'insurance' ? 'Insurance source' : 'Health record', source: asset.serverSourceId ? 'Source is linked to extracted claims' : 'Added by you · contents not analyzed', status: asset.possibleRepeat ? 'Possible duplicate · kept separate' : 'Original source', revision: JSON.stringify([asset.name, asset.kind, asset.size ?? '', asset.mimeType ?? '', asset.purpose ?? '', asset.serverSourceId ?? '', asset.possibleRepeat ?? false]), sourceIdentity: asset.serverSourceId ?? `${asset.name}|${asset.size ?? ''}|${asset.addedAt}` })),
    ...treatments.map((item) => ({ id: `treatment:${item.id}`, kind: 'treatment' as const, title: item.name, detail: [item.dose, item.schedule].filter(Boolean).join(' · ') || 'Dose and schedule not recorded', date: item.startedOn || item.createdAt, category: `Treatment · ${item.status}`, source: item.source, status: item.status === 'current' ? 'Current' : 'Past', revision: JSON.stringify([item.name, item.dose, item.schedule, item.purpose, item.prescriber, item.careLocation, item.pharmacy, item.status, item.startedOn, item.endedOn ?? '', item.updatedAt]), sourceIdentity: item.sourceId ?? item.source })),
    ...visits.map((item) => ({ id: `visit:${item.id}`, kind: 'visit' as const, title: item.purpose || 'Care visit', detail: [item.clinician, item.location].filter(Boolean).join(' · ') || 'Visit detail not recorded', date: item.appointmentAt || item.createdAt, category: 'Care visit', source: item.source, status: item.status === 'upcoming' ? 'Planned visit' : 'Visit record', revision: JSON.stringify([item.purpose, item.appointmentAt, item.clinician, item.location, item.status, item.outcome, item.followUp, item.updatedAt]), sourceIdentity: item.source })),
  ], [facts, assets, treatments, visits]);

  const selectedTopicId = topics.some((entry) => entry.id === topicId)
    ? topicId
    : topics.some((entry) => entry.id === initialTopicId) ? initialTopicId ?? '' : topics[0]?.id ?? '';
  const topic = topics.find((entry) => entry.id === selectedTopicId);
  const topicNodeId = topic ? `topic:${topic.id}` : '';
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const topicLinks = useMemo(() => links.filter((link) => link.from === topicNodeId || link.to === topicNodeId), [links, topicNodeId]);
  const connected = useMemo(() => topicLinks.flatMap((link) => {
    const itemId = link.from === topicNodeId ? link.to : link.from;
    const item = itemById.get(itemId);
    return item ? [{ ...item, link }] : [];
  }).sort((a, b) => (parseHealthDate(b.date)?.getTime() ?? 0) - (parseHealthDate(a.date)?.getTime() ?? 0)), [topicLinks, itemById, topicNodeId]);
  const connectedIds = useMemo(() => new Set(topicLinks.map((link) => link.from === topicNodeId ? link.to : link.from)), [topicLinks, topicNodeId]);
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
  const briefIsCurrent = registryBriefIsCurrent(latestBrief, sourceSignature);
  const availableItems = useMemo(() => items.filter((item) => !connectedIds.has(item.id)), [items, connectedIds]);
  const candidate = availableItems.find((item) => item.id === candidateId);
  const availableRelations = candidate ? relations.filter((item) => item.value === 'related_by_me' || (candidate.kind === 'treatment' && item.value === 'treatment_for')) : [];

  function selectTopic(id: string) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTopicId(id);
    setMessage('');
    setShowFullBrief(false);
    setShowEarlierBriefs(false);
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

  return <View style={s.page}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to health history" onPress={() => openHistory()} style={({ pressed }) => [s.backButton, pressed && s.pressed]}><Text style={s.backGlyph}>‹</Text><Text style={s.backText}>History</Text></Pressable>
        <View style={s.brand}><Text style={s.wordmark}>nura</Text><Text style={s.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View>
      </View>
      <Text style={s.eyebrow}>MEDICAL REGISTRY</Text>
      <Text style={s.title}>Your health wiki.</Text>
      <Text style={s.subtitle}>Each area gathers the records you connect, with dates and original sources kept close.</Text>

      {!ready && <View style={s.notice}><Text style={s.noticeTitle}>Opening your saved registry…</Text><Text style={s.body}>Your confirmed information will appear when the local profile has loaded.</Text></View>}
      {topics.length > 0 ? <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.topicRail}>
          {topics.map((entry) => <Pressable key={entry.id} accessibilityRole="button" accessibilityState={{ selected: topic?.id === entry.id }} onPress={() => selectTopic(entry.id)} style={({ pressed }) => [s.topicChip, topic?.id === entry.id && s.topicChipSelected, pressed && s.pressed]}><View style={[s.topicDot, topic?.id === entry.id && s.topicDotSelected]} /><Text style={[s.topicText, topic?.id === entry.id && s.topicTextSelected]}>{entry.label}</Text></Pressable>)}
        </ScrollView>
        {topic && <>
          <View style={s.topicHero}>
            <View style={s.heroTop}><View style={s.heroIcon}><Text style={s.heroIconText}>✳</Text></View><View style={s.heroBadge}><View style={s.badgeDot} /><Text style={s.badgeText}>SELECTED BY YOU</Text></View></View>
            <Text style={s.topicTitle}>{topic.label}</Text>
            <Text style={s.topicCaveat}>A focus area you chose. This is not a diagnosis or an inferred medical condition.</Text>
            <View style={s.statsRow}><View style={s.stat}><Text style={s.statValue}>{connected.length}</Text><Text style={s.statLabel}>LINKED RECORDS</Text></View><View style={s.statRule} /><View style={s.stat}><Text style={s.statValue}>{new Set(connected.map((item) => item.source)).size}</Text><Text style={s.statLabel}>SOURCES</Text></View><View style={s.statRule} /><View style={s.stat}><Text style={s.statValue}>{topicLinks.length}</Text><Text style={s.statLabel}>YOUR LINKS</Text></View></View>
            <View style={s.heroActions}><Pressable accessibilityRole="button" onPress={askAboutTopic} style={({ pressed }) => [s.askButton, pressed && s.pressed]}><Text style={s.askButtonText}>Ask Nura about this history  ↗</Text></Pressable><Pressable accessibilityRole="button" onPress={openConnect} style={({ pressed }) => [s.connectButton, pressed && s.pressed]}><Text style={s.connectButtonText}>＋ Connect a record</Text></Pressable></View>
          </View>

          <View style={s.briefCard}>
            <View style={s.briefTop}><View style={{ flex: 1 }}><Text style={s.briefKicker}>SOURCE-LINKED WIKI</Text><Text style={s.briefTitle}>Your {topic.label} summary</Text></View><View style={[s.briefStatus, latestBrief && briefIsCurrent ? s.briefFresh : latestBrief ? s.briefStale : connected.length ? s.briefReady : s.briefEmpty]}><Text style={[s.briefStatusText, latestBrief && briefIsCurrent ? s.briefFreshText : latestBrief ? s.briefStaleText : connected.length ? s.briefReadyText : s.briefEmptyText]}>{latestBrief ? (briefIsCurrent ? 'CURRENT' : 'EVIDENCE CHANGED') : connected.length ? 'READY TO CREATE' : 'NEEDS RECORDS'}</Text></View></View>
            {latestBrief ? <>
              <Text style={s.briefDate}>Last summarized {readableDate(latestBrief.createdAt)} · {latestBrief.citations.length} cited source{latestBrief.citations.length === 1 ? '' : 's'}</Text>
              {!briefIsCurrent && <Text style={s.briefWarning}>A linked record or relationship changed after this summary. Refresh it to reflect current evidence.</Text>}
              <Text numberOfLines={showFullBrief ? undefined : 8} style={s.briefAnswer}>{latestBriefDisplay}</Text>
              {latestBriefDisplay.length > 360 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFullBrief }} onPress={() => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowFullBrief((value) => !value); }} style={s.summaryToggle}><Text style={s.earlierToggleText}>{showFullBrief ? 'SHOW LESS' : 'READ FULL SUMMARY'}</Text></Pressable>}
              {latestBrief.unknowns.length > 0 && <View style={s.briefUnknowns}><Text style={s.briefUnknownTitle}>STILL UNKNOWN</Text><Text style={s.briefUnknownText}>{latestBrief.unknowns.join(' · ')}</Text></View>}
              <Text style={s.briefSourcesTitle}>CITED SOURCES</Text>
              {latestBrief.citations.map((citation) => <Pressable key={`${latestBrief.id}:${citation.id}`} accessibilityRole="button" accessibilityLabel={`Open cited source ${citation.title} in health history`} onPress={() => openHistory(registryCitationTargetId(citation, connected) ?? undefined)} style={({ pressed }) => [s.briefCitation, pressed && s.pressed]}><Text style={s.briefCitationRef}>{citation.reference}</Text><View style={{ flex: 1 }}><Text style={s.briefCitationTitle}>{citation.title}</Text><Text style={s.briefCitationDetail}>{citation.source}{citation.date ? ` · ${citation.date}` : ''}</Text></View><Text style={s.briefArrow}>›</Text></Pressable>)}
              {topicBriefs.length > 1 && <><Pressable accessibilityRole="button" accessibilityState={{ expanded: showEarlierBriefs }} onPress={() => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowEarlierBriefs((value) => !value); }} style={s.earlierToggle}><Text style={s.earlierToggleText}>{showEarlierBriefs ? 'Hide earlier summaries' : `Earlier summaries · ${topicBriefs.length - 1}`}</Text></Pressable>{showEarlierBriefs && topicBriefs.slice(1).map((brief) => <View key={brief.id} style={s.earlierBrief}><Text style={s.earlierDate}>{readableDate(brief.createdAt)} · {brief.citations.length} sources</Text><Text style={s.earlierAnswer}>{registryBriefDisplayText(brief.answer)}</Text></View>)}</>}
            </> : <Text style={s.briefIntro}>{connected.length ? `Nura can summarize only the ${connected.length} record${connected.length === 1 ? '' : 's'} you linked here. You review the cited result before it is saved.` : 'Connect a source record to this topic first. Nura will use only linked evidence and show its citations.'}</Text>}
            <Pressable accessibilityRole="button" disabled={!connected.length || !sourceSignature} onPress={createRegistryBrief} style={({ pressed }) => [s.briefAction, (!connected.length || !sourceSignature) && s.briefActionDisabled, pressed && connected.length > 0 && s.pressed]}><Text style={s.briefActionText}>{latestBrief ? (briefIsCurrent ? 'REBUILD FROM LINKED RECORDS' : 'REFRESH FROM CURRENT EVIDENCE') : 'CREATE WITH ASK NURA'}</Text></Pressable>
          </View>

          <View style={s.sectionHead}><View><Text style={s.sectionKicker}>SOURCE-LINKED HISTORY</Text><Text style={s.sectionTitle}>{connected.length ? `${connected.length} item${connected.length === 1 ? '' : 's'} connected` : 'Build this record'}</Text></View><Pressable accessibilityRole="button" onPress={() => openHistory()} style={s.openHistory}><Text style={s.openHistoryText}>FULL TIMELINE ↗</Text></Pressable></View>
          {connected.length ? <View style={s.recordList}>
            {connected.map((item, index) => {
              const tint = relationTint(item.kind);
              return <View key={`${item.link.id}:${item.id}`} style={s.recordRow}>
                <View style={s.axis}><View style={[s.axisLine, index === connected.length - 1 && s.axisLast]} /><View style={[s.nodeHalo, { backgroundColor: tint.pale }]}><View style={[s.node, { backgroundColor: tint.node }]}><Text style={s.nodeGlyph}>{item.kind === 'treatment' ? '＋' : item.kind === 'visit' ? '⌂' : item.kind === 'asset' ? '▤' : '✳'}</Text></View></View></View>
                <View style={s.recordCard}>
                  <View style={s.recordMeta}><Text style={[s.kindLabel, { color: tint.ink }]}>{item.category.toUpperCase()}</Text><Text style={s.recordDate}>{readableDate(item.date)}</Text></View>
                  <Text style={s.recordTitle}>{item.title}</Text><Text style={s.recordDetail}>{item.detail}</Text>
                  <View style={s.recordSource}><Text style={s.sourceGlyph}>▤</Text><Text style={s.sourceText}>{item.source}</Text></View>
                  <View style={s.linkMeaning}><Text style={s.linkMeaningText}>{item.link.label}</Text></View>
                  <View style={s.recordFooter}><View style={[s.statusPill, item.status === 'Confirmed by you' ? s.statusConfirmed : null]}><Text style={[s.statusText, item.status === 'Confirmed by you' ? s.statusConfirmedText : null]}>{item.status}</Text></View><Pressable accessibilityRole="button" onPress={() => openHistory(item.id)} style={({ pressed }) => [s.sourceAction, pressed && s.pressed]}><Text style={s.sourceActionText}>Source + timeline ↗</Text></Pressable></View>
                </View>
              </View>;
            })}
          </View> : <View style={s.emptyCard}><View style={s.emptyNode}><Text style={s.emptyGlyph}>＋</Text></View><Text style={s.emptyTitle}>No records connected to {topic.label} yet</Text><Text style={s.emptyBody}>Your saved information stays in the timeline until you explicitly connect a record here. Nura will not guess that a record belongs to this area.</Text><Pressable accessibilityRole="button" onPress={openConnect} style={s.emptyPrimary}><Text style={s.emptyPrimaryText}>CONNECT AN EXISTING RECORD</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/intake')} style={s.emptySecondary}><Text style={s.emptySecondaryText}>Add a health record</Text></Pressable></View>}
          <View style={s.note}><Text style={s.noteMark}>i</Text><Text style={s.noteText}>Lines and labels record associations you made. They do not mean one event caused another.</Text></View>
        </>}
      </> : <View style={s.emptyCard}><View style={s.emptyNode}><Text style={s.emptyGlyph}>✳</Text></View><Text style={s.emptyTitle}>Choose a health area to start</Text><Text style={s.emptyBody}>Your registry organizes only the focus areas you select. Add one from profile setup, or place a health record in your timeline first.</Text><Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/profile')} style={s.emptyPrimary}><Text style={s.emptyPrimaryText}>OPEN YOUR PROFILE</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/intake')} style={s.emptySecondary}><Text style={s.emptySecondaryText}>Add a health record</Text></Pressable></View>}
    </ScrollView>

    <Modal visible={connectOpen} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setConnectOpen(false)}>
      <View style={s.modalShade}><View style={s.modalCard}><View style={s.modalHandle} /><View style={s.modalHead}><View style={{ flex: 1 }}><Text style={s.modalKicker}>MAKE AN EXPLICIT LINK</Text><Text style={s.modalTitle}>Connect to {topic?.label ?? 'this area'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close connect record sheet" onPress={() => setConnectOpen(false)} style={s.closeButton}><Text style={s.closeText}>×</Text></Pressable></View>
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
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.canvas }, content: { paddingHorizontal: 20, paddingTop: 43, paddingBottom: 32, maxWidth: 580, width: '100%', alignSelf: 'center' },
  topbar: { minHeight: 42, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 23 }, backButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 18, backgroundColor: C.white, borderWidth: 1, borderColor: C.border }, backGlyph: { color: C.plum, fontSize: 23, lineHeight: 25 }, backText: { color: C.muted, fontSize: 10, fontWeight: '600' }, brand: { alignItems: 'flex-end' }, wordmark: { color: C.plum, fontSize: 19, fontWeight: '700', letterSpacing: -.4 }, tagline: { color: C.faint, fontSize: 6.5, fontWeight: '700', letterSpacing: 1.35, marginTop: 2 },
  eyebrow: { color: C.lilacInk, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 }, title: { color: C.ink, fontSize: 31, lineHeight: 37, fontWeight: '400', letterSpacing: -1, marginTop: 6 }, subtitle: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, notice: { backgroundColor: C.white, borderRadius: 15, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 19 }, noticeTitle: { color: C.ink, fontSize: 12, fontWeight: '600' }, body: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  topicRail: { flexDirection: 'row', gap: 8, paddingTop: 20, paddingBottom: 13 }, topicChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.border }, topicChipSelected: { backgroundColor: '#EFE7F3', borderColor: '#CEBED8' }, topicDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#B9B4BF' }, topicDotSelected: { backgroundColor: C.plum }, topicText: { color: C.muted, fontSize: 10, fontWeight: '500' }, topicTextSelected: { color: C.plum, fontWeight: '700' },
  topicHero: { backgroundColor: C.white, borderRadius: 23, borderWidth: 1, borderColor: '#DED7E4', padding: 17, marginTop: 4, shadowColor: '#30263D', shadowOpacity: .04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, heroIcon: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.lilac, borderWidth: 1, borderColor: '#E0D4E8' }, heroIconText: { color: C.lilacInk, fontSize: 20 }, heroBadge: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 15, backgroundColor: '#F6F3F8', borderWidth: 1, borderColor: '#EAE4EF' }, badgeDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: C.lilacInk }, badgeText: { color: C.lilacInk, fontSize: 7, fontWeight: '800', letterSpacing: .8 }, topicTitle: { color: C.ink, fontSize: 25, fontWeight: '500', marginTop: 13 }, topicCaveat: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }, statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 17, paddingTop: 13, borderTopWidth: 1, borderTopColor: C.border }, stat: { flex: 1, alignItems: 'center', gap: 2 }, statValue: { color: C.ink, fontSize: 18, fontWeight: '500' }, statLabel: { color: C.faint, fontSize: 6.5, fontWeight: '800', letterSpacing: .7, textAlign: 'center' }, statRule: { width: 1, height: 29, backgroundColor: C.border }, heroActions: { gap: 8, marginTop: 15 }, askButton: { minHeight: 44, borderRadius: 15, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, askButtonText: { color: C.white, fontSize: 11, fontWeight: '700' }, connectButton: { minHeight: 42, borderRadius: 15, backgroundColor: C.bluePale, borderWidth: 1, borderColor: '#D7E5FF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, connectButtonText: { color: C.cobalt, fontSize: 10, fontWeight: '700' },
  briefCard: { backgroundColor: C.white, borderWidth: 1, borderColor: '#D8E3F8', borderRadius: 20, padding: 15, marginTop: 13, shadowColor: '#214C96', shadowOpacity: .035, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }, briefTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, briefKicker: { color: C.cobalt, fontSize: 7, fontWeight: '800', letterSpacing: 1.1 }, briefTitle: { color: C.ink, fontSize: 16, fontWeight: '600', marginTop: 4 }, briefStatus: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1 }, briefFresh: { backgroundColor: C.mint, borderColor: '#C6E5D5' }, briefFreshText: { color: C.mintInk }, briefStale: { backgroundColor: C.amber, borderColor: '#F0DDBB' }, briefStaleText: { color: C.amberInk }, briefReady: { backgroundColor: C.bluePale, borderColor: '#D3E2FC' }, briefReadyText: { color: C.cobalt }, briefEmpty: { backgroundColor: '#F3F1F4', borderColor: C.border }, briefEmptyText: { color: C.muted }, briefStatusText: { fontSize: 6.5, fontWeight: '800', letterSpacing: .5 }, briefDate: { color: C.faint, fontSize: 8, marginTop: 7 }, briefWarning: { color: C.amberInk, fontSize: 9, lineHeight: 14, backgroundColor: '#FFF7E8', borderRadius: 10, padding: 9, marginTop: 9 }, briefAnswer: { color: C.ink, fontSize: 10, lineHeight: 16, marginTop: 10 }, summaryToggle: { minHeight: 34, justifyContent: 'center' }, briefUnknowns: { backgroundColor: '#FFF7E8', borderRadius: 10, padding: 9, marginTop: 9 }, briefUnknownTitle: { color: C.amberInk, fontSize: 7, fontWeight: '800', letterSpacing: .75 }, briefUnknownText: { color: C.ink, fontSize: 9, lineHeight: 14, marginTop: 4 }, briefSourcesTitle: { color: C.lilacInk, fontSize: 7, fontWeight: '800', letterSpacing: .9, marginTop: 12, marginBottom: 2 }, briefCitation: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.bluePale, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginTop: 5 }, briefCitationRef: { width: 21, color: C.cobalt, fontSize: 8, fontWeight: '800' }, briefCitationTitle: { color: C.ink, fontSize: 9, fontWeight: '600' }, briefCitationDetail: { color: C.muted, fontSize: 7, marginTop: 2 }, briefArrow: { color: C.cobalt, fontSize: 17 }, briefIntro: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 9 }, earlierToggle: { minHeight: 34, justifyContent: 'center', marginTop: 3 }, earlierToggleText: { color: C.cobalt, fontSize: 8, fontWeight: '600' }, earlierBrief: { backgroundColor: '#F8F7F9', borderRadius: 10, padding: 9, marginTop: 6 }, earlierDate: { color: C.faint, fontSize: 7 }, earlierAnswer: { color: C.muted, fontSize: 8, lineHeight: 13, marginTop: 4 }, briefAction: { minHeight: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cobalt, borderRadius: 13, marginTop: 11, paddingHorizontal: 10 }, briefActionDisabled: { backgroundColor: '#AEB8CC' }, briefActionText: { color: C.white, fontSize: 7.5, fontWeight: '800', letterSpacing: .6 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 23, marginBottom: 11 }, sectionKicker: { color: C.lilacInk, fontSize: 7.5, fontWeight: '800', letterSpacing: 1.25 }, sectionTitle: { color: C.ink, fontSize: 16, fontWeight: '500', marginTop: 4 }, openHistory: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.border }, openHistoryText: { color: C.cobalt, fontSize: 7.5, fontWeight: '800', letterSpacing: .5 }, recordList: { gap: 0 }, recordRow: { flexDirection: 'row', alignItems: 'stretch', gap: 9 }, axis: { width: 37, alignItems: 'center', position: 'relative' }, axisLine: { position: 'absolute', top: 0, bottom: -4, width: 2, backgroundColor: C.blueLine }, axisLast: { bottom: '50%' }, nodeHalo: { width: 37, height: 37, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginTop: 10, zIndex: 1, borderWidth: 1, borderColor: '#FFFFFF' }, node: { width: 28, height: 28, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.65)' }, nodeGlyph: { color: C.white, fontSize: 13, fontWeight: '600' }, recordCard: { flex: 1, backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 13, marginBottom: 11 }, recordMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, kindLabel: { flex: 1, fontSize: 7, fontWeight: '800', letterSpacing: .8 }, recordDate: { color: C.faint, fontSize: 8 }, recordTitle: { color: C.ink, fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 6 }, recordDetail: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, recordSource: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 9 }, sourceGlyph: { color: C.cobalt, fontSize: 10 }, sourceText: { color: C.muted, flex: 1, fontSize: 8.5, lineHeight: 13 }, linkMeaning: { backgroundColor: '#F7F4F9', borderWidth: 1, borderColor: '#E9E1EE', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginTop: 8 }, linkMeaningText: { color: C.lilacInk, fontSize: 8, lineHeight: 12 }, recordFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#F0EDF2' }, statusPill: { maxWidth: '51%', borderRadius: 12, backgroundColor: '#F1EFF3', paddingHorizontal: 8, paddingVertical: 5 }, statusText: { color: C.muted, fontSize: 7, fontWeight: '700' }, statusConfirmed: { backgroundColor: C.mint }, statusConfirmedText: { color: C.mintInk }, sourceAction: { paddingVertical: 5, paddingHorizontal: 7 }, sourceActionText: { color: C.cobalt, fontSize: 8, fontWeight: '700' }, pressed: { opacity: .86, transform: [{ scale: motion.pressScale }] },
  emptyCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 19, alignItems: 'center', marginTop: 6 }, emptyNode: { width: 45, height: 45, borderRadius: 23, backgroundColor: C.bluePale, alignItems: 'center', justifyContent: 'center' }, emptyGlyph: { color: C.cobalt, fontSize: 22, fontWeight: '300' }, emptyTitle: { color: C.ink, fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'center', marginTop: 11 }, emptyBody: { color: C.muted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 6 }, emptyPrimary: { minHeight: 42, width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: C.cobalt, marginTop: 13, paddingHorizontal: 12 }, emptyPrimaryText: { color: C.white, fontSize: 8, fontWeight: '800', letterSpacing: .7 }, emptySecondary: { paddingVertical: 11, paddingHorizontal: 12 }, emptySecondaryText: { color: C.cobalt, fontSize: 10, fontWeight: '600' }, note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F4F0F6', borderRadius: 13, padding: 11, marginTop: 13 }, noteMark: { width: 17, height: 17, borderRadius: 9, textAlign: 'center', lineHeight: 17, color: C.lilacInk, backgroundColor: '#E5D9EC', fontSize: 9, fontWeight: '700' }, noteText: { color: C.muted, flex: 1, fontSize: 8, lineHeight: 13 },
  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(28,23,34,.46)' }, modalCard: { width: '100%', maxWidth: 480, maxHeight: '90%', alignSelf: 'center', backgroundColor: C.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24 }, modalHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#D2CDD7', alignSelf: 'center', marginBottom: 15 }, modalHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, modalKicker: { color: C.lilacInk, fontSize: 7, fontWeight: '800', letterSpacing: 1.1 }, modalTitle: { color: C.ink, fontSize: 20, fontWeight: '500', marginTop: 4 }, closeButton: { width: 31, height: 31, borderRadius: 16, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }, closeText: { color: C.muted, fontSize: 22, lineHeight: 24 }, modalHelp: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 7, marginBottom: 8 }, choiceList: { maxHeight: 290 }, choice: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 10, marginTop: 6 }, choiceSelected: { borderColor: C.cobalt, backgroundColor: '#F5F8FF' }, choiceNode: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, choiceNodeGlyph: { color: C.white, fontSize: 13 }, choiceTitle: { color: C.ink, fontSize: 10, fontWeight: '600' }, choiceDetail: { color: C.muted, fontSize: 8, marginTop: 3 }, choiceSource: { color: C.faint, fontSize: 7.5, marginTop: 3 }, choiceCheck: { width: 20, textAlign: 'center', color: C.cobalt, fontSize: 16 }, noChoices: { backgroundColor: C.white, padding: 13, borderRadius: 14, marginTop: 7 }, relationBox: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 11, marginTop: 10 }, relationWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }, relationChip: { borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.canvas, paddingHorizontal: 9, paddingVertical: 7 }, relationSelected: { borderColor: '#B7D0FC', backgroundColor: C.bluePale }, relationText: { color: C.muted, fontSize: 7.5 }, relationTextSelected: { color: C.cobalt, fontWeight: '700' }, previewText: { color: C.muted, fontSize: 8, lineHeight: 12, marginTop: 8 }, modalError: { color: '#9B4640', fontSize: 9, lineHeight: 14, marginTop: 8 }, modalSave: { minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: C.cobalt, marginTop: 12 }, modalSaveText: { color: C.white, fontSize: 8, fontWeight: '800', letterSpacing: .75 }, disabled: { opacity: .38 }, modalCancel: { minHeight: 38, alignItems: 'center', justifyContent: 'center' }, modalCancelText: { color: C.muted, fontSize: 10 },
});
