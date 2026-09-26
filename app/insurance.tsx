import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { AccessibilityInfo, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Orb } from '../src/components/Orb';
import { Label, Surface } from '../src/components/Surface';
import { HealthFact, IntakeAsset, useNura } from '../src/state/NuraContext';
import { groupInsurancePolicyTerms } from '../src/services/insurancePolicyHistory.mjs';
import { buildInsuranceSnapshot, clarificationQuestion, interpretInsuranceTerm } from '../src/services/insuranceSnapshot.mjs';
import { comparePolicyDocuments, resolvePolicyReplacementLinks, summarizePolicyDifferences } from '../src/services/policyReplacement.mjs';
import { policyTermEvidenceTarget } from '../src/services/policyTermEvidence.mjs';
import { formatClaimValue } from '../src/services/claimValue.mjs';
import { getSourceClaims } from '../src/services/intakeClient';
import { isPolicyClarificationSourceCurrent } from '../src/services/policyClarification.mjs';
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

type PolicyChangeObservation = {
  label: string;
  olderValue: string;
  newerValue: string;
  kind: 'higher_stated_cost' | 'lower_stated_cost' | 'higher_stated_amount' | 'lower_stated_amount';
  newerEvidence: { sourceId: string; claimId: string };
  olderEvidence: { sourceId: string; claimId: string };
  newerTerm: HealthFact;
  olderTerm: HealthFact;
};

type PolicyChangeSummary = {
  sameCount: number;
  wordingCount: number;
  oneSidedCount: number;
  ambiguousCount: number;
  unlinkedCount: number;
  unlinkedLabels: string[];
  observations: PolicyChangeObservation[];
};

type PolicyLinkAvailability = 'current_terms' | 'history_only' | 'source_saved' | 'source_unavailable';
type PolicyLinkResolution = {
  id: string;
  newerSourceId: string;
  olderSourceId: string;
  newerStatus: PolicyLinkAvailability;
  olderStatus: PolicyLinkAvailability;
  status: 'ready' | 'needs_review';
};

function evidenceActionLabel(term: HealthFact, assets: IntakeAsset[]) {
  if (policyTermEvidenceTarget(term, assets)) return 'VIEW SOURCE QUOTE';
  if (term.sourceId && assets.some((asset) => asset.purpose === 'insurance' && asset.serverSourceId === term.sourceId)) return 'OPEN ORIGINAL SOURCE';
  return null;
}

function TermEntry({ term, kind, value, evidenceLabel, onViewSource }: { term: HealthFact; kind: 'current' | 'previous' | 'removed'; value?: string; evidenceLabel?: string | null; onViewSource?: () => void }) {
  const badge = kind === 'current' ? 'IN YOUR RECORD' : kind === 'removed' ? 'REMOVED BY YOU' : 'EARLIER VERSION';
  const sourceDate = displayDate(term.date);
  const endDate = displayDate(term.validUntil);
  return <View style={[styles.term, kind !== 'current' && styles.previousTerm]}>
    <View style={styles.termTop}><Text style={styles.termLabel}>{term.label}</Text><Text style={[styles.termType, kind !== 'current' && styles.previousTermType]}>{badge}</Text></View>
    <Text style={styles.termValue}>{value ?? term.value}</Text>
    <Text style={styles.plainMeaning}><Text style={styles.plainMeaningLead}>IN PLAIN LANGUAGE · </Text>{interpretInsuranceTerm(term)}</Text>
    {term.note ? <Text style={styles.sourceNote}><Text style={styles.sourceNoteLead}>SOURCE DETAILS · </Text>{term.note}</Text> : <Text style={styles.quoteMissing}>Open the original document to inspect its page and wording.</Text>}
    <Text style={styles.termMeta}>{term.source}{sourceDate ? ` · Record date ${sourceDate}` : ''}{endDate ? ` · Version ended ${endDate}` : ''}</Text>
    {onViewSource && evidenceLabel && <Pressable accessibilityRole="button" accessibilityLabel={`${evidenceLabel} for ${term.label}`} onPress={onViewSource} style={styles.termEvidence}><Text style={styles.termEvidenceText}>{evidenceLabel}  ↗</Text></Pressable>}
  </View>;
}

export default function InsuranceRegistry() {
  const { facts, assets, policyReplacements, policyClarifications, addPolicyReplacement, removePolicyReplacement, addPolicyClarification, editPolicyClarification, removePolicyClarification, reconcileSourceFactValue } = useNura();
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [expandedSnapshot, setExpandedSnapshot] = useState<string | null>(null);
  const [expandedKeyDetails, setExpandedKeyDetails] = useState<string | null>(null);
  const [replyForClaim, setReplyForClaim] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingReplyClaim, setSavingReplyClaim] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<{ claimId: string; message: string } | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [replyEdits, setReplyEdits] = useState<Record<string, string>>({});
  const [savingReplyEditId, setSavingReplyEditId] = useState<string | null>(null);
  const [confirmDeleteReplyId, setConfirmDeleteReplyId] = useState<string | null>(null);
  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);
  const [replyManagementError, setReplyManagementError] = useState<{ id: string; message: string } | null>(null);
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
  const policyLinkResolutions = useMemo<PolicyLinkResolution[]>(() => resolvePolicyReplacementLinks(
    policyReplacements,
    policies,
    assets.filter((asset) => asset.purpose === 'insurance' && asset.serverSourceId).map((asset) => asset.serverSourceId as string),
  ), [policyReplacements, policies, assets]);
  const sourceAssetById = useMemo(() => new Map(assets.filter((asset) => asset.purpose === 'insurance' && asset.serverSourceId).map((asset) => [asset.serverSourceId as string, asset])), [assets]);
  const policyLinksNeedingReview = policyLinkResolutions.filter((link) => link.status === 'needs_review');
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

  async function saveInsurerReply(sourceId: string, term: HealthFact) {
    const claimId = term.sourceClaimId;
    if (!claimId || savingReplyClaim) return;
    setSavingReplyClaim(claimId);
    setReplyError(null);
    try {
      await addPolicyClarification({
        sourceId,
        sourceClaimId: claimId,
        question: clarificationQuestion(term),
        response: replyDrafts[claimId] ?? '',
      });
      if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setReplyDrafts((current) => ({ ...current, [claimId]: '' }));
      setReplyForClaim(null);
    } catch (error) {
      setReplyError({ claimId, message: error instanceof Error ? error.message : 'Nura could not save your note. Please try again.' });
    } finally {
      setSavingReplyClaim(null);
    }
  }

  async function saveReplyEdit(id: string) {
    if (savingReplyEditId || !editingReplyId) return;
    setSavingReplyEditId(id);
    setReplyManagementError(null);
    try {
      await editPolicyClarification(id, replyEdits[id] ?? '');
      if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setEditingReplyId(null);
      setReplyEdits((current) => { const next = { ...current }; delete next[id]; return next; });
    } catch (error) {
      setReplyManagementError({ id, message: error instanceof Error ? error.message : 'Nura could not update this note. Please try again.' });
    } finally {
      setSavingReplyEditId(null);
    }
  }

  async function deleteSavedReply(id: string) {
    if (deletingReplyId) return;
    setDeletingReplyId(id);
    setReplyManagementError(null);
    try {
      await removePolicyClarification(id);
      if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setConfirmDeleteReplyId(null);
      if (editingReplyId === id) setEditingReplyId(null);
      setReplyEdits((current) => { const next = { ...current }; delete next[id]; return next; });
    } catch (error) {
      setReplyManagementError({ id, message: error instanceof Error ? error.message : 'Nura could not remove this note. Please try again.' });
    } finally {
      setDeletingReplyId(null);
    }
  }

  async function removeReplacementLink(linkId: string, sourceId: string) {
    if (removingReplacement) return;
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRemovingReplacement(linkId);
    setReplacementError(null);
    try {
      await removePolicyReplacement(linkId);
    } catch {
      setReplacementError({ sourceId, message: 'Nura could not remove this policy link. Please try again.' });
    } finally {
      setRemovingReplacement(null);
    }
  }

  const policySourceName = (sourceId: string) => policyBySource.get(sourceId)?.sourceName ?? sourceAssetById.get(sourceId)?.name ?? 'Policy source';
  const policyLinkSideStatus = (status: string) => {
    if (status === 'current_terms') return 'Current accepted terms are available.';
    if (status === 'history_only') return 'Only earlier or removed terms are available.';
    if (status === 'source_saved') return 'The source file is saved, but no accepted terms are available yet.';
    return 'No saved source or accepted terms are available here.';
  };
  const renderPolicyReply = (reply: (typeof policyClarifications)[number], sourceTerm?: HealthFact) => {
    const sourceCurrent = isPolicyClarificationSourceCurrent({ clarification: reply, facts, assets });
    const editing = editingReplyId === reply.id;
    const confirmingDelete = confirmDeleteReplyId === reply.id;
    const busy = savingReplyEditId === reply.id || deletingReplyId === reply.id;
    return <View key={reply.id} style={styles.userReplyItem}>
      <Text style={styles.userReplyLabel}>{reply.termLabel} · {displayDate(reply.reportedAt) ?? 'date not recorded'}</Text>
      <Text style={styles.replyPrompt}>QUESTION YOU RECORDED</Text>
      <Text style={styles.userReplyText}>{reply.question}</Text>
      <Text style={styles.replyPrompt}>YOUR NOTE ABOUT THE REPLY</Text>
      {!editing ? <Text style={styles.userReplyText}>{reply.response}</Text> : <TextInput accessibilityLabel={`Edit your user-reported note for ${reply.termLabel}`} value={replyEdits[reply.id] ?? reply.response} onChangeText={(value) => setReplyEdits((current) => ({ ...current, [reply.id]: value }))} placeholder="What did the insurer tell you?" placeholderTextColor="#918A99" multiline maxLength={2000} textAlignVertical="top" style={styles.replyInput} />}
      <Text style={styles.userReplyStatus}>USER-REPORTED · NOT POLICY WORDING</Text>
      {!sourceCurrent && <Text style={styles.replyUnavailable}>This source or term has changed. You can keep or remove this note, but it can no longer be edited against the current policy record.</Text>}
      {sourceTerm && sourceTerm.sourceId === reply.sourceId && sourceTerm.sourceClaimId === reply.sourceClaimId && evidenceActionLabel(sourceTerm, assets) ? <Pressable accessibilityRole="button" accessibilityLabel={`Open policy source quote for ${reply.termLabel}`} onPress={() => openPolicyTermEvidence(sourceTerm)}><Text style={styles.clarifySource}>OPEN LINKED POLICY QUOTE  ↗</Text></Pressable> : <Text style={styles.replyUnavailable}>The original quote link is unavailable.</Text>}
      {editing && sourceCurrent && <>
        <Text style={styles.replyEditPrivacy}>Editing changes only your note. Its original question and policy source link stay attached.</Text>
        {replyManagementError?.id === reply.id && <Text accessibilityRole="alert" style={styles.replacementError}>{replyManagementError.message}</Text>}
        <View style={styles.replyActions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveReplyEdit(reply.id)} style={[styles.replyActionPrimary, busy && styles.disabled]}><Text style={styles.replyActionPrimaryText}>{savingReplyEditId === reply.id ? 'SAVING…' : 'SAVE EDIT'}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setEditingReplyId(null); setReplyManagementError(null); }} style={styles.replyActionButton}><Text style={styles.replyActionText}>CANCEL</Text></Pressable>
        </View>
      </>}
      {!editing && !confirmingDelete && <View style={styles.replyActions}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !sourceCurrent }} disabled={!sourceCurrent || busy} onPress={() => { setReplyEdits((current) => ({ ...current, [reply.id]: reply.response })); setEditingReplyId(reply.id); setConfirmDeleteReplyId(null); setReplyManagementError(null); }} style={[styles.replyActionButton, !sourceCurrent && styles.disabled]}><Text style={styles.replyActionText}>EDIT NOTE</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setConfirmDeleteReplyId(reply.id); setReplyManagementError(null); }} style={styles.replyActionDelete}><Text style={styles.replyActionDeleteText}>REMOVE NOTE</Text></Pressable>
      </View>}
      {confirmingDelete && <View style={styles.replyDeleteConfirm}>
        <Text style={styles.replyDeleteText}>Remove this user-reported note? The policy record will stay unchanged.</Text>
        {replyManagementError?.id === reply.id && <Text accessibilityRole="alert" style={styles.replacementError}>{replyManagementError.message}</Text>}
        <View style={styles.replyActions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirmDeleteReplyId(null)} style={styles.replyActionButton}><Text style={styles.replyActionText}>KEEP NOTE</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void deleteSavedReply(reply.id)} style={[styles.replyActionDelete, busy && styles.disabled]}><Text style={styles.replyActionDeleteText}>{deletingReplyId === reply.id ? 'REMOVING…' : 'REMOVE'}</Text></Pressable>
        </View>
      </View>}
      {!editing && !confirmingDelete && replyManagementError?.id === reply.id && <Text accessibilityRole="alert" style={styles.replacementError}>{replyManagementError.message}</Text>}
    </View>;
  };

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

    {policyLinksNeedingReview.length > 0 && <Surface style={styles.linkRecoveryCard}>
      <Label>POLICY LINKS · NEEDS REVIEW</Label>
      <Text style={styles.linkRecoveryIntro}>A saved relationship is still here, but one side does not have current accepted terms to compare. Review its source or remove the document link.</Text>
      {policyLinksNeedingReview.map((link) => {
        const sourceError = [link.newerSourceId, link.olderSourceId].some((sourceId) => replacementError?.sourceId === sourceId);
        const sides = [
          { sourceId: link.newerSourceId, title: 'DOCUMENT MARKED AS REPLACING', status: link.newerStatus },
          { sourceId: link.olderSourceId, title: 'EARLIER DOCUMENT', status: link.olderStatus },
        ];
        return <View key={link.id} style={styles.linkRecoveryItem}>
          {sides.map((side) => {
            const sourceAsset = sourceAssetById.get(side.sourceId);
            return <View key={side.sourceId} style={styles.linkRecoverySide}>
              <Text style={styles.linkRecoveryRole}>{side.title}</Text>
              <Text style={styles.linkRecoveryName}>{policySourceName(side.sourceId)}</Text>
              <Text style={styles.linkRecoveryStatus}>{policyLinkSideStatus(side.status)}</Text>
              {sourceAsset && <Pressable accessibilityRole="button" accessibilityLabel={`Review policy source ${sourceAsset.name}`} onPress={() => openPolicySource(side.sourceId)} style={styles.linkRecoverySource}><Text style={styles.linkRecoverySourceText}>REVIEW SOURCE  ↗</Text></Pressable>}
            </View>;
          })}
          {sourceError && replacementError && <Text accessibilityRole="alert" style={styles.replacementError}>{replacementError.message}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel="Remove policy document link" disabled={removingReplacement === link.id} onPress={() => void removeReplacementLink(link.id, link.newerSourceId)} style={[styles.removeRelation, removingReplacement === link.id && styles.disabled]}><Text style={styles.removeRelationText}>{removingReplacement === link.id ? 'REMOVING…' : 'REMOVE DOCUMENT LINK'}</Text></Pressable>
        </View>;
      })}
    </Surface>}

    <View style={styles.sectionHead}><View><Label>YOUR POLICIES</Label><Text style={styles.sectionTitle}>{policies.length ? 'Terms and review history' : 'No policy added yet'}</Text></View><Text style={styles.sectionCount}>{String(policies.length).padStart(2, '0')}</Text></View>
    {policies.length ? policies.map((policy) => {
      const olderChoices = policies.filter((candidate) => candidate.sourceId !== policy.sourceId);
      const sourceLinks = policyReplacements.filter((link) => link.newerSourceId === policy.sourceId || link.olderSourceId === policy.sourceId);
      const policyReplies = policyClarifications.filter((reply) => reply.sourceId === policy.sourceId);
      const snapshot = snapshotBySource.get(policy.sourceId) ?? buildInsuranceSnapshot(policy.currentTerms);
      return <Surface key={policy.sourceId} style={styles.policyCard}>
      <View style={styles.policyHead}><View style={styles.policyMark}><Text style={styles.policyMarkText}>▤</Text></View><View style={{ flex: 1 }}><Text style={styles.policyEyebrow}>POLICY SOURCE</Text><Text style={styles.policyName}>{policy.sourceName}</Text></View><Text style={styles.sourceLinked}>LINKED</Text></View>
      <View style={styles.sourceBand}><Text style={styles.sourceBandIcon}>⌑</Text><Text style={styles.sourceBandText}>Source file · {policy.currentTerms.length} current entr{policy.currentTerms.length === 1 ? 'y' : 'ies'} · {policy.previousTerms.length} earlier · {policy.removedTerms.length} removed</Text></View>
      {replacementError?.sourceId === policy.sourceId && <Text accessibilityRole="alert" style={styles.replacementError}>{replacementError.message}</Text>}
      {assets.find((asset) => asset.serverSourceId === policy.sourceId) && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/review', params: { purpose: 'insurance', assetId: assets.find((asset) => asset.serverSourceId === policy.sourceId)?.id } })} style={styles.sourceAction}><Text style={styles.sourceActionText}>OPEN ORIGINAL SOURCE AND REVIEW  ↗</Text></Pressable>}
      {snapshot.keyDetails.length > 0 && <View style={styles.keyDetailsCard}>
        <View style={styles.keyDetailsHeading}><Text style={styles.keyDetailsEyebrow}>AT A GLANCE · APPROVED TERMS</Text><Text style={styles.keyDetailsCount}>{snapshot.keyDetails.length}</Text></View>
        {(expandedKeyDetails === policy.sourceId ? snapshot.keyDetails : snapshot.keyDetails.slice(0, 4)).map(({ key, label, term }) => {
          const evidenceLabel = evidenceActionLabel(term, assets);
          return <Pressable key={`${key}:${term.id ?? term.label}`} accessibilityRole="button" accessibilityState={{ disabled: !evidenceLabel }} disabled={!evidenceLabel} accessibilityLabel={`${evidenceLabel ?? 'Source unavailable'} for ${term.label}`} onPress={() => openPolicyTermEvidence(term)} style={({ pressed }) => [styles.keyDetailRow, pressed && styles.keyDetailPressed, !evidenceLabel && styles.disabled]}>
            <View style={styles.keyDetailCopy}><Text style={styles.keyDetailLabel}>{label}</Text><Text style={styles.keyDetailValue}>{displayTermValue(term)}</Text><Text style={styles.termEvidenceText}>{evidenceLabel ? `${evidenceLabel} ↗` : 'SOURCE UNAVAILABLE'}</Text></View><Text style={styles.keyDetailArrow}>↗</Text>
          </Pressable>;
        })}
        {snapshot.keyDetails.length > 4 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: expandedKeyDetails === policy.sourceId }} onPress={() => {
          if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setExpandedKeyDetails((current) => current === policy.sourceId ? null : policy.sourceId);
        }} style={styles.keyDetailsFooterAction}><Text style={styles.keyDetailsFooter}>{expandedKeyDetails === policy.sourceId ? 'SHOW FEWER APPROVED TERMS  ↑' : `SHOW ALL ${snapshot.keyDetails.length} APPROVED TERMS  ↓`}</Text></Pressable>}
      </View>}
      {snapshot.notFoundMedicalDetails.length > 0 && <View style={styles.notFoundSummary}>
        <Text style={styles.notFoundSummaryTitle}>DETAILS NOT FOUND IN THIS SUMMARY</Text>
        <View style={styles.notFoundSummaryTags}>{snapshot.notFoundMedicalDetails.map((field) => <Text key={field.label} style={styles.notFoundSummaryTag}>{field.label}</Text>)}</View>
        <Text style={styles.notFoundSummaryBody}>These details may appear elsewhere in the full policy. Their absence here does not mean they are excluded.</Text>
      </View>}
      {snapshot.exclusions.length > 0 && <View style={styles.exclusionPanel}><View style={styles.snapshotHead}><Text style={styles.exclusionEyebrow}>EXPLICITLY EXCLUDED IN SAVED WORDING</Text><Text style={styles.exclusionCount}>{snapshot.exclusions.length}</Text></View>{snapshot.exclusions.map((term) => { const evidenceLabel = evidenceActionLabel(term, assets); return <View key={term.id} style={styles.exclusionItem}><Text style={styles.exclusionTitle}>{term.label}</Text><Text style={styles.exclusionValue}>{displayTermValue(term)}</Text>{evidenceLabel ? <Pressable accessibilityRole="button" accessibilityLabel={`${evidenceLabel} for ${term.label}`} onPress={() => openPolicyTermEvidence(term)} style={styles.exclusionSource}><Text style={styles.exclusionSourceText}>{evidenceLabel}  ↗</Text></Pressable> : <Text style={styles.quoteMissing}>Original source link unavailable. Check the policy file before relying on this detail.</Text>}</View>; })}<Text style={styles.exclusionFoot}>This reflects only the wording captured above. Confirm definitions, exceptions and applicability in the full contract.</Text></View>}
      {snapshot.clarifications.length > 0 && <View style={styles.clarifyPanel}>
        <Text style={styles.clarifyEyebrow}>WORDING TO CONFIRM</Text>
        {snapshot.clarifications.map((term) => {
          const evidenceLabel = evidenceActionLabel(term, assets);
          const claimId = term.sourceClaimId;
          const canRecordReply = Boolean(claimId && term.sourceId === policy.sourceId && evidenceLabel);
          const formOpen = Boolean(canRecordReply && claimId && replyForClaim === claimId);
          return <View key={term.id} style={styles.clarifyItem}>
            <Text style={styles.clarifyTitle}>{term.label}</Text>
            <Text style={styles.clarifyValue}>{displayTermValue(term)}</Text>
            <Text style={styles.clarifyValue}>Ask the insurer: {clarificationQuestion(term)}</Text>
            {evidenceLabel ? <Pressable accessibilityRole="button" accessibilityLabel={`${evidenceLabel} for ${term.label}`} onPress={() => openPolicyTermEvidence(term)}><Text style={styles.clarifySource}>{evidenceLabel}  ↗</Text></Pressable> : <Text style={styles.quoteMissing}>Original source link unavailable. Check the policy file before relying on this detail.</Text>}
            {canRecordReply && claimId ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: formOpen }} onPress={() => { setReplyError(null); setReplyForClaim((current) => current === claimId ? null : claimId); }} style={styles.recordReplyButton}><Text style={styles.recordReplyButtonText}>{formOpen ? 'CLOSE REPLY NOTE' : 'RECORD AN INSURER REPLY  +'}</Text></Pressable> : <Text style={styles.replyUnavailable}>A saved source quote and extraction claim are required to link a reply to this term.</Text>}
            {formOpen && claimId && <View style={styles.replyForm}>
              <Text style={styles.replyPrompt}>QUESTION TO ASK</Text>
              <Text style={styles.replyQuestion}>{clarificationQuestion(term)}</Text>
              <TextInput accessibilityLabel={`Your note about the insurer reply for ${term.label}`} value={replyDrafts[claimId] ?? ''} onChangeText={(value) => setReplyDrafts((current) => ({ ...current, [claimId]: value }))} placeholder="What did the insurer tell you?" placeholderTextColor="#918A99" multiline maxLength={2000} textAlignVertical="top" style={styles.replyInput} />
              <Text style={styles.replyPrivacy}>Saved in this Nura record only. It stays separate from policy wording and is not sent to Nura’s AI.</Text>
              {replyError && replyError.claimId === claimId && <Text accessibilityRole="alert" style={styles.replacementError}>{replyError.message}</Text>}
              <Pressable accessibilityRole="button" disabled={savingReplyClaim === claimId} onPress={() => void saveInsurerReply(policy.sourceId, term)} style={[styles.saveReplyButton, savingReplyClaim === claimId && styles.disabled]}><Text style={styles.saveReplyButtonText}>{savingReplyClaim === claimId ? 'SAVING YOUR NOTE…' : 'SAVE MY NOTE  →'}</Text></Pressable>
            </View>}
          </View>;
        })}
      </View>}
      {policyReplies.length > 0 && <View style={styles.userReplyPanel}>
        <Text style={styles.userReplyEyebrow}>INSURER REPLIES YOU RECORDED · {policyReplies.length}</Text>
        <Text style={styles.userReplyNotice}>These are your notes about conversations with the insurer. They are not policy wording or an insurer decision verified by Nura.</Text>
        {policyReplies.map((reply) => renderPolicyReply(reply, [...policy.currentTerms, ...policy.previousTerms, ...policy.removedTerms].find((term) => term.id === reply.sourceFactId && term.sourceClaimId === reply.sourceClaimId)))}
      </View>}
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
            {group.terms.map((term) => <TermEntry key={term.id} term={term} kind="current" value={displayTermValue(term)} evidenceLabel={evidenceActionLabel(term, assets)} onViewSource={() => openPolicyTermEvidence(term)} />)}
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
        {expandedHistory === policy.sourceId && <View style={styles.historyEntries}>{policy.previousTerms.map((term) => <TermEntry key={term.id} term={term} kind="previous" evidenceLabel={evidenceActionLabel(term, assets)} onViewSource={() => openPolicyTermEvidence(term)} />)}{policy.removedTerms.map((term) => <TermEntry key={term.id} term={term} kind="removed" evidenceLabel={evidenceActionLabel(term, assets)} onViewSource={() => openPolicyTermEvidence(term)} />)}</View>}
      </>}
      {sourceLinks.map((link) => {
        const isReplacing = link.newerSourceId === policy.sourceId;
        const counterpartId = isReplacing ? link.olderSourceId : link.newerSourceId;
        const counterpart = policyBySource.get(counterpartId);
        if (!counterpart) return null;
        if (!isReplacing) return <View key={link.id} style={styles.relationshipNotice}><View style={styles.relationshipHeading}><View style={{ flex: 1 }}><Text style={styles.relationshipTitle}>YOU MARKED THIS POLICY AS REPLACED BY</Text><Text style={styles.relationshipSource}>{counterpart.sourceName}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Remove policy document link" disabled={removingReplacement === link.id} onPress={() => void removeReplacementLink(link.id, policy.sourceId)} style={styles.removeRelation}><Text style={styles.removeRelationText}>{removingReplacement === link.id ? 'REMOVING…' : 'REMOVE LINK'}</Text></Pressable></View><Text style={styles.relationshipNote}>This is your document link. Nura does not infer which policy is currently active.</Text><Pressable accessibilityRole="button" accessibilityLabel={`Open ${counterpart.sourceName}`} onPress={() => openPolicySource(counterpartId)} style={styles.relationSourceButton}><Text style={styles.relationSourceButtonText}>OPEN LINKED SOURCE  ↗</Text></Pressable></View>;
        const comparisonRows = comparePolicyDocuments(policy, counterpart) as PolicyComparisonRow[];
        const comparisonSummaryRows = comparisonRows.map((row) => ({
          ...row,
          newerTerms: row.newerTerms.map((term) => ({ ...term, value: displayTermValue(term) })),
          olderTerms: row.olderTerms.map((term) => ({ ...term, value: displayTermValue(term) })),
        }));
        const comparisonSummary = summarizePolicyDifferences(comparisonSummaryRows) as PolicyChangeSummary;
        const comparisonGaps = [
          { label: 'Annual premium', match: /premium/i },
          { label: 'Life cover amount', match: /sum assured|death benefit|life cover|critical illness/i },
          { label: 'Annual medical limit', match: /annual.{0,24}medical.{0,20}limit|medical.{0,20}annual.{0,20}limit/i },
          { label: 'Lifetime medical limit', match: /lifetime.{0,24}medical.{0,20}limit|medical.{0,20}lifetime.{0,20}limit/i },
        ].filter((field) => !policy.currentTerms.some((term) => field.match.test(term.label)) || !counterpart.currentTerms.some((term) => field.match.test(term.label)));
        return <View key={link.id} style={styles.comparisonCard}>
          <View style={styles.comparisonHeading}><View style={{ flex: 1 }}><Text style={styles.relationshipTitle}>YOU MARKED THIS DOCUMENT AS REPLACING</Text><Text style={styles.relationshipSource}>{counterpart.sourceName}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Remove policy document link" disabled={removingReplacement === link.id} onPress={() => void removeReplacementLink(link.id, policy.sourceId)} style={styles.removeRelation}><Text style={styles.removeRelationText}>{removingReplacement === link.id ? 'REMOVING…' : 'REMOVE LINK'}</Text></Pressable></View>
          <Text style={styles.comparisonNote}>This link records your understanding of the documents. Different saved wording is shown for review; missing wording is not treated as an exclusion, and this does not establish active coverage.</Text>
          <View style={styles.changeSummary}><Text style={styles.changeSummaryEyebrow}>WHAT CHANGED ON PAPER</Text><Text style={styles.changeSummaryCounts}>{comparisonSummary.observations.length} source-linked numeric change{comparisonSummary.observations.length === 1 ? '' : 's'} · {comparisonSummary.sameCount} same term{comparisonSummary.sameCount === 1 ? '' : 's'}</Text>
            {comparisonSummary.observations.map((item) => <View key={item.label} style={styles.changeObservation}><Text style={[styles.changeKind, item.kind === 'higher_stated_cost' || item.kind === 'lower_stated_amount' ? styles.changeKindCaution : styles.changeKindPositive]}>{item.kind === 'higher_stated_cost' ? 'HIGHER STATED COST' : item.kind === 'lower_stated_cost' ? 'LOWER STATED COST' : item.kind === 'lower_stated_amount' ? 'LOWER STATED LIMIT / AMOUNT' : 'HIGHER STATED LIMIT / AMOUNT'}</Text><Text style={styles.changeTerm}>{item.label}</Text><Text style={styles.changeValues}>{item.olderValue}  →  {item.newerValue}</Text><View style={styles.changeEvidenceRow}><Pressable accessibilityRole="button" accessibilityLabel={`View earlier source quote for ${item.label}`} onPress={() => openPolicyTermEvidence(item.olderTerm)} style={styles.changeEvidenceButton}><Text style={styles.evidenceButtonText}>EARLIER SOURCE QUOTE ↗</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`View current source quote for ${item.label}`} onPress={() => openPolicyTermEvidence(item.newerTerm)} style={styles.changeEvidenceButton}><Text style={styles.evidenceButtonText}>CURRENT SOURCE QUOTE ↗</Text></Pressable></View></View>)}
            {comparisonSummary.wordingCount > 0 && <Text style={styles.changeFoot}>{comparisonSummary.wordingCount} other changed term{comparisonSummary.wordingCount === 1 ? ' could' : 's could'} not be compared directionally; review both source quotes.</Text>}
            {comparisonSummary.unlinkedCount > 0 && <Text style={styles.changeFoot}>{comparisonSummary.unlinkedCount} numeric difference{comparisonSummary.unlinkedCount === 1 ? ' has' : 's have'} no linked claim in both documents, so Nura has not described a cost or benefit direction. Check the source wording for {comparisonSummary.unlinkedLabels.join(' · ')}.</Text>}
            {comparisonSummary.oneSidedCount > 0 && <Text style={styles.changeFoot}>{comparisonSummary.oneSidedCount} term{comparisonSummary.oneSidedCount === 1 ? ' appears' : 's appear'} in only one approved summary. Missing entries do not establish that a benefit is excluded.</Text>}
            {comparisonSummary.ambiguousCount > 0 && <Text style={styles.changeFoot}>{comparisonSummary.ambiguousCount} term{comparisonSummary.ambiguousCount === 1 ? ' has' : 's have'} multiple entries and needs review.</Text>}
            {comparisonGaps.length > 0 && <Text style={styles.changeFoot}>Not comparable from both approved summaries: {comparisonGaps.map((field) => field.label).join(' · ')}.</Text>}
            <Text style={styles.changeDisclaimer}>Numeric direction is based on the saved wording only. It does not determine eligibility, total cover or which policy is active.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Ask Nura to compare these policies with selected health details" onPress={() => router.push({ pathname: '/ask', params: { context: 'these two linked policy documents and the health details you select', policySourceIds: `${policy.sourceId},${counterpartId}`, question: `Compare ${policy.sourceName} with ${counterpart.sourceName}. Using the approved policy terms and only the health details I select for this run, summarize stated improvements, lower limits or higher costs, explicit exclusions that may be relevant, unchanged terms, and ambiguous or missing details. Separate document facts from possible implications. Cite both policy sources and each health source. Do not infer active coverage, predict an insurer decision, diagnose me, or recommend replacing or changing a policy. End with specific questions to ask the insurer and say when the evidence is insufficient.` } })} style={styles.askCompare}><Text style={styles.askCompareText}>ASK NURA TO CHECK AGAINST YOUR HEALTH  →</Text></Pressable>
          </View>
          {comparisonRows.length === 0 ? <Text style={styles.noComparison}>No matching accepted policy terms are available in both records yet.</Text> : comparisonRows.map((row) => {
            const isNumericChange = comparisonSummary.observations.some((item) => item.label === row.label);
            const sourceLinkNeeded = comparisonSummary.unlinkedLabels.includes(row.label);
            const statusLabel = row.status === 'different' ? isNumericChange ? 'SOURCE-LINKED NUMERIC VALUE CHANGED' : sourceLinkNeeded ? 'SAVED VALUES DIFFER · SOURCE CHECK NEEDED' : 'SAVED TERMS DIFFER · REVIEW QUOTES' : row.status === 'same' ? 'SAME SAVED VALUE' : row.status === 'ambiguous' ? 'MULTIPLE MATCHING ENTRIES · REVIEW' : row.status === 'only_newer' ? 'NO ACCEPTED ENTRY IN EARLIER RECORD' : 'NO ACCEPTED ENTRY IN NEWER RECORD';
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

    {policyClarifications.some((reply) => !policyBySource.has(reply.sourceId)) && <View style={styles.userReplyPanel}>
      <Text style={styles.userReplyEyebrow}>EARLIER INSURER NOTES · SOURCE UNAVAILABLE</Text>
      <Text style={styles.userReplyNotice}>These remain your notes, even if the policy document or accepted term was removed. They are not policy wording or a verified insurer decision.</Text>
      {policyClarifications.filter((reply) => !policyBySource.has(reply.sourceId)).map((reply) => renderPolicyReply(reply))}
    </View>}

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
  linkRecoveryCard: { backgroundColor: '#FFF9F1', borderColor: '#EBD6C0', marginBottom: 18, padding: 13 }, linkRecoveryIntro: { color: '#695F67', fontSize: 9, lineHeight: 14, marginTop: 5 }, linkRecoveryItem: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#E8DCCD', borderRadius: 12, padding: 10, marginTop: 9 }, linkRecoverySide: { paddingVertical: 5 }, linkRecoveryRole: { color: '#8B694D', fontSize: 7, fontWeight: '800', letterSpacing: .55 }, linkRecoveryName: { color: colors.ink, fontSize: 10, fontWeight: '700', marginTop: 3 }, linkRecoveryStatus: { color: colors.muted, fontSize: 8, lineHeight: 12, marginTop: 2 }, linkRecoverySource: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingHorizontal: 4 }, linkRecoverySourceText: { color: colors.cobalt, fontSize: 7, fontWeight: '800', letterSpacing: .45 },
  sourceAction: { alignSelf: 'flex-start', marginTop: 7, paddingVertical: 4 }, sourceActionText: { color: colors.cobalt, fontSize: 7, fontWeight: '700', letterSpacing: .7 },
  keyDetailsCard: { backgroundColor: '#EEF4FC', borderWidth: 1, borderColor: '#D0DFF2', borderRadius: 14, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 4, marginTop: 12 }, keyDetailsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }, keyDetailsEyebrow: { color: '#3567AE', fontSize: 9, fontWeight: '800', letterSpacing: .75 }, keyDetailsCount: { color: '#3567AE', backgroundColor: '#DDEBFC', fontSize: 10, fontWeight: '700', minWidth: 24, textAlign: 'center', borderRadius: 8, overflow: 'hidden', paddingVertical: 3 }, keyDetailRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#D7E3F3' }, keyDetailPressed: { opacity: .72 }, keyDetailCopy: { flex: 1, paddingVertical: 7 }, keyDetailLabel: { color: '#657892', fontSize: 10, fontWeight: '600' }, keyDetailValue: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 2 }, keyDetailArrow: { color: colors.cobalt, fontSize: 16, paddingHorizontal: 5 }, keyDetailsFooterAction: { minHeight: 42, justifyContent: 'center' }, keyDetailsFooter: { color: '#3567AE', fontSize: 9, fontWeight: '700', letterSpacing: .45, borderTopWidth: 1, borderTopColor: '#D7E3F3', paddingVertical: 11 },
  notFoundSummary: { backgroundColor: '#FBF5E9', borderWidth: 1, borderColor: '#EADBBF', borderRadius: 14, padding: 11, marginTop: 10 }, notFoundSummaryTitle: { color: '#8C6B31', fontSize: 9, fontWeight: '800', letterSpacing: .7 }, notFoundSummaryTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }, notFoundSummaryTag: { color: '#746348', backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E9DEC9', borderRadius: 9, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5, fontSize: 9 }, notFoundSummaryBody: { color: '#76684F', fontSize: 10, lineHeight: 15, marginTop: 8 },
  breakdownHeading: { marginTop: 15, marginBottom: 5 }, breakdownSub: { color: colors.muted, fontSize: 9, marginTop: 3 }, breakdownSection: { borderTopWidth: 1, borderTopColor: '#E4DCE8' }, breakdownToggle: { minHeight: 59, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }, breakdownPressed: { opacity: .82 }, breakdownMark: { width: 33, height: 33, borderRadius: 12, backgroundColor: '#E8E0EF', alignItems: 'center', justifyContent: 'center' }, breakdownMarkMedical: { backgroundColor: '#E5EEFC' }, breakdownMarkLife: { backgroundColor: '#E6F1EB' }, breakdownMarkPremium: { backgroundColor: '#F8EDE2' }, breakdownMarkValue: { backgroundColor: '#E7EAF7' }, breakdownMarkText: { color: colors.violet, fontSize: 15, fontWeight: '700' }, breakdownCopy: { flex: 1 }, breakdownTitle: { color: colors.ink, fontSize: 12, fontWeight: '600' }, breakdownMeta: { color: colors.quiet, fontSize: 9, marginTop: 3 }, breakdownArrow: { color: colors.violet, width: 25, textAlign: 'center', fontSize: 20 }, breakdownBody: { paddingLeft: 10, paddingBottom: 10 }, notFoundBox: { backgroundColor: '#F2EDF5', borderWidth: 1, borderColor: '#E4D9EA', borderRadius: 11, padding: 10, marginTop: 9 }, notFoundEyebrow: { color: colors.violet, fontSize: 7, fontWeight: '800', letterSpacing: .8 }, notFoundItems: { color: colors.ink, fontSize: 9, lineHeight: 14, marginTop: 6 }, notFoundCopy: { color: colors.muted, fontSize: 8, lineHeight: 12, marginTop: 5 },
  exclusionPanel: { backgroundColor: '#FFF1EB', borderWidth: 1, borderColor: '#F0D4C9', borderRadius: 14, padding: 11, marginTop: 13 }, snapshotHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, exclusionEyebrow: { color: '#985847', fontSize: 7, fontWeight: '800', letterSpacing: .75, flex: 1 }, exclusionCount: { color: '#8C493D', backgroundColor: '#F4D9CF', borderRadius: 9, minWidth: 23, textAlign: 'center', overflow: 'hidden', paddingVertical: 3, fontSize: 8, fontWeight: '800' }, exclusionItem: { borderTopWidth: 1, borderTopColor: '#EBD5CD', marginTop: 8, paddingTop: 8 }, exclusionTitle: { color: colors.ink, fontSize: 11, fontWeight: '700' }, exclusionValue: { color: '#74534E', fontSize: 9, lineHeight: 13, marginTop: 3 }, exclusionSource: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingRight: 8 }, exclusionSourceText: { color: '#9B5140', fontSize: 7, fontWeight: '800', letterSpacing: .45 }, exclusionFoot: { color: '#765B55', fontSize: 8, lineHeight: 12, marginTop: 4 }, clarifyPanel: { backgroundColor: '#FBF1DE', borderWidth: 1, borderColor: '#ECDAB8', borderRadius: 14, padding: 11, marginTop: 10 }, clarifyEyebrow: { color: '#946B27', fontSize: 7, fontWeight: '800', letterSpacing: .8 }, clarifyItem: { borderTopWidth: 1, borderTopColor: '#EDE0C8', marginTop: 8, paddingTop: 8 }, clarifyTitle: { color: colors.ink, fontSize: 11, fontWeight: '700' }, clarifyValue: { color: '#6E5A3A', fontSize: 9, lineHeight: 13, marginTop: 3 }, clarifySource: { color: '#946B27', fontSize: 7, fontWeight: '800', letterSpacing: .5, paddingVertical: 7 },
  recordReplyButton: { alignSelf: 'flex-start', minHeight: 38, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 10, backgroundColor: '#F5E7C9', marginTop: 4 }, recordReplyButtonText: { color: '#76581F', fontSize: 7, fontWeight: '800', letterSpacing: .5 }, replyUnavailable: { color: '#8C6C32', fontSize: 8, lineHeight: 12, marginTop: 6 }, replyForm: { backgroundColor: '#FFF9EF', borderWidth: 1, borderColor: '#EEDDBD', borderRadius: 12, padding: 10, marginTop: 8 }, replyPrompt: { color: '#946B27', fontSize: 7, fontWeight: '800', letterSpacing: .6, marginTop: 6 }, replyQuestion: { color: '#6E5A3A', fontSize: 9, lineHeight: 14, marginTop: 3 }, replyInput: { minHeight: 86, maxHeight: 180, borderWidth: 1, borderColor: '#DED6E1', borderRadius: 10, backgroundColor: '#FFFFFF', color: colors.ink, fontSize: 11, lineHeight: 16, padding: 10, marginTop: 8 }, replyPrivacy: { color: colors.muted, fontSize: 8, lineHeight: 12, marginTop: 7 }, saveReplyButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cobalt, borderRadius: 10, marginTop: 9 }, saveReplyButtonText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800', letterSpacing: .55 }, userReplyPanel: { backgroundColor: '#EEF5F0', borderWidth: 1, borderColor: '#CCDED1', borderRadius: 14, padding: 11, marginTop: 10 }, userReplyEyebrow: { color: '#367456', fontSize: 7, fontWeight: '800', letterSpacing: .7 }, userReplyNotice: { color: '#536D5B', fontSize: 8, lineHeight: 12, marginTop: 5 }, userReplyItem: { borderTopWidth: 1, borderTopColor: '#D6E4D9', marginTop: 8, paddingTop: 8 }, userReplyLabel: { color: colors.ink, fontSize: 10, fontWeight: '700' }, userReplyText: { color: colors.ink, fontSize: 9, lineHeight: 14, marginTop: 3 }, userReplyStatus: { alignSelf: 'flex-start', color: '#367456', backgroundColor: '#DCECE0', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, fontSize: 7, fontWeight: '800', letterSpacing: .4, marginTop: 7 },
  healthFitCard: { backgroundColor: '#F2EDF5', borderWidth: 1, borderColor: '#DED1E5', borderRadius: 15, padding: 12, marginTop: 14 }, healthFitOrb: { width: 35, height: 35, borderRadius: 13, backgroundColor: '#F0E1E6', alignItems: 'center', justifyContent: 'center' }, healthFitCopy: { marginTop: 8 }, healthFitEyebrow: { color: colors.violet, fontSize: 7, fontWeight: '800', letterSpacing: .8 }, healthFitTitle: { color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 4 }, healthFitBody: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 4 }, healthFitButton: { minHeight: 43, backgroundColor: colors.cobalt, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, healthFitButtonText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800', letterSpacing: .65 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }, sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '500', marginTop: 4 }, sectionCount: { color: '#918A99', fontSize: 11 }, policyCard: { marginBottom: 13, padding: 14 }, policyHead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, policyMark: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center' }, policyMarkText: { color: colors.cobalt, fontSize: 17 }, policyEyebrow: { color: '#92899A', fontSize: 7, fontWeight: '700', letterSpacing: 1.1 }, sourceLinked: { color: '#60456D', backgroundColor: '#F0E6F1', fontSize: 7, fontWeight: '700', letterSpacing: 0.7, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 }, sourceBand: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, backgroundColor: colors.bluePale, padding: 9, marginTop: 12 }, sourceBandIcon: { color: colors.cobalt, fontSize: 12 }, sourceBandText: { color: '#4A668D', fontSize: 9, fontWeight: '500', flex: 1 }, term: { borderTopWidth: 1, borderTopColor: '#EBE8EF', paddingTop: 12, marginTop: 12 }, previousTerm: { borderTopColor: '#E7DDEA' }, termTop: { flexDirection: 'row', alignItems: 'center', gap: 7 }, termLabel: { color: colors.ink, fontSize: 13, fontWeight: '600', flex: 1 }, termType: { color: colors.cobalt, backgroundColor: colors.bluePale, fontSize: 6, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 }, previousTermType: { color: '#684F71', backgroundColor: '#F0E6F1' }, termValue: { color: '#4C4854', fontSize: 11, lineHeight: 16, marginTop: 5 }, plainMeaning: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 6 }, plainMeaningLead: { color: colors.violet, fontSize: 7, fontWeight: '800', letterSpacing: .45 }, termEvidence: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingRight: 8 }, termEvidenceText: { color: colors.cobalt, fontSize: 7, fontWeight: '800', letterSpacing: .45 }, sourceNote: { color: '#716A79', fontSize: 10, lineHeight: 15, backgroundColor: '#F5F2F6', padding: 9, borderRadius: 9, marginTop: 8 }, sourceNoteLead: { color: '#684F71', fontSize: 8, fontWeight: '700', letterSpacing: 0.5 }, quoteMissing: { color: '#8C6C32', fontSize: 9, lineHeight: 14, marginTop: 8 }, termMeta: { color: '#918A99', fontSize: 8, marginTop: 6 }, noCurrentTerms: { color: '#716A79', fontSize: 10, lineHeight: 15, marginTop: 12 }, historyToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E7DDEA', marginTop: 14, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F6EFF7' }, historyTogglePressed: { backgroundColor: '#EFE4F0' }, historyTitle: { color: '#5F4569', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }, historySubtitle: { color: '#817687', fontSize: 8, marginTop: 3 }, historyArrow: { color: '#5F4569', fontSize: 20, fontWeight: '500', marginLeft: 12 }, historyEntries: { paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: '#CFB6D0', marginLeft: 4 },
  relationshipNotice: { backgroundColor: '#F3EDF5', borderWidth: 1, borderColor: '#E3D6E8', borderRadius: 14, padding: 11, marginTop: 12 }, relationshipHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 }, relationshipTitle: { color: colors.violet, fontSize: 8, fontWeight: '800', letterSpacing: 0.75, lineHeight: 12 }, relationshipSource: { color: colors.ink, fontSize: 11, fontWeight: '700', lineHeight: 15, marginTop: 4 }, relationshipNote: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 5 }, relationSourceButton: { minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 11, backgroundColor: colors.bluePale, borderWidth: 1, borderColor: '#C9DBFA', paddingHorizontal: 10, marginTop: 8 }, relationSourceButtonText: { color: colors.cobalt, fontSize: 8, fontWeight: '800', letterSpacing: 0.55 },
  comparisonCard: { backgroundColor: '#F5F0F6', borderWidth: 1, borderColor: '#E3D7E8', borderRadius: 15, padding: 11, marginTop: 12 }, comparisonHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 }, removeRelation: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E3D2C1', backgroundColor: '#FFF9F1' }, removeRelationText: { color: '#93633A', fontSize: 7, fontWeight: '800', letterSpacing: 0.5 }, comparisonNote: { color: '#665E6B', fontSize: 9, lineHeight: 14, marginTop: 8 }, noComparison: { color: colors.muted, fontSize: 9, lineHeight: 13, backgroundColor: colors.surface, borderRadius: 10, padding: 9, marginTop: 9 }, comparisonRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#E6DFE9', borderRadius: 12, padding: 9, marginTop: 8 }, comparisonDifferent: { backgroundColor: '#FFF7EF', borderColor: '#EBD6C0' }, comparisonTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }, comparisonTermLabel: { flex: 1, color: colors.ink, fontSize: 10, fontWeight: '700' }, comparisonStatus: { color: colors.violet, fontSize: 6, fontWeight: '800', letterSpacing: 0.4, textAlign: 'right', maxWidth: '56%' }, comparisonStatusDifferent: { color: '#9A6327' }, comparisonSideLabel: { color: '#817687', fontSize: 7, fontWeight: '800', letterSpacing: 0.35, marginTop: 7 }, comparisonValue: { color: '#4C4653', fontSize: 9, lineHeight: 13, marginTop: 2 }, comparisonEvidenceTerm: { borderLeftWidth: 2, borderLeftColor: '#D6C7DE', paddingLeft: 7, marginTop: 3 }, evidenceButton: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', paddingRight: 8 }, evidenceButtonText: { color: colors.cobalt, fontSize: 7, fontWeight: '800', letterSpacing: 0.5 }, relationActions: { gap: 2, marginTop: 4 },
  changeSummary: { backgroundColor: '#493553', borderWidth: 1, borderColor: '#68516F', borderRadius: 13, padding: 11, marginTop: 10 }, changeSummaryEyebrow: { color: '#EBC9D2', fontSize: 7, fontWeight: '800', letterSpacing: 0.9 }, changeSummaryCounts: { color: '#FFF9F3', fontSize: 11, fontWeight: '600', marginTop: 4 }, changeObservation: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.16)', marginTop: 8, paddingTop: 8 }, changeKind: { fontSize: 7, fontWeight: '800', letterSpacing: 0.65 }, changeKindCaution: { color: '#F5C58D' }, changeKindPositive: { color: '#A8DEC4' }, changeTerm: { color: '#FFF9F3', fontSize: 10, fontWeight: '600', marginTop: 3 }, changeValues: { color: '#E5DCE8', fontSize: 9, marginTop: 2 }, changeFoot: { color: '#E5DCE8', fontSize: 8, lineHeight: 12, marginTop: 7 }, changeDisclaimer: { color: '#EAC5AC', fontSize: 8, lineHeight: 12, marginTop: 8 }, askCompare: { minHeight: 43, justifyContent: 'center', alignItems: 'center', borderRadius: 11, backgroundColor: colors.cobalt, paddingHorizontal: 9, marginTop: 9 }, askCompareText: { color: '#FFFFFF', fontSize: 7, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
  changeEvidenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 }, changeEvidenceButton: { minHeight: 32, justifyContent: 'center', paddingRight: 8 },
  linkOlderButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#EEE7F1', borderWidth: 1, borderColor: '#DED2E4', marginTop: 10 }, linkOlderButtonText: { color: colors.violet, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 }, linkChooser: { backgroundColor: '#F7F2F8', borderWidth: 1, borderColor: '#E4D9EA', borderRadius: 13, padding: 10, marginTop: 8 }, linkChooserTitle: { color: colors.ink, fontSize: 11, fontWeight: '700' }, linkChooserNote: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 4 }, olderChoice: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 9, marginTop: 7 }, olderChoiceSelected: { backgroundColor: colors.bluePale, borderColor: '#AAC9FF' }, olderChoiceTitle: { color: colors.ink, fontSize: 9, fontWeight: '700' }, olderChoiceMeta: { color: colors.muted, fontSize: 8, marginTop: 3 }, confirmReplacement: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: colors.cobalt, paddingHorizontal: 10, marginTop: 8 }, confirmReplacementText: { color: '#FFFFFF', fontSize: 7, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' }, disabled: { opacity: 0.6 }, replacementError: { color: '#8A3F32', backgroundColor: '#FFF0E8', borderWidth: 1, borderColor: '#F0CCBA', borderRadius: 10, padding: 8, marginTop: 8, fontSize: 9, lineHeight: 13 },
  askAction: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#F5F0F8', borderWidth: 1, borderColor: '#E5DCEB', borderRadius: 13, padding: 10, marginTop: 14 }, askOrb: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#F4E6E6', alignItems: 'center', justifyContent: 'center' }, askTitle: { color: '#483250', fontSize: 11, fontWeight: '600' }, askSubtitle: { color: '#827A89', fontSize: 8, marginTop: 2 }, askArrow: { color: '#483250', fontSize: 17 },
  emptyCard: { alignItems: 'flex-start', padding: 17, marginBottom: 14 }, emptyIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center', marginBottom: 11 }, emptyGlyph: { color: colors.cobalt, fontSize: 22 }, emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' }, emptyBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 7 }, emptySteps: { width: '100%', borderTopWidth: 1, borderTopColor: '#ECE8EF', marginTop: 13, paddingTop: 9, gap: 8 }, step: { color: '#655D6B', fontSize: 9, fontWeight: '500' }, primary: { minHeight: 58, borderRadius: radius.md, backgroundColor: colors.cobalt, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }, primaryTitle: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, primarySub: { color: 'rgba(255,255,255,.78)', fontSize: 9, marginTop: 3 }, primaryArrow: { color: '#FFF', fontSize: 22 }, disclaimer: { color: colors.quiet, fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 11 },
  replyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 },
  replyActionButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: '#D8CEDB', backgroundColor: '#FFFFFF' },
  replyActionText: { color: '#55495D', fontSize: 8, fontWeight: '800', letterSpacing: .45 },
  replyActionPrimary: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.cobalt },
  replyActionPrimaryText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800', letterSpacing: .45 },
  replyActionDelete: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: '#E7C7BA', backgroundColor: '#FFF5F1' },
  replyActionDeleteText: { color: '#8C493D', fontSize: 8, fontWeight: '800', letterSpacing: .45 },
  replyDeleteConfirm: { backgroundColor: '#FFF5F1', borderWidth: 1, borderColor: '#E9CFC4', borderRadius: 11, padding: 10, marginTop: 9 },
  replyDeleteText: { color: '#72534C', fontSize: 9, lineHeight: 14 },
  replyEditPrivacy: { color: '#6E6675', fontSize: 8, lineHeight: 12, marginTop: 6 },
});
