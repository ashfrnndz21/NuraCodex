import React, { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Orb } from '../src/components/Orb';
import { Label, Surface } from '../src/components/Surface';
import { useNura } from '../src/state/NuraContext';
import { colors, radius } from '../src/theme';
import { CandidateClaim, IntakeActivity, IntakeCancelledError, LocalSource, correctCandidate, decideCandidate, extractPickedFile, getSourceClaims } from '../src/services/intakeClient';

const supported = (asset: { mimeType?: string }) => ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes((asset.mimeType || '').toLowerCase());
export default function Review() {
  const params = useLocalSearchParams<{ purpose?: string; assetId?: string; sourceId?: string; claimId?: string }>();
  const existingSourceId = typeof params.sourceId === 'string' ? params.sourceId : '';
  const requestedClaimId = typeof params.claimId === 'string' ? params.claimId : '';
  const purpose: 'medical' | 'insurance' = params.purpose === 'insurance' ? 'insurance' : 'medical';
  const { assets, facts, addFact, correctFact, attachSourceToAsset } = useNura();
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
  const [drafts, setDrafts] = useState<Record<string, { label: string; value: string; unit: string }>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => () => extractionAbort.current?.abort(), []);

  useEffect(() => {
    if (!existingSourceId) return;
    let active = true;
    void getSourceClaims(existingSourceId).then((result) => {
      if (!active) return;
      setSource(result.source); setClaims(result.claims);
      setNotice('Opened the existing extraction; the original file was not sent again.');
      const requestedClaim = result.claims.find((claim) => claim.id === requestedClaimId && claim.evidenceState === 'user_confirmed');
      if (requestedClaim) {
        setDrafts((current) => ({ ...current, [requestedClaim.id]: { label: requestedClaim.label, value: requestedClaim.value, unit: requestedClaim.unit ?? '' } }));
        setEditingId(requestedClaim.id);
      }
      if (selectedAssetId) attachSourceToAsset(selectedAssetId, result.source.id);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : 'This source could not be opened.');
    });
    return () => { active = false; };
  }, [existingSourceId, requestedClaimId, selectedAssetId, attachSourceToAsset]);

  async function readSelected() {
    if (!selected || busy) return;
    const controller = new AbortController();
    extractionAbort.current = controller;
    setConsentOpen(false); setBusy(true); setExtracting(true); setError(''); setNotice(''); setSource(null); setClaims([]); setActivity([]);
    try {
      const result = await extractPickedFile({ uri: selected.uri, name: selected.name, mimeType: selected.mimeType, size: selected.size }, (item) => setActivity((current) => [...current, item]), purpose, controller.signal);
      attachSourceToAsset(selected.id, result.source.id);
      setSource(result.source); setClaims(result.claims);
      setNotice(result.duplicate ? 'Exact duplicate file detected. Showing its existing review state.' : result.claims.length ? 'Extraction finished. Nothing is in your profile until you accept a claim.' : 'The source was read, but no clear claims were returned. No profile details were added.');
    } catch (caught) {
      if (caught instanceof IntakeCancelledError) {
        setNotice('Processing stopped. No new claim was added. You can review this file again whenever you are ready.');
        setActivity((current) => current.some((item) => item.status === 'cancelled') ? current : [...current, { id: `${Date.now()}-intake-cancelled`, label: 'Processing stopped at your request', status: 'cancelled' }]);
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
        note: [result.claim.sourceLocation.quote, result.claim.sourceLocation.page ? `Page ${result.claim.sourceLocation.page}` : null].filter(Boolean).join(' · '),
        validFrom: result.claim.effectiveAt ?? new Date().toISOString(), validUntil: null,
        confidence: result.claim.confidence, permissionScope: 'profile_write',
      });
      setNotice(decision === 'reject' ? 'You rejected this candidate. It was not added to your profile.' : 'You confirmed this sourced detail. It is now in your local registry.');
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
        note: [result.claim.sourceLocation.quote, result.claim.sourceLocation.page ? `Page ${result.claim.sourceLocation.page}` : null, result.claim.effectiveAt ? `Record date ${result.claim.effectiveAt}` : null, 'Corrected by you; earlier versions are retained.'].filter(Boolean).join(' · '),
        validFrom: result.claim.effectiveAt ?? new Date().toISOString(), validUntil: null,
        confidence: null, permissionScope: 'profile_write',
      });
      setEditingId(null);
      setNotice(`Saved as version ${result.assertion.version}. Version ${result.previousAssertion.version} remains in the source history.`);
    } catch (caught) { setError(sourceCorrectionSaved ? 'The source version was saved, but its matching profile timeline copy could not be saved on this device. Reopen this source to reconcile it.' : caught instanceof Error ? caught.message : 'The corrected version could not be saved.'); }
    finally { setBusy(false); }
  }
  function startEdit(claim: CandidateClaim) {
    setDrafts((current) => ({ ...current, [claim.id]: { label: claim.label, value: claim.value, unit: claim.unit ?? '' } }));
    setEditingId(claim.id);
  }

  return <View style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>‹  Back</Text></Pressable>
    <View style={styles.heading}><Orb size={36} state={busy ? 'thinking' : 'idle'} /><View style={{ flex: 1 }}><Label>{purpose === 'insurance' ? 'YOUR POLICY · SOURCE REVIEW' : 'YOUR FILES · SOURCE REVIEW'}</Label><Text style={styles.title}>{purpose === 'insurance' ? 'Review policy terms.' : 'Read, then decide.'}</Text></View></View>
    <Text style={styles.intro}>{purpose === 'insurance' ? 'A PDF or image is sent only after you confirm. Nura suggests explicit policy terms with source quotes. It does not decide whether a service will be covered.' : 'A PDF or image is sent only after you confirm. Nura extracts review candidates; it does not file them as facts until you accept or edit them.'}</Text>
    {readable.length > 0 ? <View style={styles.files}><Label>PDFS AND IMAGES · {readable.length}</Label>{readable.map((asset) => <Pressable key={asset.id} onPress={() => { setSelectedId(asset.id); setSource(null); setClaims([]); setActivity([]); setNotice(''); setError(''); }}><Surface style={{ ...styles.file, ...(selected?.id === asset.id ? styles.fileSelected : {}) }}><Text style={styles.fileType}>{asset.kind.toUpperCase()}</Text><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.fileName}>{asset.name}</Text><Text style={styles.fileSub}>{asset.size ? `${Math.round(asset.size / 1024)} KB` : 'Ready for explicit review'}</Text></View><Text style={styles.select}>{selected?.id === asset.id ? 'Selected' : 'Choose'}</Text></Surface></Pressable>)}</View> : null}
    {assets.some((asset) => asset.kind === 'video') && <Surface style={styles.notice}><Text style={styles.noticeTitle}>Video understanding is not connected</Text><Text style={styles.noticeBody}>This demo cannot analyze video or audio yet. No video is uploaded from this screen.</Text></Surface>}
    {selected && !source && (!existingSourceId || Boolean(error)) && <Pressable disabled={busy} onPress={() => { setError(''); setConsentOpen(true); }} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Reading with the configured service…' : existingSourceId ? 'Retry review with Nura' : 'Review this file with Nura'}</Text><Text style={styles.arrow}>→</Text></Pressable>}
    {Boolean(existingSourceId) && !source && !error && <Surface style={styles.notice}><Text style={styles.noticeTitle}>Opening saved source details</Text><Text style={styles.noticeBody}>Loading the existing extracted claims. The original file will not be uploaded again.</Text></Surface>}
    {extracting && <Surface style={styles.notice}><Text style={styles.noticeTitle}>Nura is processing this file</Text><Text style={styles.noticeBody}>The selected source is sent to the configured AI provider. Original bytes are not saved by this local backend.</Text><Pressable accessibilityRole="button" accessibilityLabel="Stop document extraction" onPress={() => extractionAbort.current?.abort()} style={({ pressed }) => [styles.stop, pressed && styles.stopPressed]}><Text style={styles.stopText}>STOP THIS READ</Text></Pressable></Surface>}
    {activity.length > 0 && <Surface style={styles.activity}><Label>LIVE ACTIVITY · SERVER EVENTS</Label>{activity.map((item) => <View key={item.id} style={styles.activityRow}><Text style={[styles.activityMark, item.status === 'complete' && styles.activityDone, item.status === 'failed' && styles.activityFailed, item.status === 'cancelled' && styles.activityCancelled]}>{item.status === 'complete' ? '✓' : item.status === 'failed' ? '!' : item.status === 'cancelled' ? '×' : '·'}</Text><Text style={styles.activityText}>{item.label}</Text></View>)}</Surface>}
    {notice ? <Surface style={styles.notice}><Text style={styles.noticeTitle}>Source status</Text><Text style={styles.noticeBody}>{notice}</Text></Surface> : null}
    {error ? <Surface style={styles.error}><Text style={styles.noticeTitle}>Could not complete this step</Text><Text style={styles.noticeBody}>{error}</Text></Surface> : null}
    {source && <Surface style={styles.sourceCard}><Label>SOURCE · {source.state.replace(/_/g, ' ').toUpperCase()}</Label><Text style={styles.sourceName}>{source.displayName}</Text><Text style={styles.sourceSub}>SHA-256 exact-match identity · {new Date(source.importedAt).toLocaleDateString()}</Text><Text style={styles.sourceSub}>Original stays on this device. Extracted candidates below remain separate from your profile until reviewed.</Text></Surface>}
    {claims.map((claim) => {
      const draft = drafts[claim.id] ?? { label: claim.label, value: claim.value, unit: claim.unit ?? '' };
      const pending = claim.evidenceState === 'needs_review';
      const correctingAccepted = claim.evidenceState === 'user_confirmed' && editingId === claim.id;
      return <Surface key={claim.id} style={styles.claim}>
        <View style={styles.claimTop}><View style={{ flex: 1 }}><Text style={styles.claimLabel}>{claim.label}</Text><Text style={styles.claimValue}>{claim.value}{claim.unit ? ` ${claim.unit}` : ''}{claim.effectiveAt ? ` · ${claim.effectiveAt}` : ''}</Text></View><Text style={[styles.state, !pending && styles.stateDone]}>{pending ? 'REVIEW' : claim.evidenceState === 'user_confirmed' ? 'ADDED' : 'REJECTED'}</Text></View>
        {claim.sourceLocation.quote ? <Text style={styles.quote}>“{claim.sourceLocation.quote}”{claim.sourceLocation.page ? ` · page ${claim.sourceLocation.page}` : ''}</Text> : <Text style={styles.quote}>No page quote was returned. Check the original before accepting.</Text>}
        <Text style={styles.confidence}>Extraction confidence {claim.confidence === null ? 'not supplied' : `${Math.round(claim.confidence * 100)}%`} · model suggestion, not verification</Text>
        {claim.originalExtraction && <View style={styles.versionHistory}><Text style={styles.historyTitle}>ORIGINAL EXTRACTION</Text><Text style={styles.historyCopy}>{claim.originalExtraction.label}: {claim.originalExtraction.value}{claim.originalExtraction.unit ? ` ${claim.originalExtraction.unit}` : ''} · retained beside the source quote</Text></View>}
        {(claim.revisionHistory ?? []).length > 0 && <View style={styles.versionHistory}><Text style={styles.historyTitle}>EARLIER ACCEPTED VERSIONS</Text>{[...(claim.revisionHistory ?? [])].reverse().map((version) => <Text key={version.assertionId} style={styles.historyCopy}>v{version.version} · {new Date(version.recordedAt).toLocaleDateString()} · {version.label}: {version.value}{version.unit ? ` ${version.unit}` : ''}</Text>)}</View>}
        {pending && editingId === claim.id ? <View style={styles.editFields}><TextInput value={draft.label} onChangeText={(label) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, label } }))} placeholder="Detail name" style={styles.input} /><TextInput value={draft.value} onChangeText={(value) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, value } }))} placeholder="Value" style={styles.input} /><TextInput value={draft.unit} onChangeText={(unit) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, unit } }))} placeholder="Unit (optional)" style={styles.input} /><Pressable disabled={busy} onPress={() => void reviewClaim(claim, 'edit')} style={styles.primarySmall}><Text style={styles.primarySmallText}>Save edit and add</Text></Pressable></View> : null}
        {correctingAccepted && <View style={styles.editFields}><Text style={styles.confidence}>Your correction creates a new version and keeps the earlier accepted value linked to this source.</Text><TextInput value={draft.label} onChangeText={(label) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, label } }))} placeholder="Detail name" style={styles.input} /><TextInput value={draft.value} onChangeText={(value) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, value } }))} placeholder="Corrected value" style={styles.input} /><TextInput value={draft.unit} onChangeText={(unit) => setDrafts((items) => ({ ...items, [claim.id]: { ...draft, unit } }))} placeholder="Unit (optional)" style={styles.input} /><Pressable disabled={busy} onPress={() => void saveClaimCorrection(claim)} style={styles.primarySmall}><Text style={styles.primarySmallText}>{busy ? 'Saving version…' : 'Save corrected version'}</Text></Pressable><Pressable disabled={busy} onPress={() => setEditingId(null)} style={styles.cancel}><Text style={styles.secondaryText}>Cancel</Text></Pressable></View>}
        {claim.evidenceState === 'user_confirmed' && !correctingAccepted && <Pressable disabled={busy} accessibilityRole="button" onPress={() => startEdit(claim)} style={styles.edit}><Text style={styles.actionText}>Correct this detail</Text></Pressable>}
        {pending && purpose === 'insurance' && claim.kind !== 'coverage_term' ? <View style={styles.actions}><Text style={styles.confidence}>Not a policy term · this suggestion cannot be added to the Insurance Registry.</Text><Pressable disabled={busy} onPress={() => void reviewClaim(claim, 'reject')} style={styles.reject}><Text style={styles.actionText}>Dismiss</Text></Pressable></View> : null}
        {pending && editingId !== claim.id && (purpose !== 'insurance' || claim.kind === 'coverage_term') ? <View style={styles.actions}><Pressable disabled={busy} onPress={() => void reviewClaim(claim, 'accept')} style={styles.accept}><Text style={styles.actionOnText}>Accept</Text></Pressable><Pressable disabled={busy} onPress={() => startEdit(claim)} style={styles.edit}><Text style={styles.actionText}>Edit</Text></Pressable><Pressable disabled={busy} onPress={() => void reviewClaim(claim, 'reject')} style={styles.reject}><Text style={styles.actionText}>Reject</Text></Pressable></View> : null}
      </Surface>;
    })}
    {!assets.length && <Surface style={styles.notice}><Text style={styles.noticeTitle}>No supported document selected</Text><Text style={styles.noticeBody}>Choose a PDF or image in the previous step to start a real extraction. Video is not supported yet.</Text></Surface>}
    <Pressable onPress={() => router.replace(purpose === 'insurance' ? '/insurance' : '/(tabs)/health')} style={styles.secondary}><Text style={styles.secondaryText}>{purpose === 'insurance' ? 'Open Insurance Registry' : 'Open my registry'}</Text><Text style={styles.arrow}>→</Text></Pressable>
    <Text style={styles.footer}>The local development backend uses a server-held key and loopback access only. The provider’s data handling applies. Do not use real health records in this demo.</Text>
  </ScrollView>
  {consentOpen && <View style={styles.modalShade}><View style={styles.modal}><Text style={styles.modalEyebrow}>ONE FILE · ONE EXTRACTION</Text><Text style={styles.modalTitle}>Send this source to Nura?</Text><Text style={styles.modalBody}>{selected?.name} will be sent to your local demo service and configured AI provider for extraction. No claim is added automatically; you can review, edit or reject each suggestion. Provider data handling applies.</Text><Pressable onPress={() => void readSelected()} style={styles.primary}><Text style={styles.primaryText}>I agree · read this file</Text><Text style={styles.arrow}>→</Text></Pressable><Pressable onPress={() => setConsentOpen(false)} style={styles.cancel}><Text style={styles.secondaryText}>Cancel</Text></Pressable></View></View>}
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, content: { padding: 22, paddingTop: 38, paddingBottom: 50, maxWidth: 600, width: '100%', alignSelf: 'center' }, back: { color: colors.muted, fontSize: 15, marginBottom: 22 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, title: { color: colors.text, fontSize: 27, fontWeight: '300', marginTop: 6 }, intro: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 13, marginBottom: 17 }, files: { marginTop: 3, marginBottom: 12 }, file: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: radius.md, marginTop: 8, gap: 10 }, fileSelected: { borderColor: colors.violet, borderWidth: 1.5 }, fileType: { color: colors.aqua, fontSize: 9, fontWeight: '700', borderColor: colors.border, borderWidth: 1, borderRadius: 9, padding: 8 }, fileName: { color: colors.text, fontSize: 12, fontWeight: '500' }, fileSub: { color: colors.quiet, fontSize: 10, marginTop: 3 }, select: { color: colors.violet, fontSize: 10, fontWeight: '600' }, notice: { marginTop: 12, borderColor: colors.border }, activity: { marginTop: 12, padding: 13 }, activityRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 9 }, activityMark: { color: colors.quiet, fontSize: 14, width: 18, textAlign: 'center' }, activityDone: { color: '#3B8863' }, activityFailed: { color: '#A55142' }, activityCancelled: { color: colors.muted }, activityText: { color: colors.muted, fontSize: 10, flex: 1 }, noticeTitle: { color: colors.text, fontSize: 13, fontWeight: '600' }, noticeBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 5 }, stop: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#D9D2E2', backgroundColor: '#F8F5FA' }, stopPressed: { opacity: .78, transform: [{ scale: .98 }] }, stopText: { color: colors.violet, fontSize: 9, fontWeight: '700', letterSpacing: .55 }, error: { marginTop: 12, borderColor: '#E8BDB4', backgroundColor: '#FFF5F2' }, primary: { backgroundColor: '#E8E0FF', borderRadius: radius.pill, minHeight: 53, marginTop: 13, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, disabled: { opacity: .6 }, primaryText: { color: colors.ink, fontWeight: '600', fontSize: 13 }, arrow: { color: colors.ink, fontSize: 19 }, sourceCard: { marginTop: 13 }, sourceName: { color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 8 }, sourceSub: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 }, claim: { marginTop: 10, padding: 14 }, claimTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, claimLabel: { color: colors.text, fontSize: 14, fontWeight: '600' }, claimValue: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, state: { color: '#8B672E', backgroundColor: '#FFF1D8', overflow: 'hidden', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 7, fontSize: 8, fontWeight: '700' }, stateDone: { color: '#33785A', backgroundColor: '#E1F2E9' }, quote: { color: colors.muted, fontSize: 11, lineHeight: 16, fontStyle: 'italic', marginTop: 10 }, confidence: { color: colors.quiet, fontSize: 9, lineHeight: 14, marginTop: 7 }, actions: { flexDirection: 'row', gap: 7, marginTop: 12 }, accept: { flex: 1, borderRadius: 12, backgroundColor: '#DFF2EA', padding: 10, alignItems: 'center' }, edit: { flex: 1, borderRadius: 12, backgroundColor: '#F2EDF5', padding: 10, alignItems: 'center' }, reject: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10, alignItems: 'center' }, actionOnText: { color: '#327457', fontSize: 11, fontWeight: '600' }, actionText: { color: colors.text, fontSize: 11, fontWeight: '600' }, editFields: { gap: 7, marginTop: 10 }, input: { color: colors.text, fontSize: 12, backgroundColor: '#F7F5F8', borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 9 }, primarySmall: { backgroundColor: colors.violet, borderRadius: 11, padding: 11, alignItems: 'center' }, primarySmallText: { color: '#FFF', fontSize: 11, fontWeight: '600' }, secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, minHeight: 48, marginTop: 17, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, secondaryText: { color: colors.text, fontWeight: '500', fontSize: 12 }, footer: { color: colors.quiet, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 12 }, modalShade: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', backgroundColor: 'rgba(20,16,26,.45)' }, modal: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 21, paddingTop: 24, paddingBottom: 28 }, modalEyebrow: { color: colors.violet, fontSize: 8, fontWeight: '700', letterSpacing: 1.2 }, modalTitle: { color: colors.text, fontSize: 21, fontWeight: '500', marginTop: 7 }, modalBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9 }, cancel: { alignItems: 'center', padding: 12, marginTop: 4 },
  versionHistory: { marginTop: 9, padding: 10, borderRadius: 10, backgroundColor: '#F5F0FA', borderWidth: 1, borderColor: '#E6DDED' }, historyTitle: { color: colors.violet, fontSize: 8, fontWeight: '700', letterSpacing: .8 }, historyCopy: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
});
