import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { AccessibilityInfo, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Orb } from '../src/components/Orb';
import { Label, Surface } from '../src/components/Surface';
import { HealthFact, useNura } from '../src/state/NuraContext';
import { groupInsurancePolicyTerms } from '../src/services/insurancePolicyHistory.mjs';
import { comparePolicyDocuments } from '../src/services/policyReplacement.mjs';
import { colors, radius } from '../src/theme';

function displayDate(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

type PolicyComparisonRow = {
  key: string;
  label: string;
  status: 'same' | 'different' | 'ambiguous' | 'only_newer' | 'only_older';
  newerTerms: HealthFact[];
  olderTerms: HealthFact[];
};

function TermEntry({ term, kind }: { term: HealthFact; kind: 'current' | 'previous' | 'removed' }) {
  const badge = kind === 'current' ? 'IN YOUR RECORD' : kind === 'removed' ? 'REMOVED BY YOU' : 'EARLIER VERSION';
  const sourceDate = displayDate(term.date);
  const endDate = displayDate(term.validUntil);
  return <View style={[styles.term, kind !== 'current' && styles.previousTerm]}>
    <View style={styles.termTop}><Text style={styles.termLabel}>{term.label}</Text><Text style={[styles.termType, kind !== 'current' && styles.previousTermType]}>{badge}</Text></View>
    <Text style={styles.termValue}>{term.value}</Text>
    {term.note ? <Text style={styles.sourceNote}><Text style={styles.sourceNoteLead}>SOURCE DETAILS · </Text>{term.note}</Text> : <Text style={styles.quoteMissing}>Open the original document to inspect its page and wording.</Text>}
    <Text style={styles.termMeta}>{term.source}{sourceDate ? ` · Record date ${sourceDate}` : ''}{endDate ? ` · Version ended ${endDate}` : ''}</Text>
  </View>;
}

export default function InsuranceRegistry() {
  const { facts, assets, policyReplacements, addPolicyReplacement, removePolicyReplacement } = useNura();
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [replacementFor, setReplacementFor] = useState<string | null>(null);
  const [olderSourceChoice, setOlderSourceChoice] = useState<string | null>(null);
  const [savingReplacement, setSavingReplacement] = useState(false);
  const [removingReplacement, setRemovingReplacement] = useState<string | null>(null);
  const [replacementError, setReplacementError] = useState<{ sourceId: string; message: string } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  const policies = useMemo(() => groupInsurancePolicyTerms(facts), [facts]);
  const policyBySource = useMemo(() => new Map(policies.map((policy) => [policy.sourceId, policy])), [policies]);
  const waiting = assets.filter((asset) => asset.purpose === 'insurance' && !asset.serverSourceId);
  const termCount = policies.reduce((total, policy) => total + policy.currentTerms.length + policy.previousTerms.length + policy.removedTerms.length, 0);
  const historyCount = policies.reduce((total, policy) => total + policy.previousTerms.length + policy.removedTerms.length, 0);

  function toggleHistory(sourceId: string) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedHistory((current) => current === sourceId ? null : sourceId);
  }

  function openPolicySource(sourceId: string) {
    const asset = assets.find((item) => item.serverSourceId === sourceId);
    if (!asset) return;
    router.push({ pathname: '/review', params: { purpose: 'insurance', assetId: asset.id } });
  }

  async function saveReplacement(newerSourceId: string) {
    if (!olderSourceChoice || savingReplacement) return;
    setSavingReplacement(true);
    setReplacementError(null);
    try {
      const saved = await addPolicyReplacement(newerSourceId, olderSourceChoice);
      if (!saved) {
        setReplacementError({ sourceId: newerSourceId, message: 'This policy link could not be saved. Check that both documents are still in your policy record.' });
        return;
      }
      if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setReplacementFor(null);
      setOlderSourceChoice(null);
    } catch {
      setReplacementError({ sourceId: newerSourceId, message: 'Nura could not save this policy link. Please try again.' });
    } finally {
      setSavingReplacement(false);
    }
  }

  return <View style={styles.page}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}><Text style={styles.back}>‹  Back</Text></Pressable>
    <View style={styles.brandRow}><Orb size={38} /><View style={{ flex: 1 }}><Text style={styles.brand}>nura</Text><Text style={styles.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View><Text style={styles.privacy}>PRIVATE BY DESIGN</Text></View>
    <Label>YOUR COVERAGE · SOURCE-LINKED</Label>
    <View style={styles.titleRow}><View style={{ flex: 1 }}><Text style={styles.title}>Insurance</Text><Text style={styles.subtitle}>Policy terms, kept with the pages they came from.</Text></View><View style={styles.countBadge}><Text style={styles.countNumber}>{String(policies.length).padStart(2, '0')}</Text><Text style={styles.countLabel}>SOURCES</Text></View></View>

    <Surface style={styles.summary}>
      <Text style={styles.summaryTitle}>A clear record of what the document says.</Text>
      <Text style={styles.summaryBody}>Nura can organize benefits, limits, deductibles, copays and exclusions you confirm from a policy. A missing clause stays “not found” or “unclear”—it is not treated as proof of a coverage gap.</Text>
      <View style={styles.summaryFoot}><Text style={styles.summaryStat}>{String(termCount).padStart(2, '0')} saved entries</Text><Text style={styles.summaryDot}>·</Text><Text style={styles.summaryStat}>{String(historyCount).padStart(2, '0')} earlier or removed</Text></View>
    </Surface>

    {waiting.length > 0 && <Surface style={styles.waitingCard}><Label>READY FOR SOURCE REVIEW · {waiting.length}</Label>{waiting.map((asset) => <View key={asset.id} style={styles.waitingRow}><View style={styles.fileIcon}><Text style={styles.fileIconText}>PDF</Text></View><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.policyName}>{asset.name}</Text><Text style={styles.muted}>Saved on this device · not yet analyzed</Text></View><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/review', params: { purpose: 'insurance' } })}><Text style={styles.link}>Review →</Text></Pressable></View>)}</Surface>}

    <View style={styles.sectionHead}><View><Label>YOUR POLICIES</Label><Text style={styles.sectionTitle}>{policies.length ? 'Terms and review history' : 'No policy added yet'}</Text></View><Text style={styles.sectionCount}>{String(policies.length).padStart(2, '0')}</Text></View>
    {policies.length ? policies.map((policy) => {
      const olderChoices = policies.filter((candidate) => candidate.sourceId !== policy.sourceId);
      const sourceLinks = policyReplacements.filter((link) => link.newerSourceId === policy.sourceId || link.olderSourceId === policy.sourceId);
      return <Surface key={policy.sourceId} style={styles.policyCard}>
      <View style={styles.policyHead}><View style={styles.policyMark}><Text style={styles.policyMarkText}>▤</Text></View><View style={{ flex: 1 }}><Text style={styles.policyEyebrow}>POLICY SOURCE</Text><Text style={styles.policyName}>{policy.sourceName}</Text></View><Text style={styles.sourceLinked}>LINKED</Text></View>
      <View style={styles.sourceBand}><Text style={styles.sourceBandIcon}>⌑</Text><Text style={styles.sourceBandText}>Source file · {policy.currentTerms.length} current entr{policy.currentTerms.length === 1 ? 'y' : 'ies'} · {policy.previousTerms.length} earlier · {policy.removedTerms.length} removed</Text></View>
      {replacementError?.sourceId === policy.sourceId && <Text accessibilityRole="alert" style={styles.replacementError}>{replacementError.message}</Text>}
      {assets.find((asset) => asset.serverSourceId === policy.sourceId) && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/review', params: { purpose: 'insurance', assetId: assets.find((asset) => asset.serverSourceId === policy.sourceId)?.id } })} style={styles.sourceAction}><Text style={styles.sourceActionText}>OPEN ORIGINAL SOURCE AND REVIEW  ↗</Text></Pressable>}
      {policy.currentTerms.map((term) => <TermEntry key={term.id} term={term} kind="current" />)}
      {policy.currentTerms.length === 0 && <Text style={styles.noCurrentTerms}>No current entries are saved from this document. Its review history remains available below.</Text>}
      {(policy.previousTerms.length > 0 || policy.removedTerms.length > 0) && <>
        <Pressable accessibilityRole="button" accessibilityLabel={`Review history for ${policy.sourceName}`} accessibilityState={{ expanded: expandedHistory === policy.sourceId }} onPress={() => toggleHistory(policy.sourceId)} style={({ pressed }) => [styles.historyToggle, pressed && styles.historyTogglePressed]}>
          <View style={{ flex: 1 }}><Text style={styles.historyTitle}>{expandedHistory === policy.sourceId ? 'HIDE REVIEW HISTORY' : 'SHOW REVIEW HISTORY'}</Text><Text style={styles.historySubtitle}>{policy.previousTerms.length} earlier version{policy.previousTerms.length === 1 ? '' : 's'} · {policy.removedTerms.length} removed by you</Text></View><Text style={styles.historyArrow}>{expandedHistory === policy.sourceId ? '−' : '+'}</Text>
        </Pressable>
        {expandedHistory === policy.sourceId && <View style={styles.historyEntries}>{policy.previousTerms.map((term) => <TermEntry key={term.id} term={term} kind="previous" />)}{policy.removedTerms.map((term) => <TermEntry key={term.id} term={term} kind="removed" />)}</View>}
      </>}
      {sourceLinks.map((link) => {
        const isReplacing = link.newerSourceId === policy.sourceId;
        const counterpartId = isReplacing ? link.olderSourceId : link.newerSourceId;
        const counterpart = policyBySource.get(counterpartId);
        if (!counterpart) return null;
        if (!isReplacing) return <View key={link.id} style={styles.relationshipNotice}><Text style={styles.relationshipTitle}>YOU MARKED THIS POLICY AS REPLACED BY</Text><Text style={styles.relationshipSource}>{counterpart.sourceName}</Text><Text style={styles.relationshipNote}>This is your document link. Nura does not infer which policy is currently active.</Text><Pressable accessibilityRole="button" accessibilityLabel={`Open ${counterpart.sourceName}`} onPress={() => openPolicySource(counterpartId)} style={styles.relationSourceButton}><Text style={styles.relationSourceButtonText}>OPEN LINKED SOURCE  ↗</Text></Pressable></View>;
        const comparisonRows = comparePolicyDocuments(policy, counterpart) as PolicyComparisonRow[];
        return <View key={link.id} style={styles.comparisonCard}>
          <View style={styles.comparisonHeading}><View style={{ flex: 1 }}><Text style={styles.relationshipTitle}>YOU MARKED THIS DOCUMENT AS REPLACING</Text><Text style={styles.relationshipSource}>{counterpart.sourceName}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Remove policy document link" disabled={removingReplacement === link.id} onPress={async () => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setRemovingReplacement(link.id); setReplacementError(null); try { await removePolicyReplacement(link.id); } catch { setReplacementError({ sourceId: policy.sourceId, message: 'Nura could not remove this policy link. Please try again.' }); } finally { setRemovingReplacement(null); } }} style={styles.removeRelation}><Text style={styles.removeRelationText}>{removingReplacement === link.id ? 'SAVING…' : 'REMOVE LINK'}</Text></Pressable></View>
          <Text style={styles.comparisonNote}>This link records your understanding of the documents. Different saved wording is shown for review; missing wording is not treated as an exclusion, and this does not establish active coverage.</Text>
          {comparisonRows.length === 0 ? <Text style={styles.noComparison}>No matching accepted policy terms are available in both records yet.</Text> : comparisonRows.map((row) => {
            const statusLabel = row.status === 'different' ? 'DIFFERENT SAVED VALUES' : row.status === 'same' ? 'SAME SAVED VALUE' : row.status === 'ambiguous' ? 'MULTIPLE MATCHING ENTRIES · REVIEW' : row.status === 'only_newer' ? 'NO ACCEPTED ENTRY IN EARLIER RECORD' : 'NO ACCEPTED ENTRY IN NEWER RECORD';
            const values = (terms: typeof row.newerTerms) => terms.length ? terms.map((term) => term.value).join(' · ') : 'No accepted entry with this label in this document.';
            return <View key={row.key} style={[styles.comparisonRow, row.status === 'different' && styles.comparisonDifferent]}>
              <View style={styles.comparisonTitleRow}><Text style={styles.comparisonTermLabel}>{row.label}</Text><Text style={[styles.comparisonStatus, row.status === 'different' && styles.comparisonStatusDifferent]}>{statusLabel}</Text></View>
              <Text style={styles.comparisonSideLabel}>THIS DOCUMENT · {policy.sourceName}</Text><Text style={styles.comparisonValue}>{values(row.newerTerms)}</Text>
              <Text style={styles.comparisonSideLabel}>EARLIER DOCUMENT · {counterpart.sourceName}</Text><Text style={styles.comparisonValue}>{values(row.olderTerms)}</Text>
            </View>;
          })}
          <View style={styles.relationActions}><Pressable accessibilityRole="button" accessibilityLabel={`Open this policy source, ${policy.sourceName}`} onPress={() => openPolicySource(policy.sourceId)} style={styles.relationSourceButton}><Text style={styles.relationSourceButtonText}>OPEN THIS SOURCE  ↗</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Open earlier policy source, ${counterpart.sourceName}`} onPress={() => openPolicySource(counterpartId)} style={styles.relationSourceButton}><Text style={styles.relationSourceButtonText}>OPEN EARLIER SOURCE  ↗</Text></Pressable></View>
        </View>;
      })}
      {olderChoices.length > 0 && <>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: replacementFor === policy.sourceId }} onPress={() => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setReplacementFor((current) => current === policy.sourceId ? null : policy.sourceId); setOlderSourceChoice(null); setReplacementError(null); }} style={styles.linkOlderButton}><Text style={styles.linkOlderButtonText}>{replacementFor === policy.sourceId ? 'CANCEL POLICY LINK' : 'LINK AN EARLIER POLICY'}</Text></Pressable>
        {replacementFor === policy.sourceId && <View style={styles.linkChooser}><Text style={styles.linkChooserTitle}>Which earlier document does this replace?</Text><Text style={styles.linkChooserNote}>Choose only if you know this policy document supersedes the other one.</Text>{olderChoices.map((candidate) => <Pressable key={candidate.sourceId} accessibilityRole="button" accessibilityState={{ selected: olderSourceChoice === candidate.sourceId }} onPress={() => setOlderSourceChoice(candidate.sourceId)} style={[styles.olderChoice, olderSourceChoice === candidate.sourceId && styles.olderChoiceSelected]}><Text style={styles.olderChoiceTitle}>{candidate.sourceName}</Text><Text style={styles.olderChoiceMeta}>{candidate.currentTerms.length} current accepted entr{candidate.currentTerms.length === 1 ? 'y' : 'ies'}</Text></Pressable>)}{olderSourceChoice && <Pressable accessibilityRole="button" disabled={savingReplacement} onPress={() => void saveReplacement(policy.sourceId)} style={[styles.confirmReplacement, savingReplacement && styles.disabled]}><Text style={styles.confirmReplacementText}>{savingReplacement ? 'SAVING POLICY LINK…' : `CONFIRM · THIS DOCUMENT REPLACES ${policyBySource.get(olderSourceChoice)?.sourceName ?? 'EARLIER POLICY'}`}</Text></Pressable>}</View>}
      </>}
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/ask', params: { context: 'your insurance policy and health profile', question: 'Based on the confirmed policy terms and the health details I choose to share, what is explicitly covered, what is explicitly limited or excluded, and what remains unclear?' } })} style={styles.askAction}>
        <View style={styles.askOrb}><Orb size={22} /></View><View style={{ flex: 1 }}><Text style={styles.askTitle}>Ask Nura about this policy</Text><Text style={styles.askSubtitle}>Compare source terms with selected profile details</Text></View><Text style={styles.askArrow}>→</Text>
      </Pressable>
    </Surface>;
    }) : <Surface style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Text style={styles.emptyGlyph}>▤</Text></View>
      <Text style={styles.emptyTitle}>Your policy record starts with a document.</Text>
      <Text style={styles.emptyBody}>Add a benefits summary or policy schedule. Nura will show the extracted wording beside its page quote so you can accept, edit or dismiss each term.</Text>
      <View style={styles.emptySteps}><Text style={styles.step}>01  Add a policy PDF or photo</Text><Text style={styles.step}>02  Review quoted terms</Text><Text style={styles.step}>03  Ask what the evidence supports</Text></View>
    </Surface>}

    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/intake', params: { purpose: 'insurance' } })} style={styles.primary}><View style={{ flex: 1 }}><Text style={styles.primaryTitle}>ADD A POLICY DOCUMENT</Text><Text style={styles.primarySub}>PDF or clear page photo</Text></View><Text style={styles.primaryArrow}>↗</Text></Pressable>
    <Text style={styles.disclaimer}>Policy summaries are for organizing your records, not a coverage determination. Confirm important questions with your insurer.</Text>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, maxWidth: 560, width: '100%', alignSelf: 'center' },
  back: { color: colors.muted, fontSize: 14, marginBottom: 15 }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 27 }, brand: { color: colors.plum, fontSize: 18, fontWeight: '700', letterSpacing: -0.5 }, tagline: { color: colors.quiet, fontSize: 7, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 }, privacy: { color: colors.quiet, fontSize: 7, letterSpacing: 1.2, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7, marginBottom: 17, gap: 12 }, title: { color: colors.ink, fontSize: 31, fontWeight: '300', letterSpacing: -0.8 }, subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 }, countBadge: { width: 58, height: 54, borderRadius: 15, backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center' }, countNumber: { color: colors.cobalt, fontSize: 20, fontWeight: '600' }, countLabel: { color: '#6F7F9A', fontSize: 6, letterSpacing: 1, marginTop: 1 },
  summary: { backgroundColor: '#392A4B', borderColor: '#5A496A', marginBottom: 24 }, summaryTitle: { color: '#FBF6F0', fontSize: 16, fontWeight: '600' }, summaryBody: { color: 'rgba(251,246,240,.82)', fontSize: 11, lineHeight: 17, marginTop: 8 }, summaryFoot: { flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.18)', marginTop: 12, paddingTop: 10 }, summaryStat: { color: '#E0D3EA', fontSize: 9, fontWeight: '600' }, summaryDot: { color: '#EAB58E', fontSize: 13 },
  waitingCard: { marginBottom: 18, padding: 14 }, waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 11 }, fileIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center' }, fileIconText: { color: colors.cobalt, fontSize: 8, fontWeight: '700' }, policyName: { color: colors.ink, fontSize: 13, fontWeight: '600' }, muted: { color: colors.quiet, fontSize: 9, marginTop: 3 }, link: { color: colors.cobalt, fontSize: 10, fontWeight: '700' },
  sourceAction: { alignSelf: 'flex-start', marginTop: 7, paddingVertical: 4 }, sourceActionText: { color: colors.cobalt, fontSize: 7, fontWeight: '700', letterSpacing: .7 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }, sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '500', marginTop: 4 }, sectionCount: { color: '#918A99', fontSize: 11 }, policyCard: { marginBottom: 13, padding: 14 }, policyHead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, policyMark: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center' }, policyMarkText: { color: colors.cobalt, fontSize: 17 }, policyEyebrow: { color: '#92899A', fontSize: 7, fontWeight: '700', letterSpacing: 1.1 }, sourceLinked: { color: '#60456D', backgroundColor: '#F0E6F1', fontSize: 7, fontWeight: '700', letterSpacing: 0.7, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 }, sourceBand: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, backgroundColor: colors.bluePale, padding: 9, marginTop: 12 }, sourceBandIcon: { color: colors.cobalt, fontSize: 12 }, sourceBandText: { color: '#4A668D', fontSize: 9, fontWeight: '500', flex: 1 }, term: { borderTopWidth: 1, borderTopColor: '#EBE8EF', paddingTop: 12, marginTop: 12 }, previousTerm: { borderTopColor: '#E7DDEA' }, termTop: { flexDirection: 'row', alignItems: 'center', gap: 7 }, termLabel: { color: colors.ink, fontSize: 13, fontWeight: '600', flex: 1 }, termType: { color: colors.cobalt, backgroundColor: colors.bluePale, fontSize: 6, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 }, previousTermType: { color: '#684F71', backgroundColor: '#F0E6F1' }, termValue: { color: '#4C4854', fontSize: 11, lineHeight: 16, marginTop: 5 }, sourceNote: { color: '#716A79', fontSize: 10, lineHeight: 15, backgroundColor: '#F5F2F6', padding: 9, borderRadius: 9, marginTop: 8 }, sourceNoteLead: { color: '#684F71', fontSize: 8, fontWeight: '700', letterSpacing: 0.5 }, quoteMissing: { color: '#8C6C32', fontSize: 9, lineHeight: 14, marginTop: 8 }, termMeta: { color: '#918A99', fontSize: 8, marginTop: 6 }, noCurrentTerms: { color: '#716A79', fontSize: 10, lineHeight: 15, marginTop: 12 }, historyToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E7DDEA', marginTop: 14, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F6EFF7' }, historyTogglePressed: { backgroundColor: '#EFE4F0' }, historyTitle: { color: '#5F4569', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }, historySubtitle: { color: '#817687', fontSize: 8, marginTop: 3 }, historyArrow: { color: '#5F4569', fontSize: 20, fontWeight: '500', marginLeft: 12 }, historyEntries: { paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: '#CFB6D0', marginLeft: 4 },
  relationshipNotice: { backgroundColor: '#F3EDF5', borderWidth: 1, borderColor: '#E3D6E8', borderRadius: 14, padding: 11, marginTop: 12 }, relationshipTitle: { color: colors.violet, fontSize: 8, fontWeight: '800', letterSpacing: 0.75, lineHeight: 12 }, relationshipSource: { color: colors.ink, fontSize: 11, fontWeight: '700', lineHeight: 15, marginTop: 4 }, relationshipNote: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 5 }, relationSourceButton: { minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 11, backgroundColor: colors.bluePale, borderWidth: 1, borderColor: '#C9DBFA', paddingHorizontal: 10, marginTop: 8 }, relationSourceButtonText: { color: colors.cobalt, fontSize: 8, fontWeight: '800', letterSpacing: 0.55 },
  comparisonCard: { backgroundColor: '#F5F0F6', borderWidth: 1, borderColor: '#E3D7E8', borderRadius: 15, padding: 11, marginTop: 12 }, comparisonHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 }, removeRelation: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E3D2C1', backgroundColor: '#FFF9F1' }, removeRelationText: { color: '#93633A', fontSize: 7, fontWeight: '800', letterSpacing: 0.5 }, comparisonNote: { color: '#665E6B', fontSize: 9, lineHeight: 14, marginTop: 8 }, noComparison: { color: colors.muted, fontSize: 9, lineHeight: 13, backgroundColor: colors.surface, borderRadius: 10, padding: 9, marginTop: 9 }, comparisonRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#E6DFE9', borderRadius: 12, padding: 9, marginTop: 8 }, comparisonDifferent: { backgroundColor: '#FFF7EF', borderColor: '#EBD6C0' }, comparisonTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }, comparisonTermLabel: { flex: 1, color: colors.ink, fontSize: 10, fontWeight: '700' }, comparisonStatus: { color: colors.violet, fontSize: 6, fontWeight: '800', letterSpacing: 0.4, textAlign: 'right', maxWidth: '56%' }, comparisonStatusDifferent: { color: '#9A6327' }, comparisonSideLabel: { color: '#817687', fontSize: 7, fontWeight: '800', letterSpacing: 0.35, marginTop: 7 }, comparisonValue: { color: '#4C4653', fontSize: 9, lineHeight: 13, marginTop: 2 }, relationActions: { gap: 2, marginTop: 4 },
  linkOlderButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#EEE7F1', borderWidth: 1, borderColor: '#DED2E4', marginTop: 10 }, linkOlderButtonText: { color: colors.violet, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 }, linkChooser: { backgroundColor: '#F7F2F8', borderWidth: 1, borderColor: '#E4D9EA', borderRadius: 13, padding: 10, marginTop: 8 }, linkChooserTitle: { color: colors.ink, fontSize: 11, fontWeight: '700' }, linkChooserNote: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 4 }, olderChoice: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 9, marginTop: 7 }, olderChoiceSelected: { backgroundColor: colors.bluePale, borderColor: '#AAC9FF' }, olderChoiceTitle: { color: colors.ink, fontSize: 9, fontWeight: '700' }, olderChoiceMeta: { color: colors.muted, fontSize: 8, marginTop: 3 }, confirmReplacement: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: colors.cobalt, paddingHorizontal: 10, marginTop: 8 }, confirmReplacementText: { color: '#FFFFFF', fontSize: 7, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' }, disabled: { opacity: 0.6 }, replacementError: { color: '#8A3F32', backgroundColor: '#FFF0E8', borderWidth: 1, borderColor: '#F0CCBA', borderRadius: 10, padding: 8, marginTop: 8, fontSize: 9, lineHeight: 13 },
  askAction: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#F5F0F8', borderWidth: 1, borderColor: '#E5DCEB', borderRadius: 13, padding: 10, marginTop: 14 }, askOrb: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#F4E6E6', alignItems: 'center', justifyContent: 'center' }, askTitle: { color: '#483250', fontSize: 11, fontWeight: '600' }, askSubtitle: { color: '#827A89', fontSize: 8, marginTop: 2 }, askArrow: { color: '#483250', fontSize: 17 },
  emptyCard: { alignItems: 'flex-start', padding: 17, marginBottom: 14 }, emptyIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center', marginBottom: 11 }, emptyGlyph: { color: colors.cobalt, fontSize: 22 }, emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' }, emptyBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 7 }, emptySteps: { width: '100%', borderTopWidth: 1, borderTopColor: '#ECE8EF', marginTop: 13, paddingTop: 9, gap: 8 }, step: { color: '#655D6B', fontSize: 9, fontWeight: '500' }, primary: { minHeight: 58, borderRadius: radius.md, backgroundColor: colors.cobalt, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }, primaryTitle: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, primarySub: { color: 'rgba(255,255,255,.78)', fontSize: 9, marginTop: 3 }, primaryArrow: { color: '#FFF', fontSize: 22 }, disclaimer: { color: colors.quiet, fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 11 },
});
