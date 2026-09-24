import React, { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Orb } from '../src/components/Orb';
import { Label, Surface } from '../src/components/Surface';
import { DocumentContextCard } from '../src/components/DocumentContextCard';
import { useNura } from '../src/state/NuraContext';
import { colors, radius } from '../src/theme';
import { CandidateClaim, IntakeActivity, IntakeCancelledError, LocalSource, correctCandidate, decideCandidate, extractPickedFile, getSourceClaims, retractAcceptedCandidate, sourceMatchesAsset } from '../src/services/intakeClient';
import { findMisdatedAcceptedClaims, findMissingAcceptedClaims, findMissingRetractions } from '../src/services/sourceClaimReconciliation.mjs';

const supported = (asset: { mimeType?: string }) => ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes((asset.mimeType || '').toLowerCase());
export default function Review() {
  const params = useLocalSearchParams<{ purpose?: string; assetId?: string; sourceId?: string; claimId?: string }>();
  const existingSourceId = typeof params.sourceId === 'string' ? params.sourceId : '';
  const requestedClaimId = typeof params.claimId === 'string' ? params.claimId : '';
  const purpose: 'medical' | 'insurance' = params.purpose === 'insurance' ? 'insurance' : 'medical';
  const { ready, assets, facts, addFact, correctFact, retractFact, reconcileSourceFactDate, attachSourceToAsset } = useNura();
  const readable = useMemo(() => assets.filter((asset) => (asset.purpose ?? 'medical') === purpose && supported(asset)), [assets, purpose]);
  const [selectedId, setSelectedId] = useState(typeof params.assetId === 'string' ? params.assetId : readable[0]?.id ?? '');
  const selected = readable.find((asset) => asset.id === selectedId) ?? (existingSourceId ? undefined : readable[0]);
  const selectedAssetId = selected?.id ?? '';
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const extractionAbort = useRef<AbortController | null>(null);
  const [activity, setActivity] = useState<IntakeActivity[]>([]);
  const [source, setSource] = useState<LocalSource | null>(null);
  const [claims, setClaims] = useState<CandidateClaim[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [retractConfirmId, setRetractConfirmId] = useState<string | null>(null);
  const pendingRetractionSyncs = useRef(new Set<string>());
  const [drafts, setDrafts] = useState<Record<string, { label: string; value: string; unit: string }>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => () => extractionAbort.current?.abort(), []);

  useEffect(() => {
    if (!existingSourceId || !ready) return;
    if (!selected) return;
    let active = true;
    void getSourceClaims(existingSourceId).then(async (result) => {
      if (!active) return;
      if (!(await sourceMatchesAsset(selected, result.source))) {
        if (selectedAssetId && selected.serverSourceId === result.source.id) attachSourceToAsset(selectedAssetId, null);
        setSource(null); setClaims([]);
        setError('These extracted details did not match the saved file, so Nura hid them. Review the original file again to create a correct match.');
        return;
      }
      if (!active) return;
      setSource(result.source); setClaims(result.claims);
      setNotice('Opened the existing extraction; the original file was not sent again.');
      const requestedClaim = result.claims.find((claim) => claim.id === requestedClaimId && claim.evidenceState === 'user_confirmed');
      if (requestedClaim) {
        setDrafts((current) => ({ ...current, [requestedClaim.id]: { label: requestedClaim.label, value: requestedClaim.value, unit: requestedClaim.unit ?? '' } }));
        setEditingId(requestedClaim.id);
      }
      if (selectedAssetId && selected.serverSourceId !== result.source.id) attachSourceToAsset(selectedAssetId, result.source.id);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : 'This source could not be opened.');
    });
    return () => { active = false; };
  }, [existingSourceId, requestedClaimId, selected, selectedAssetId, ready, attachSourceToAsset]);

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
    for (const claim of missingAccepted) addFact(claim.label, `${claim.value}${claim.unit ? ` ${claim.unit}` : ''}`, {
      category: purpose === 'insurance' ? 'Insurance coverage' : claim.kind,
      source: source.displayName,
      sourceId: claim.sourceId,
      sourceClaimId: claim.id,
      note: [claim.sourceLocation.quote, claim.sourceLocation.page ? `Page ${claim.sourceLocation.page}` : null, claim.referenceRange ? `Reference range ${claim.referenceRange}` : null, claim.method ? `Method ${claim.method}` : null].filter(Boolean).join(' · '),
      validFrom: claim.effectiveAt ?? new Date().toISOString(),
      validUntil: null,
      confidence: claim.confidence,
      permissionScope: 'profile_write',
    });
  }, [ready, source, missingAccepted, purpose, addFact]);

  async function readSelected() {
    if (!selected || busy) return;
    const controller = new AbortController();
    extractionAbort.current = controller;
    setConsentOpen(false); setBusy(true); setExtracting(true); setError(''); setNotice(''); setSource(null); setClaims([]); setActivity([]);
    try {
      const result = await extractPickedFile({ uri: selected.uri, name: selected.name, mimeType: selected.mimeType, size: selected.size }, (item) => setActivity((current) => [...current, item]), purpose, controller.signal);
      attachSourceToAsset(selected.id, result.source.id);
      setSource(result.source); setClaims(result.claims);
      setNotice(result.duplicate ? 'This file is already in your records. Nura has opened its saved review.' : result.claims.length ? `Nura found ${result.claims.length} personal details for you to review. Nothing is added to your profile until you approve it.` : result.source.documentContext ? 'Nura saved report details with this source. It did not find a personal health detail to add.' : 'Nura couldn’t identify clear personal details in this file. Nothing was added to your profile.');
    } catch (caught) {
      if (caught instanceof IntakeCancelledError) {
        setNotice('Reading stopped. Nothing new was added to your profile. You can review this file again whenever you’re ready.');
        setActivity((current) => current.some((item) => item.status === 'cancelled') ? current : [...current, { id: `${Date.now()}-intake-cancelled`, label: 'Reading stopped at your request', status: 'cancelled' }]);
      } else setError(caught instanceof Error ? caught.message : 'This source could not be processed.');
    }
    finally {
      if (extractionAbort.current === controller) extractionAbort.current = null;
      setExtracting(false);
      setBusy(false);
    }
  }
  async function reviewClaim(claim: CandidateClaim, decision: 'accept' | 'edit' | 'reject') {
    if (busy) return;
    if (purpose === 'insurance' && claim.kind !== 'coverage_term' && decision !== 'reject') { setError('Only explicit policy terms can be added to the Insurance Registry.'); return; }
    setBusy(true); setError('');
    const draft = drafts[claim.id] ?? { label: claim.label, value: claim.value, unit: claim.unit ?? '' };
    try {
      const result = await decideCandidate(claim.id, decision, decision === 'edit' ? draft : undefined);
      setClaims((items) => items.map((item) => item.id === result.claim.id ? result.claim : item));
      setEditingId(null);
      if (result.assertion && !result.unchanged) addFact(result.claim.label, `${result.claim.value}${result.claim.unit ? ` ${result.claim.unit}` : ''}`, {
        category: purpose === 'insurance' ? 'Insurance coverage' : result.claim.kind, source: selected?.name ?? 'Reviewed document',
        sourceId: result.claim.sourceId, sourceClaimId: result.claim.id,
        note: [result.claim.sourceLocation.quote, result.claim.sourceLocation.page ? `Page ${result.claim.sourceLocation.page}` : null, result.claim.referenceRange ? `Reference range ${result.claim.referenceRange}` : null, result.claim.method ? `Method ${result.claim.method}` : null].filter(Boolean).join(' · '),
        validFrom: result.claim.effectiveAt ?? new Date().toISOString(), validUntil: null,
        confidence: result.claim.confidence, permissionScope: 'profile_write',
      });
      setNotice(decision === 'reject' ? 'This suggestion was dismissed and wasn’t added to your profile.' : 'This sourced detail has been added to your Medical Registry.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The review decision could not be saved.'); }
    finally { setBusy(false); }
  }
  async function saveClaimCorrection(claim: CandidateClaim) {
    if (busy || !claim.acceptedAssertionId) return;
    if (purpose === 'insurance' && claim.kind !== 'coverage_term') { setError('Only reviewed policy terms can be corrected in the Insurance Registry.'); return; }
    const draft = drafts[claim.id] ?? { label: claim.label, value: claim.value, unit: claim.unit ?? '' };
    setBusy(true); setError('');
    let sourceCorrectionSaved = false;
    try {
      const result = await correctCandidate(claim.id, claim.acceptedAssertionId, { ...draft, effectiveAt: claim.effectiveAt ?? undefined });
      sourceCorrectionSaved = true;
      setClaims((items) => items.map((item) => item.id === result.claim.id ? result.claim : item));
      const currentFact = facts.find((fact) => fact.sourceClaimId === claim.id && !fact.validUntil);
      const value = `${result.claim.value}${result.claim.unit ? ` ${result.claim.unit}` : ''}`;
      if (currentFact) await correctFact(currentFact.id, result.claim.label, value);
      else addFact(result.claim.label, value, {
        category: purpose === 'insurance' ? 'Insurance coverage' : result.claim.kind,
        source: selected?.name ?? source?.displayName ?? 'Reviewed document', sourceId: result.claim.sourceId,
        sourceClaimId: result.claim.id,
        note: [result.claim.sourceLocation.quote, result.claim.sourceLocation.page ? `Page ${result.claim.sourceLocation.page}` : null, result.claim.effectiveAt ? `Record date ${result.claim.effectiveAt}` : null, result.claim.referenceRange ? `Reference range ${result.claim.referenceRange}` : null, result.claim.method ? `Method ${result.claim.method}` : null, 'Corrected by you; earlier versions are retained.'].filter(Boolean).join(' · '),
        validFrom: result.claim.effectiveAt ?? new Date().toISOString(), validUntil: null,
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
      if (profileSynced) setNotice('Removed from your active profile. The original source and review history remain available.');
      else setError('The source review is saved, but this device still needs to sync the active profile. Nura will retry while this source is open.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This detail could not be removed from the active profile.');
    } finally { setBusy(false); }
  }
  function startEdit(claim: CandidateClaim) {
    setDrafts((current) => ({ ...current, [claim.id]: { label: claim.label, value: claim.value, unit: claim.unit ?? '' } }));
    setEditingId(claim.id);
  }

  return <View style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>‹  Back</Text></Pressable>
    <View style={styles.heading}><Orb size={36} state={busy ? 'thinking' : 'idle'} /><View style={{ flex: 1 }}><Label>{purpose === 'insurance' ? 'YOUR POLICY · SOURCE REVIEW' : 'YOUR FILES · SOURCE REVIEW'}</Label><Text style={styles.title}>{purpose === 'insurance' ? 'Review policy terms.' : 'Read, then decide.'}</Text></View></View>
    <Text style={styles.intro}>{purpose === 'insurance' ? 'After you confirm, Nura will highlight stated policy terms and show their source. Use these details to prepare questions; they are not a coverage decision.' : 'After you confirm, Nura will read this file and show each suggested detail with a quote from the source. Review, edit or dismiss every suggestion before anything is added to your record.'}</Text>
    {readable.length > 0 ? <View style={styles.files}><Label>PDFS AND IMAGES · {readable.length}</Label>{readable.map((asset) => <Pressable key={asset.id} onPress={() => { setSelectedId(asset.id); setSource(null); setClaims([]); setActivity([]); setNotice(''); setError(''); }}><Surface style={{ ...styles.file, ...(selected?.id === asset.id ? styles.fileSelected : {}) }}><Text style={styles.fileType}>{asset.kind.toUpperCase()}</Text><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.fileName}>{asset.name}</Text><Text style={styles.fileSub}>{asset.size ? `${Math.round(asset.size / 1024)} KB` : 'Ready for explicit review'}</Text></View><Text style={styles.select}>{selected?.id === asset.id ? 'Selected' : 'Choose'}</Text></Surface></Pressable>)}</View> : null}
    {assets.some((asset) => asset.kind === 'video') && <Surface style={styles.notice}><Text style={styles.noticeTitle}>Video review is coming soon</Text><Text style={styles.noticeBody}>You can keep videos with your records, but Nura can’t review their contents yet. Videos aren’t sent for analysis.</Text></Surface>}
    {selected && !source && (!existingSourceId || Boolean(error)) && <Pressable disabled={busy} onPress={() => { setError(''); setConsentOpen(true); }} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Reading your file…' : existingSourceId ? 'Review this file again' : 'Review this file with Nura'}</Text><Text style={styles.arrow}>→</Text></Pressable>}
    {Boolean(existingSourceId) && !source && !error && <Surface style={styles.notice}><Text style={styles.noticeTitle}>Opening your saved review</Text><Text style={styles.noticeBody}>Your earlier suggestions and decisions are loading. This file won’t be sent again.</Text></Surface>}
    {extracting && <Surface style={styles.notice}><Text style={styles.noticeTitle}>Nura is reading your file</Text><Text style={styles.noticeBody}>This may take a moment. Suggested details will appear here with their source so you can review them.</Text><Pressable accessibilityRole="button" accessibilityLabel="Stop document reading" onPress={() => extractionAbort.current?.abort()} style={({ pressed }) => [styles.stop, pressed && styles.stopPressed]}><Text style={styles.stopText}>STOP READING</Text></Pressable></Surface>}
    {activity.length > 0 && <Surface style={styles.activity}><Label>HOW NURA IS WORKING</Label>{activity.map((item) => <View key={item.id} style={styles.activityRow}><Text style={[styles.activityMark, item.status === 'complete' && styles.activityDone, item.status === 'failed' && styles.activityFailed, item.status === 'cancelled' && styles.activityCancelled]}>{item.status === 'complete' ? '✓' : item.status === 'failed' ? '!' : item.status === 'cancelled' ? '×' : '·'}</Text><Text style={styles.activityText}>{item.label}</Text></View>)}</Surface>}
    {notice ? <Surface style={styles.notice}><Text style={styles.noticeTitle}>Review update</Text><Text style={styles.noticeBody}>{notice}</Text></Surface> : null}
    {error ? <Surface style={styles.error}><Text style={styles.noticeTitle}>Could not complete this step</Text><Text style={styles.noticeBody}>{error}</Text></Surface> : null}
    {Boolean(existingSourceId && ready && !selected) && <Surface style={styles.error}><Text style={styles.noticeTitle}>Original file unavailable</Text><Text style={styles.noticeBody}>Nura couldn’t match this extraction to its saved original. The extracted details stay hidden until the original file is available.</Text></Surface>}
    {source && <Surface style={styles.sourceCard}><Label>YOUR SOURCE</Label><Text style={styles.sourceName}>{source.displayName}</Text><Text style={styles.sourceSub}>Duplicate check complete · {new Date(source.importedAt).toLocaleDateString()}</Text>{claims.some((claim) => claim.evidenceState === 'user_confirmed') && <Text style={styles.sourceSub}>{missingAccepted.length ? `${missingAccepted.length} previously approved detail${missingAccepted.length === 1 ? ' is' : 's are'} being reconnected to your registry.` : `${claims.filter((claim) => claim.evidenceState === 'user_confirmed').length} previously approved detail${claims.filter((claim) => claim.evidenceState === 'user_confirmed').length === 1 ? ' is' : 's are'} linked to your registry.`}</Text>}{claims.some((claim) => claim.evidenceState === 'needs_review' || claim.evidenceState === 'candidate') && <Text style={styles.sourceSub}>{claims.filter((claim) => claim.evidenceState === 'needs_review' || claim.evidenceState === 'candidate').length} suggested detail{claims.filter((claim) => claim.evidenceState === 'needs_review' || claim.evidenceState === 'candidate').length === 1 ? ' stays' : 's stay'} separate until you approve them.</Text>}<Text style={styles.sourceSub}>The original file remains saved on this device.</Text><DocumentContextCard context={source.documentContext} compact /></Surface>}
    {claims.map((claim) => {
      const draft = drafts[claim.id] ?? { label: claim.label, value: claim.value, unit: claim.unit ?? '' };
      const pending = claim.evidenceState === 'needs_review';
      const accepted = claim.evidenceState === 'user_confirmed';
      const retracted = claim.evidenceState === 'user_retracted';
      const correctingAccepted = accepted && editingId === claim.id;
      return <Surface key={claim.id} style={styles.claim}>
        <View style={styles.claimTop}><View style={{ flex: 1 }}><Text style={styles.claimLabel}>{claim.label}</Text><Text style={styles.claimValue}>{claim.value}{claim.unit ? ` ${claim.unit}` : ''}{claim.effectiveAt ? ` · ${claim.effectiveAt}` : ''}</Text>{(claim.referenceRange || claim.method) && <Text style={styles.claimMeta}>{[claim.referenceRange ? `Reference range ${claim.referenceRange}` : null, claim.method ? `Method ${claim.method}` : null].filter(Boolean).join(' · ')}</Text>}</View><Text style={[styles.state, accepted && styles.stateDone, retracted && styles.stateRemoved]}>{pending ? 'FOR REVIEW' : accepted ? 'IN YOUR RECORD' : retracted ? 'REMOVED FROM PROFILE' : 'DISMISSED'}</Text></View>
        {claim.sourceLocation.quote ? <Text style={styles.quote}>“{claim.sourceLocation.quote}”{claim.sourceLocation.page ? ` · page ${claim.sourceLocation.page}` : ''}</Text> : <Text style={styles.quote}>No source quote was found. Check the original before saving this detail.</Text>}
        <Text style={styles.confidence}>AI confidence estimate {claim.confidence === null ? 'not available' : `${Math.round(claim.confidence * 100)}%`} · check against the original</Text>
        {retracted && <View style={styles.retractedNote}><Text style={styles.retractedText}>Removed from your active profile. The original file, source quote and review history remain available.</Text></View>}
        {claim.originalExtraction && <View style={styles.versionHistory}><Text style={styles.historyTitle}>WHAT NURA FIRST READ</Text><Text style={styles.historyCopy}>{claim.originalExtraction.label}: {claim.originalExtraction.value}{claim.originalExtraction.unit ? ` ${claim.originalExtraction.unit}` : ''} · kept with the source quote</Text></View>}
        {(claim.revisionHistory ?? []).length > 0 && <View style={styles.versionHistory}><Text style={styles.historyTitle}>EARLIER VERSIONS</Text>{[...(claim.revisionHistory ?? [])].reverse().map((version) => <Text key={version.assertionId} style={styles.historyCopy}>v{version.version} · {new Date(version.recordedAt).toLocaleDateString()} · {version.label}: {version.value}{version.unit ? ` ${version.unit}` : ''}</Text>)}</View>}
        {pending && editingId === claim.id ? <View style={styles.editFields}><TextInput value={draft.label} onChangeText={(label) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, label } }))} placeholder="Detail name" style={styles.input} /><TextInput value={draft.value} onChangeText={(value) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, value } }))} placeholder="Value" style={styles.input} /><TextInput value={draft.unit} onChangeText={(unit) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, unit } }))} placeholder="Unit (optional)" style={styles.input} /><Pressable disabled={busy} onPress={() => void reviewClaim(claim, 'edit')} style={styles.primarySmall}><Text style={styles.primarySmallText}>Save edit and add</Text></Pressable></View> : null}
        {correctingAccepted && <View style={styles.editFields}><Text style={styles.confidence}>Your correction creates a new version and keeps the earlier accepted value linked to this source.</Text><TextInput value={draft.label} onChangeText={(label) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, label } }))} placeholder="Detail name" style={styles.input} /><TextInput value={draft.value} onChangeText={(value) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, value } }))} placeholder="Corrected value" style={styles.input} /><TextInput value={draft.unit} onChangeText={(unit) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, unit } }))} placeholder="Unit (optional)" style={styles.input} /><Pressable disabled={busy} onPress={() => void saveClaimCorrection(claim)} style={styles.primarySmall}><Text style={styles.primarySmallText}>{busy ? 'Saving version…' : 'Save corrected version'}</Text></Pressable><Pressable disabled={busy} onPress={() => setEditingId(null)} style={styles.cancel}><Text style={styles.secondaryText}>Cancel</Text></Pressable></View>}
        {accepted && !correctingAccepted && <View style={styles.actions}><Pressable disabled={busy} accessibilityRole="button" onPress={() => startEdit(claim)} style={styles.edit}><Text style={styles.actionText}>Correct this detail</Text></Pressable><Pressable disabled={busy} accessibilityRole="button" onPress={() => setRetractConfirmId(claim.id)} style={styles.reject}><Text style={styles.actionText}>Remove from profile</Text></Pressable></View>}
        {accepted && retractConfirmId === claim.id && <View style={styles.retractConfirm}><Text style={styles.retractConfirmText}>Remove this as a personal health fact? Its source quote, original file and review history will be kept.</Text><View style={styles.actions}><Pressable disabled={busy} accessibilityRole="button" onPress={() => void retractClaim(claim)} style={styles.removeConfirm}><Text style={styles.removeConfirmText}>{busy ? 'Removing…' : 'Remove from profile'}</Text></Pressable><Pressable disabled={busy} accessibilityRole="button" onPress={() => setRetractConfirmId(null)} style={styles.edit}><Text style={styles.actionText}>Keep it</Text></Pressable></View></View>}
        {pending && purpose === 'insurance' && claim.kind !== 'coverage_term' ? <View style={styles.actions}><Text style={styles.confidence}>This isn’t a policy term, so it can’t be added to your Insurance Registry.</Text><Pressable disabled={busy} onPress={() => void reviewClaim(claim, 'reject')} style={styles.reject}><Text style={styles.actionText}>Dismiss</Text></Pressable></View> : null}
        {pending && editingId !== claim.id && (purpose !== 'insurance' || claim.kind === 'coverage_term') ? <View style={styles.actions}><Pressable disabled={busy} onPress={() => void reviewClaim(claim, 'accept')} style={styles.accept}><Text style={styles.actionOnText}>Add to my record</Text></Pressable><Pressable disabled={busy} onPress={() => startEdit(claim)} style={styles.edit}><Text style={styles.actionText}>Edit</Text></Pressable><Pressable disabled={busy} onPress={() => void reviewClaim(claim, 'reject')} style={styles.reject}><Text style={styles.actionText}>Dismiss</Text></Pressable></View> : null}
      </Surface>;
    })}
    {!assets.length && <Surface style={styles.notice}><Text style={styles.noticeTitle}>No supported document selected</Text><Text style={styles.noticeBody}>Choose a PDF or image in the previous step to start a real extraction. Video is not supported yet.</Text></Surface>}
    <Pressable onPress={() => router.replace(purpose === 'insurance' ? '/insurance' : '/(tabs)/health')} style={styles.secondary}><Text style={styles.secondaryText}>{purpose === 'insurance' ? 'Open Insurance Registry' : 'Open my registry'}</Text><Text style={styles.arrow}>→</Text></Pressable>
    <Text style={styles.footer}>Preview mode · Use fictional files only. A file is sent to the connected AI service only after you confirm. The service’s privacy practices apply. Please don’t upload real health records.</Text>
  </ScrollView>
  {consentOpen && <View style={styles.modalShade}><View style={styles.modal}><Text style={styles.modalEyebrow}>ONE FILE · YOUR CHOICE</Text><Text style={styles.modalTitle}>Let Nura read this file?</Text><Text style={styles.modalBody}>{selected?.name} will be sent to Nura’s AI service for review. Nura will show suggested details with quotes from the source. Nothing is added to your record unless you approve it. Preview mode · use fictional files only. The AI service’s privacy practices apply.</Text><Pressable onPress={() => void readSelected()} style={styles.primary}><Text style={styles.primaryText}>Continue and read file</Text><Text style={styles.arrow}>→</Text></Pressable><Pressable onPress={() => setConsentOpen(false)} style={styles.cancel}><Text style={styles.secondaryText}>Not now</Text></Pressable></View></View>}
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, content: { padding: 22, paddingTop: 38, paddingBottom: 50, maxWidth: 600, width: '100%', alignSelf: 'center' }, back: { color: colors.muted, fontSize: 15, marginBottom: 22 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, title: { color: colors.text, fontSize: 27, fontWeight: '300', marginTop: 6 }, intro: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 13, marginBottom: 17 }, files: { marginTop: 3, marginBottom: 12 }, file: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: radius.md, marginTop: 8, gap: 10 }, fileSelected: { borderColor: colors.violet, borderWidth: 1.5 }, fileType: { color: colors.aqua, fontSize: 9, fontWeight: '700', borderColor: colors.border, borderWidth: 1, borderRadius: 9, padding: 8 }, fileName: { color: colors.text, fontSize: 12, fontWeight: '500' }, fileSub: { color: colors.quiet, fontSize: 10, marginTop: 3 }, select: { color: colors.violet, fontSize: 10, fontWeight: '600' }, notice: { marginTop: 12, borderColor: colors.border }, activity: { marginTop: 12, padding: 13 }, activityRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 9 }, activityMark: { color: colors.quiet, fontSize: 14, width: 18, textAlign: 'center' }, activityDone: { color: '#3B8863' }, activityFailed: { color: '#A55142' }, activityCancelled: { color: colors.muted }, activityText: { color: colors.muted, fontSize: 10, flex: 1 }, noticeTitle: { color: colors.text, fontSize: 13, fontWeight: '600' }, noticeBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 5 }, stop: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#D9D2E2', backgroundColor: '#F8F5FA' }, stopPressed: { opacity: .78, transform: [{ scale: .98 }] }, stopText: { color: colors.violet, fontSize: 9, fontWeight: '700', letterSpacing: .55 }, error: { marginTop: 12, borderColor: '#E8BDB4', backgroundColor: '#FFF5F2' }, primary: { backgroundColor: '#E8E0FF', borderRadius: radius.pill, minHeight: 53, marginTop: 13, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, disabled: { opacity: .6 }, primaryText: { color: colors.ink, fontWeight: '600', fontSize: 13 }, arrow: { color: colors.ink, fontSize: 19 }, sourceCard: { marginTop: 13 }, sourceName: { color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 8 }, sourceSub: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 }, claim: { marginTop: 10, padding: 14 }, claimTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, claimLabel: { color: colors.text, fontSize: 14, fontWeight: '600' }, claimValue: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, claimMeta: { color: colors.quiet, fontSize: 10, lineHeight: 15, marginTop: 4 }, state: { color: '#8B672E', backgroundColor: '#FFF1D8', overflow: 'hidden', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 7, fontSize: 8, fontWeight: '700' }, stateDone: { color: '#33785A', backgroundColor: '#E1F2E9' }, stateRemoved: { color: '#675478', backgroundColor: '#F0EAF5' }, retractedNote: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#F5F0F7' }, retractedText: { color: '#675478', fontSize: 10, lineHeight: 15 }, retractConfirm: { marginTop: 10, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: '#E7D9E8', backgroundColor: '#FBF7FC' }, retractConfirmText: { color: colors.muted, fontSize: 11, lineHeight: 16 }, removeConfirm: { flex: 1, borderRadius: 12, backgroundColor: '#F5E8E6', padding: 10, alignItems: 'center' }, removeConfirmText: { color: '#8E473C', fontSize: 11, fontWeight: '600' }, quote: { color: colors.muted, fontSize: 11, lineHeight: 16, fontStyle: 'italic', marginTop: 10 }, confidence: { color: colors.quiet, fontSize: 9, lineHeight: 14, marginTop: 7 }, actions: { flexDirection: 'row', gap: 7, marginTop: 12 }, accept: { flex: 1, borderRadius: 12, backgroundColor: '#DFF2EA', padding: 10, alignItems: 'center' }, edit: { flex: 1, borderRadius: 12, backgroundColor: '#F2EDF5', padding: 10, alignItems: 'center' }, reject: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10, alignItems: 'center' }, actionOnText: { color: '#327457', fontSize: 11, fontWeight: '600' }, actionText: { color: colors.text, fontSize: 11, fontWeight: '600' }, editFields: { gap: 7, marginTop: 10 }, input: { color: colors.text, fontSize: 12, backgroundColor: '#F7F5F8', borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 9 }, primarySmall: { backgroundColor: colors.violet, borderRadius: 11, padding: 11, alignItems: 'center' }, primarySmallText: { color: '#FFF', fontSize: 11, fontWeight: '600' }, secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, minHeight: 48, marginTop: 17, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, secondaryText: { color: colors.text, fontWeight: '500', fontSize: 12 }, footer: { color: colors.quiet, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 12 }, modalShade: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', backgroundColor: 'rgba(20,16,26,.45)' }, modal: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 21, paddingTop: 24, paddingBottom: 28 }, modalEyebrow: { color: colors.violet, fontSize: 8, fontWeight: '700', letterSpacing: 1.2 }, modalTitle: { color: colors.text, fontSize: 21, fontWeight: '500', marginTop: 7 }, modalBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9 }, cancel: { alignItems: 'center', padding: 12, marginTop: 4 },
  versionHistory: { marginTop: 9, padding: 10, borderRadius: 10, backgroundColor: '#F5F0FA', borderWidth: 1, borderColor: '#E6DDED' }, historyTitle: { color: colors.violet, fontSize: 8, fontWeight: '700', letterSpacing: .8 }, historyCopy: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
});
