import React, { useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AccessibilityInfo, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Orb } from '../src/components/Orb';
import { GlassMaterial } from '../src/components/GlassMaterial';
import { Atmosphere } from '../src/components/ambient/Atmosphere';
import { ProfileSetupProgress } from '../src/components/ProfileSetupProgress';
import { Surface } from '../src/components/Surface';
import { HealthFact, IntakeAsset, useNura } from '../src/state/NuraContext';
import { groupInsurancePolicyTerms } from '../src/services/insurancePolicyHistory.mjs';
import { buildInsuranceRegistryOverview, buildInsuranceSnapshot, clarificationQuestion, interpretInsuranceTerm } from '../src/services/insuranceSnapshot.mjs';
import { comparePolicyDocuments, independentPolicyComparisonCandidates, resolvePolicyReplacementLinks, summarizePolicyDifferences } from '../src/services/policyReplacement.mjs';
import { policySourceAsset, policyTermEvidenceAction, policyTermEvidenceTarget } from '../src/services/policyTermEvidence.mjs';
import { documentDisplayName, documentOriginalName } from '../src/services/documentPresentation.mjs';
import { formatClaimValue } from '../src/services/claimValue.mjs';
import { getSourceClaims } from '../src/services/intakeClient';
import type { CandidateClaim, LocalSource } from '../src/services/intakeClient';
import { DocumentContextCard } from '../src/components/DocumentContextCard';
import { isPolicyClarificationSourceCurrent } from '../src/services/policyClarification.mjs';
import { buildPolicyExtractionReview } from '../src/services/policyExtractionReview.mjs';

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
  return policyTermEvidenceAction(term, assets).label;
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

function InsuranceLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export default function InsuranceRegistry() {
  const params = useLocalSearchParams<{ firstRun?: string }>();
  const firstRun = params.firstRun === 'true';
  const { facts, assets, policyReplacements, policyClarifications, addPolicyReplacement, removePolicyReplacement, addPolicyClarification, editPolicyClarification, removePolicyClarification, reconcileSourceFactValue, removeSavedSource, resolveProfileSetupSection } = useNura();
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
  const [comparisonPickerFor, setComparisonPickerFor] = useState<string | null>(null);
  const [independentComparison, setIndependentComparison] = useState<{ leftSourceId: string; rightSourceId: string } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sourceClaimValues, setSourceClaimValues] = useState<Record<string, string>>({});
  const [expandedExtractionReviewId, setExpandedExtractionReviewId] = useState<string | null>(null);
  const [sourceClaimsReadyKey, setSourceClaimsReadyKey] = useState('');
  const [unregisteredSourceReviews, setUnregisteredSourceReviews] = useState<{ key: string; results: Record<string, { source: LocalSource; claims: CandidateClaim[] } | null>; loading: boolean }>({ key: '', results: {}, loading: false });
  const [setupChoiceBusy, setSetupChoiceBusy] = useState(false);
  const [setupChoiceError, setSetupChoiceError] = useState('');
  const [confirmRemoveSourceId, setConfirmRemoveSourceId] = useState<string | null>(null);
  const [removingSourceId, setRemovingSourceId] = useState<string | null>(null);
  const [removeSourceError, setRemoveSourceError] = useState<{ sourceId: string; message: string } | null>(null);
  const [confirmRemovePendingAssetId, setConfirmRemovePendingAssetId] = useState<string | null>(null);
  const [removingPendingAssetId, setRemovingPendingAssetId] = useState<string | null>(null);
  const [pendingAssetRemovalError, setPendingAssetRemovalError] = useState<{ assetId: string; message: string } | null>(null);
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
  const insuranceAssets = useMemo(() => assets.filter((asset) => asset.purpose === 'insurance'), [assets]);
  const unregisteredSourceAssets = useMemo(() => insuranceAssets.filter((asset) => asset.serverSourceId && !policyBySource.has(asset.serverSourceId)), [insuranceAssets, policyBySource]);
  const unregisteredSourceKey = unregisteredSourceAssets.map((asset) => `${asset.id}:${asset.serverSourceId}`).join('|');
  useEffect(() => {
    let active = true;
    if (!unregisteredSourceKey) return () => { active = false; };
    void Promise.all(unregisteredSourceAssets.map(async (asset) => {
      if (!asset.serverSourceId) return [asset.id, null] as const;
      try { return [asset.id, await getSourceClaims(asset.serverSourceId)] as const; }
      catch { return [asset.id, null] as const; }
    })).then((entries) => {
      if (active) setUnregisteredSourceReviews({ key: unregisteredSourceKey, results: Object.fromEntries(entries), loading: false });
    });
    return () => { active = false; };
  }, [unregisteredSourceAssets, unregisteredSourceKey]);
  const policyLinkResolutions = useMemo<PolicyLinkResolution[]>(() => resolvePolicyReplacementLinks(
    policyReplacements,
    policies,
    assets.filter((asset) => asset.purpose === 'insurance' && asset.serverSourceId).map((asset) => asset.serverSourceId as string),
  ), [policyReplacements, policies, assets]);
  const sourceAssetById = useMemo(() => new Map(assets.filter((asset) => asset.purpose === 'insurance' && asset.serverSourceId).map((asset) => [asset.serverSourceId as string, asset])), [assets]);
  const policyLinksNeedingReview = policyLinkResolutions.filter((link) => link.status === 'needs_review');
  const snapshotBySource = useMemo(() => new Map(policies.map((policy) => [policy.sourceId, buildInsuranceSnapshot(policy.currentTerms)])), [policies]);
  const waiting = insuranceAssets.filter((asset) => !asset.serverSourceId);
  const termCount = policies.reduce((total, policy) => total + policy.currentTerms.length, 0);
  const historyCount = policies.reduce((total, policy) => total + policy.previousTerms.length + policy.removedTerms.length, 0);
  const exclusionCount = policies.reduce((total, policy) => total + (snapshotBySource.get(policy.sourceId)?.exclusions.length ?? 0), 0);
  const clarificationCount = policies.reduce((total, policy) => total + (snapshotBySource.get(policy.sourceId)?.clarifications.length ?? 0), 0);
  const notFoundMedicalCount = policies.reduce((total, policy) => total + (snapshotBySource.get(policy.sourceId)?.notFoundMedicalDetails.length ?? 0), 0);
  const canChooseNoPolicy = firstRun && policies.length === 0 && insuranceAssets.length === 0 && policyLinksNeedingReview.length === 0;

  async function chooseNoPolicy() {
    if (!canChooseNoPolicy || setupChoiceBusy) return;
    setSetupChoiceBusy(true);
    setSetupChoiceError('');
    try {
      await resolveProfileSetupSection('insurance', 'none');
      router.replace('/setup');
    } catch {
      setSetupChoiceError('Your choice could not be saved. Please try again.');
    } finally {
      setSetupChoiceBusy(false);
    }
  }

  async function continueProfileSetup() {
    if (!firstRun || setupChoiceBusy) return;
    setSetupChoiceBusy(true);
    setSetupChoiceError('');
    try {
      await resolveProfileSetupSection('insurance', 'saved');
      router.replace('/setup');
    } catch {
      setSetupChoiceError('Your progress could not be saved. Please try again.');
    } finally {
      setSetupChoiceBusy(false);
    }
  }

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
    const asset = policySourceAsset(sourceId, assets);
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

  async function removePolicySource(sourceId: string) {
    if (removingSourceId) return;
    const asset = sourceAssetById.get(sourceId);
    setRemovingSourceId(sourceId);
    setRemoveSourceError(null);
    try {
      await removeSavedSource(sourceId, asset?.id);
      setConfirmRemoveSourceId(null);
      setIndependentComparison(null);
    } catch (error) {
      setRemoveSourceError({ sourceId, message: error instanceof Error ? error.message : 'This document could not be removed. Try again.' });
    } finally {
      setRemovingSourceId(null);
    }
  }

  async function removePendingPolicyFile(assetId: string) {
    if (removingPendingAssetId) return;
    setRemovingPendingAssetId(assetId);
    setPendingAssetRemovalError(null);
    try {
      // The source has not been analyzed, so removing by local asset ID deletes
      // only the app-owned file and inventory entry.
      await removeSavedSource(null, assetId);
      setConfirmRemovePendingAssetId(null);
    } catch (error) {
      setPendingAssetRemovalError({ assetId, message: error instanceof Error ? error.message : 'This file could not be removed. Try again.' });
    } finally {
      setRemovingPendingAssetId(null);
    }
  }

  const policySourceName = (sourceId: string) => {
    const asset = sourceAssetById.get(sourceId);
    const policy = policyBySource.get(sourceId);
    return asset ? documentDisplayName(asset, facts) : policy?.sourceName || (policy ? 'Insurance policy · reviewed terms' : 'Insurance policy');
  };
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

  return <View style={styles.page}><Atmosphere /><StatusBar style="light" /><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}><Text style={styles.back}>‹  Back</Text></Pressable>
    <View style={styles.brandRow}><Orb size={38} /><View style={{ flex: 1 }}><Text style={styles.brand}>nura</Text><Text style={styles.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View><Text style={styles.privacy}>PRIVATE BY DESIGN</Text></View>
    {firstRun ? <ProfileSetupProgress step={5} /> : null}
    <InsuranceLabel>YOUR INSURANCE</InsuranceLabel>
    <View style={styles.titleRow}><View style={{ flex: 1 }}><Text style={styles.title}>Insurance</Text><Text style={styles.subtitle}>{firstRun ? 'Add a policy document, or continue without one.' : 'Your policy details and source documents.'}</Text></View><View style={styles.countBadge}><Text style={styles.countNumber}>{String(policies.length).padStart(2, '0')}</Text><Text style={styles.countLabel}>SOURCES</Text></View></View>

    {policies.length > 0 && <Surface tone="dark" style={styles.summary}>
      <View style={styles.summaryHead}><View style={{ flex: 1 }}><Text style={styles.summaryEyebrow}>POLICY SNAPSHOT</Text><Text style={styles.summaryTitle}>{String(policies.length).padStart(2, '0')} {policies.length === 1 ? 'policy' : 'policies'} · {String(termCount).padStart(2, '0')} confirmed terms</Text></View><View style={styles.summaryOrb}><Orb size={28} /></View></View>
      <View style={styles.summaryMetrics}><View style={styles.summaryMetric}><Text style={styles.summaryMetricValue}>{String(exclusionCount).padStart(2, '0')}</Text><Text style={styles.summaryMetricLabel}>EXCLUSIONS</Text></View><View style={styles.summaryMetricRule} /><View style={styles.summaryMetric}><Text style={styles.summaryMetricValue}>{String(clarificationCount).padStart(2, '0')}</Text><Text style={styles.summaryMetricLabel}>MARKED UNCLEAR</Text></View><View style={styles.summaryMetricRule} /><View style={styles.summaryMetric}><Text style={styles.summaryMetricValue}>{String(notFoundMedicalCount).padStart(2, '0')}</Text><Text style={styles.summaryMetricLabel}>DETAILS TO CHECK</Text></View></View>
      <Text style={styles.summaryBody}>Exclusions appear only when saved policy wording says so. “Not found” items are absent from this approved summary; that does not mean they are not covered.</Text>
      {historyCount > 0 && <Text style={styles.summaryHistory}>{String(historyCount).padStart(2, '0')} earlier or removed terms kept in review history</Text>}
    </Surface>}

    {waiting.length > 0 && <Surface tone="dark" style={styles.waitingCard}><InsuranceLabel>READY FOR SOURCE REVIEW · {waiting.length}</InsuranceLabel>{waiting.map((asset) => <View key={asset.id} style={styles.waitingItem}><View style={styles.waitingRow}><View style={styles.fileIcon}><Text style={styles.fileIconText}>{asset.kind === 'pdf' ? 'PDF' : 'IMG'}</Text></View><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.policyName}>{documentDisplayName(asset, facts)}</Text><Text numberOfLines={1} style={styles.muted}>Original file · {documentOriginalName(asset)}</Text><Text style={styles.muted}>Saved on this device · not yet analyzed</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Review ${documentOriginalName(asset)}`} onPress={() => router.push({ pathname: '/review', params: { purpose: 'insurance' } })}><Text style={styles.link}>Review →</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${documentOriginalName(asset)}`} onPress={() => { setPendingAssetRemovalError(null); setConfirmRemovePendingAssetId(asset.id); }} style={styles.waitingRemove}><Text style={styles.waitingRemoveText}>Remove</Text></Pressable></View>{confirmRemovePendingAssetId === asset.id && <View style={styles.removeSourceConfirm}><Text style={styles.removeSourceConfirmText}>Remove this unreviewed file and its saved copy from Nura?</Text>{pendingAssetRemovalError?.assetId === asset.id && <Text accessibilityRole="alert" style={styles.replacementError}>{pendingAssetRemovalError.message}</Text>}<View style={styles.removeSourceActions}><Pressable accessibilityRole="button" disabled={removingPendingAssetId === asset.id} onPress={() => setConfirmRemovePendingAssetId(null)} style={styles.removeSourceCancel}><Text style={styles.removeSourceCancelText}>Keep file</Text></Pressable><Pressable accessibilityRole="button" disabled={removingPendingAssetId === asset.id} onPress={() => void removePendingPolicyFile(asset.id)} style={[styles.removeSourceButton, removingPendingAssetId === asset.id && styles.disabled]}><Text style={styles.removeSourceButtonText}>{removingPendingAssetId === asset.id ? 'REMOVING…' : 'REMOVE FILE'}</Text></Pressable></View></View>}</View>)}</Surface>}

    {unregisteredSourceAssets.length > 0 && <View style={styles.unregisteredSources}>
      <View style={styles.sectionHead}><View><InsuranceLabel>UPLOADED POLICY SOURCES</InsuranceLabel><Text style={styles.sectionTitle}>Terms to review</Text></View><Text style={styles.sectionCount}>{String(unregisteredSourceAssets.length).padStart(2, '0')}</Text></View>
      {unregisteredSourceAssets.map((asset) => {
        const sourceId = asset.serverSourceId;
        if (!sourceId) return null;
        const review = unregisteredSourceReviews.key === unregisteredSourceKey ? unregisteredSourceReviews.results[asset.id] : undefined;
        const policyClaims = review?.claims.filter((claim) => claim.kind === 'coverage_term') ?? [];
        const extractionReview = review ? buildPolicyExtractionReview({ claims: review.claims, documentContext: review.source.documentContext }) : null;
        const reviewableTerms = policyClaims.filter((claim) => ['candidate', 'needs_review'].includes(claim.evidenceState));
        const purposeNeedsConfirmation = review?.source.state === 'purpose_confirmation_required';
        const retryNeeded = review?.source.state === 'extracted_empty' || review?.source.state === 'failed' || purposeNeedsConfirmation;
        const detectedType = asset.documentType?.trim() || review?.source.documentContext?.documentType?.trim() || review?.source.documentPurposeCheck?.kind.replaceAll('_', ' ') || '';
        const likelyWrongDocument = purposeNeedsConfirmation;
        return <Surface tone="dark" key={asset.id} style={styles.unregisteredSourceCard}>
          <View style={styles.policyHead}><View style={styles.policyMark}><Text style={styles.policyMarkText}>▤</Text></View><View style={{ flex: 1 }}><Text style={styles.policyEyebrow}>{reviewableTerms.length ? `${reviewableTerms.length} TERMS NEED YOUR REVIEW` : 'SOURCE DETAILS · NO APPROVED TERMS'}</Text><Text style={styles.policyName}>{documentDisplayName(asset, facts)}</Text></View><Text style={styles.sourceLinked}>SAVED</Text></View>
          <Text style={styles.unregisteredSourceNote}>{unregisteredSourceReviews.loading || review === undefined
            ? 'Loading the saved source review…'
            : review === null
              ? 'Nura could not reopen the saved extraction. Open source review to check it again.'
              : reviewableTerms.length
                ? 'These are suggestions from the policy. They stay out of your Insurance Registry until you review and approve them.'
              : purposeNeedsConfirmation
                ? 'Nura could not confirm this is an insurance policy. No policy details have been extracted or added. Open source review to confirm the category, change it, or remove the file.'
              : retryNeeded
                ? 'The insurer details identify the document, but no coverage terms were readable. Nothing has been added to your Insurance Registry.'
                : 'The source has document details but no pending coverage terms. Insurer information is not a coverage benefit.'}</Text>
          {detectedType ? <View style={[styles.sourceTypeCallout, likelyWrongDocument && styles.sourceTypeCalloutWarning]}>
            <Text style={styles.sourceTypeCalloutTitle}>{likelyWrongDocument ? 'CATEGORY NEEDS YOUR CONFIRMATION' : 'DOCUMENT TYPE READ BY NURA'}</Text>
            <Text style={styles.sourceTypeCalloutBody}>Nura identified this source as “{detectedType}.” {likelyWrongDocument ? 'No policy terms were extracted. Confirm or change its category in source review before reading details.' : 'Check that this matches the policy you intended to add.'}</Text>
            {likelyWrongDocument ? <Pressable accessibilityRole="button" onPress={() => openPolicySource(sourceId)} style={styles.sourceFitKeep}><Text style={styles.sourceFitKeepText}>Confirm document category →</Text></Pressable> : null}
          </View> : null}
          {review?.source.documentContext ? <DocumentContextCard context={review.source.documentContext} compact /> : null}
          {!purposeNeedsConfirmation && extractionReview && <View style={styles.extractionReview}>
            <View style={styles.extractionReviewHeading}><View style={{ flex: 1 }}><Text style={styles.extractionReviewEyebrow}>POLICY BRIEF · EXTRACTION CHECK</Text><Text style={styles.extractionReviewTitle}>{extractionReview.counts.identified} areas identified · {extractionReview.counts.needsReview} to check · {extractionReview.counts.notIdentified} not identified</Text></View></View>
            {(expandedExtractionReviewId === sourceId ? extractionReview.sections : extractionReview.sections.slice(0, 4)).map((section) => <View key={section.id} style={styles.extractionReviewSection}>
              <View style={styles.extractionReviewRow}><Text style={styles.extractionReviewSectionTitle}>{section.title}</Text><Text style={[styles.extractionReviewStatus, section.status === 'identified' ? styles.extractionReviewStatusFound : section.status === 'needs_review' ? styles.extractionReviewStatusCheck : styles.extractionReviewStatusMissing]}>{section.status === 'identified' ? 'IDENTIFIED' : section.status === 'needs_review' ? 'CHECK' : 'NOT IDENTIFIED'}</Text></View>
              {section.evidence.length > 0 ? section.evidence.map((item, index) => <View key={item.claimId ?? `${section.id}:${index}`} style={styles.extractionEvidence}>
                <Text style={styles.extractionEvidenceLabel}>{item.label}{item.value ? ` · ${item.value}` : ''}</Text>
                {item.quote ? <Text style={styles.extractionEvidenceQuote}>“{item.quote}”{item.page ? ` · Page ${item.page}` : ''}</Text> : <Text style={styles.extractionEvidenceQuote}>No source quote was returned for this suggestion.</Text>}
              </View>) : <Text style={styles.extractionNotFound}>Not identified in this extraction. Check the full policy; this does not mean the detail is excluded.</Text>}
            </View>)}
            {extractionReview.sections.length > 4 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: expandedExtractionReviewId === sourceId }} onPress={() => setExpandedExtractionReviewId((current) => current === sourceId ? null : sourceId)} style={styles.extractionReviewToggle}><Text style={styles.extractionReviewToggleText}>{expandedExtractionReviewId === sourceId ? 'SHOW FEWER AREAS  ↑' : `SHOW ALL ${extractionReview.sections.length} AREAS  ↓`}</Text></Pressable>}
            <Text style={styles.extractionReviewNote}>{extractionReview.note}</Text>
          </View>}
          {!purposeNeedsConfirmation && reviewableTerms.slice(0, 4).map((claim) => <View key={claim.id} style={styles.candidatePolicyTerm}>
            <Text style={styles.candidatePolicyTermTitle}>{claim.label}{claim.value ? ` · ${formatClaimValue(claim.value, claim.unit)}` : ''}</Text>
            {claim.sourceLocation.quote ? <Text numberOfLines={3} style={styles.candidatePolicyQuote}>“{claim.sourceLocation.quote}”{claim.sourceLocation.page ? ` · Page ${claim.sourceLocation.page}` : ''}</Text> : null}
          </View>)}
          <Pressable accessibilityRole="button" accessibilityLabel={`${retryNeeded ? 'Retry or confirm category for' : 'Review'} policy source ${documentDisplayName(asset, facts)}`} accessibilityHint={retryNeeded ? 'Opens the source review where you can check the document category or retry this file.' : 'Opens the quoted policy terms so you can review what to save.'} onPress={() => openPolicySource(sourceId)} style={styles.unregisteredSourceAction}>
            <Text style={styles.unregisteredSourceActionText}>{purposeNeedsConfirmation ? 'CONFIRM CATEGORY' : retryNeeded ? 'RETRY READING THIS POLICY' : reviewableTerms.length ? 'REVIEW EXTRACTED TERMS' : 'OPEN SOURCE REVIEW'}  →</Text>
          </Pressable>
          {confirmRemoveSourceId === sourceId ? <View style={styles.removeSourceConfirm}>
            <Text style={styles.removeSourceConfirmText}>Remove this document and the details derived from it from Nura? This cannot be undone.</Text>
            {removeSourceError?.sourceId === sourceId ? <Text accessibilityRole="alert" style={styles.replacementError}>{removeSourceError.message}</Text> : null}
            <View style={styles.removeSourceActions}>
              <Pressable accessibilityRole="button" onPress={() => setConfirmRemoveSourceId(null)} style={styles.removeSourceCancel}><Text style={styles.removeSourceCancelText}>Keep document</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: removingSourceId === sourceId, busy: removingSourceId === sourceId }} disabled={removingSourceId === sourceId} onPress={() => void removePolicySource(sourceId)} style={styles.removeSourceButton}><Text style={styles.removeSourceButtonText}>{removingSourceId === sourceId ? 'Removing…' : 'Remove document'}</Text></Pressable>
            </View>
          </View> : <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${documentDisplayName(asset, facts)} from Nura`} accessibilityHint="Removes this document and its saved extracted details after confirmation." onPress={() => { setRemoveSourceError(null); setConfirmRemoveSourceId(sourceId); }} style={styles.removeSourceLink}><Text style={styles.removeSourceLinkText}>REMOVE THIS DOCUMENT</Text></Pressable>}
        </Surface>;
      })}
    </View>}

    {policyLinksNeedingReview.length > 0 && <Surface tone="dark" style={styles.linkRecoveryCard}>
      <InsuranceLabel>POLICY LINKS · NEEDS REVIEW</InsuranceLabel>
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
      {sourceAsset && <Pressable accessibilityRole="button" accessibilityLabel={`Review policy source ${policySourceName(side.sourceId)}`} onPress={() => openPolicySource(side.sourceId)} style={styles.linkRecoverySource}><Text style={styles.linkRecoverySourceText}>REVIEW SOURCE  ↗</Text></Pressable>}
            </View>;
          })}
          {sourceError && replacementError && <Text accessibilityRole="alert" style={styles.replacementError}>{replacementError.message}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel="Remove policy document link" disabled={removingReplacement === link.id} onPress={() => void removeReplacementLink(link.id, link.newerSourceId)} style={[styles.removeRelation, removingReplacement === link.id && styles.disabled]}><Text style={styles.removeRelationText}>{removingReplacement === link.id ? 'REMOVING…' : 'REMOVE DOCUMENT LINK'}</Text></Pressable>
        </View>;
      })}
    </Surface>}

    <View style={styles.sectionHead}><View><InsuranceLabel>YOUR POLICIES</InsuranceLabel><Text style={styles.sectionTitle}>{policies.length ? 'Terms and review history' : 'No policy added yet'}</Text></View><Text style={styles.sectionCount}>{String(policies.length).padStart(2, '0')}</Text></View>
    {policies.length ? policies.map((policy) => {
      const olderChoices = policies.filter((candidate) => candidate.sourceId !== policy.sourceId);
      const independentChoices = independentPolicyComparisonCandidates(policy.sourceId, policies, policyReplacements) as typeof policies;
      const sourceLinks = policyReplacements.filter((link) => link.newerSourceId === policy.sourceId || link.olderSourceId === policy.sourceId);
      const policyReplies = policyClarifications.filter((reply) => reply.sourceId === policy.sourceId);
      const snapshot = snapshotBySource.get(policy.sourceId) ?? buildInsuranceSnapshot(policy.currentTerms);
      const overview = buildInsuranceRegistryOverview(policy.currentTerms);
      const namedPolicy = snapshot.keyDetails.find(({ key }) => key === 'policy-name')?.term;
      const namedInsurer = snapshot.keyDetails.find(({ key }) => key === 'insurer')?.term;
      const policyTitle = namedPolicy ? displayTermValue(namedPolicy) : namedInsurer ? displayTermValue(namedInsurer) : policySourceName(policy.sourceId);
      const sourceAsset = sourceAssetById.get(policy.sourceId);
      return <Surface tone="dark" key={policy.sourceId} style={styles.policyCard}>
      <View style={styles.policyHead}><View style={styles.policyMark}><Text style={styles.policyMarkText}>▤</Text></View><View style={{ flex: 1 }}><Text style={styles.policyEyebrow}>INSURANCE POLICY</Text><Text style={styles.policyName}>{policyTitle}</Text></View><Text style={styles.sourceLinked}>SOURCE LINKED</Text></View>
      <View style={styles.sourceBand}><Text style={styles.sourceBandIcon}>⌑</Text><Text style={styles.sourceBandText}>{sourceAsset ? `Source file · ${documentOriginalName(sourceAsset)}` : 'Saved policy details'} · {policy.currentTerms.length} current entr{policy.currentTerms.length === 1 ? 'y' : 'ies'} · {policy.previousTerms.length} earlier · {policy.removedTerms.length} removed</Text></View>
      <View testID="policy-dossier" style={styles.keyDetailsCard}>
        <View style={styles.keyDetailsHeading}><Text style={styles.keyDetailsEyebrow}>POLICY DOSSIER · APPROVED DETAILS</Text><Text style={styles.keyDetailsCount}>{snapshot.keyDetails.length}</Text></View>
        {snapshot.keyDetails.length > 0 ? <>
          {(expandedKeyDetails === policy.sourceId ? snapshot.keyDetails : snapshot.keyDetails.slice(0, 4)).map(({ key, label, term }) => {
            const evidenceLabel = evidenceActionLabel(term, assets);
            return <Pressable key={`${key}:${term.id ?? term.label}`} accessibilityRole="button" accessibilityState={{ disabled: !evidenceLabel }} disabled={!evidenceLabel} accessibilityLabel={`${evidenceLabel ?? 'Source unavailable'} for ${term.label}`} onPress={() => openPolicyTermEvidence(term)} style={({ pressed }) => [styles.keyDetailRow, pressed && styles.keyDetailPressed, !evidenceLabel && styles.disabled]}>
              <View style={styles.keyDetailCopy}><Text style={styles.keyDetailLabel}>{label}</Text><Text style={styles.keyDetailValue}>{displayTermValue(term)}</Text><Text style={styles.keyDetailEvidence}>{evidenceLabel ? `${evidenceLabel} ↗` : 'SOURCE UNAVAILABLE'}</Text></View><Text style={styles.keyDetailArrow}>↗</Text>
            </Pressable>;
          })}
          {snapshot.keyDetails.length > 4 && <Pressable accessibilityRole="button" accessibilityLabel={expandedKeyDetails === policy.sourceId ? 'Show fewer approved policy terms' : `Show all ${snapshot.keyDetails.length} approved policy terms`} accessibilityHint="Expands or collapses the approved policy wording shown in this summary." accessibilityState={{ expanded: expandedKeyDetails === policy.sourceId }} onPress={() => {
            if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setExpandedKeyDetails((current) => current === policy.sourceId ? null : policy.sourceId);
          }} style={styles.keyDetailsFooterAction}><Text style={styles.keyDetailsFooter}>{expandedKeyDetails === policy.sourceId ? 'SHOW FEWER APPROVED TERMS  ↑' : `SHOW ALL ${snapshot.keyDetails.length} APPROVED TERMS  ↓`}</Text></Pressable>}
        </> : <Text style={styles.dossierEmpty}>No key policy details have been approved yet. Open the source review to inspect the document and choose which quoted terms to save.</Text>}
        <Text style={styles.dossierNote}>These are details you approved from this source. They do not confirm current eligibility or an insurer’s decision.</Text>
      </View>
      {confirmRemoveSourceId === policy.sourceId ? <View style={styles.removeSourceConfirm}>
        <Text style={styles.removeSourceConfirmText}>Remove this policy document and the details derived from it from Nura? This cannot be undone.</Text>
        {removeSourceError?.sourceId === policy.sourceId ? <Text accessibilityRole="alert" style={styles.replacementError}>{removeSourceError.message}</Text> : null}
        <View style={styles.removeSourceActions}>
          <Pressable accessibilityRole="button" onPress={() => setConfirmRemoveSourceId(null)} style={styles.removeSourceCancel}><Text style={styles.removeSourceCancelText}>Keep policy</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: removingSourceId === policy.sourceId, busy: removingSourceId === policy.sourceId }} disabled={removingSourceId === policy.sourceId} onPress={() => void removePolicySource(policy.sourceId)} style={styles.removeSourceButton}><Text style={styles.removeSourceButtonText}>{removingSourceId === policy.sourceId ? 'Removing…' : 'Remove policy'}</Text></Pressable>
        </View>
      </View> : <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${policySourceName(policy.sourceId)} and its saved details from Nura`} onPress={() => { setRemoveSourceError(null); setConfirmRemoveSourceId(policy.sourceId); }} style={styles.removeSourceLink}><Text style={styles.removeSourceLinkText}>REMOVE THIS SOURCE AND ITS SAVED DETAILS</Text></Pressable>}
      <View style={styles.registryOverview}>
        <View style={styles.registryOverviewHeading}><Text style={styles.registryOverviewTitle}>POLICY AT A GLANCE</Text><Text style={styles.registryOverviewCaption}>Approved wording only</Text></View>
        <View style={styles.registryOverviewGrid}>
          <View style={[styles.registryOverviewCell, styles.registryOverviewCoverage]}><Text style={styles.registryOverviewCount}>{overview.coverageDetails.length}</Text><Text style={styles.registryOverviewLabel}>STATED BENEFITS & LIMITS</Text></View>
          <View style={[styles.registryOverviewCell, styles.registryOverviewExcluded]}><Text style={styles.registryOverviewCount}>{overview.exclusions.length}</Text><Text style={styles.registryOverviewLabel}>EXPLICIT EXCLUSIONS</Text></View>
          <View style={[styles.registryOverviewCell, styles.registryOverviewClarify]}><Text style={styles.registryOverviewCount}>{overview.clarifications.length}</Text><Text style={styles.registryOverviewLabel}>WORDING TO CONFIRM</Text></View>
          <View style={[styles.registryOverviewCell, styles.registryOverviewMissing]}><Text style={styles.registryOverviewCount}>{overview.missingDetails.length}</Text><Text style={styles.registryOverviewLabel}>DETAILS NOT FOUND</Text></View>
        </View>
        <Text style={styles.registryOverviewNote}>A missing detail is unknown, not an exclusion. Open a source-linked term to check its wording.</Text>
      </View>
      {replacementError?.sourceId === policy.sourceId && <Text accessibilityRole="alert" style={styles.replacementError}>{replacementError.message}</Text>}
      {independentChoices.length > 0 && <View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: comparisonPickerFor === policy.sourceId }} accessibilityLabel={comparisonPickerFor === policy.sourceId ? 'Close side-by-side policy comparison' : 'Compare this policy with another saved policy'} onPress={() => {
          if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setComparisonPickerFor((current) => current === policy.sourceId ? null : policy.sourceId);
        }} style={styles.linkOlderButton}>
          <Text style={styles.linkOlderButtonText}>{comparisonPickerFor === policy.sourceId ? 'CLOSE SIDE-BY-SIDE COMPARISON' : 'COMPARE WITH ANOTHER POLICY'}</Text>
        </Pressable>
        {comparisonPickerFor === policy.sourceId && <View style={styles.linkChooser}>
          <Text style={styles.linkChooserTitle}>Choose another saved policy</Text>
          <Text style={styles.linkChooserNote}>This compares approved summaries only. It does not link the documents or say one replaced the other.</Text>
          {independentChoices.map((candidate) => <Pressable key={candidate.sourceId} accessibilityRole="button" accessibilityLabel={`Compare ${policySourceName(policy.sourceId)} with ${policySourceName(candidate.sourceId)}`} onPress={() => {
            setIndependentComparison({ leftSourceId: policy.sourceId, rightSourceId: candidate.sourceId });
            setComparisonPickerFor(null);
          }} style={styles.olderChoice}>
            <Text style={styles.olderChoiceTitle}>{policySourceName(candidate.sourceId)}</Text>
            <Text style={styles.olderChoiceMeta}>{candidate.currentTerms.length} approved term{candidate.currentTerms.length === 1 ? '' : 's'} available</Text>
          </Pressable>)}
        </View>}
        {independentComparison?.leftSourceId === policy.sourceId && independentChoices.some((candidate) => candidate.sourceId === independentComparison.rightSourceId) && (() => {
          const counterpart = policyBySource.get(independentComparison.rightSourceId);
          if (!counterpart) return null;
          const rows = comparePolicyDocuments(policy, counterpart) as PolicyComparisonRow[];
          const sideValues = (terms: HealthFact[], sourceName: string) => terms.length ? terms.map((term) => {
            const evidenceAction = policyTermEvidenceAction(term, assets);
            return <View key={term.id} style={styles.comparisonEvidenceTerm}>
              <Text style={styles.comparisonValue}>{displayTermValue(term)}</Text>
              {evidenceAction.kind !== 'unavailable' ? <Pressable accessibilityRole="button" accessibilityLabel={`${evidenceAction.label} for ${term.label} from ${sourceName}`} onPress={() => openPolicyTermEvidence(term)} style={styles.evidenceButton}><Text style={styles.evidenceButtonText}>{evidenceAction.label}  ↗</Text></Pressable> : <Text style={styles.quoteMissing}>The source link for this entry is unavailable.</Text>}
            </View>;
          }) : <Text style={styles.comparisonValue}>No matching accepted entry in this summary.</Text>;
          return <View testID="independent-policy-comparison" style={styles.comparisonCard}>
            <View style={styles.comparisonHeading}><View style={{ flex: 1 }}><Text style={styles.relationshipTitle}>SIDE-BY-SIDE · NO REPLACEMENT LINK</Text><Text style={styles.relationshipSource}>{policySourceName(policy.sourceId)} + {policySourceName(counterpart.sourceId)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close side-by-side policy comparison" onPress={() => setIndependentComparison(null)} style={styles.removeRelation}><Text style={styles.removeRelationText}>CLOSE</Text></Pressable></View>
            <Text style={styles.comparisonNote}>This compares only the approved terms saved from each document. It does not say which policy is active or whether one replaces the other. A term missing from a summary is unknown, not an exclusion.</Text>
            {rows.length === 0 ? <Text style={styles.noComparison}>These records do not yet have accepted terms to compare.</Text> : rows.map((row) => {
              const statusLabel = row.status === 'different' ? 'SAVED VALUES DIFFER' : row.status === 'same' ? 'SAME SAVED VALUE' : row.status === 'ambiguous' ? 'MULTIPLE ENTRIES · REVIEW' : row.status === 'only_newer' ? 'ONLY IN FIRST SUMMARY' : 'ONLY IN SECOND SUMMARY';
              return <View key={`${row.key}:${policy.sourceId}:${counterpart.sourceId}`} style={[styles.comparisonRow, row.status === 'different' && styles.comparisonDifferent]}>
                <View style={styles.comparisonTitleRow}><Text style={styles.comparisonTermLabel}>{row.label}</Text><Text style={[styles.comparisonStatus, row.status === 'different' && styles.comparisonStatusDifferent]}>{statusLabel}</Text></View>
                <Text style={styles.comparisonSideLabel}>POLICY A · {policySourceName(policy.sourceId)}</Text>{sideValues(row.newerTerms, policySourceName(policy.sourceId))}
                <Text style={styles.comparisonSideLabel}>POLICY B · {policySourceName(counterpart.sourceId)}</Text>{sideValues(row.olderTerms, policySourceName(counterpart.sourceId))}
              </View>;
            })}
            <Text style={styles.changeDisclaimer}>Different wording or values should be checked in the original sources. Nura cannot determine eligibility, total cover or an insurer’s decision.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Ask Nura to compare these separate policies with selected health details" onPress={() => router.push({ pathname: '/ask', params: { context: 'these two independent policy summaries and the health details you choose', policySourceIds: `${policy.sourceId},${counterpart.sourceId}`, question: `Compare the approved terms in ${policySourceName(policy.sourceId)} and ${policySourceName(counterpart.sourceId)} as separate documents. Summarize matching, different, ambiguous, and one-sided terms, linking the exact sources. Using only the health details I choose for this run, identify any explicit term that may be relevant and give me concrete insurer questions. Do not assume one policy replaces the other, infer which policy is active, treat missing wording as an exclusion, or predict an insurer decision.` } })} style={styles.askCompare}><Text style={styles.askCompareText}>ASK NURA TO COMPARE WITH MY HEALTH  →</Text></Pressable>
            <View style={styles.relationActions}><Pressable accessibilityRole="button" accessibilityLabel={`Open policy source ${policySourceName(policy.sourceId)}`} onPress={() => openPolicySource(policy.sourceId)} style={styles.relationSourceButton}><Text style={styles.relationSourceButtonText}>OPEN POLICY A SOURCE  ↗</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Open policy source ${policySourceName(counterpart.sourceId)}`} onPress={() => openPolicySource(counterpart.sourceId)} style={styles.relationSourceButton}><Text style={styles.relationSourceButtonText}>OPEN POLICY B SOURCE  ↗</Text></Pressable></View>
          </View>;
        })()}
      </View>}
      {sourceAssetById.get(policy.sourceId) && <Pressable accessibilityRole="button" onPress={() => openPolicySource(policy.sourceId)} style={styles.sourceAction}><Text style={styles.sourceActionText}>OPEN ORIGINAL SOURCE AND REVIEW  ↗</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Ask Nura for an evidence-linked brief of ${policySourceName(policy.sourceId)}`} onPress={() => router.push({ pathname: '/ask', params: {
        context: `the saved insurance policy source ${policySourceName(policy.sourceId)}`,
        policySourceIds: policy.sourceId,
        question: 'Prepare a clear, evidence-linked brief of this policy from its original source and the terms I approved. Summarize the insurer and plan, policy dates and status only when explicitly stated, key benefits and limits, cost sharing, exclusions and waiting periods, and claims or appeal requirements when found. Separate what the wording explicitly states, what is ambiguous, and what was not found. Link each important point to its exact source wording and page where available. Do not infer which policy is active, assume coverage or eligibility, or predict payment. End with the missing context and the most useful questions to ask the insurer.',
      } })} style={styles.policyBriefButton}><Text style={styles.policyBriefButtonText}>ASK NURA FOR A SOURCE-LINKED POLICY BRIEF  →</Text></Pressable>
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
            {canRecordReply && claimId ? <Pressable accessibilityRole="button" accessibilityLabel={`${formOpen ? 'Close' : 'Record'} an insurer reply for ${term.label}`} accessibilityHint="Save your note to this policy term. It stays separate from the policy wording." accessibilityState={{ expanded: formOpen }} onPress={() => { setReplyError(null); setReplyForClaim((current) => current === claimId ? null : claimId); }} style={styles.recordReplyButton}><Text style={styles.recordReplyButtonText}>{formOpen ? 'CLOSE REPLY NOTE' : 'RECORD AN INSURER REPLY  +'}</Text></Pressable> : <Text style={styles.replyUnavailable}>A saved source quote and extraction claim are required to link a reply to this term.</Text>}
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
      <View style={styles.breakdownHeading}><View><InsuranceLabel>POLICY BREAKDOWN</InsuranceLabel><Text style={styles.breakdownSub}>Tap a section to inspect saved terms and missing details.</Text></View></View>
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
      <View style={styles.healthFitCard}><View style={styles.healthFitOrb}><Orb size={24} /></View><View style={styles.healthFitCopy}><Text style={styles.healthFitEyebrow}>POLICY + YOUR HEALTH</Text><Text style={styles.healthFitTitle}>Review against the health details you choose</Text><Text style={styles.healthFitBody}>A possible connection is shown only when Nura can cite both a policy term and a selected health source. If the evidence does not support a link, Nura says so. It cannot decide how an insurer will apply your policy.</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Check ${policySourceName(policy.sourceId)} against selected health details`} onPress={() => router.push({ pathname: '/ask', params: { context: `the ${policySourceName(policy.sourceId)} policy and the health details you choose`, question: 'Check the confirmed terms in this policy against only the health details I choose to share. Separate explicit exclusions or limits that may be relevant from what is unclear or not found. Cite the exact policy and health sources, explain any possible concern without making a coverage decision, and give me concrete questions to ask my insurer. Treat missing wording as unknown, not as an exclusion.' , policySourceIds: policy.sourceId } })} disabled={sourceClaimRepairing} style={[styles.healthFitButton, sourceClaimRepairing && styles.disabled]}><Text style={styles.healthFitButtonText}>{sourceClaimRepairing ? 'PREPARING POLICY DETAILS…' : 'CHECK WITH NURA  →'}</Text></Pressable></View>
      {(policy.previousTerms.length > 0 || policy.removedTerms.length > 0) && <>
        <Pressable accessibilityRole="button" accessibilityLabel={`Review history for ${policySourceName(policy.sourceId)}`} accessibilityState={{ expanded: expandedHistory === policy.sourceId }} onPress={() => toggleHistory(policy.sourceId)} style={({ pressed }) => [styles.historyToggle, pressed && styles.historyTogglePressed]}>
          <View style={{ flex: 1 }}><Text style={styles.historyTitle}>{expandedHistory === policy.sourceId ? 'HIDE REVIEW HISTORY' : 'SHOW REVIEW HISTORY'}</Text><Text style={styles.historySubtitle}>{policy.previousTerms.length} earlier version{policy.previousTerms.length === 1 ? '' : 's'} · {policy.removedTerms.length} removed by you</Text></View><Text style={styles.historyArrow}>{expandedHistory === policy.sourceId ? '−' : '+'}</Text>
        </Pressable>
        {expandedHistory === policy.sourceId && <View style={styles.historyEntries}>{policy.previousTerms.map((term) => <TermEntry key={term.id} term={term} kind="previous" evidenceLabel={evidenceActionLabel(term, assets)} onViewSource={() => openPolicyTermEvidence(term)} />)}{policy.removedTerms.map((term) => <TermEntry key={term.id} term={term} kind="removed" evidenceLabel={evidenceActionLabel(term, assets)} onViewSource={() => openPolicyTermEvidence(term)} />)}</View>}
      </>}
      {sourceLinks.map((link) => {
        const isReplacing = link.newerSourceId === policy.sourceId;
        const counterpartId = isReplacing ? link.olderSourceId : link.newerSourceId;
        const counterpart = policyBySource.get(counterpartId);
        if (!counterpart) return null;
        if (!isReplacing) return <View key={link.id} style={styles.relationshipNotice}><View style={styles.relationshipHeading}><View style={{ flex: 1 }}><Text style={styles.relationshipTitle}>YOU MARKED THIS POLICY AS REPLACED BY</Text><Text style={styles.relationshipSource}>{policySourceName(counterpartId)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Remove policy document link" disabled={removingReplacement === link.id} onPress={() => void removeReplacementLink(link.id, policy.sourceId)} style={styles.removeRelation}><Text style={styles.removeRelationText}>{removingReplacement === link.id ? 'REMOVING…' : 'REMOVE LINK'}</Text></Pressable></View><Text style={styles.relationshipNote}>This is your document link. Nura does not infer which policy is currently active.</Text><Pressable accessibilityRole="button" accessibilityLabel={`Open ${policySourceName(counterpartId)}`} onPress={() => openPolicySource(counterpartId)} style={styles.relationSourceButton}><Text style={styles.relationSourceButtonText}>OPEN LINKED SOURCE  ↗</Text></Pressable></View>;
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
          <View style={styles.comparisonHeading}><View style={{ flex: 1 }}><Text style={styles.relationshipTitle}>YOU MARKED THIS DOCUMENT AS REPLACING</Text><Text style={styles.relationshipSource}>{policySourceName(counterpartId)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Remove policy document link" disabled={removingReplacement === link.id} onPress={() => void removeReplacementLink(link.id, policy.sourceId)} style={styles.removeRelation}><Text style={styles.removeRelationText}>{removingReplacement === link.id ? 'REMOVING…' : 'REMOVE LINK'}</Text></Pressable></View>
          <Text style={styles.comparisonNote}>This link records your understanding of the documents. Different saved wording is shown for review; missing wording is not treated as an exclusion, and this does not establish active coverage.</Text>
          <View style={styles.changeSummary}><Text style={styles.changeSummaryEyebrow}>WHAT CHANGED ON PAPER</Text><Text style={styles.changeSummaryCounts}>{comparisonSummary.observations.length} source-linked numeric change{comparisonSummary.observations.length === 1 ? '' : 's'} · {comparisonSummary.sameCount} same term{comparisonSummary.sameCount === 1 ? '' : 's'}</Text>
            {comparisonSummary.observations.map((item) => <View key={item.label} style={styles.changeObservation}><Text style={[styles.changeKind, item.kind === 'higher_stated_cost' || item.kind === 'lower_stated_amount' ? styles.changeKindCaution : styles.changeKindPositive]}>{item.kind === 'higher_stated_cost' ? 'HIGHER STATED COST' : item.kind === 'lower_stated_cost' ? 'LOWER STATED COST' : item.kind === 'lower_stated_amount' ? 'LOWER STATED LIMIT / AMOUNT' : 'HIGHER STATED LIMIT / AMOUNT'}</Text><Text style={styles.changeTerm}>{item.label}</Text><Text style={styles.changeValues}>{item.olderValue}  →  {item.newerValue}</Text><View style={styles.changeEvidenceRow}><Pressable accessibilityRole="button" accessibilityLabel={`View earlier source quote for ${item.label}`} onPress={() => openPolicyTermEvidence(item.olderTerm)} style={styles.changeEvidenceButton}><Text style={styles.evidenceButtonText}>EARLIER SOURCE QUOTE ↗</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`View current source quote for ${item.label}`} onPress={() => openPolicyTermEvidence(item.newerTerm)} style={styles.changeEvidenceButton}><Text style={styles.evidenceButtonText}>CURRENT SOURCE QUOTE ↗</Text></Pressable></View></View>)}
            {comparisonSummary.wordingCount > 0 && <Text style={styles.changeFoot}>{comparisonSummary.wordingCount} other changed term{comparisonSummary.wordingCount === 1 ? ' could' : 's could'} not be compared directionally; review both source quotes.</Text>}
            {comparisonSummary.unlinkedCount > 0 && <Text style={styles.changeFoot}>{comparisonSummary.unlinkedCount} numeric difference{comparisonSummary.unlinkedCount === 1 ? ' has' : 's have'} no linked claim in both documents, so Nura has not described a cost or benefit direction. Check the source wording for {comparisonSummary.unlinkedLabels.join(' · ')}.</Text>}
            {comparisonSummary.oneSidedCount > 0 && <Text style={styles.changeFoot}>{comparisonSummary.oneSidedCount} term{comparisonSummary.oneSidedCount === 1 ? ' appears' : 's appear'} in only one approved summary. Missing entries do not establish that a benefit is excluded.</Text>}
            {comparisonSummary.ambiguousCount > 0 && <Text style={styles.changeFoot}>{comparisonSummary.ambiguousCount} term{comparisonSummary.ambiguousCount === 1 ? ' has' : 's have'} multiple entries and needs review.</Text>}
            {comparisonGaps.length > 0 && <Text style={styles.changeFoot}>Not comparable from both approved summaries: {comparisonGaps.map((field) => field.label).join(' · ')}.</Text>}
            <Text style={styles.changeDisclaimer}>Numeric direction is based on the saved wording only. It does not determine eligibility, total cover or which policy is active.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Ask Nura to compare these policies with selected health details" onPress={() => router.push({ pathname: '/ask', params: { context: 'these two linked policy documents and the health details you select', policySourceIds: `${policy.sourceId},${counterpartId}`, question: `Compare ${policySourceName(policy.sourceId)} with ${policySourceName(counterpartId)}. Using the approved policy terms and only the health details I select for this run, summarize stated improvements, lower limits or higher costs, explicit exclusions that may be relevant, unchanged terms, and ambiguous or missing details. Separate document facts from possible implications. Cite both policy sources and each health source. Do not infer active coverage, predict an insurer decision, diagnose me, or recommend replacing or changing a policy. End with specific questions to ask the insurer and say when the evidence is insufficient.` } })} style={styles.askCompare}><Text style={styles.askCompareText}>ASK NURA TO CHECK AGAINST YOUR HEALTH  →</Text></Pressable>
          </View>
          {comparisonRows.length === 0 ? <Text style={styles.noComparison}>No matching accepted policy terms are available in both records yet.</Text> : comparisonRows.map((row) => {
            const isNumericChange = comparisonSummary.observations.some((item) => item.label === row.label);
            const sourceLinkNeeded = comparisonSummary.unlinkedLabels.includes(row.label);
            const statusLabel = row.status === 'different' ? isNumericChange ? 'SOURCE-LINKED NUMERIC VALUE CHANGED' : sourceLinkNeeded ? 'SAVED VALUES DIFFER · SOURCE CHECK NEEDED' : 'SAVED TERMS DIFFER · REVIEW QUOTES' : row.status === 'same' ? 'SAME SAVED VALUE' : row.status === 'ambiguous' ? 'MULTIPLE MATCHING ENTRIES · REVIEW' : row.status === 'only_newer' ? 'NO ACCEPTED ENTRY IN EARLIER RECORD' : 'NO ACCEPTED ENTRY IN NEWER RECORD';
            const evidenceValues = (terms: typeof row.newerTerms) => terms.length ? terms.map((term) => {
              const evidenceAction = policyTermEvidenceAction(term, assets);
              return <View key={term.id} style={styles.comparisonEvidenceTerm}>
                <Text style={styles.comparisonValue}>{displayTermValue(term)}</Text>
                {evidenceAction.kind !== 'unavailable' ? <Pressable accessibilityRole="button" accessibilityLabel={`${evidenceAction.label} for ${term.label} from ${term.source}`} onPress={() => openPolicyTermEvidence(term)} style={styles.evidenceButton}>
                  <Text style={styles.evidenceButtonText}>{evidenceAction.label}  ↗</Text>
                </Pressable> : <Text style={styles.quoteMissing}>No saved source link is available for this entry.</Text>}
              </View>;
            }) : <Text style={styles.comparisonValue}>No accepted entry with this label in this document.</Text>;
            return <View key={row.key} style={[styles.comparisonRow, row.status === 'different' && styles.comparisonDifferent]}>
              <View style={styles.comparisonTitleRow}><Text style={styles.comparisonTermLabel}>{row.label}</Text><Text style={[styles.comparisonStatus, row.status === 'different' && styles.comparisonStatusDifferent]}>{statusLabel}</Text></View>
              <Text style={styles.comparisonSideLabel}>THIS DOCUMENT · {policySourceName(policy.sourceId)}</Text>{evidenceValues(row.newerTerms)}
              <Text style={styles.comparisonSideLabel}>EARLIER DOCUMENT · {policySourceName(counterpartId)}</Text>{evidenceValues(row.olderTerms)}
            </View>;
          })}
          <View style={styles.relationActions}><Pressable accessibilityRole="button" accessibilityLabel={`Open this policy source, ${policySourceName(policy.sourceId)}`} onPress={() => openPolicySource(policy.sourceId)} style={styles.relationSourceButton}><Text style={styles.relationSourceButtonText}>OPEN THIS SOURCE  ↗</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Open earlier policy source, ${policySourceName(counterpartId)}`} onPress={() => openPolicySource(counterpartId)} style={styles.relationSourceButton}><Text style={styles.relationSourceButtonText}>OPEN EARLIER SOURCE  ↗</Text></Pressable></View>
        </View>;
      })}
      {olderChoices.length > 0 && <>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: replacementFor === policy.sourceId }} onPress={() => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setReplacementFor((current) => current === policy.sourceId ? null : policy.sourceId); setOlderSourceChoice(null); setReplacementError(null); }} style={styles.linkOlderButton}><Text style={styles.linkOlderButtonText}>{replacementFor === policy.sourceId ? 'CANCEL POLICY LINK' : 'LINK AN EARLIER POLICY'}</Text></Pressable>
        {replacementFor === policy.sourceId && <View style={styles.linkChooser}><Text style={styles.linkChooserTitle}>Which earlier document does this replace?</Text><Text style={styles.linkChooserNote}>Choose only if you know this policy document supersedes the other one.</Text>{olderChoices.map((candidate) => <Pressable key={candidate.sourceId} accessibilityRole="button" accessibilityState={{ selected: olderSourceChoice === candidate.sourceId }} onPress={() => setOlderSourceChoice(candidate.sourceId)} style={[styles.olderChoice, olderSourceChoice === candidate.sourceId && styles.olderChoiceSelected]}><Text style={styles.olderChoiceTitle}>{policySourceName(candidate.sourceId)}</Text><Text style={styles.olderChoiceMeta}>{candidate.currentTerms.length} current accepted entr{candidate.currentTerms.length === 1 ? 'y' : 'ies'}</Text></Pressable>)}{olderSourceChoice && <Pressable accessibilityRole="button" disabled={savingReplacement} onPress={() => void saveReplacement(policy.sourceId)} style={[styles.confirmReplacement, savingReplacement && styles.disabled]}><Text style={styles.confirmReplacementText}>{savingReplacement ? 'SAVING POLICY LINK…' : `CONFIRM · THIS DOCUMENT REPLACES ${policySourceName(olderSourceChoice).toLocaleUpperCase()}`}</Text></Pressable>}</View>}
      </>}
    </Surface>;
    }) : <Surface tone="dark" style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Text style={styles.emptyGlyph}>▤</Text></View>
      <Text style={styles.emptyTitle}>No policy added yet</Text>
      <Text style={styles.emptyBody}>Add a PDF, Word, RTF, OpenDocument or text file, or a clear photo, to review its details.</Text>
    </Surface>}

    {policyClarifications.some((reply) => !policyBySource.has(reply.sourceId)) && <View style={styles.userReplyPanel}>
      <Text style={styles.userReplyEyebrow}>EARLIER INSURER NOTES · SOURCE UNAVAILABLE</Text>
      <Text style={styles.userReplyNotice}>These remain your notes, even if the policy document or accepted term was removed. They are not policy wording or a verified insurer decision.</Text>
      {policyClarifications.filter((reply) => !policyBySource.has(reply.sourceId)).map((reply) => renderPolicyReply(reply))}
    </View>}

    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/intake', params: { purpose: 'insurance', ...(firstRun ? { firstRun: 'true' } : {}) } })} style={styles.primary}>
      <GlassMaterial tone="dark" radius={18} intensity={18} />
      <View style={{ flex: 1 }}><Text style={styles.primaryTitle}>Add a policy document</Text><Text style={styles.primarySub}>PDF, Word, RTF, OpenDocument or clear photo</Text></View><Text style={styles.primaryArrow}>↗</Text>
    </Pressable>
    {firstRun && waiting.length > 0 && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/review', params: { purpose: 'insurance', firstRun: 'true' } })} style={styles.setupReturn}>
      <GlassMaterial tone="dark" radius={18} intensity={24} /><Text style={styles.setupReturnText}>Review uploaded policy  →</Text>
    </Pressable>}
    {firstRun && policies.length > 0 && waiting.length === 0 && <Pressable accessibilityRole="button" disabled={setupChoiceBusy} onPress={() => void continueProfileSetup()} style={[styles.setupReturn, setupChoiceBusy && styles.disabled]}>
      <GlassMaterial tone="light" radius={18} intensity={16} /><Text style={styles.continueText}>{setupChoiceBusy ? 'Saving…' : 'Continue to final review  →'}</Text>
    </Pressable>}
    {canChooseNoPolicy && <Pressable accessibilityRole="button" accessibilityLabel="I have no policy to add" disabled={setupChoiceBusy} onPress={() => void chooseNoPolicy()} style={[styles.noPolicyChoice, setupChoiceBusy && styles.disabled]}>
      <GlassMaterial tone="dark" radius={15} intensity={22} /><Text style={styles.noPolicyChoiceText}>{setupChoiceBusy ? 'Saving your choice…' : 'I have no policy to add'}</Text><Text style={styles.noPolicyChoiceArrow}>→</Text>
    </Pressable>}
    {setupChoiceError ? <Text accessibilityRole="alert" style={styles.setupChoiceError}>{setupChoiceError}</Text> : null}
    {!firstRun && <Text style={styles.disclaimer}>For coverage confirmation, contact your insurer.</Text>}
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  extractionReview: { marginTop: 12, padding: 11, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(168,216,255,.34)', backgroundColor: 'rgba(108,158,193,.10)' }, extractionReviewHeading: { flexDirection: 'row', alignItems: 'flex-start' }, extractionReviewEyebrow: { color: '#A8D8FF', fontSize: 8, fontWeight: '800', letterSpacing: .75 }, extractionReviewTitle: { color: '#FFF8F0', fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 4 }, extractionReviewSection: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.15)', marginTop: 9, paddingTop: 8 }, extractionReviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, extractionReviewSectionTitle: { flex: 1, color: '#FFF8F0', fontSize: 10, lineHeight: 15, fontWeight: '700' }, extractionReviewStatus: { maxWidth: 105, textAlign: 'right', fontSize: 7, fontWeight: '800', letterSpacing: .4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' }, extractionReviewStatusFound: { color: '#A5E0C4', backgroundColor: 'rgba(143,216,180,.14)' }, extractionReviewStatusCheck: { color: '#F2BD9D', backgroundColor: 'rgba(242,189,157,.14)' }, extractionReviewStatusMissing: { color: 'rgba(255,248,240,.72)', backgroundColor: 'rgba(255,248,240,.09)' }, extractionEvidence: { marginTop: 6, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: 'rgba(168,216,255,.32)' }, extractionEvidenceLabel: { color: '#FFF8F0', fontSize: 9, lineHeight: 14, fontWeight: '600' }, extractionEvidenceQuote: { color: 'rgba(255,248,240,.78)', fontSize: 9, lineHeight: 14, marginTop: 2 }, extractionNotFound: { color: 'rgba(255,248,240,.68)', fontSize: 9, lineHeight: 14, marginTop: 4 }, extractionReviewToggle: { minHeight: 40, justifyContent: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.15)', marginTop: 8 }, extractionReviewToggleText: { color: '#A8D8FF', fontSize: 8, fontWeight: '800', letterSpacing: .5 }, extractionReviewNote: { color: 'rgba(255,248,240,.62)', fontSize: 8, lineHeight: 13, marginTop: 7 },
  unregisteredSources: { marginBottom: 17 }, unregisteredSourceCard: { marginBottom: 9, padding: 13 }, unregisteredSourceNote: { color: 'rgba(255,248,240,.82)', fontSize: 9, lineHeight: 14, marginTop: 9 }, sourceTypeCallout: { backgroundColor: 'rgba(108,158,193,.12)', borderWidth: 1, borderColor: 'rgba(168,216,255,.28)', borderRadius: 12, padding: 10, marginTop: 10 }, sourceTypeCalloutWarning: { backgroundColor: 'rgba(206,139,105,.16)', borderColor: 'rgba(242,189,157,.40)' }, sourceTypeCalloutTitle: { color: '#F2BD9D', fontSize: 8, fontWeight: '800', letterSpacing: .65 }, sourceTypeCalloutBody: { color: '#FFF8F0', fontSize: 10, lineHeight: 15, marginTop: 5 }, sourceFitActions: { gap: 7, marginTop: 9 }, sourceFitKeep: { minHeight: 38, justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(108,158,193,.25)', paddingHorizontal: 10 }, sourceFitKeepText: { color: '#A8D8FF', fontSize: 9, fontWeight: '700' }, sourceFitRemove: { minHeight: 38, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(242,189,157,.40)', paddingHorizontal: 10 }, sourceFitRemoveText: { color: '#F2BD9D', fontSize: 9, fontWeight: '700' }, removeSourceLink: { minHeight: 38, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 5, marginTop: 3 }, removeSourceLinkText: { color: '#F2BD9D', fontSize: 8, fontWeight: '800', letterSpacing: .55 }, removeSourceConfirm: { backgroundColor: 'rgba(206,139,105,.16)', borderWidth: 1, borderColor: 'rgba(242,189,157,.40)', borderRadius: 12, padding: 10, marginTop: 8 }, removeSourceConfirmText: { color: '#FFF8F0', fontSize: 10, lineHeight: 15 }, removeSourceActions: { flexDirection: 'row', gap: 8, marginTop: 9 }, removeSourceCancel: { minHeight: 38, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,232,211,.24)' }, removeSourceCancelText: { color: '#FFF8F0', fontSize: 9, fontWeight: '700' }, removeSourceButton: { minHeight: 38, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(206,99,91,.34)' }, removeSourceButtonText: { color: '#FFF8F0', fontSize: 9, fontWeight: '800' }, candidatePolicyTerm: { borderTopWidth: 1, borderTopColor: 'rgba(255,232,211,.18)', paddingTop: 8, marginTop: 8 }, candidatePolicyTermTitle: { color: '#FFF8F0', fontSize: 10, lineHeight: 14, fontWeight: '700' }, candidatePolicyQuote: { color: 'rgba(255,248,240,.72)', fontSize: 8, lineHeight: 12, marginTop: 4 }, unregisteredSourceAction: { minHeight: 42, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(108,158,193,.2)', borderWidth: 1, borderColor: 'rgba(168,216,255,.34)', borderRadius: 12, paddingHorizontal: 12, marginTop: 11 }, unregisteredSourceActionText: { color: '#A8D8FF', fontSize: 8, fontWeight: '800', letterSpacing: .65, textAlign: 'center' },
  registryOverview: { backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 13, padding: 12, marginTop: 10 }, registryOverviewHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, registryOverviewTitle: { color: '#F2BD9D', fontSize: 10, fontWeight: '800', letterSpacing: .65 }, registryOverviewCaption: { color: 'rgba(255,248,240,.64)', fontSize: 10 }, registryOverviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }, registryOverviewCell: { width: '48%', minHeight: 60, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }, registryOverviewCoverage: { backgroundColor: 'rgba(108,158,193,.17)' }, registryOverviewExcluded: { backgroundColor: 'rgba(206,139,105,.16)' }, registryOverviewClarify: { backgroundColor: 'rgba(206,139,105,.16)' }, registryOverviewMissing: { backgroundColor: 'rgba(255,248,240,.09)' }, registryOverviewCount: { color: '#FFF8F0', fontSize: 16, fontWeight: '700' }, registryOverviewLabel: { color: 'rgba(255,248,240,.82)', fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: .35, marginTop: 3 }, registryOverviewNote: { color: 'rgba(255,248,240,.82)', fontSize: 11, lineHeight: 16, marginTop: 9 },
  page: { flex: 1, backgroundColor: '#211A17' },
  label: { color: '#F2BD9D', letterSpacing: 1.35, textTransform: 'uppercase', fontSize: 9, fontWeight: '800' }, content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, maxWidth: 560, width: '100%', alignSelf: 'center' },
  back: { color: 'rgba(255,248,240,.82)', fontSize: 14, marginBottom: 15 }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 27 }, brand: { color: '#FFF8F0', fontSize: 18, fontWeight: '700', letterSpacing: -0.5 }, tagline: { color: 'rgba(255,248,240,.64)', fontSize: 7, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 }, privacy: { color: 'rgba(255,248,240,.64)', fontSize: 7, letterSpacing: 1.2, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7, marginBottom: 17, gap: 12 }, title: { color: '#FFF8F0', fontSize: 31, fontWeight: '300', letterSpacing: -0.8 }, subtitle: { color: 'rgba(255,248,240,.82)', fontSize: 12, lineHeight: 18, marginTop: 3 }, countBadge: { width: 58, height: 54, borderRadius: 15, backgroundColor: 'rgba(108,158,193,.18)', alignItems: 'center', justifyContent: 'center' }, countNumber: { color: '#A8D8FF', fontSize: 20, fontWeight: '600' }, countLabel: { color: '#A8D8FF', fontSize: 6, letterSpacing: 1, marginTop: 1 },
  summary: { backgroundColor: 'rgba(42,29,31,.64)', borderColor: 'rgba(255,232,211,.22)', marginBottom: 21, padding: 15 }, summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, summaryEyebrow: { color: 'rgba(255,248,240,.66)', fontSize: 8, fontWeight: '800', letterSpacing: 1.2 }, summaryTitle: { color: '#FFF8F0', fontSize: 14, lineHeight: 19, fontWeight: '600', marginTop: 4 }, summaryOrb: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,249,243,.1)', alignItems: 'center', justifyContent: 'center' }, summaryMetrics: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.18)' }, summaryMetric: { flex: 1, alignItems: 'center', gap: 3 }, summaryMetricValue: { color: '#FFF8F0', fontSize: 17, fontWeight: '500' }, summaryMetricLabel: { color: 'rgba(255,248,240,.78)', fontSize: 7, fontWeight: '800', letterSpacing: .45, textAlign: 'center' }, summaryMetricRule: { width: 1, height: 29, backgroundColor: 'rgba(255,255,255,.16)' }, summaryBody: { color: 'rgba(255,249,243,.82)', fontSize: 9, lineHeight: 14, marginTop: 10 }, summaryHistory: { color: '#F2BD9D', fontSize: 8, fontWeight: '600', marginTop: 7 },
  waitingCard: { marginBottom: 18, padding: 14 }, waitingItem: { marginTop: 11 }, waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, waitingRemove: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 3 }, waitingRemoveText: { color: '#F2BD9D', fontSize: 9, fontWeight: '700' }, fileIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: 'rgba(108,158,193,.18)', alignItems: 'center', justifyContent: 'center' }, fileIconText: { color: '#A8D8FF', fontSize: 8, fontWeight: '700' }, policyName: { color: '#FFF8F0', fontSize: 13, fontWeight: '600' }, muted: { color: 'rgba(255,248,240,.64)', fontSize: 9, marginTop: 3 }, link: { color: '#A8D8FF', fontSize: 10, fontWeight: '700' },
  linkRecoveryCard: { backgroundColor: 'rgba(206,139,105,.16)', borderColor: 'rgba(255,232,211,.22)', marginBottom: 18, padding: 13 }, linkRecoveryIntro: { color: '#FFF8F0', fontSize: 9, lineHeight: 14, marginTop: 5 }, linkRecoveryItem: { backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 12, padding: 10, marginTop: 9 }, linkRecoverySide: { paddingVertical: 5 }, linkRecoveryRole: { color: '#F2BD9D', fontSize: 7, fontWeight: '800', letterSpacing: .55 }, linkRecoveryName: { color: '#FFF8F0', fontSize: 10, fontWeight: '700', marginTop: 3 }, linkRecoveryStatus: { color: 'rgba(255,248,240,.82)', fontSize: 8, lineHeight: 12, marginTop: 2 }, linkRecoverySource: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingHorizontal: 4 }, linkRecoverySourceText: { color: '#A8D8FF', fontSize: 7, fontWeight: '800', letterSpacing: .45 },
  sourceAction: { alignSelf: 'flex-start', marginTop: 7, paddingVertical: 4 }, sourceActionText: { color: '#A8D8FF', fontSize: 7, fontWeight: '700', letterSpacing: .7 }, policyBriefButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(108,158,193,.20)', borderWidth: 1, borderColor: 'rgba(168,216,255,.34)', paddingHorizontal: 10, marginTop: 9 }, policyBriefButtonText: { color: '#A8D8FF', fontSize: 8, fontWeight: '800', letterSpacing: .5, textAlign: 'center' },
  keyDetailsCard: { backgroundColor: 'rgba(108,158,193,.17)', borderWidth: 1, borderColor: 'rgba(168,216,255,.42)', borderRadius: 14, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 5, marginTop: 12 }, keyDetailsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }, keyDetailsEyebrow: { color: '#A8D8FF', fontSize: 10, fontWeight: '800', letterSpacing: .75 }, keyDetailsCount: { color: '#A8D8FF', backgroundColor: 'rgba(255,248,240,.09)', fontSize: 11, fontWeight: '700', minWidth: 26, textAlign: 'center', borderRadius: 8, overflow: 'hidden', paddingVertical: 4 }, keyDetailRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(168,216,255,.42)' }, keyDetailPressed: { opacity: .72 }, keyDetailCopy: { flex: 1, paddingVertical: 9 }, keyDetailLabel: { color: '#A8D8FF', fontSize: 12, lineHeight: 16, fontWeight: '600' }, keyDetailValue: { color: '#FFF8F0', fontSize: 16, lineHeight: 22, fontWeight: '600', marginTop: 3 }, keyDetailEvidence: { color: '#A8D8FF', fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: .3, marginTop: 2 }, keyDetailArrow: { color: '#A8D8FF', fontSize: 18, paddingHorizontal: 5 }, keyDetailsFooterAction: { minHeight: 46, justifyContent: 'center' }, keyDetailsFooter: { color: '#A8D8FF', fontSize: 10, fontWeight: '700', letterSpacing: .45, borderTopWidth: 1, borderTopColor: 'rgba(168,216,255,.42)', paddingVertical: 12 }, dossierEmpty: { color: 'rgba(255,248,240,.88)', fontSize: 11, lineHeight: 17, borderTopWidth: 1, borderTopColor: 'rgba(168,216,255,.42)', paddingTop: 10, marginTop: 5 }, dossierNote: { color: 'rgba(255,248,240,.78)', fontSize: 10, lineHeight: 15, paddingBottom: 9, marginTop: 6 },
  notFoundSummary: { backgroundColor: 'rgba(206,139,105,.16)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 14, padding: 11, marginTop: 10 }, notFoundSummaryTitle: { color: '#F2BD9D', fontSize: 9, fontWeight: '800', letterSpacing: .7 }, notFoundSummaryTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }, notFoundSummaryTag: { color: '#F2BD9D', backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 9, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5, fontSize: 9 }, notFoundSummaryBody: { color: '#F2BD9D', fontSize: 10, lineHeight: 15, marginTop: 8 },
  breakdownHeading: { marginTop: 15, marginBottom: 5 }, breakdownSub: { color: 'rgba(255,248,240,.82)', fontSize: 9, marginTop: 3 }, breakdownSection: { borderTopWidth: 1, borderTopColor: 'rgba(255,232,211,.22)' }, breakdownToggle: { minHeight: 59, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }, breakdownPressed: { opacity: .82 }, breakdownMark: { width: 33, height: 33, borderRadius: 12, backgroundColor: 'rgba(255,248,240,.09)', alignItems: 'center', justifyContent: 'center' }, breakdownMarkMedical: { backgroundColor: 'rgba(108,158,193,.17)' }, breakdownMarkLife: { backgroundColor: 'rgba(137,205,170,.15)' }, breakdownMarkPremium: { backgroundColor: 'rgba(206,139,105,.16)' }, breakdownMarkValue: { backgroundColor: 'rgba(108,158,193,.17)' }, breakdownMarkText: { color: '#F2BD9D', fontSize: 15, fontWeight: '700' }, breakdownCopy: { flex: 1 }, breakdownTitle: { color: '#FFF8F0', fontSize: 12, fontWeight: '600' }, breakdownMeta: { color: 'rgba(255,248,240,.64)', fontSize: 9, marginTop: 3 }, breakdownArrow: { color: '#F2BD9D', width: 25, textAlign: 'center', fontSize: 20 }, breakdownBody: { paddingLeft: 10, paddingBottom: 10 }, notFoundBox: { backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 11, padding: 10, marginTop: 9 }, notFoundEyebrow: { color: '#F2BD9D', fontSize: 7, fontWeight: '800', letterSpacing: .8 }, notFoundItems: { color: '#FFF8F0', fontSize: 9, lineHeight: 14, marginTop: 6 }, notFoundCopy: { color: 'rgba(255,248,240,.82)', fontSize: 8, lineHeight: 12, marginTop: 5 },
  exclusionPanel: { backgroundColor: 'rgba(206,139,105,.16)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 14, padding: 11, marginTop: 13 }, snapshotHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, exclusionEyebrow: { color: '#F2BD9D', fontSize: 7, fontWeight: '800', letterSpacing: .75, flex: 1 }, exclusionCount: { color: '#F2BD9D', backgroundColor: 'rgba(206,139,105,.16)', borderRadius: 9, minWidth: 23, textAlign: 'center', overflow: 'hidden', paddingVertical: 3, fontSize: 8, fontWeight: '800' }, exclusionItem: { borderTopWidth: 1, borderTopColor: 'rgba(255,232,211,.22)', marginTop: 8, paddingTop: 8 }, exclusionTitle: { color: '#FFF8F0', fontSize: 11, fontWeight: '700' }, exclusionValue: { color: '#F2BD9D', fontSize: 9, lineHeight: 13, marginTop: 3 }, exclusionSource: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingRight: 8 }, exclusionSourceText: { color: '#F2BD9D', fontSize: 7, fontWeight: '800', letterSpacing: .45 }, exclusionFoot: { color: '#F2BD9D', fontSize: 8, lineHeight: 12, marginTop: 4 }, clarifyPanel: { backgroundColor: 'rgba(206,139,105,.16)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 14, padding: 11, marginTop: 10 }, clarifyEyebrow: { color: '#F2BD9D', fontSize: 7, fontWeight: '800', letterSpacing: .8 }, clarifyItem: { borderTopWidth: 1, borderTopColor: 'rgba(255,232,211,.22)', marginTop: 8, paddingTop: 8 }, clarifyTitle: { color: '#FFF8F0', fontSize: 11, fontWeight: '700' }, clarifyValue: { color: '#F2BD9D', fontSize: 9, lineHeight: 13, marginTop: 3 }, clarifySource: { color: '#F2BD9D', fontSize: 7, fontWeight: '800', letterSpacing: .5, paddingVertical: 7 },
  recordReplyButton: { alignSelf: 'flex-start', minHeight: 38, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 10, backgroundColor: 'rgba(206,139,105,.16)', marginTop: 4 }, recordReplyButtonText: { color: '#F2BD9D', fontSize: 7, fontWeight: '800', letterSpacing: .5 }, replyUnavailable: { color: '#F2BD9D', fontSize: 8, lineHeight: 12, marginTop: 6 }, replyForm: { backgroundColor: 'rgba(206,139,105,.16)', borderWidth: 1, borderColor: 'rgba(242,189,157,.40)', borderRadius: 12, padding: 10, marginTop: 8 }, replyPrompt: { color: '#F2BD9D', fontSize: 7, fontWeight: '800', letterSpacing: .6, marginTop: 6 }, replyQuestion: { color: '#F2BD9D', fontSize: 9, lineHeight: 14, marginTop: 3 }, replyInput: { minHeight: 86, maxHeight: 180, borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 10, backgroundColor: 'rgba(255,248,240,.09)', color: '#FFF8F0', fontSize: 11, lineHeight: 16, padding: 10, marginTop: 8 }, replyPrivacy: { color: 'rgba(255,248,240,.82)', fontSize: 8, lineHeight: 12, marginTop: 7 }, saveReplyButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(52,108,156,.86)', borderRadius: 10, marginTop: 9 }, saveReplyButtonText: { color: 'rgba(255,248,240,.66)', fontSize: 8, fontWeight: '800', letterSpacing: .55 }, userReplyPanel: { backgroundColor: 'rgba(137,205,170,.15)', borderWidth: 1, borderColor: 'rgba(143,216,180,.42)', borderRadius: 14, padding: 11, marginTop: 10 }, userReplyEyebrow: { color: '#BFE3CE', fontSize: 7, fontWeight: '800', letterSpacing: .7 }, userReplyNotice: { color: '#BFE3CE', fontSize: 8, lineHeight: 12, marginTop: 5 }, userReplyItem: { borderTopWidth: 1, borderTopColor: 'rgba(143,216,180,.42)', marginTop: 8, paddingTop: 8 }, userReplyLabel: { color: '#FFF8F0', fontSize: 10, fontWeight: '700' }, userReplyText: { color: '#FFF8F0', fontSize: 9, lineHeight: 14, marginTop: 3 }, userReplyStatus: { alignSelf: 'flex-start', color: '#BFE3CE', backgroundColor: 'rgba(137,205,170,.15)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, fontSize: 7, fontWeight: '800', letterSpacing: .4, marginTop: 7 },
  healthFitCard: { backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 15, padding: 12, marginTop: 14 }, healthFitOrb: { width: 35, height: 35, borderRadius: 13, backgroundColor: 'rgba(255,248,240,.09)', alignItems: 'center', justifyContent: 'center' }, healthFitCopy: { marginTop: 8 }, healthFitEyebrow: { color: '#F2BD9D', fontSize: 7, fontWeight: '800', letterSpacing: .8 }, healthFitTitle: { color: '#FFF8F0', fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 4 }, healthFitBody: { color: 'rgba(255,248,240,.82)', fontSize: 9, lineHeight: 14, marginTop: 4 }, healthFitButton: { minHeight: 43, backgroundColor: 'rgba(52,108,156,.86)', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, healthFitButtonText: { color: 'rgba(255,248,240,.66)', fontSize: 8, fontWeight: '800', letterSpacing: .65 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }, sectionTitle: { color: '#FFF8F0', fontSize: 17, fontWeight: '500', marginTop: 4 }, sectionCount: { color: 'rgba(255,248,240,.82)', fontSize: 11 }, policyCard: { marginBottom: 13, padding: 14 }, policyHead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, policyMark: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(108,158,193,.18)', alignItems: 'center', justifyContent: 'center' }, policyMarkText: { color: '#A8D8FF', fontSize: 17 }, policyEyebrow: { color: 'rgba(255,248,240,.82)', fontSize: 7, fontWeight: '700', letterSpacing: 1.1 }, sourceLinked: { color: '#A8D8FF', backgroundColor: 'rgba(255,248,240,.09)', fontSize: 7, fontWeight: '700', letterSpacing: 0.7, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 }, sourceBand: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, backgroundColor: 'rgba(108,158,193,.18)', padding: 9, marginTop: 12 }, sourceBandIcon: { color: '#A8D8FF', fontSize: 12 }, sourceBandText: { color: '#A8D8FF', fontSize: 9, fontWeight: '500', flex: 1 }, term: { borderTopWidth: 1, borderTopColor: 'rgba(255,232,211,.22)', paddingTop: 12, marginTop: 12 }, previousTerm: { borderTopColor: 'rgba(255,232,211,.22)' }, termTop: { flexDirection: 'row', alignItems: 'center', gap: 7 }, termLabel: { color: '#FFF8F0', fontSize: 13, fontWeight: '600', flex: 1 }, termType: { color: '#A8D8FF', backgroundColor: 'rgba(108,158,193,.18)', fontSize: 6, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 }, previousTermType: { color: '#FFF8F0', backgroundColor: 'rgba(255,248,240,.09)' }, termValue: { color: '#FFF8F0', fontSize: 11, lineHeight: 16, marginTop: 5 }, plainMeaning: { color: 'rgba(255,248,240,.82)', fontSize: 9, lineHeight: 14, marginTop: 6 }, plainMeaningLead: { color: '#F2BD9D', fontSize: 7, fontWeight: '800', letterSpacing: .45 }, termEvidence: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingRight: 8 }, termEvidenceText: { color: '#A8D8FF', fontSize: 7, fontWeight: '800', letterSpacing: .45 }, sourceNote: { color: '#FFF8F0', fontSize: 10, lineHeight: 15, backgroundColor: 'rgba(255,248,240,.09)', padding: 9, borderRadius: 9, marginTop: 8 }, sourceNoteLead: { color: '#FFF8F0', fontSize: 8, fontWeight: '700', letterSpacing: 0.5 }, quoteMissing: { color: '#F2BD9D', fontSize: 9, lineHeight: 14, marginTop: 8 }, termMeta: { color: 'rgba(255,248,240,.82)', fontSize: 8, marginTop: 6 }, noCurrentTerms: { color: '#FFF8F0', fontSize: 10, lineHeight: 15, marginTop: 12 }, historyToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,232,211,.22)', marginTop: 14, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,248,240,.09)' }, historyTogglePressed: { backgroundColor: 'rgba(255,248,240,.09)' }, historyTitle: { color: '#FFF8F0', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }, historySubtitle: { color: 'rgba(255,248,240,.82)', fontSize: 8, marginTop: 3 }, historyArrow: { color: '#FFF8F0', fontSize: 20, fontWeight: '500', marginLeft: 12 }, historyEntries: { paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: 'rgba(255,232,211,.22)', marginLeft: 4 },
  relationshipNotice: { backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 14, padding: 11, marginTop: 12 }, relationshipHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 }, relationshipTitle: { color: '#F2BD9D', fontSize: 8, fontWeight: '800', letterSpacing: 0.75, lineHeight: 12 }, relationshipSource: { color: '#FFF8F0', fontSize: 11, fontWeight: '700', lineHeight: 15, marginTop: 4 }, relationshipNote: { color: 'rgba(255,248,240,.82)', fontSize: 9, lineHeight: 13, marginTop: 5 }, relationSourceButton: { minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 11, backgroundColor: 'rgba(108,158,193,.18)', borderWidth: 1, borderColor: 'rgba(168,216,255,.42)', paddingHorizontal: 10, marginTop: 8 }, relationSourceButtonText: { color: '#A8D8FF', fontSize: 8, fontWeight: '800', letterSpacing: 0.55 },
  comparisonCard: { backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 15, padding: 11, marginTop: 12 }, comparisonHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 }, removeRelation: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(242,189,157,.40)', backgroundColor: 'rgba(206,139,105,.16)' }, removeRelationText: { color: '#F2BD9D', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 }, comparisonNote: { color: '#FFF8F0', fontSize: 10, lineHeight: 16, marginTop: 8 }, noComparison: { color: 'rgba(255,248,240,.82)', fontSize: 10, lineHeight: 15, backgroundColor: 'rgba(255,248,240,.09)', borderRadius: 10, padding: 9, marginTop: 9 }, comparisonRow: { backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 12, padding: 9, marginTop: 8 }, comparisonDifferent: { backgroundColor: 'rgba(206,139,105,.16)', borderColor: 'rgba(255,232,211,.22)' }, comparisonTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }, comparisonTermLabel: { flex: 1, color: '#FFF8F0', fontSize: 12, fontWeight: '700' }, comparisonStatus: { color: '#F2BD9D', fontSize: 8, fontWeight: '800', letterSpacing: 0.4, textAlign: 'right', maxWidth: '56%' }, comparisonStatusDifferent: { color: '#F2BD9D' }, comparisonSideLabel: { color: 'rgba(255,248,240,.82)', fontSize: 8, fontWeight: '800', letterSpacing: 0.35, marginTop: 7 }, comparisonValue: { color: '#FFF8F0', fontSize: 11, lineHeight: 16, marginTop: 2 }, comparisonEvidenceTerm: { borderLeftWidth: 2, borderLeftColor: 'rgba(255,232,211,.22)', paddingLeft: 7, marginTop: 3 }, evidenceButton: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', paddingRight: 8 }, evidenceButtonText: { color: '#A8D8FF', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 }, relationActions: { gap: 2, marginTop: 4 },
  changeSummary: { backgroundColor: 'rgba(42,29,31,.64)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 13, padding: 11, marginTop: 10 }, changeSummaryEyebrow: { color: 'rgba(255,248,240,.66)', fontSize: 7, fontWeight: '800', letterSpacing: 0.9 }, changeSummaryCounts: { color: 'rgba(255,248,240,.66)', fontSize: 11, fontWeight: '600', marginTop: 4 }, changeObservation: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.16)', marginTop: 8, paddingTop: 8 }, changeKind: { fontSize: 7, fontWeight: '800', letterSpacing: 0.65 }, changeKindCaution: { color: '#F2BD9D' }, changeKindPositive: { color: '#BFE3CE' }, changeTerm: { color: 'rgba(255,248,240,.66)', fontSize: 10, fontWeight: '600', marginTop: 3 }, changeValues: { color: 'rgba(255,248,240,.66)', fontSize: 9, marginTop: 2 }, changeFoot: { color: 'rgba(255,248,240,.66)', fontSize: 8, lineHeight: 12, marginTop: 7 }, changeDisclaimer: { color: '#F2BD9D', fontSize: 8, lineHeight: 12, marginTop: 8 }, askCompare: { minHeight: 43, justifyContent: 'center', alignItems: 'center', borderRadius: 11, backgroundColor: 'rgba(52,108,156,.86)', paddingHorizontal: 9, marginTop: 9 }, askCompareText: { color: 'rgba(255,248,240,.66)', fontSize: 7, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
  changeEvidenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 }, changeEvidenceButton: { minHeight: 32, justifyContent: 'center', paddingRight: 8 },
  linkOlderButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', marginTop: 10 }, linkOlderButtonText: { color: '#F2BD9D', fontSize: 8, fontWeight: '800', letterSpacing: 0.7 }, linkChooser: { backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 13, padding: 10, marginTop: 8 }, linkChooserTitle: { color: '#FFF8F0', fontSize: 11, fontWeight: '700' }, linkChooserNote: { color: 'rgba(255,248,240,.82)', fontSize: 9, lineHeight: 13, marginTop: 4 }, olderChoice: { backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,232,211,.26)', borderRadius: 11, padding: 9, marginTop: 7 }, olderChoiceSelected: { backgroundColor: 'rgba(108,158,193,.18)', borderColor: 'rgba(168,216,255,.42)' }, olderChoiceTitle: { color: '#FFF8F0', fontSize: 9, fontWeight: '700' }, olderChoiceMeta: { color: 'rgba(255,248,240,.82)', fontSize: 8, marginTop: 3 }, confirmReplacement: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(52,108,156,.86)', paddingHorizontal: 10, marginTop: 8 }, confirmReplacementText: { color: 'rgba(255,248,240,.66)', fontSize: 7, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' }, disabled: { opacity: 0.6 }, replacementError: { color: '#F2BD9D', backgroundColor: 'rgba(206,139,105,.16)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 10, padding: 8, marginTop: 8, fontSize: 9, lineHeight: 13 },
  askAction: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', borderRadius: 13, padding: 10, marginTop: 14 }, askOrb: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,248,240,.09)', alignItems: 'center', justifyContent: 'center' }, askTitle: { color: '#FFF8F0', fontSize: 11, fontWeight: '600' }, askSubtitle: { color: 'rgba(255,248,240,.82)', fontSize: 8, marginTop: 2 }, askArrow: { color: '#FFF8F0', fontSize: 17 },
  emptyCard: { alignItems: 'flex-start', padding: 17, marginBottom: 14 }, emptyIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: 'rgba(108,158,193,.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 11 }, emptyGlyph: { color: '#A8D8FF', fontSize: 22 }, emptyTitle: { color: '#FFF8F0', fontSize: 16, fontWeight: '600' }, emptyBody: { color: 'rgba(255,248,240,.82)', fontSize: 11, lineHeight: 17, marginTop: 7 }, emptySteps: { width: '100%', borderTopWidth: 1, borderTopColor: 'rgba(255,232,211,.22)', marginTop: 13, paddingTop: 9, gap: 8 }, step: { color: '#FFF8F0', fontSize: 9, fontWeight: '500' }, primary: { position: 'relative', overflow: 'hidden', minHeight: 62, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.86)', backgroundColor: 'rgba(255,248,240,.96)', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }, primaryTitle: { color: '#382742', fontSize: 12, fontWeight: '800' }, primarySub: { color: 'rgba(56,39,66,.72)', fontSize: 10, marginTop: 3 }, primaryArrow: { color: '#382742', fontSize: 22 }, setupReturn: { position: 'relative', overflow: 'hidden', minHeight: 54, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,232,211,.36)', backgroundColor: 'rgba(255,248,240,.10)' }, setupReturnText: { color: '#FFF8F0', fontSize: 11, fontWeight: '700' }, continueText: { color: '#382742', fontSize: 11, fontWeight: '800' }, noPolicyChoice: { position: 'relative', overflow: 'hidden', minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,232,211,.34)', backgroundColor: 'rgba(255,248,240,.08)', marginTop: 10 }, noPolicyChoiceText: { color: '#FFF8F0', fontSize: 11, fontWeight: '700' }, noPolicyChoiceArrow: { color: '#F2BD9D', fontSize: 18, fontWeight: '700' }, setupChoiceError: { color: '#FFD8CF', fontSize: 10, lineHeight: 15, marginTop: 8 }, disclaimer: { color: 'rgba(255,248,240,.72)', fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 11 },
  replyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 },
  replyActionButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,232,211,.22)', backgroundColor: 'rgba(255,248,240,.09)' },
  replyActionText: { color: '#FFF8F0', fontSize: 8, fontWeight: '800', letterSpacing: .45 },
  replyActionPrimary: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(52,108,156,.86)' },
  replyActionPrimaryText: { color: 'rgba(255,248,240,.66)', fontSize: 8, fontWeight: '800', letterSpacing: .45 },
  replyActionDelete: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(242,189,157,.40)', backgroundColor: 'rgba(206,139,105,.16)' },
  replyActionDeleteText: { color: '#F2BD9D', fontSize: 8, fontWeight: '800', letterSpacing: .45 },
  replyDeleteConfirm: { backgroundColor: 'rgba(206,139,105,.16)', borderWidth: 1, borderColor: 'rgba(242,189,157,.40)', borderRadius: 11, padding: 10, marginTop: 9 },
  replyDeleteText: { color: '#F2BD9D', fontSize: 9, lineHeight: 14 },
  replyEditPrivacy: { color: '#FFF8F0', fontSize: 8, lineHeight: 12, marginTop: 6 },
});
