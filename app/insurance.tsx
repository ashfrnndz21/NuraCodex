import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { AccessibilityInfo, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Orb } from '../src/components/Orb';
import { Label, Surface } from '../src/components/Surface';
import { HealthFact, useNura } from '../src/state/NuraContext';
import { groupInsurancePolicyTerms } from '../src/services/insurancePolicyHistory.mjs';
import { buildInsuranceSnapshot, clarificationQuestion, interpretInsuranceTerm } from '../src/services/insuranceSnapshot.mjs';
import { comparePolicyDocuments, summarizePolicyDifferences } from '../src/services/policyReplacement.mjs';
import { policyTermEvidenceTarget } from '../src/services/policyTermEvidence.mjs';
import { formatClaimValue } from '../src/services/claimValue.mjs';
import { getSourceClaims } from '../src/services/intakeClient';
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

function TermEntry({ term, kind, value, onViewSource }: { term: HealthFact; kind: 'current' | 'previous' | 'removed'; value?: string; onViewSource?: () => void }) {
  const badge = kind === 'current' ? 'IN YOUR RECORD' : kind === 'removed' ? 'REMOVED BY YOU' : 'EARLIER VERSION';
  const sourceDate = displayDate(term.date);
  const endDate = displayDate(term.validUntil);
  return <View style={[styles.term, kind !== 'current' && styles.previousTerm]}>
    <View style={styles.termTop}><Text style={styles.termLabel}>{term.label}</Text><Text style={[styles.termType, kind !== 'current' && styles.previousTermType]}>{badge}</Text></View>
    <Text style={styles.termValue}>{value ?? term.value}</Text>
    <Text style={styles.plainMeaning}><Text style={styles.plainMeaningLead}>IN PLAIN LANGUAGE · </Text>{interpretInsuranceTerm(term)}</Text>
    {term.note ? <Text style={styles.sourceNote}><Text style={styles.sourceNoteLead}>SOURCE DETAILS · </Text>{term.note}</Text> : <Text style={styles.quoteMissing}>Open the original document to inspect its page and wording.</Text>}
    <Text style={styles.termMeta}>{term.source}{sourceDate ? ` · Record date ${sourceDate}` : ''}{endDate ? ` · Version ended ${endDate}` : ''}</Text>
    {onViewSource && <Pressable accessibilityRole="button" onPress={onViewSource} style={styles.termEvidence}><Text style={styles.termEvidenceText}>VIEW SOURCE QUOTE  ↗</Text></Pressable>}
  </View>;
}

export default function InsuranceRegistry() {
  const { facts, assets, policyReplacements, addPolicyReplacement, removePolicyReplacement, reconcileSourceFactValue } = useNura();
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [expandedSnapshot, setExpandedSnapshot] = useState<string | null>(null);
  const [replacementFor, setReplacementFor] = useState<string | null>(null);
  const [olderSourceChoice, setOlderSourceChoice] = useState<string | null>(null);
  const [savingReplacement, setSavingReplacement] = useState(false);
  const [removingReplacement, setRemovingReplacement] = useState<string | null>(null);
  const [replacementError, setReplacementError] = useState<{ sourceId: string; message: string } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sourceClaimValues, setSourceClaimValues] = useState<Record<string, string>>({});
  const [sourceClaimsReadyKey, setSourceClaimsReadyKey] = useState('');
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  const policies = useMemo(() => groupInsurancePolicyTerms(facts), [facts]);
  const policySourceIds = useMemo(() => [...new Set(policies.map((policy) => policy.sourceId))], [policies]);
  const policySourceKey = policySourceIds.join('|');
  const sourceClaimRepairing = Boolean(policySourceKey) && sourceClaimsReadyKey !== policySourceKey;
  useEffect(() => {
    let active = true;
    if (!policySourceKey) return () => { active = false; };
    const currentFacts = new Map(policies.flatMap((policy) => policy.currentTerms.map((term) => [term.sourceClaimId, term] as const)));
    const sourceIds = policySourceIds;
    void Promise.all(sourceIds.map((sourceId) => getSourceClaims(sourceId).catch(() => null))).then(async (results) => {
      if (!active) return;
      const repairedValues: Record<string, string> = {};
      const repairs: { factId: string; sourceId: string; claimId: string; expectedValue: string; normalizedValue: string }[] = [];
      for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        const sourceId = sourceIds[index];
        for (const claim of result?.claims ?? []) {
          const fact = currentFacts.get(claim.id);
          if (!fact || !claim.unit) continue;
          const oldJoinedValue = `${claim.value} ${claim.unit}`.trim();
          const cleanValue = formatClaimValue(claim.value, claim.unit);
          // Only repair a value that exactly matches the former value + unit join.
          if (fact.value === oldJoinedValue && cleanValue !== oldJoinedValue) {
            repairedValues[claim.id] = cleanValue;
            repairs.push({ factId: fact.id, sourceId, claimId: claim.id, expectedValue: oldJoinedValue, normalizedValue: cleanValue });
          }
        }
      }
      setSourceClaimValues(repairedValues);
      try {
        await Promise.all(repairs.map((repair) => reconcileSourceFactValue(repair.factId, repair.sourceId, repair.claimId, repair.expectedValue, repair.normalizedValue)));
      } finally {
        if (active) setSourceClaimsReadyKey(policySourceKey);
      }
    }).catch(() => { if (active) setSourceClaimsReadyKey(policySourceKey); });
    return () => { active = false; };
  }, [policies, policySourceIds, policySourceKey, reconcileSourceFactValue]);
  const displayTermValue = (term: HealthFact) => term.sourceClaimId ? sourceClaimValues[term.sourceClaimId] ?? term.value : term.value;
  const policyBySource = useMemo(() => new Map(policies.map((policy) => [policy.sourceId, policy])), [policies]);
  const snapshotBySource = useMemo(() => new Map(policies.map((policy) => [policy.sourceId, buildInsuranceSnapshot(policy.currentTerms)])), [policies]);
  const waiting = assets.filter((asset) => asset.purpose === 'insurance' && !asset.serverSourceId);
  const termCount = policies.reduce((total, policy) => total + policy.currentTerms.length, 0);
  const historyCount = policies.reduce((total, policy) => total + policy.previousTerms.length + policy.removedTerms.length, 0);
  const exclusionCount = policies.reduce((total, policy) => total + (snapshotBySource.get(policy.sourceId)?.exclusions.length ?? 0), 0);
  const clarificationCount = policies.reduce((total, policy) => total + (snapshotBySource.get(policy.sourceId)?.clarifications.length ?? 0), 0);
  const notFoundMedicalCount = policies.reduce((total, policy) => total + (snapshotBySource.get(policy.sourceId)?.notFoundMedicalDetails.length ?? 0), 0);

  function toggleHistory(sourceId: string) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedHistory((current) => current === sourceId ? null : sourceId);
  }

  function toggleSnapshot(sourceId: string, sectionId: string) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const key = `${sourceId}:${sectionId}`;
    setExpandedSnapshot((current) => current === key ? null : key);
  }

  function openPolicySource(sourceId: string) {
    const asset = assets.find((item) => item.serverSourceId === sourceId);
    if (!asset) return;
    router.push({ pathname: '/review', params: { purpose: 'insurance', assetId: asset.id } });
  }

  function openPolicyTermEvidence(term: HealthFact) {
    const target = policyTermEvidenceTarget(term, assets);
    if (!target) {
      if (term.sourceId) openPolicySource(term.sourceId);
      return;
    }
    router.push({ pathname: '/review', params: { purpose: 'insurance', assetId: target.assetId, sourceId: target.sourceId, focusClaimId: target.claimId } });
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

    {policies.length > 0 && <Surface style={styles.summary}>
      <View style={styles.summaryHead}><View style={{ flex: 1 }}><Text style={styles.summaryEyebrow}>POLICY SNAPSHOT</Text><Text style={styles.summaryTitle}>{String(policies.length).padStart(2, '0')} {policies.length === 1 ? 'policy' : 'policies'} · {String(termCount).padStart(2, '0')} confirmed terms</Text></View><View style={styles.summaryOrb}><Orb size={28} /></View></View>
      <View style={styles.summaryMetrics}><View style={styles.summaryMetric}><Text style={styles.summaryMetricValue}>{String(exclusionCount).padStart(2, '0')}</Text><Text style={styles.summaryMetricLabel}>EXCLUSIONS</Text></View><View style={styles.summaryMetricRule} /><View style={styles.summaryMetric}><Text style={styles.summaryMetricValue}>{String(clarificationCount).padStart(2, '0')}</Text><Text style={styles.summaryMetricLabel}>MARKED UNCLEAR</Text></View><View style={styles.summaryMetricRule} /><View style={styles.summaryMetric}><Text style={styles.summaryMetricValue}>{String(notFoundMedicalCount).padStart(2, '0')}</Text><Text style={styles.summaryMetricLabel}>DETAILS TO CHECK</Text></View></View>
      <Text style={styles.summaryBody}>Exclusions appear only when saved policy wording says so. “Not found” items are absent from this approved summary; that does not mean they are not covered.</Text>
      {historyCount > 0 && <Text style={styles.summaryHistory}>{String(historyCount).padStart(2, '0')} earlier or removed terms kept in review history</Text>}
    </Surface>}

    {waiting.length > 0 && <Surface style={styles.waitingCard}><Label>READY FOR SOURCE REVIEW · {waiting.length}</Label>{waiting.map((asset) => <View key={asset.id} style={styles.waitingRow}><View style={styles.fileIcon}><Text style={styles.fileIconText}>PDF</Text></View><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.policyName}>{asset.name}</Text><Text style={styles.muted}>Saved on this device · not yet analyzed</Text></View><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/review', params: { purpose: 'insurance' } })}><Text style={styles.link}>Review →</Text></Pressable></View>)}</Surface>}

    <View style={styles.sectionHead}><View><Label>YOUR POLICIES</Label><Text style={styles.sectionTitle}>{policies.length ? 'Terms and review history' : 'No policy added yet'}</Text></View><Text style={styles.sectionCount}>{String(policies.length).padStart(2, '0')}</Text></View>
    {policies.length ? policies.map((policy) => {
      const olderChoices = policies.filter((candidate) => candidate.sourceId !== policy.sourceId);
      const sourceLinks = policyReplacements.filter((link) => link.newerSourceId === policy.sourceId || link.olderSourceId === policy.sourceId);
      const snapshot = snapshotBySource.get(policy.sourceId) ?? buildInsuranceSnapshot(policy.currentTerms);
      return <Surface key={policy.sourceId} style={styles.policyCard}>
      <View style={styles.policyHead}><View style={styles.policyMark}><Text style={styles.policyMarkText}>▤</Text></View><View style={{ flex: 1 }}><Text style={styles.policyEyebrow}>POLICY SOURCE</Text><Text style={styles.policyName}>{policy.sourceName}</Text></View><Text style={styles.sourceLinked}>LINKED</Text></View>
      <View style={styles.sourceBand}><Text style={styles.sourceBandIcon}>⌑</Text><Text style={styles.sourceBandText}>Source file · {policy.currentTerms.length} current entr{policy.currentTerms.length === 1 ? 'y' : 'ies'} · {policy.previousTerms.length} earlier · {policy.removedTerms.length} removed</Text></View>
      {replacementError?.sourceId === policy.sourceId && <Text accessibilityRole="alert" style={styles.replacementError}>{replacementError.message}</Text>}
      {assets.find((asset) => asset.serverSourceId === policy.sourceId) && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/review', params: { purpose: 'insurance', assetId: assets.find((asset) => asset.serverSourceId === policy.sourceId)?.id } })} style={styles.sourceAction}><Text style={styles.sourceActionText}>OPEN ORIGINAL SOURCE AND REVIEW  ↗</Text></Pressable>}
      {snapshot.exclusions.length > 0 && <View style={styles.exclusionPanel}><View style={styles.snapshotHead}><Text style={styles.exclusionEyebrow}>EXPLICITLY EXCLUDED IN SAVED WORDING</Text><Text style={styles.exclusionCount}>{snapshot.exclusions.length}</Text></View>{snapshot.exclusions.map((term) => <View key={term.id} style={styles.exclusionItem}><Text style={styles.exclusionTitle}>{term.label}</Text><Text style={styles.exclusionValue}>{displayTermValue(term)}</Text><Pressable accessibilityRole="button" onPress={() => openPolicyTermEvidence(term)} style={styles.exclusionSource}><Text style={styles.exclusionSourceText}>CHECK SOURCE QUOTE  ↗</Text></Pressable></View>)}<Text style={styles.exclusionFoot}>This reflects only the wording captured above. Confirm definitions, exceptions and applicability in the full contract.</Text></View>}
      {snapshot.clarifications.length > 0 && <View style={styles.clarifyPanel}><Text style={styles.clarifyEyebrow}>WORDING TO CONFIRM</Text>{snapshot.clarifications.map((term) => <View key={term.id} style={styles.clarifyItem}><Text style={styles.clarifyTitle}>{term.label}</Text><Text style={styles.clarifyValue}>{displayTermValue(term)}</Text><Text style={styles.clarifyValue}>Ask the insurer: {clarificationQuestion(term)}</Text><Pressable accessibilityRole="button" onPress={() => openPolicyTermEvidence(term)}><Text style={styles.clarifySource}>VIEW SOURCE QUOTE  ↗</Text></Pressable></View>)}</View>}
      <View style={styles.breakdownHeading}><View><Label>POLICY BREAKDOWN</Label><Text style={styles.breakdownSub}>Tap a section to inspect saved terms and missing details.</Text></View></View>
      {snapshot.groups.filter((group) => group.id !== 'other' || group.terms.length > 0).map((group) => {
        const expanded = expandedSnapshot === `${policy.sourceId}:${group.id}`;
        return <View key={group.id} style={styles.breakdownSection}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => toggleSnapshot(policy.sourceId, group.id)} style={({ pressed }) => [styles.breakdownToggle, pressed && styles.breakdownPressed]}>
            <View style={[styles.breakdownMark, group.id === 'medical' && styles.breakdownMarkMedical, group.id === 'life' && styles.breakdownMarkLife, group.id === 'premium' && styles.breakdownMarkPremium, group.id === 'value' && styles.breakdownMarkValue]}><Text style={styles.breakdownMarkText}>{group.id === 'medical' ? '+' : group.id === 'life' ? '◈' : group.id === 'premium' ? '↻' : group.id === 'value' ? '↗' : '▤'}</Text></View>
            <View style={styles.breakdownCopy}><Text style={styles.breakdownTitle}>{group.title}</Text><Text style={styles.breakdownMeta}>{group.terms.length ? `${group.terms.length} approved ${group.terms.length === 1 ? 'term' : 'terms'}` : 'Not found in approved summary'}</Text></View>
            <Text style={styles.breakdownArrow}>{expanded ? '−' : '+'}</Text>
          </Pressable>
          {expanded && <View style={styles.breakdownBody}>
            {group.terms.map((term) => <TermEntry key={term.id} term={term} kind="current" value={displayTermValue(term)} onViewSource={() => openPolicyTermEvidence(term)} />)}
            {group.notFound.length > 0 && <View style={styles.notFoundBox}><Text style={styles.notFoundEyebrow}>NOT FOUND IN THIS SUMMARY</Text><Text style={styles.notFoundItems}>{group.notFound.join('  ·  ')}</Text><Text style={styles.notFoundCopy}>These items may appear elsewhere in the policy. Their absence here is not an exclusion.</Text></View>}
            {!group.terms.length && !group.notFound.length && <Text style={styles.noCurrentTerms}>No approved entries from this section. Review the full source if this detail matters.</Text>}
          </View>}
        </View>;
      })}
      <View style={styles.healthFitCard}><View style={styles.healthFitOrb}><Orb size={24} /></View><View style={styles.healthFitCopy}><Text style={styles.healthFitEyebrow}>POLICY + YOUR HEALTH</Text><Text style={styles.healthFitTitle}>Check whether a stated term may matter to you</Text><Text style={styles.healthFitBody}>Choose the profile sections to include. Nura cites possible concerns; it cannot decide how an insurer will apply the policy.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Check this policy against selected health details" onPress={() => router.push({ pathname: '/ask', params: { context: 'this policy and the health details you choose', question: 'Check the confirmed terms in this policy against only the health details I choose to share. Separate explicit exclusions or limits that may be relevant from what is unclear or not found. Cite the exact policy and health sources, explain any possible concern without making a coverage decision, and give me concrete questions to ask my insurer. Treat missing wording as unknown, not as an exclusion.' , policySourceIds: policy.sourceId } })} disabled={sourceClaimRepairing} style={[styles.healthFitButton, sourceClaimRepairing && styles.disabled]}><Text style={styles.healthFitButtonText}>{sourceClaimRepairing ? 'PREPARING POLICY DETAILS…' : 'CHECK WITH NURA  →'}</Text></Pressable></View>
      {(policy.previousTerms.length > 0 || policy.removedTerms.length > 0) && <>
        <Pressable accessibilityRole="button" accessibilityLabel={`Review history for ${policy.sourceName}`} accessibilityState={{ expanded: expandedHistory === policy.sourceId }} onPress={() => toggleHistory(policy.sourceId)} style={({ pressed }) => [styles.historyToggle, pressed && styles.historyTogglePressed]}>
          <View style={{ flex: 1 }}><Text style={styles.historyTitle}>{expandedHistory === policy.sourceId ? 'HIDE REVIEW HISTORY' : 'SHOW REVIEW HISTORY'}</Text><Text style={styles.historySubtitle}>{policy.previousTerms.length} earlier version{policy.previousTerms.length === 1 ? '' : 's'} · {policy.removedTerms.length} removed by you</Text></View><Text style={styles.historyArrow}>{expandedHistory === policy.sourceId ? '−' : '+'}</Text>
        </Pressable>
        {expandedHistory === policy.sourceId && <View style={styles.historyEntries}>{policy.previousTerms.map((term) => <TermEntry key={term.id} term={term} kind="previous" onViewSource={() => openPolicyTermEvidence(term)} />)}{policy.removedTerms.map((term) => <TermEntry key={term.id} term={term} kind="removed" onViewSource={() => openPolicyTermEvidence(term)} />)}</View>}
      </>}
      {sourceLinks.map((link) => {
        const isReplacing = link.newerSourceId === policy.sourceId;
        const counterpartId = isReplacing ? link.olderSourceId : link.newerSourceId;
        const counterpart = policyBySource.get(counterpartId);
        if (!counterpart) return null;
        if (!isReplacing) return <View key={link.id} style={styles.relationshipNotice}><Text style={styles.relationshipTitle}>YOU MARKED THIS POLICY AS REPLACED BY</Text><Text style={styles.relationshipSource}>{counterpart.sourceName}</Text><Text style={styles.relationshipNote}>This is your document link. Nura does not infer which policy is currently active.</Text><Pressable accessibilityRole="button" accessibilityLabel={`Open ${counterpart.sourceName}`} onPress={() => openPolicySource(counterpartId)} style={styles.relationSourceButton}><Text style={styles.relationSourceButtonText}>OPEN LINKED SOURCE  ↗</Text></Pressable></View>;
        const comparisonRows = comparePolicyDocuments(policy, counterpart) as PolicyComparisonRow[];
        const comparisonSummaryRows = comparisonRows.map((row) => ({
          ...row,
          newerTerms: row.newerTerms.map((term) => ({ ...term, value: displayTermValue(term) })),
          olderTerms: row.olderTerms.map((term) => ({ ...term, value: displayTermValue(term) })),
        }));
        const comparisonSummary = summarizePolicyDifferences(comparisonSummaryRows);
        const comparisonGaps = [
          { label: 'Annual premium', match: /premium/i },
          { label: 'Life cover amount', match: /sum assured|death benefit|life cover|critical illness/i },
          { label: 'Annual medical limit', match: /annual.{0,24}medical.{0,20}limit|medical.{0,20}annual.{0,20}limit/i },
          { label: 'Lifetime medical limit', match: /lifetime.{0,24}medical.{0,20}limit|medical.{0,20}lifetime.{0,20}limit/i },
        ].filter((field) => !policy.currentTerms.some((term) => field.match.test(term.label)) || !counterpart.currentTerms.some((term) => field.match.test(term.label)));
        return <View key={link.id} style={styles.comparisonCard}>
          <View style={styles.comparisonHeading}><View style={{ flex: 1 }}><Text style={styles.relationshipTitle}>YOU MARKED THIS DOCUMENT AS REPLACING</Text><Text style={styles.relationshipSource}>{counterpart.sourceName}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Remove policy document link" disabled={removingReplacement === link.id} onPress={async () => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setRemovingReplacement(link.id); setReplacementError(null); try { await removePolicyReplacement(link.id); } catch { setReplacementError({ sourceId: policy.sourceId, message: 'Nura could not remove this policy link. Please try again.' }); } finally { setRemovingReplacement(null); } }} style={styles.removeRelation}><Text style={styles.removeRelationText}>{removingReplacement === link.id ? 'SAVING…' : 'REMOVE LINK'}</Text></Pressable></View>
          <Text style={styles.comparisonNote}>This link records your understanding of the documents. Different saved wording is shown for review; missing wording is not treated as an exclusion, and this does not establish active coverage.</Text>
          <View style={styles.changeSummary}><Text style={styles.changeSummaryEyebrow}>WHAT CHANGED ON PAPER</Text><Text style={styles.changeSummaryCounts}>{comparisonSummary.observations.length} numeric change{comparisonSummary.observations.length === 1 ? '' : 's'} · {comparisonSummary.sameCount} same term{comparisonSummary.sameCount === 1 ? '' : 's'}</Text>
            {comparisonSummary.observations.map((item) => <View key={item.label} style={styles.changeObservation}><Text style={[styles.changeKind, item.kind === 'higher_stated_cost' || item.kind === 'lower_stated_amount' ? styles.changeKindCaution : styles.changeKindPositive]}>{item.kind === 'higher_stated_cost' ? 'HIGHER STATED COST' : item.kind === 'lower_stated_cost' ? 'LOWER STATED COST' : item.kind === 'lower_stated_amount' ? 'LOWER STATED LIMIT / AMOUNT' : 'HIGHER STATED LIMIT / AMOUNT'}</Text><Text style={styles.changeTerm}>{item.label}</Text><Text style={styles.changeValues}>{item.olderValue}  →  {item.newerValue}</Text></View>)}
            {comparisonSummary.wordingCount > 0 && <Text style={styles.changeFoot}>{comparisonSummary.wordingCount} other changed term{comparisonSummary.wordingCount === 1 ? ' has' : 's have'} different wording; compare both source quotes.</Text>}
            {comparisonSummary.oneSidedCount > 0 && <Text style={styles.changeFoot}>{comparisonSummary.oneSidedCount} term{comparisonSummary.oneSidedCount === 1 ? ' appears' : 's appear'} in only one approved summary. Missing entries do not establish that a benefit is excluded.</Text>}
            {comparisonSummary.ambiguousCount > 0 && <Text style={styles.changeFoot}>{comparisonSummary.ambiguousCount} term{comparisonSummary.ambiguousCount === 1 ? ' has' : 's have'} multiple entries and needs review.</Text>}
            {comparisonGaps.length > 0 && <Text style={styles.changeFoot}>Not comparable from both approved summaries: {comparisonGaps.map((field) => field.label).join(' · ')}.</Text>}
            <Text style={styles.changeDisclaimer}>Numeric direction is based on the saved wording only. It does not determine eligibility, total cover or which policy is active.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Ask Nura to compare these policies with selected health details" onPress={() => router.push({ pathname: '/ask', params: { context: 'these two linked policy documents and the health details you select', policySourceIds: `${policy.sourceId},${counterpartId}`, question: `Compare ${policy.sourceName} with ${counterpart.sourceName}. Using the approved policy terms and only the health details I select for this run, summarize stated improvements, lower limits or higher costs, explicit exclusions that may be relevant, unchanged terms, and ambiguous or missing details. Separate document facts from possible implications. Cite both policy sources and each health source. Do not infer active coverage, predict an insurer decision, diagnose me, or recommend replacing or changing a policy. End with specific questions to ask the insurer and say when the evidence is insufficient.` } })} style={styles.askCompare}><Text style={styles.askCompareText}>ASK NURA TO CHECK AGAINST YOUR HEALTH  →</Text></Pressable>
          </View>
          {comparisonRows.length === 0 ? <Text style={styles.noComparison}>No matching accepted policy terms are available in both records yet.</Text> : comparisonRows.map((row) => {
            const isNumericChange = comparisonSummary.observations.some((item) => item.label === row.label);
            const statusLabel = row.status === 'different' ? isNumericChange ? 'NUMERIC VALUE CHANGED' : 'WORDING DIFFERS · REVIEW QUOTES' : row.status === 'same' ? 'SAME SAVED VALUE' : row.status === 'ambiguous' ? 'MULTIPLE MATCHING ENTRIES · REVIEW' : row.status === 'only_newer' ? 'NO ACCEPTED ENTRY IN EARLIER RECORD' : 'NO ACCEPTED ENTRY IN NEWER RECORD';
            const evidenceValues = (terms: typeof row.newerTerms) => terms.length ? terms.map((term) => <View key={term.id} style={styles.comparisonEvidenceTerm}>
              <Text style={styles.comparisonValue}>{displayTermValue(term)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`View source quote for ${term.label} from ${term.source}`} onPress={() => openPolicyTermEvidence(term)} style={styles.evidenceButton}>
                <Text style={styles.evidenceButtonText}>VIEW SOURCE QUOTE  ↗</Text>
              </Pressable>
            </View>) : <Text style={styles.comparisonValue}>No accepted entry with this label in this document.</Text>;
            return <View key={row.key} style={[styles.comparisonRow, row.status === 'different' && styles.comparisonDifferent]}>
              <View style={styles.comparisonTitleRow}><Text style={styles.comparisonTermLabel}>{row.label}</Text><Text style={[styles.comparisonStatus, row.status === 'different' && styles.comparisonStatusDifferent]}>{statusLabel}</Text></View>
              <Text style={styles.comparisonSideLabel}>THIS DOCUMENT · {policy.sourceName}</Text>{evidenceValues(row.newerTerms)}
              <Text style={styles.comparisonSideLabel}>EARLIER DOCUMENT · {counterpart.sourceName}</Text>{evidenceValues(row.olderTerms)}
            </View>;
          })}
          <View style={styles.relationActions}><Pressable accessibilityRole="button" accessibilityLabel={`Open this policy source, ${policy.sourceName}`} onPress={() => openPolicySource(policy.sourceId)} style={styles.relationSourceButton}><Text style={styles.relationSourceButtonText}>OPEN THIS SOURCE  ↗</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Open earlier policy source, ${counterpart.sourceName}`} onPress={() => openPolicySource(counterpartId)} style={styles.relationSourceButton}><Text style={styles.relationSourceButtonText}>OPEN EARLIER SOURCE  ↗</Text></Pressable></View>
        </View>;
      })}
      {olderChoices.length > 0 && <>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: replacementFor === policy.sourceId }} onPress={() => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setReplacementFor((current) => current === policy.sourceId ? null : policy.sourceId); setOlderSourceChoice(null); setReplacementError(null); }} style={styles.linkOlderButton}><Text style={styles.linkOlderButtonText}>{replacementFor === policy.sourceId ? 'CANCEL POLICY LINK' : 'LINK AN EARLIER POLICY'}</Text></Pressable>
        {replacementFor === policy.sourceId && <View style={styles.linkChooser}><Text style={styles.linkChooserTitle}>Which earlier document does this replace?</Text><Text style={styles.linkChooserNote}>Choose only if you know this policy document supersedes the other one.</Text>{olderChoices.map((candidate) => <Pressable key={candidate.sourceId} accessibilityRole="button" accessibilityState={{ selected: olderSourceChoice === candidate.sourceId }} onPress={() => setOlderSourceChoice(candidate.sourceId)} style={[styles.olderChoice, olderSourceChoice === candidate.sourceId && styles.olderChoiceSelected]}><Text style={styles.olderChoiceTitle}>{candidate.sourceName}</Text><Text style={styles.olderChoiceMeta}>{candidate.currentTerms.length} current accepted entr{candidate.currentTerms.length === 1 ? 'y' : 'ies'}</Text></Pressable>)}{olderSourceChoice && <Pressable accessibilityRole="button" disabled={savingReplacement} onPress={() => void saveReplacement(policy.sourceId)} style={[styles.confirmReplacement, savingReplacement && styles.disabled]}><Text style={styles.confirmReplacementText}>{savingReplacement ? 'SAVING POLICY LINK…' : `CONFIRM · THIS DOCUMENT REPLACES ${policyBySource.get(olderSourceChoice)?.sourceName ?? 'EARLIER POLICY'}`}</Text></Pressable>}</View>}
      </>}
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
  summary: { backgroundColor: '#493553', borderColor: '#68516F', marginBottom: 21, padding: 15 }, summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, summaryEyebrow: { color: '#EBC9D2', fontSize: 8, fontWeight: '800', letterSpacing: 1.2 }, summaryTitle: { color: '#FFF9F3', fontSize: 14, lineHeight: 19, fontWeight: '600', marginTop: 4 }, summaryOrb: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,249,243,.1)', alignItems: 'center', justifyContent: 'center' }, summaryMetrics: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.18)' }, summaryMetric: { flex: 1, alignItems: 'center', gap: 3 }, summaryMetricValue: { color: '#FFF9F3', fontSize: 17, fontWeight: '500' }, summaryMetricLabel: { color: '#D8C7DE', fontSize: 7, fontWeight: '800', letterSpacing: .45, textAlign: 'center' }, summaryMetricRule: { width: 1, height: 29, backgroundColor: 'rgba(255,255,255,.16)' }, summaryBody: { color: 'rgba(255,249,243,.82)', fontSize: 9, lineHeight: 14, marginTop: 10 }, summaryHistory: { color: '#EAC5AC', fontSize: 8, fontWeight: '600', marginTop: 7 },
  waitingCard: { marginBottom: 18, padding: 14 }, waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 11 }, fileIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center' }, fileIconText: { color: colors.cobalt, fontSize: 8, fontWeight: '700' }, policyName: { color: colors.ink, fontSize: 13, fontWeight: '600' }, muted: { color: colors.quiet, fontSize: 9, marginTop: 3 }, link: { color: colors.cobalt, fontSize: 10, fontWeight: '700' },
  sourceAction: { alignSelf: 'flex-start', marginTop: 7, paddingVertical: 4 }, sourceActionText: { color: colors.cobalt, fontSize: 7, fontWeight: '700', letterSpacing: .7 },
  breakdownHeading: { marginTop: 15, marginBottom: 5 }, breakdownSub: { color: colors.muted, fontSize: 9, marginTop: 3 }, breakdownSection: { borderTopWidth: 1, borderTopColor: '#E4DCE8' }, breakdownToggle: { minHeight: 59, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }, breakdownPressed: { opacity: .82 }, breakdownMark: { width: 33, height: 33, borderRadius: 12, backgroundColor: '#E8E0EF', alignItems: 'center', justifyContent: 'center' }, breakdownMarkMedical: { backgroundColor: '#E5EEFC' }, breakdownMarkLife: { backgroundColor: '#E6F1EB' }, breakdownMarkPremium: { backgroundColor: '#F8EDE2' }, breakdownMarkValue: { backgroundColor: '#E7EAF7' }, breakdownMarkText: { color: colors.violet, fontSize: 15, fontWeight: '700' }, breakdownCopy: { flex: 1 }, breakdownTitle: { color: colors.ink, fontSize: 12, fontWeight: '600' }, breakdownMeta: { color: colors.quiet, fontSize: 9, marginTop: 3 }, breakdownArrow: { color: colors.violet, width: 25, textAlign: 'center', fontSize: 20 }, breakdownBody: { paddingLeft: 10, paddingBottom: 10 }, notFoundBox: { backgroundColor: '#F2EDF5', borderWidth: 1, borderColor: '#E4D9EA', borderRadius: 11, padding: 10, marginTop: 9 }, notFoundEyebrow: { color: colors.violet, fontSize: 7, fontWeight: '800', letterSpacing: .8 }, notFoundItems: { color: colors.ink, fontSize: 9, lineHeight: 14, marginTop: 6 }, notFoundCopy: { color: colors.muted, fontSize: 8, lineHeight: 12, marginTop: 5 },
  exclusionPanel: { backgroundColor: '#FFF1EB', borderWidth: 1, borderColor: '#F0D4C9', borderRadius: 14, padding: 11, marginTop: 13 }, snapshotHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, exclusionEyebrow: { color: '#985847', fontSize: 7, fontWeight: '800', letterSpacing: .75, flex: 1 }, exclusionCount: { color: '#8C493D', backgroundColor: '#F4D9CF', borderRadius: 9, minWidth: 23, textAlign: 'center', overflow: 'hidden', paddingVertical: 3, fontSize: 8, fontWeight: '800' }, exclusionItem: { borderTopWidth: 1, borderTopColor: '#EBD5CD', marginTop: 8, paddingTop: 8 }, exclusionTitle: { color: colors.ink, fontSize: 11, fontWeight: '700' }, exclusionValue: { color: '#74534E', fontSize: 9, lineHeight: 13, marginTop: 3 }, exclusionSource: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingRight: 8 }, exclusionSourceText: { color: '#9B5140', fontSize: 7, fontWeight: '800', letterSpacing: .45 }, exclusionFoot: { color: '#765B55', fontSize: 8, lineHeight: 12, marginTop: 4 }, clarifyPanel: { backgroundColor: '#FBF1DE', borderWidth: 1, borderColor: '#ECDAB8', borderRadius: 14, padding: 11, marginTop: 10 }, clarifyEyebrow: { color: '#946B27', fontSize: 7, fontWeight: '800', letterSpacing: .8 }, clarifyItem: { borderTopWidth: 1, borderTopColor: '#EDE0C8', marginTop: 8, paddingTop: 8 }, clarifyTitle: { color: colors.ink, fontSize: 11, fontWeight: '700' }, clarifyValue: { color: '#6E5A3A', fontSize: 9, lineHeight: 13, marginTop: 3 }, clarifySource: { color: '#946B27', fontSize: 7, fontWeight: '800', letterSpacing: .5, paddingVertical: 7 },
  healthFitCard: { backgroundColor: '#F2EDF5', borderWidth: 1, borderColor: '#DED1E5', borderRadius: 15, padding: 12, marginTop: 14 }, healthFitOrb: { width: 35, height: 35, borderRadius: 13, backgroundColor: '#F0E1E6', alignItems: 'center', justifyContent: 'center' }, healthFitCopy: { marginTop: 8 }, healthFitEyebrow: { color: colors.violet, fontSize: 7, fontWeight: '800', letterSpacing: .8 }, healthFitTitle: { color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 4 }, healthFitBody: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 4 }, healthFitButton: { minHeight: 43, backgroundColor: colors.cobalt, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, healthFitButtonText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800', letterSpacing: .65 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }, sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '500', marginTop: 4 }, sectionCount: { color: '#918A99', fontSize: 11 }, policyCard: { marginBottom: 13, padding: 14 }, policyHead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, policyMark: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center' }, policyMarkText: { color: colors.cobalt, fontSize: 17 }, policyEyebrow: { color: '#92899A', fontSize: 7, fontWeight: '700', letterSpacing: 1.1 }, sourceLinked: { color: '#60456D', backgroundColor: '#F0E6F1', fontSize: 7, fontWeight: '700', letterSpacing: 0.7, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 }, sourceBand: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, backgroundColor: colors.bluePale, padding: 9, marginTop: 12 }, sourceBandIcon: { color: colors.cobalt, fontSize: 12 }, sourceBandText: { color: '#4A668D', fontSize: 9, fontWeight: '500', flex: 1 }, term: { borderTopWidth: 1, borderTopColor: '#EBE8EF', paddingTop: 12, marginTop: 12 }, previousTerm: { borderTopColor: '#E7DDEA' }, termTop: { flexDirection: 'row', alignItems: 'center', gap: 7 }, termLabel: { color: colors.ink, fontSize: 13, fontWeight: '600', flex: 1 }, termType: { color: colors.cobalt, backgroundColor: colors.bluePale, fontSize: 6, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 }, previousTermType: { color: '#684F71', backgroundColor: '#F0E6F1' }, termValue: { color: '#4C4854', fontSize: 11, lineHeight: 16, marginTop: 5 }, plainMeaning: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 6 }, plainMeaningLead: { color: colors.violet, fontSize: 7, fontWeight: '800', letterSpacing: .45 }, termEvidence: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingRight: 8 }, termEvidenceText: { color: colors.cobalt, fontSize: 7, fontWeight: '800', letterSpacing: .45 }, sourceNote: { color: '#716A79', fontSize: 10, lineHeight: 15, backgroundColor: '#F5F2F6', padding: 9, borderRadius: 9, marginTop: 8 }, sourceNoteLead: { color: '#684F71', fontSize: 8, fontWeight: '700', letterSpacing: 0.5 }, quoteMissing: { color: '#8C6C32', fontSize: 9, lineHeight: 14, marginTop: 8 }, termMeta: { color: '#918A99', fontSize: 8, marginTop: 6 }, noCurrentTerms: { color: '#716A79', fontSize: 10, lineHeight: 15, marginTop: 12 }, historyToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E7DDEA', marginTop: 14, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F6EFF7' }, historyTogglePressed: { backgroundColor: '#EFE4F0' }, historyTitle: { color: '#5F4569', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }, historySubtitle: { color: '#817687', fontSize: 8, marginTop: 3 }, historyArrow: { color: '#5F4569', fontSize: 20, fontWeight: '500', marginLeft: 12 }, historyEntries: { paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: '#CFB6D0', marginLeft: 4 },
  relationshipNotice: { backgroundColor: '#F3EDF5', borderWidth: 1, borderColor: '#E3D6E8', borderRadius: 14, padding: 11, marginTop: 12 }, relationshipTitle: { color: colors.violet, fontSize: 8, fontWeight: '800', letterSpacing: 0.75, lineHeight: 12 }, relationshipSource: { color: colors.ink, fontSize: 11, fontWeight: '700', lineHeight: 15, marginTop: 4 }, relationshipNote: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 5 }, relationSourceButton: { minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 11, backgroundColor: colors.bluePale, borderWidth: 1, borderColor: '#C9DBFA', paddingHorizontal: 10, marginTop: 8 }, relationSourceButtonText: { color: colors.cobalt, fontSize: 8, fontWeight: '800', letterSpacing: 0.55 },
  comparisonCard: { backgroundColor: '#F5F0F6', borderWidth: 1, borderColor: '#E3D7E8', borderRadius: 15, padding: 11, marginTop: 12 }, comparisonHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 }, removeRelation: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E3D2C1', backgroundColor: '#FFF9F1' }, removeRelationText: { color: '#93633A', fontSize: 7, fontWeight: '800', letterSpacing: 0.5 }, comparisonNote: { color: '#665E6B', fontSize: 9, lineHeight: 14, marginTop: 8 }, noComparison: { color: colors.muted, fontSize: 9, lineHeight: 13, backgroundColor: colors.surface, borderRadius: 10, padding: 9, marginTop: 9 }, comparisonRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#E6DFE9', borderRadius: 12, padding: 9, marginTop: 8 }, comparisonDifferent: { backgroundColor: '#FFF7EF', borderColor: '#EBD6C0' }, comparisonTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }, comparisonTermLabel: { flex: 1, color: colors.ink, fontSize: 10, fontWeight: '700' }, comparisonStatus: { color: colors.violet, fontSize: 6, fontWeight: '800', letterSpacing: 0.4, textAlign: 'right', maxWidth: '56%' }, comparisonStatusDifferent: { color: '#9A6327' }, comparisonSideLabel: { color: '#817687', fontSize: 7, fontWeight: '800', letterSpacing: 0.35, marginTop: 7 }, comparisonValue: { color: '#4C4653', fontSize: 9, lineHeight: 13, marginTop: 2 }, comparisonEvidenceTerm: { borderLeftWidth: 2, borderLeftColor: '#D6C7DE', paddingLeft: 7, marginTop: 3 }, evidenceButton: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', paddingRight: 8 }, evidenceButtonText: { color: colors.cobalt, fontSize: 7, fontWeight: '800', letterSpacing: 0.5 }, relationActions: { gap: 2, marginTop: 4 },
  changeSummary: { backgroundColor: '#493553', borderWidth: 1, borderColor: '#68516F', borderRadius: 13, padding: 11, marginTop: 10 }, changeSummaryEyebrow: { color: '#EBC9D2', fontSize: 7, fontWeight: '800', letterSpacing: 0.9 }, changeSummaryCounts: { color: '#FFF9F3', fontSize: 11, fontWeight: '600', marginTop: 4 }, changeObservation: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.16)', marginTop: 8, paddingTop: 8 }, changeKind: { fontSize: 7, fontWeight: '800', letterSpacing: 0.65 }, changeKindCaution: { color: '#F5C58D' }, changeKindPositive: { color: '#A8DEC4' }, changeTerm: { color: '#FFF9F3', fontSize: 10, fontWeight: '600', marginTop: 3 }, changeValues: { color: '#E5DCE8', fontSize: 9, marginTop: 2 }, changeFoot: { color: '#E5DCE8', fontSize: 8, lineHeight: 12, marginTop: 7 }, changeDisclaimer: { color: '#EAC5AC', fontSize: 8, lineHeight: 12, marginTop: 8 }, askCompare: { minHeight: 43, justifyContent: 'center', alignItems: 'center', borderRadius: 11, backgroundColor: colors.cobalt, paddingHorizontal: 9, marginTop: 9 }, askCompareText: { color: '#FFFFFF', fontSize: 7, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
  linkOlderButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#EEE7F1', borderWidth: 1, borderColor: '#DED2E4', marginTop: 10 }, linkOlderButtonText: { color: colors.violet, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 }, linkChooser: { backgroundColor: '#F7F2F8', borderWidth: 1, borderColor: '#E4D9EA', borderRadius: 13, padding: 10, marginTop: 8 }, linkChooserTitle: { color: colors.ink, fontSize: 11, fontWeight: '700' }, linkChooserNote: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 4 }, olderChoice: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 9, marginTop: 7 }, olderChoiceSelected: { backgroundColor: colors.bluePale, borderColor: '#AAC9FF' }, olderChoiceTitle: { color: colors.ink, fontSize: 9, fontWeight: '700' }, olderChoiceMeta: { color: colors.muted, fontSize: 8, marginTop: 3 }, confirmReplacement: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: colors.cobalt, paddingHorizontal: 10, marginTop: 8 }, confirmReplacementText: { color: '#FFFFFF', fontSize: 7, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' }, disabled: { opacity: 0.6 }, replacementError: { color: '#8A3F32', backgroundColor: '#FFF0E8', borderWidth: 1, borderColor: '#F0CCBA', borderRadius: 10, padding: 8, marginTop: 8, fontSize: 9, lineHeight: 13 },
  askAction: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#F5F0F8', borderWidth: 1, borderColor: '#E5DCEB', borderRadius: 13, padding: 10, marginTop: 14 }, askOrb: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#F4E6E6', alignItems: 'center', justifyContent: 'center' }, askTitle: { color: '#483250', fontSize: 11, fontWeight: '600' }, askSubtitle: { color: '#827A89', fontSize: 8, marginTop: 2 }, askArrow: { color: '#483250', fontSize: 17 },
  emptyCard: { alignItems: 'flex-start', padding: 17, marginBottom: 14 }, emptyIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center', marginBottom: 11 }, emptyGlyph: { color: colors.cobalt, fontSize: 22 }, emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' }, emptyBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 7 }, emptySteps: { width: '100%', borderTopWidth: 1, borderTopColor: '#ECE8EF', marginTop: 13, paddingTop: 9, gap: 8 }, step: { color: '#655D6B', fontSize: 9, fontWeight: '500' }, primary: { minHeight: 58, borderRadius: radius.md, backgroundColor: colors.cobalt, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }, primaryTitle: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, primarySub: { color: 'rgba(255,255,255,.78)', fontSize: 9, marginTop: 3 }, primaryArrow: { color: '#FFF', fontSize: 22 }, disclaimer: { color: colors.quiet, fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 11 },
});
