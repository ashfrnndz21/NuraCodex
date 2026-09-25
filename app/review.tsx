import React, { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Orb } from '../src/components/Orb';
import { Label, Surface } from '../src/components/Surface';
import { DocumentContextCard } from '../src/components/DocumentContextCard';
import { useNura } from '../src/state/NuraContext';
import type { IntakeAsset } from '../src/state/NuraContext';
import { colors, radius } from '../src/theme';
import { CandidateClaim, IntakeActivity, LocalSource, correctCandidate, decideCandidate, describeSourceLocation, extractPickedFile, formatVideoTimestamp, getSourceClaims, resolveIntakeMediaType, retractAcceptedCandidate, sourceMatchesAsset } from '../src/services/intakeClient';
import { findMisdatedAcceptedClaims, findMissingAcceptedClaims, findMissingRetractions } from '../src/services/sourceClaimReconciliation.mjs';
import { formatClaimValue } from '../src/services/claimValue.mjs';
import { processIntakeBatch } from '../src/services/intakeBatch.mjs';
import { analyzeIntakeBatch } from '../src/services/intakeBatchAnalysis.mjs';
import type { IntakeBatchFinding } from '../src/services/intakeBatchAnalysis.mjs';

const supported = (asset: { name: string; mimeType?: string }) => Boolean(resolveIntakeMediaType(asset));
type BatchSourceReview = { assetId: string; name: string; status: 'loading' | 'verified' | 'mismatch' | 'unavailable'; source?: LocalSource; claims: CandidateClaim[] };
export default function Review() {
  const params = useLocalSearchParams<{ purpose?: string; assetId?: string; sourceId?: string; claimId?: string; focusClaimId?: string }>();
  const existingSourceId = typeof params.sourceId === 'string' ? params.sourceId : '';
  const requestedClaimId = typeof params.claimId === 'string' ? params.claimId : '';
  const focusClaimId = typeof params.focusClaimId === 'string' ? params.focusClaimId : '';
  const routeAssetId = typeof params.assetId === 'string' ? params.assetId : '';
  const purpose: 'medical' | 'insurance' = params.purpose === 'insurance' ? 'insurance' : 'medical';
  const { ready, assets, intakeNotes, facts, addFact, correctFact, retractFact, reconcileSourceFactDate, attachSourceToAsset, saveIntakeNote, commitIntakeNote, removeIntakeNote } = useNura();
  const readable = useMemo<IntakeAsset[]>(() => assets.filter((asset) => (asset.purpose ?? 'medical') === purpose && supported(asset) && !(purpose === 'insurance' && asset.kind === 'video')), [assets, purpose]);
  const linkedSourceAssets = useMemo(() => readable.filter((asset) => Boolean(asset.serverSourceId)), [readable]);
  const [selectedId, setSelectedId] = useState(typeof params.assetId === 'string' ? params.assetId : readable[0]?.id ?? '');
  const selected = readable.find((asset) => asset.id === selectedId) ?? (existingSourceId ? undefined : readable[0]);
  const selectedAssetId = selected?.id ?? '';
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentAssetIds, setConsentAssetIds] = useState<string[]>([]);
  const [selectionChanged, setSelectionChanged] = useState(false);
  const [fileStates, setFileStates] = useState<Record<string, { status: 'queued' | 'reading' | 'complete' | 'failed' | 'cancelled'; detail?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const extractionAbort = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [activity, setActivity] = useState<IntakeActivity[]>([]);
  const [source, setSource] = useState<LocalSource | null>(null);
  const [claims, setClaims] = useState<CandidateClaim[]>([]);
  const [batchReviewRun, setBatchReviewRun] = useState<{ key: string; reviews: BatchSourceReview[]; complete: boolean }>({ key: '', reviews: [], complete: false });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [retractConfirmId, setRetractConfirmId] = useState<string | null>(null);
  const pendingRetractionSyncs = useRef(new Set<string>());
  const [drafts, setDrafts] = useState<Record<string, { label: string; value: string; unit: string }>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [discardNoteId, setDiscardNoteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sourceToOpen = !selectionChanged && existingSourceId && (!routeAssetId || selected?.id === routeAssetId)
    ? existingSourceId
    : selected?.serverSourceId ?? '';
  const filesNeedingReview = readable.filter((asset) => !asset.serverSourceId);
  const consentFiles = readable.filter((asset) => consentAssetIds.includes(asset.id));
  const linkedSourceKey = useMemo(() => linkedSourceAssets.map((asset) => `${asset.id}:${asset.serverSourceId ?? ''}`).join('|'), [linkedSourceAssets]);
  const batchSourceReviews = useMemo(() => batchReviewRun.key === linkedSourceKey ? batchReviewRun.reviews : [], [batchReviewRun, linkedSourceKey]);
  const batchFindings = useMemo<IntakeBatchFinding[]>(() => analyzeIntakeBatch(batchSourceReviews.filter((item) => item.status === 'verified' && item.source).map((item) => ({
    sourceId: item.source!.id, sourceName: item.name, claims: item.claims,
  }))), [batchSourceReviews]);
  const batchComparisonComplete = linkedSourceKey !== '' && batchReviewRun.key === linkedSourceKey && batchReviewRun.complete;

  useEffect(() => () => extractionAbort.current?.abort(), []);

  useEffect(() => {
    if (!sourceToOpen || !ready) return;
    if (!selected) return;
    let active = true;
    void getSourceClaims(sourceToOpen).then(async (result) => {
      if (!active) return;
      const matchesOriginal = await sourceMatchesAsset(selected, result.source);
      if (!active) return;
      if (!matchesOriginal) {
        if (selectedAssetId && selected.serverSourceId === result.source.id) await attachSourceToAsset(selectedAssetId, null);
        if (!active) return;
        setSource(null); setClaims([]);
        setError('These extracted details did not match the saved file, so Nura hid them. Review the original file again to create a correct match.');
        return;
      }
      if (!active) return;
      if (selectedAssetId && selected.serverSourceId !== result.source.id) await attachSourceToAsset(selectedAssetId, result.source.id);
      if (!active) return;
      setSource(result.source); setClaims(result.claims);
      setNotice('Opened the saved extraction for this file. The original was not sent again.');
      const requestedClaim = result.claims.find((claim) => claim.id === requestedClaimId && claim.evidenceState === 'user_confirmed');
      if (requestedClaim) {
        setDrafts((current) => ({ ...current, [requestedClaim.id]: { label: requestedClaim.label, value: requestedClaim.value, unit: requestedClaim.unit ?? '' } }));
        setEditingId(requestedClaim.id);
      }
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : 'This source could not be opened.');
    });
    return () => { active = false; };
  }, [sourceToOpen, requestedClaimId, selected, selectedAssetId, ready, attachSourceToAsset]);

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
      note: [describeSourceLocation(claim.sourceLocation), claim.referenceRange ? `Reference range ${claim.referenceRange}` : null, claim.method ? `Method ${claim.method}` : null].filter(Boolean).join(' · '),
      validFrom: claim.effectiveAt ?? new Date().toISOString(),
      validUntil: null,
      confidence: claim.confidence,
      permissionScope: 'profile_write',
    });
  }, [ready, source, missingAccepted, purpose, addFact]);

  async function readSelectedBatch() {
    const batch = consentAssetIds.map((id) => readable.find((asset) => asset.id === id)).filter((asset): asset is typeof readable[number] => Boolean(asset && !asset.serverSourceId));
    if (!batch.length || busy) return;
    const controller = new AbortController();
    extractionAbort.current = controller;
    setConsentOpen(false); setBusy(true); setExtracting(true); setError(''); setNotice(''); if (!selected?.serverSourceId) { setSource(null); setClaims([]); } setActivity([]);
    setFileStates((current) => ({ ...current, ...Object.fromEntries(batch.map((asset) => [asset.id, { status: 'queued' as const }])) }));
    try {
      const results = await processIntakeBatch(batch, async (asset) => {
        const result = await extractPickedFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size }, (item) => setActivity((current) => [...current, { ...item, id: `${asset.id}:${item.id}`, label: `${asset.name} · ${item.label}` }]), purpose, controller.signal);
        await attachSourceToAsset(asset.id, result.source.id);
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
      if (completed || failed) setNotice(`${completed} of ${batch.length} ${purpose === 'insurance' ? 'policy file' : 'health file'}${batch.length === 1 ? '' : 's'} processed${failed ? ` · ${failed} need another try` : ''}. Open each saved file to review its suggestions; nothing enters your registry without your approval.`);
      if (!completed && failed) setError('Nura could not read the selected files. Each file’s status is shown above; you can retry the unprocessed files.');
      if (stopped) {
        setNotice(`Reading stopped at your request. ${completed} file${completed === 1 ? '' : 's'} finished and remain available to review; unstarted files are still ready.`);
        setActivity((current) => current.some((item) => item.status === 'cancelled') ? current : [...current, { id: `${Date.now()}-intake-cancelled`, label: 'Reading stopped at your request', status: 'cancelled' }]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This source could not be processed.');
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
      if (result.assertion && !result.unchanged) addFact(result.claim.label, formatClaimValue(result.claim.value, result.claim.unit), {
        category: purpose === 'insurance' ? 'Insurance coverage' : result.claim.kind, source: selected?.name ?? 'Reviewed document',
        sourceId: result.claim.sourceId, sourceClaimId: result.claim.id,
        note: [describeSourceLocation(result.claim.sourceLocation), result.claim.referenceRange ? `Reference range ${result.claim.referenceRange}` : null, result.claim.method ? `Method ${result.claim.method}` : null].filter(Boolean).join(' · '),
        validFrom: result.claim.effectiveAt ?? new Date().toISOString(), validUntil: null,
        confidence: result.claim.confidence, permissionScope: 'profile_write',
      });
      setNotice(decision === 'reject' ? purpose === 'insurance' ? 'This policy suggestion was dismissed and wasn’t added to your Insurance Registry.' : 'This suggestion was dismissed and wasn’t added to your profile.' : purpose === 'insurance' ? 'This policy term has been added to your Insurance Registry.' : 'This sourced detail has been added to your Medical Registry.');
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
      const value = formatClaimValue(result.claim.value, result.claim.unit);
      if (currentFact) await correctFact(currentFact.id, result.claim.label, value);
      else addFact(result.claim.label, value, {
        category: purpose === 'insurance' ? 'Insurance coverage' : result.claim.kind,
        source: selected?.name ?? source?.displayName ?? 'Reviewed document', sourceId: result.claim.sourceId,
        sourceClaimId: result.claim.id,
        note: [describeSourceLocation(result.claim.sourceLocation), result.claim.effectiveAt ? `Record date ${result.claim.effectiveAt}` : null, result.claim.referenceRange ? `Reference range ${result.claim.referenceRange}` : null, result.claim.method ? `Method ${result.claim.method}` : null, 'Corrected by you; earlier versions are retained.'].filter(Boolean).join(' · '),
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
      if (profileSynced) setNotice(purpose === 'insurance' ? 'Removed from your Insurance Registry. The original policy source and review history remain available.' : 'Removed from your active profile. The original source and review history remain available.');
      else setError(purpose === 'insurance' ? 'The source review is saved, but this device still needs to sync the Insurance Registry. Nura will retry while this source is open.' : 'The source review is saved, but this device still needs to sync the active profile. Nura will retry while this source is open.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : purpose === 'insurance' ? 'This policy term could not be removed from the Insurance Registry.' : 'This detail could not be removed from the active profile.');
    } finally { setBusy(false); }
  }
  function startEdit(claim: CandidateClaim) {
    setDrafts((current) => ({ ...current, [claim.id]: { label: claim.label, value: claim.value, unit: claim.unit ?? '' } }));
    setEditingId(claim.id);
  }

  async function saveSelfReportDraft(noteId: string) {
    const note = intakeNotes.find((item) => item.id === noteId);
    if (!note || busy) return;
    setBusy(true); setError('');
    try {
      await saveIntakeNote({ id: note.id, text: noteDrafts[note.id] ?? note.text, topicId: note.topicId, topicLabel: note.topicLabel });
      setEditingNoteId(null);
      setNotice('Your description is saved for review in your own words.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Your note could not be saved.'); }
    finally { setBusy(false); }
  }

  async function addSelfReportToProfile(noteId: string) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await commitIntakeNote(noteId, noteDrafts[noteId]);
      setEditingNoteId(null);
      setNotice('Your description is now saved in your Medical Registry as a self-reported note.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Your note could not be added to your profile.'); }
    finally { setBusy(false); }
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

  return <View style={styles.page}><ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>‹  Back</Text></Pressable>
    <View style={styles.heading}><Orb size={36} state={busy ? 'thinking' : 'idle'} /><View style={{ flex: 1 }}><Label>{purpose === 'insurance' ? 'YOUR POLICY · SOURCE REVIEW' : 'YOUR FILES · SOURCE REVIEW'}</Label><Text style={styles.title}>{purpose === 'insurance' ? 'Review policy terms.' : 'Read, then decide.'}</Text></View></View>
    <Text style={styles.intro}>{purpose === 'insurance' ? 'After you confirm, Nura will highlight stated policy terms and show their source. Use these details to prepare questions; they are not a coverage decision.' : 'Files are read only after you confirm. Review, edit or dismiss each suggestion. Your own description stays labeled as your words and is saved only when you choose.'}</Text>
    {purpose === 'medical' && intakeNotes.length > 0 && <View style={styles.selfReportSection}><Label>YOUR WORDS · {intakeNotes.length} DESCRIPTION{intakeNotes.length === 1 ? '' : 'S'}</Label>{intakeNotes.map((note) => <Surface key={note.id} style={styles.selfReportCard}><View style={styles.selfReportHeader}><View style={{ flex: 1 }}><Text style={styles.selfReportTitle}>{note.topicLabel ? `${note.topicLabel} · your description` : 'Your health description'}</Text><Text style={styles.selfReportMeta}>Written by you · {new Date(note.createdAt).toLocaleDateString()}</Text></View><Text style={styles.selfReportState}>NEEDS YOUR REVIEW</Text></View>{editingNoteId === note.id ? <TextInput value={noteDrafts[note.id] ?? note.text} onChangeText={(text) => setNoteDrafts((current) => ({ ...current, [note.id]: text }))} multiline maxLength={2000} textAlignVertical="top" accessibilityLabel="Edit your health description" style={styles.selfReportInput} /> : <Text style={styles.selfReportText}>{noteDrafts[note.id] ?? note.text}</Text>}<Text style={styles.selfReportFoot}>Nura has not interpreted this note. If you add it, it remains a self-reported detail.</Text>{discardNoteId === note.id ? <View style={styles.selfReportConfirm}><Text style={styles.selfReportFoot}>Remove this unsaved description from the review queue?</Text><View style={styles.actions}><Pressable disabled={busy} onPress={() => void discardSelfReport(note.id)} style={styles.reject}><Text style={styles.actionText}>{busy ? 'Removing…' : 'Remove draft'}</Text></Pressable><Pressable disabled={busy} onPress={() => setDiscardNoteId(null)} style={styles.edit}><Text style={styles.actionText}>Keep note</Text></Pressable></View></View> : <View style={styles.actions}>{editingNoteId === note.id ? <><Pressable disabled={busy} onPress={() => void saveSelfReportDraft(note.id)} style={styles.edit}><Text style={styles.actionText}>{busy ? 'Saving…' : 'Save changes'}</Text></Pressable><Pressable disabled={busy} onPress={() => { setEditingNoteId(null); setNoteDrafts((current) => { const next = { ...current }; delete next[note.id]; return next; }); }} style={styles.reject}><Text style={styles.actionText}>Cancel</Text></Pressable></> : <><Pressable disabled={busy} onPress={() => void addSelfReportToProfile(note.id)} style={styles.accept}><Text style={styles.actionOnText}>{busy ? 'Saving…' : 'Add to my record'}</Text></Pressable><Pressable disabled={busy} onPress={() => { setNoteDrafts((current) => ({ ...current, [note.id]: note.text })); setEditingNoteId(note.id); }} style={styles.edit}><Text style={styles.actionText}>Edit</Text></Pressable><Pressable disabled={busy} onPress={() => setDiscardNoteId(note.id)} style={styles.reject}><Text style={styles.actionText}>Remove</Text></Pressable></>}</View>}</Surface>)}</View>}
    {readable.length > 0 ? <View style={styles.files}><Label>{purpose === 'insurance' ? 'POLICY FILES' : 'HEALTH FILES'} · {readable.length}</Label>{readable.map((asset) => { const run = fileStates[asset.id]; const status = run?.status === 'reading' ? 'Reading now' : run?.status === 'complete' || asset.serverSourceId ? 'Ready to review' : run?.status === 'failed' ? 'Needs another try' : run?.status === 'cancelled' ? 'Stopped' : 'Ready'; return <Pressable key={asset.id} disabled={busy} onPress={() => { setSelectionChanged(true); setSelectedId(asset.id); setSource(null); setClaims([]); setActivity([]); setNotice(''); setError(''); }}><Surface style={{ ...styles.file, ...(selected?.id === asset.id ? styles.fileSelected : {}) }}><Text style={styles.fileType}>{asset.kind.toUpperCase()}</Text><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.fileName}>{asset.name}</Text><Text style={styles.fileSub}>{asset.kind === 'video' ? 'Up to 3 minutes · up to 6 timestamped moments' : asset.size ? `${Math.round(asset.size / 1024)} KB` : 'Ready for explicit review'} · {status}</Text>{run?.detail ? <Text numberOfLines={2} style={styles.fileSub}>{run.detail}</Text> : null}</View><Text style={styles.select}>{selected?.id === asset.id ? 'Selected' : 'Open'}</Text></Surface></Pressable>; })}</View> : null}
    {!readable.length && assets.length > 0 && <Surface style={styles.notice}><Text style={styles.noticeTitle}>{purpose === 'insurance' ? 'Choose a policy PDF or image' : 'Choose a supported health file'}</Text><Text style={styles.noticeBody}>{purpose === 'insurance' ? 'The Insurance Registry reads policy PDFs and images. Video files are not used for policy review.' : 'Nura can review PDFs, JPG, PNG and WebP images, and short MP4, MOV or WebM health videos.'}</Text></Surface>}
    {filesNeedingReview.length > 0 && <Pressable disabled={busy} onPress={() => { setError(''); setConsentOpen(true); setConsentAssetIds(filesNeedingReview.map((asset) => asset.id)); }} style={[styles.primary, busy && styles.disabled]}><View style={{ flex: 1 }}><Text style={styles.primaryText}>{busy ? 'Reviewing files…' : `Review ${filesNeedingReview.length === 1 ? 'file' : `all ${filesNeedingReview.length} files`} with Nura`}</Text><Text style={[styles.fileSub, { color: colors.violet }]}>One approval · each file gets its own source-linked review</Text></View><Text style={styles.arrow}>→</Text></Pressable>}
    {linkedSourceAssets.length > 1 && <View style={styles.batchAnalysis}>
      <Label>CHECKS ACROSS YOUR FILES · {linkedSourceAssets.length}</Label>
      <Text style={styles.batchIntro}>Nura compares matching detail names, units, values and dates across saved sources. These are review cues only; files and claims are never merged automatically.</Text>
      {!batchComparisonComplete ? <Surface style={styles.notice}><Text style={styles.noticeTitle}>Checking source-matched details</Text><Text style={styles.noticeBody}>Each result is checked against its original file before it is included.</Text></Surface> : null}
      {batchComparisonComplete && batchSourceReviews.some((item) => item.status !== 'verified') ? <Surface style={styles.error}><Text style={styles.noticeTitle}>Some files could not be compared</Text><Text style={styles.noticeBody}>{batchSourceReviews.filter((item) => item.status !== 'verified').map((item) => `${item.name} · ${item.status === 'mismatch' ? 'source did not match; suggestions hidden' : 'source review unavailable'}`).join('\n')} Open those files individually to review them.</Text></Surface> : null}
      {batchComparisonComplete && batchFindings.length === 0 && batchSourceReviews.every((item) => item.status === 'verified') ? <Surface style={styles.notice}><Text style={styles.noticeTitle}>No exact overlaps found</Text><Text style={styles.noticeBody}>No repeated values for the same named detail and date, or same-date differences, were found across these extracted claims. Different wording or missing dates may still need your review.</Text></Surface> : null}
      {batchComparisonComplete && batchFindings.map((finding) => {
        const isConflict = finding.kind === 'same_date_difference';
        const headline = isConflict ? 'Different values for the same date' : finding.kind === 'same_date_match' ? 'Possible repeat · same value and date' : 'Possible repeat · compare dates';
        const when = finding.eventDates.length ? finding.eventDates.join(', ') : 'date not available';
        const values = finding.values.map((value) => `${value}${finding.unit ? ` ${finding.unit}` : ''}`).join(' / ');
        return <Surface key={finding.id} style={styles.batchFinding}>
          <Text style={[styles.batchFindingTitle, isConflict && styles.batchConflictTitle]}>{headline}</Text>
          <Text style={styles.batchFindingBody}>{finding.label} · {values} · {when}</Text>
          <Text style={styles.batchFindingBody}>{isConflict ? 'Check the source passages and dates before deciding which value belongs in your history. Both suggestions remain separate.' : 'The same value appears in more than one file. Check the original reports before deciding whether these are the same event.'}</Text>
          <View style={styles.batchSources}>{finding.sources.map((item) => {
            const asset = batchSourceReviews.find((review) => review.source?.id === item.id);
            return <Pressable key={item.id} disabled={!asset} onPress={() => { if (!asset) return; setSelectionChanged(true); setSelectedId(asset.assetId); setSource(null); setClaims([]); setActivity([]); setError(''); setNotice(`Opened ${asset.name} to compare its original source.`); }} style={styles.batchSourceButton}>
              <Text style={styles.batchSourceText}>Open {item.name} ↗</Text>
            </Pressable>;
          })}</View>
        </Surface>;
      })}
    </View>}
    {Boolean(sourceToOpen) && !source && !error && <Surface style={styles.notice}><Text style={styles.noticeTitle}>Opening your saved review</Text><Text style={styles.noticeBody}>The suggestions for this file are loading. The original won’t be sent again.</Text></Surface>}
    {extracting && <Surface style={styles.notice}><Text style={styles.noticeTitle}>Nura is reviewing your files</Text><Text style={styles.noticeBody}>Files are processed one at a time. Completed sources stay saved if you stop or if another file needs attention.</Text><Pressable accessibilityRole="button" accessibilityLabel="Stop file review" onPress={() => extractionAbort.current?.abort()} style={({ pressed }) => [styles.stop, pressed && styles.stopPressed]}><Text style={styles.stopText}>STOP READING</Text></Pressable></Surface>}
    {activity.length > 0 && <Surface style={styles.activity}><Label>HOW NURA IS WORKING</Label>{activity.map((item) => <View key={item.id} style={styles.activityRow}><Text style={[styles.activityMark, item.status === 'complete' && styles.activityDone, item.status === 'failed' && styles.activityFailed, item.status === 'cancelled' && styles.activityCancelled]}>{item.status === 'complete' ? '✓' : item.status === 'failed' ? '!' : item.status === 'cancelled' ? '×' : '·'}</Text><Text style={styles.activityText}>{item.label}</Text></View>)}</Surface>}
    {notice ? <Surface style={styles.notice}><Text style={styles.noticeTitle}>Review update</Text><Text style={styles.noticeBody}>{notice}</Text></Surface> : null}
    {error ? <Surface style={styles.error}><Text style={styles.noticeTitle}>Could not complete this step</Text><Text style={styles.noticeBody}>{error}</Text></Surface> : null}
    {Boolean(existingSourceId && ready && !selected) && <Surface style={styles.error}><Text style={styles.noticeTitle}>Original file unavailable</Text><Text style={styles.noticeBody}>Nura couldn’t match this extraction to its saved original. The extracted details stay hidden until the original file is available.</Text></Surface>}
    {source && <Surface style={styles.sourceCard}><Label>YOUR SOURCE</Label><Text style={styles.sourceName}>{source.displayName}</Text><Text style={styles.sourceSub}>Duplicate check complete · {new Date(source.importedAt).toLocaleDateString()}</Text>{claims.some((claim) => claim.evidenceState === 'user_confirmed') && <Text style={styles.sourceSub}>{missingAccepted.length ? `${missingAccepted.length} previously approved ${purpose === 'insurance' ? 'policy term' : 'detail'}${missingAccepted.length === 1 ? ' is' : 's are'} being reconnected to your registry.` : `${claims.filter((claim) => claim.evidenceState === 'user_confirmed').length} previously approved ${purpose === 'insurance' ? 'policy term' : 'detail'}${claims.filter((claim) => claim.evidenceState === 'user_confirmed').length === 1 ? ' is' : 's are'} linked to your registry.`}</Text>}{claims.some((claim) => claim.evidenceState === 'needs_review' || claim.evidenceState === 'candidate') && <Text style={styles.sourceSub}>{claims.filter((claim) => claim.evidenceState === 'needs_review' || claim.evidenceState === 'candidate').length} suggested {purpose === 'insurance' ? 'policy term' : 'detail'}{claims.filter((claim) => claim.evidenceState === 'needs_review' || claim.evidenceState === 'candidate').length === 1 ? ' stays' : 's stay'} separate until you approve them.</Text>}<Text style={styles.sourceSub}>The original file remains saved on this device.</Text><DocumentContextCard context={source.documentContext} compact /></Surface>}
    {claims.map((claim) => {
      const draft = drafts[claim.id] ?? { label: claim.label, value: claim.value, unit: claim.unit ?? '' };
      const pending = claim.evidenceState === 'needs_review';
      const accepted = claim.evidenceState === 'user_confirmed';
      const retracted = claim.evidenceState === 'user_retracted';
      const correctingAccepted = accepted && editingId === claim.id;
      return <View key={claim.id} onLayout={(event) => { if (claim.id === focusClaimId) scrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 20), animated: false }); }}><Surface style={claim.id === focusClaimId ? { ...styles.claim, ...styles.focusedClaim } : styles.claim}>
        <View style={styles.claimTop}><View style={{ flex: 1 }}><Text style={styles.claimLabel}>{claim.label}</Text><Text style={styles.claimValue}>{formatClaimValue(claim.value, claim.unit)}{claim.effectiveAt ? ` · ${claim.effectiveAt}` : ''}</Text>{(claim.referenceRange || claim.method) && <Text style={styles.claimMeta}>{[claim.referenceRange ? `Reference range ${claim.referenceRange}` : null, claim.method ? `Method ${claim.method}` : null].filter(Boolean).join(' · ')}</Text>}</View><Text style={[styles.state, accepted && styles.stateDone, retracted && styles.stateRemoved]}>{pending ? 'FOR REVIEW' : accepted ? purpose === 'insurance' ? 'IN POLICY RECORD' : 'IN YOUR RECORD' : retracted ? purpose === 'insurance' ? 'REMOVED FROM POLICY' : 'REMOVED FROM PROFILE' : 'DISMISSED'}</Text></View>
        {claim.id === focusClaimId && <Text style={styles.focusNotice}>OPENED FROM POLICY COMPARISON</Text>}
        {claim.sourceLocation.quote ? <Text style={styles.quote}>“{claim.sourceLocation.quote}”{claim.sourceLocation.page ? ` · page ${claim.sourceLocation.page}` : typeof claim.sourceLocation.timestampSeconds === 'number' ? ` · video ${formatVideoTimestamp(claim.sourceLocation.timestampSeconds)}` : ''}</Text> : <Text style={styles.quote}>No source quote was found. Check the original before saving this detail.</Text>}
        <Text style={styles.confidence}>AI confidence estimate {claim.confidence === null ? 'not available' : `${Math.round(claim.confidence * 100)}%`} · check against the original</Text>
        {retracted && <View style={styles.retractedNote}><Text style={styles.retractedText}>{purpose === 'insurance' ? 'Removed from the Insurance Registry. The original policy file, source quote and review history remain available.' : 'Removed from your active profile. The original file, source quote and review history remain available.'}</Text></View>}
        {claim.originalExtraction && <View style={styles.versionHistory}><Text style={styles.historyTitle}>WHAT NURA FIRST READ</Text><Text style={styles.historyCopy}>{claim.originalExtraction.label}: {formatClaimValue(claim.originalExtraction.value, claim.originalExtraction.unit)} · kept with the source quote</Text></View>}
        {(claim.revisionHistory ?? []).length > 0 && <View style={styles.versionHistory}><Text style={styles.historyTitle}>EARLIER VERSIONS</Text>{[...(claim.revisionHistory ?? [])].reverse().map((version) => <Text key={version.assertionId} style={styles.historyCopy}>v{version.version} · {new Date(version.recordedAt).toLocaleDateString()} · {version.label}: {formatClaimValue(version.value, version.unit)}</Text>)}</View>}
        {pending && editingId === claim.id ? <View style={styles.editFields}><TextInput value={draft.label} onChangeText={(label) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, label } }))} placeholder="Detail name" style={styles.input} /><TextInput value={draft.value} onChangeText={(value) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, value } }))} placeholder="Value" style={styles.input} /><TextInput value={draft.unit} onChangeText={(unit) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, unit } }))} placeholder="Unit (optional)" style={styles.input} /><Pressable disabled={busy} onPress={() => void reviewClaim(claim, 'edit')} style={styles.primarySmall}><Text style={styles.primarySmallText}>Save edit and add</Text></Pressable></View> : null}
        {correctingAccepted && <View style={styles.editFields}><Text style={styles.confidence}>Your correction creates a new version and keeps the earlier accepted value linked to this source.</Text><TextInput value={draft.label} onChangeText={(label) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, label } }))} placeholder="Detail name" style={styles.input} /><TextInput value={draft.value} onChangeText={(value) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, value } }))} placeholder="Corrected value" style={styles.input} /><TextInput value={draft.unit} onChangeText={(unit) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, unit } }))} placeholder="Unit (optional)" style={styles.input} /><Pressable disabled={busy} onPress={() => void saveClaimCorrection(claim)} style={styles.primarySmall}><Text style={styles.primarySmallText}>{busy ? 'Saving version…' : 'Save corrected version'}</Text></Pressable><Pressable disabled={busy} onPress={() => setEditingId(null)} style={styles.cancel}><Text style={styles.secondaryText}>Cancel</Text></Pressable></View>}
        {accepted && !correctingAccepted && <View style={styles.actions}><Pressable disabled={busy} accessibilityRole="button" onPress={() => startEdit(claim)} style={styles.edit}><Text style={styles.actionText}>{purpose === 'insurance' ? 'Correct this policy term' : 'Correct this detail'}</Text></Pressable><Pressable disabled={busy} accessibilityRole="button" onPress={() => setRetractConfirmId(claim.id)} style={styles.reject}><Text style={styles.actionText}>{purpose === 'insurance' ? 'Remove from registry' : 'Remove from profile'}</Text></Pressable></View>}
        {accepted && retractConfirmId === claim.id && <View style={styles.retractConfirm}><Text style={styles.retractConfirmText}>{purpose === 'insurance' ? 'Remove this policy term from your Insurance Registry? Its source quote, original policy file and review history will be kept.' : 'Remove this as a personal health fact? Its source quote, original file and review history will be kept.'}</Text><View style={styles.actions}><Pressable disabled={busy} accessibilityRole="button" onPress={() => void retractClaim(claim)} style={styles.removeConfirm}><Text style={styles.removeConfirmText}>{busy ? 'Removing…' : purpose === 'insurance' ? 'Remove policy term' : 'Remove from profile'}</Text></Pressable><Pressable disabled={busy} accessibilityRole="button" onPress={() => setRetractConfirmId(null)} style={styles.edit}><Text style={styles.actionText}>Keep it</Text></Pressable></View></View>}
        {pending && purpose === 'insurance' && claim.kind !== 'coverage_term' ? <View style={styles.actions}><Text style={styles.confidence}>This isn’t a policy term, so it can’t be added to your Insurance Registry.</Text><Pressable disabled={busy} onPress={() => void reviewClaim(claim, 'reject')} style={styles.reject}><Text style={styles.actionText}>Dismiss</Text></Pressable></View> : null}
        {pending && editingId !== claim.id && (purpose !== 'insurance' || claim.kind === 'coverage_term') ? <View style={styles.actions}><Pressable disabled={busy} onPress={() => void reviewClaim(claim, 'accept')} style={styles.accept}><Text style={styles.actionOnText}>{purpose === 'insurance' ? 'Add policy term' : 'Add to my record'}</Text></Pressable><Pressable disabled={busy} onPress={() => startEdit(claim)} style={styles.edit}><Text style={styles.actionText}>Edit</Text></Pressable><Pressable disabled={busy} onPress={() => void reviewClaim(claim, 'reject')} style={styles.reject}><Text style={styles.actionText}>Dismiss</Text></Pressable></View> : null}
      </Surface></View>;
    })}
    {!assets.length && <Surface style={styles.notice}><Text style={styles.noticeTitle}>No file selected</Text><Text style={styles.noticeBody}>{purpose === 'insurance' ? 'Choose a policy PDF or image to review its stated terms.' : 'Choose a PDF, image or short health video to begin a source-linked review.'}</Text></Surface>}
    <Pressable onPress={() => router.replace(purpose === 'insurance' ? '/insurance' : '/(tabs)/health')} style={styles.secondary}><Text style={styles.secondaryText}>{purpose === 'insurance' ? 'Open Insurance Registry' : 'Open my registry'}</Text><Text style={styles.arrow}>→</Text></Pressable>
    <Text style={styles.footer}>Preview mode · Use fictional files only. A file is sent to the connected AI service only after you confirm. The service’s privacy practices apply. Please don’t upload real health records.</Text>
  </ScrollView>
  {consentOpen && <View style={styles.modalShade}><View style={styles.modal}><Text style={styles.modalEyebrow}>ONE APPROVAL · {consentFiles.length} FILE{consentFiles.length === 1 ? '' : 'S'}</Text><Text style={styles.modalTitle}>{purpose === 'insurance' ? 'Review these policy files?' : 'Review these health files?'}</Text><Text style={styles.modalBody}>{consentFiles.map((asset) => `• ${asset.name}`).join('\n')}{consentFiles.some((asset) => asset.kind === 'video') ? '\n\nFor video, Nura selects up to six still images from clips up to three minutes long. Video audio is not analyzed.' : ''}{'\n\nAfter you continue, each listed file is sent to the configured Nura AI service, one at a time. Each keeps its own source and suggestions. Nothing enters your registry unless you approve it. Preview mode · use fictional files only. The service’s privacy practices apply.'}</Text><Pressable onPress={() => void readSelectedBatch()} style={styles.primary}><Text style={styles.primaryText}>Approve and read {consentFiles.length} {consentFiles.length === 1 ? 'file' : 'files'}</Text><Text style={styles.arrow}>→</Text></Pressable><Pressable onPress={() => setConsentOpen(false)} style={styles.cancel}><Text style={styles.secondaryText}>Not now</Text></Pressable></View></View>}
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, content: { padding: 22, paddingTop: 38, paddingBottom: 50, maxWidth: 600, width: '100%', alignSelf: 'center' }, back: { color: colors.muted, fontSize: 15, marginBottom: 22 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, title: { color: colors.text, fontSize: 27, fontWeight: '300', marginTop: 6 }, intro: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 13, marginBottom: 17 }, files: { marginTop: 3, marginBottom: 12 }, file: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: radius.md, marginTop: 8, gap: 10 }, fileSelected: { borderColor: colors.violet, borderWidth: 1.5 }, fileType: { color: colors.aqua, fontSize: 9, fontWeight: '700', borderColor: colors.border, borderWidth: 1, borderRadius: 9, padding: 8 }, fileName: { color: colors.text, fontSize: 12, fontWeight: '500' }, fileSub: { color: colors.quiet, fontSize: 10, marginTop: 3 }, select: { color: colors.violet, fontSize: 10, fontWeight: '600' }, notice: { marginTop: 12, borderColor: colors.border }, activity: { marginTop: 12, padding: 13 }, activityRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 9 }, activityMark: { color: colors.quiet, fontSize: 14, width: 18, textAlign: 'center' }, activityDone: { color: '#3B8863' }, activityFailed: { color: '#A55142' }, activityCancelled: { color: colors.muted }, activityText: { color: colors.muted, fontSize: 10, flex: 1 }, noticeTitle: { color: colors.text, fontSize: 13, fontWeight: '600' }, noticeBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 5 }, stop: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#D9D2E2', backgroundColor: '#F8F5FA' }, stopPressed: { opacity: .78, transform: [{ scale: .98 }] }, stopText: { color: colors.violet, fontSize: 9, fontWeight: '700', letterSpacing: .55 }, error: { marginTop: 12, borderColor: '#E8BDB4', backgroundColor: '#FFF5F2' }, primary: { backgroundColor: '#E8E0FF', borderRadius: radius.pill, minHeight: 53, marginTop: 13, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, disabled: { opacity: .6 }, primaryText: { color: colors.ink, fontWeight: '600', fontSize: 13 }, arrow: { color: colors.ink, fontSize: 19 }, sourceCard: { marginTop: 13 }, sourceName: { color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 8 }, sourceSub: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 }, claim: { marginTop: 10, padding: 14 }, claimTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, claimLabel: { color: colors.text, fontSize: 14, fontWeight: '600' }, claimValue: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, claimMeta: { color: colors.quiet, fontSize: 10, lineHeight: 15, marginTop: 4 }, state: { color: '#8B672E', backgroundColor: '#FFF1D8', overflow: 'hidden', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 7, fontSize: 8, fontWeight: '700' }, stateDone: { color: '#33785A', backgroundColor: '#E1F2E9' }, stateRemoved: { color: '#675478', backgroundColor: '#F0EAF5' }, retractedNote: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#F5F0F7' }, retractedText: { color: '#675478', fontSize: 10, lineHeight: 15 }, retractConfirm: { marginTop: 10, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: '#E7D9E8', backgroundColor: '#FBF7FC' }, retractConfirmText: { color: colors.muted, fontSize: 11, lineHeight: 16 }, removeConfirm: { flex: 1, borderRadius: 12, backgroundColor: '#F5E8E6', padding: 10, alignItems: 'center' }, removeConfirmText: { color: '#8E473C', fontSize: 11, fontWeight: '600' }, quote: { color: colors.muted, fontSize: 11, lineHeight: 16, fontStyle: 'italic', marginTop: 10 }, confidence: { color: colors.quiet, fontSize: 9, lineHeight: 14, marginTop: 7 }, actions: { flexDirection: 'row', gap: 7, marginTop: 12 }, accept: { flex: 1, borderRadius: 12, backgroundColor: '#DFF2EA', padding: 10, alignItems: 'center' }, edit: { flex: 1, borderRadius: 12, backgroundColor: '#F2EDF5', padding: 10, alignItems: 'center' }, reject: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10, alignItems: 'center' }, actionOnText: { color: '#327457', fontSize: 11, fontWeight: '600' }, actionText: { color: colors.text, fontSize: 11, fontWeight: '600' }, editFields: { gap: 7, marginTop: 10 }, input: { color: colors.text, fontSize: 12, backgroundColor: '#F7F5F8', borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 9 }, primarySmall: { backgroundColor: colors.violet, borderRadius: 11, padding: 11, alignItems: 'center' }, primarySmallText: { color: '#FFF', fontSize: 11, fontWeight: '600' }, secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, minHeight: 48, marginTop: 17, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, secondaryText: { color: colors.text, fontWeight: '500', fontSize: 12 }, footer: { color: colors.quiet, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 12 }, modalShade: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', backgroundColor: 'rgba(20,16,26,.45)' }, modal: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 21, paddingTop: 24, paddingBottom: 28 }, modalEyebrow: { color: colors.violet, fontSize: 8, fontWeight: '700', letterSpacing: 1.2 }, modalTitle: { color: colors.text, fontSize: 21, fontWeight: '500', marginTop: 7 }, modalBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9 }, cancel: { alignItems: 'center', padding: 12, marginTop: 4 },
  selfReportSection: { marginTop: 12, marginBottom: 10 }, selfReportCard: { marginTop: 9, padding: 13, borderColor: '#CDBDD6', backgroundColor: '#FBF7FB' }, selfReportHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, selfReportTitle: { color: colors.text, fontSize: 13, fontWeight: '600' }, selfReportMeta: { color: colors.quiet, fontSize: 10, marginTop: 4 }, selfReportState: { color: '#8A6AA0', fontSize: 8, fontWeight: '700', letterSpacing: 0.5 }, selfReportText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12 }, selfReportInput: { minHeight: 100, marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, padding: 11, fontSize: 12, lineHeight: 18 }, selfReportFoot: { color: colors.quiet, fontSize: 10, lineHeight: 15, marginTop: 9 }, selfReportConfirm: { marginTop: 10, padding: 10, borderRadius: 11, borderWidth: 1, borderColor: '#E7D9E8', backgroundColor: '#FBF7FC' },
  versionHistory: { marginTop: 9, padding: 10, borderRadius: 10, backgroundColor: '#F5F0FA', borderWidth: 1, borderColor: '#E6DDED' }, historyTitle: { color: colors.violet, fontSize: 8, fontWeight: '700', letterSpacing: .8 }, historyCopy: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  focusedClaim: { borderColor: colors.violet, borderWidth: 2, backgroundColor: '#F8F1FA' }, focusNotice: { color: colors.violet, fontSize: 8, fontWeight: '800', letterSpacing: 0.7, marginTop: 9 },
  batchAnalysis: { marginTop: 16, marginBottom: 8 }, batchIntro: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 7, marginBottom: 3 },
  batchFinding: { marginTop: 9, padding: 13, borderColor: '#D9C7A8', backgroundColor: '#FFFBF3' }, batchFindingTitle: { color: '#8B672E', fontSize: 12, fontWeight: '700' }, batchConflictTitle: { color: '#A34E43' }, batchFindingBody: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  batchSources: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }, batchSourceButton: { borderRadius: 99, backgroundColor: colors.surfaceStrong, paddingHorizontal: 10, paddingVertical: 7 }, batchSourceText: { color: colors.violet, fontSize: 9, fontWeight: '600' },
});
