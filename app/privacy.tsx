import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Label, Surface } from '../src/components/Surface';
import { clearLocalDemoProcessingData } from '../src/services/agentClient';
import { getSourceClaims, retractAcceptedCandidate } from '../src/services/intakeClient';
import { CONSENT_PURPOSE_LABELS, CONSENT_SCOPE_LABELS } from '../src/services/consentReceipts.mjs';
import { buildNuraLocalExport, createNuraExportArchive } from '../src/services/privacyExport.mjs';
import { privacyStorageMap } from '../src/services/privacyStorageMap.mjs';
import { readSavedSourceFilesForExport } from '../src/services/localSourceExport';
import { getPrivacyConsentState, updatePrivacyConsentState, type PrivacyConsentState, type PrivacyPreferencePurpose } from '../src/services/privacyConsentClient';
import { useNura } from '../src/state/NuraContext';
import { usePreviewIdentity } from '../src/state/PreviewIdentityContext';
import { colors, radius } from '../src/theme';

type InventoryRow = { id: string; title: string; count: number; summary: string; details: React.ReactNode };
type ConfirmAction = 'device' | 'processor' | 'sample' | 'export' | null;
type RemovableSource = { key: string; sourceId: string | null; assetId?: string; title: string; detail: string; linkedCount: number };

function RecordLine({ title, value, source }: { title: string; value?: string; source?: string }) {
  return <View style={styles.recordLine}><Text style={styles.recordTitle}>{title}</Text>{value ? <Text style={styles.recordValue}>{value}</Text> : null}{source ? <Text style={styles.recordSource}>{source}</Text> : null}</View>;
}

export default function Privacy() {
  const { ready, storageError, name, birthday, country, email, phone, setupProgress, topics, facts, assets, intakeNotes, treatments, treatmentEvents, visits, visitEvents, links, policyReplacements, feedItems, savedQuestions, agentMessages, askConversations, registryBriefs, policyClarifications, consentReceipts, clearAllLocalData, resetDemo, retractFact, removeSavedSource } = useNura();
  const { signOut } = usePreviewIdentity();
  const [expanded, setExpanded] = useState<string | null>('profile');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [confirmError, setConfirmError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [factToRemoveId, setFactToRemoveId] = useState<string | null>(null);
  const [factRemovalBusy, setFactRemovalBusy] = useState(false);
  const [factRemovalError, setFactRemovalError] = useState('');
  const [factRemovalNotice, setFactRemovalNotice] = useState('');
  const [pendingLocalRetraction, setPendingLocalRetraction] = useState<{ factId: string; retractedAt: string } | null>(null);
  const [sourceToRemove, setSourceToRemove] = useState<RemovableSource | null>(null);
  const [sourceRemovalBusy, setSourceRemovalBusy] = useState(false);
  const [sourceRemovalError, setSourceRemovalError] = useState('');
  const [sourceRemovalNotice, setSourceRemovalNotice] = useState('');
  const [privacyPreferences, setPrivacyPreferences] = useState<PrivacyConsentState | null>(null);
  const [privacyPreferencesLoading, setPrivacyPreferencesLoading] = useState(true);
  const [privacyPreferencesBusy, setPrivacyPreferencesBusy] = useState(false);
  const [privacyPreferencesError, setPrivacyPreferencesError] = useState('');
  const [enablePurpose, setEnablePurpose] = useState<PrivacyPreferencePurpose | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    void getPrivacyConsentState().then((state) => {
      if (active) { setPrivacyPreferences(state); setPrivacyPreferencesError(''); }
    }).catch((error) => {
      if (active) setPrivacyPreferencesError(error instanceof Error ? error.message : 'Nura could not load your processing choices.');
    }).finally(() => { if (active) setPrivacyPreferencesLoading(false); });
    return () => { active = false; };
  }, [ready]);

  const personalDetails = [
    ['Name', name], ['Birthday', birthday], ['Country', country], ['Email', email], ['Phone', phone],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const storageLocations = useMemo(() => privacyStorageMap(Platform.OS), []);

  const removableSources = useMemo<RemovableSource[]>(() => {
    const byKey = new Map<string, RemovableSource>();
    const ensure = (sourceId: string | null, assetId?: string, title?: string) => {
      const key = sourceId ? `server:${sourceId}` : `asset:${assetId ?? ''}`;
      const existing = byKey.get(key);
      if (existing) return existing;
      const entry: RemovableSource = { key, sourceId, assetId, title: title || 'Saved source', detail: sourceId ? 'Source reviewed by Nura' : 'File saved on this device', linkedCount: 0 };
      byKey.set(key, entry);
      return entry;
    };
    for (const asset of assets) {
      const entry = ensure(asset.serverSourceId ?? null, asset.id, asset.name);
      if (asset.serverSourceId) entry.assetId = asset.id;
      entry.detail = `${asset.kind.toUpperCase()} · ${asset.purpose ?? 'medical'} · added ${new Date(asset.addedAt).toLocaleDateString()}`;
      entry.linkedCount += 1;
    }
    for (const note of intakeNotes) if (note.serverSourceId) {
      const entry = ensure(note.serverSourceId, undefined, note.topicLabel ? `${note.topicLabel} · your note` : 'Your saved note');
      entry.linkedCount += 1;
    }
    for (const fact of facts) if (fact.sourceId) {
      const entry = ensure(fact.sourceId, undefined, fact.source || fact.label);
      entry.linkedCount += 1;
    }
    for (const item of treatments) if (item.sourceId) {
      const entry = ensure(item.sourceId, undefined, item.source || item.name);
      entry.linkedCount += 1;
    }
    return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [assets, facts, intakeNotes, treatments]);

  const rows = useMemo<InventoryRow[]>(() => [
    {
      id: 'profile', title: 'Profile details', count: personalDetails.length,
      summary: 'Details you entered yourself.',
      details: personalDetails.length ? personalDetails.map(([label, value]) => <RecordLine key={label} title={label} value={value} source="Entered by you · saved in the Nura profile" />) : <Text style={styles.empty}>No profile details saved.</Text>,
    },
    {
      id: 'sources', title: 'Saved sources and reports', count: removableSources.length,
      summary: 'Remove one report or note and its linked saved details.',
      details: removableSources.length ? removableSources.map((source) => <View key={source.key} style={styles.sourceRecordRow}>
        <RecordLine title={source.title} value={source.detail} source={`${source.linkedCount} linked saved item${source.linkedCount === 1 ? '' : 's'}`} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Permanently remove ${source.title} and its linked saved information`} disabled={sourceRemovalBusy} onPress={() => { setSourceRemovalError(''); setSourceRemovalNotice(''); setSourceToRemove(source); }} style={({ pressed }) => [styles.removeSourceAction, sourceRemovalBusy && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.removeSourceActionText}>{source.sourceId ? 'Permanently remove source' : 'Remove saved file'}</Text>
        </Pressable>
      </View>) : <Text style={styles.empty}>No saved sources are available to remove.</Text>,
    },
    {
      id: 'topics', title: 'Health areas', count: topics.length,
      summary: 'Topics you chose to explore; these are not diagnoses.',
      details: topics.length ? topics.map((topic) => <RecordLine key={topic.id} title={topic.label} source="Selected by you" />) : <Text style={styles.empty}>No health areas selected.</Text>,
    },
    {
      id: 'facts', title: 'Health details', count: facts.length,
      summary: 'Saved facts with their source and review status.',
      details: facts.length ? facts.map((fact) => <View key={fact.id} style={styles.factRecordRow}>
        <RecordLine title={fact.label} value={fact.value} source={`${fact.source} · ${fact.date} · ${fact.reviewState === 'user_retracted' ? 'Removed from active profile' : fact.validUntil ? 'Earlier version' : fact.status}`} />
        {!fact.validUntil && fact.reviewState !== 'user_retracted' ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${fact.label} from active profile`} onPress={() => { setFactRemovalError(''); setFactRemovalNotice(''); setFactToRemoveId(fact.id); }} style={styles.removeFactAction}><Text style={styles.removeFactActionText}>Remove from active profile</Text></Pressable> : null}
      </View>) : <Text style={styles.empty}>No health details saved.</Text>,
    },
    {
      id: 'files', title: 'Health records and policies', count: assets.length,
      summary: Platform.OS === 'web' ? 'Sample files and files selected in this tab.' : 'Original file copies saved inside the app on this device.',
      details: assets.length ? assets.map((asset) => <RecordLine key={asset.id} title={asset.name} value={`${asset.kind.toUpperCase()} · ${asset.purpose ?? 'medical'}`} source={`${asset.serverSourceId ? 'Reviewed by Nura' : 'Not sent for review'} · added ${new Date(asset.addedAt).toLocaleDateString()}`} />) : <Text style={styles.empty}>No files saved.</Text>,
    },
    {
      id: 'treatments', title: 'Medicines and treatment', count: treatments.length,
      summary: 'Current and past treatment details you recorded.',
      details: treatments.length ? treatments.map((record) => <RecordLine key={record.id} title={record.name} value={[record.dose, record.schedule, record.purpose].filter(Boolean).join(' · ')} source={`${record.status === 'current' ? 'Current' : 'Past'} · ${record.source}`} />) : <Text style={styles.empty}>No treatment details saved.</Text>,
    },
    {
      id: 'visits', title: 'Visits and care actions', count: visits.length,
      summary: 'Appointments, visit notes and follow-up details.',
      details: visits.length ? visits.map((visit) => <RecordLine key={visit.id} title={visit.purpose || 'Care visit'} value={[visit.clinician, visit.location].filter(Boolean).join(' · ')} source={`${visit.status} · ${visit.appointmentAt || 'date not set'}`} />) : <Text style={styles.empty}>No visit details saved.</Text>,
    },
    {
      id: 'links', title: 'Record connections', count: links.length,
      summary: 'Associations you explicitly created between records.',
      details: links.length ? links.map((link) => <RecordLine key={link.id} title={link.label} value={link.relationType.replaceAll('_', ' ')} source="Linked by you · not a medical causation finding" />) : <Text style={styles.empty}>No record connections created.</Text>,
    },
    {
      id: 'reading', title: 'Health reading', count: feedItems.length,
      summary: 'Search results, saved items and items you dismissed.',
      details: feedItems.length ? feedItems.map((item) => <RecordLine key={item.id} title={item.title} value={item.publisher} source={`${item.saved ? 'Saved' : item.dismissed ? 'Hidden' : 'In this session'} · ${item.topic}`} />) : <Text style={styles.empty}>No reading items saved in this session.</Text>,
    },
    {
      id: 'registry-briefs', title: 'Medical Registry summaries', count: registryBriefs.length,
      summary: 'Saved source-cited summaries created from a consented Ask Nura run.',
      details: registryBriefs.length ? registryBriefs.map((brief) => <RecordLine key={brief.id} title={brief.topicLabel + ' · ' + new Date(brief.createdAt).toLocaleDateString()} value={brief.answer} source={'Saved summary · ' + brief.citations.length + ' cited sources · run ' + brief.runId} />) : <Text style={styles.empty}>No Medical Registry summaries saved.</Text>,
    },
    {
      id: 'policy-clarifications', title: 'Insurer replies you recorded', count: policyClarifications.length,
      summary: 'Your notes about replies from an insurer, kept separate from extracted policy wording.',
      details: policyClarifications.length ? policyClarifications.map((reply) => <RecordLine key={reply.id} title={`${reply.termLabel} · ${new Date(reply.reportedAt).toLocaleDateString()}`} value={reply.response} source={`User-reported · not policy wording · linked to source claim ${reply.sourceClaimId}`} />) : <Text style={styles.empty}>No insurer replies recorded.</Text>,
    },
    {
      id: 'questions', title: 'Ask history and saved questions', count: askConversations.length + agentMessages.length + savedQuestions.length,
      summary: 'Titled conversations, their messages, and saved questions on this device or in this tab.',
      details: <>{savedQuestions.map((question, index) => <RecordLine key={`question-${index}`} title="Saved question" value={question} source="Saved by you" />)}{askConversations.map((conversation) => <RecordLine key={`conversation-${conversation.id}`} title={`Conversation · ${conversation.title}`} value={`${agentMessages.filter((message) => message.conversationId === conversation.id).length} saved messages`} source={`Updated ${new Date(conversation.updatedAt).toLocaleString()} · linked chats: ${conversation.linkedConversationIds.length}`} />)}{agentMessages.map((message) => { const title = askConversations.find((conversation) => conversation.id === message.conversationId)?.title; return <RecordLine key={message.id} title={`${title ? `${title} · ` : ''}${message.role === 'user' ? 'You asked' : 'Nura answered'}`} value={message.text} source={`${new Date(message.createdAt).toLocaleString()} · ${message.citations.length} cited sources`} />; })}{!savedQuestions.length && !agentMessages.length ? <Text style={styles.empty}>No conversation history saved.</Text> : null}</>,
    },
    {
      id: 'consent', title: 'Nura approvals', count: consentReceipts.length,
      summary: 'A local log of the purpose, information categories and time approved for each run.',
      details: consentReceipts.length ? consentReceipts.map((receipt) => <RecordLine key={receipt.id} title={`${CONSENT_PURPOSE_LABELS[receipt.purpose]} · ${new Date(receipt.approvedAt).toLocaleString()}`} value={receipt.scopes.map((scope) => CONSENT_SCOPE_LABELS[scope]).join(' · ')} source="One run only · question text and health values are not in this approval log" />) : <Text style={styles.empty}>No AI or search approvals recorded on this device yet.</Text>,
    },
    {
      id: 'processing-choices', title: 'Processing choice history', count: privacyPreferences?.events.length ?? 0,
      summary: 'When you enabled or withdrew AI answers and public health searches.',
      details: privacyPreferences?.events.length ? privacyPreferences.events.slice(0, 12).map((event) => <RecordLine key={event.id} title={`${event.purpose === 'ai_processing' ? 'AI processing' : 'Public health search'} · ${event.decision}`} value={`Policy ${event.policyVersion}`} source={new Date(event.recordedAt).toLocaleString()} />) : <Text style={styles.empty}>No account-wide processing changes recorded in the local preview.</Text>,
    },
  ], [personalDetails, removableSources, sourceRemovalBusy, topics, facts, assets, treatments, visits, links, feedItems, agentMessages, askConversations, registryBriefs, policyClarifications, savedQuestions, consentReceipts, privacyPreferences]);

  function toggleRow(id: string) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => current === id ? null : id);
  }

  async function saveProcessingPreference(purpose: PrivacyPreferencePurpose, enabled: boolean, confirmed = false) {
    if (!privacyPreferences) return;
    setPrivacyPreferencesBusy(true);
    setPrivacyPreferencesError('');
    try {
      const state = await updatePrivacyConsentState({
        aiProcessing: purpose === 'aiProcessing' ? enabled : privacyPreferences.settings.aiProcessing,
        publicHealthSearch: purpose === 'publicHealthSearch' ? enabled : privacyPreferences.settings.publicHealthSearch,
        ...(confirmed ? { consentConfirmed: true, policyVersion: privacyPreferences.policyVersion } : {}),
      });
      setPrivacyPreferences(state);
      setEnablePurpose(null);
    } catch (error) {
      setPrivacyPreferencesError(error instanceof Error ? error.message : 'Nura could not update your processing choices. Try again.');
    } finally {
      setPrivacyPreferencesBusy(false);
    }
  }

  function changeProcessingPreference(purpose: PrivacyPreferencePurpose, enabled: boolean) {
    if (enabled) setEnablePurpose(purpose);
    else void saveProcessingPreference(purpose, false);
  }

  function confirmEnableProcessing() {
    if (enablePurpose) void saveProcessingPreference(enablePurpose, true, true);
  }

  async function confirmRemoveFact() {
    if (!factToRemoveId || factRemovalBusy) return;
    const fact = facts.find((item) => item.id === factToRemoveId && !item.validUntil && item.reviewState !== 'user_retracted');
    if (!fact) {
      setFactRemovalError('This detail is no longer active. Close this message and refresh the inventory.');
      return;
    }
    setFactRemovalBusy(true);
    setFactRemovalError('');
    setFactRemovalNotice('');
    try {
      let retractedAt = new Date().toISOString();
      const retryingLocalSync = pendingLocalRetraction?.factId === fact.id;
      if (retryingLocalSync) {
        retractedAt = pendingLocalRetraction.retractedAt;
      } else if (fact.sourceClaimId) {
        if (!fact.sourceId) throw new Error('This source-linked detail is missing its source reference. Open its source review to remove the current version safely.');
        const { claims } = await getSourceClaims(fact.sourceId);
        const claim = claims.find((item) => item.id === fact.sourceClaimId);
        if (!claim?.acceptedAssertionId || claim.evidenceState !== 'user_confirmed') throw new Error('This detail changed since it was saved. Open its source review to remove the latest confirmed version safely.');
        const result = await retractAcceptedCandidate(claim.id, claim.acceptedAssertionId);
        retractedAt = result.claim.retractedAt ?? result.previousAssertion.validUntil ?? new Date().toISOString();
        setPendingLocalRetraction({ factId: fact.id, retractedAt });
      }
      try {
        const removed = await retractFact(fact.id, retractedAt);
        if (!removed) throw new Error('The saved detail changed before this device could update it.');
      } catch (error) {
        if (fact.sourceClaimId) {
          setFactRemovalError(`Nura removed this detail from its source review, but could not update the copy on this device. Tap “Sync removal” to finish. ${error instanceof Error ? error.message : ''}`.trim());
          return;
        }
        throw error;
      }
      setPendingLocalRetraction(null);
      setFactToRemoveId(null);
      setFactRemovalNotice(`“${fact.label}” was removed from your active profile. Its original source and review history remain available.`);
    } catch (error) {
      setFactRemovalError(error instanceof Error ? error.message : 'Nura could not remove this detail. Try again.');
    } finally {
      setFactRemovalBusy(false);
    }
  }

  async function confirmRemoveSource() {
    if (!sourceToRemove || sourceRemovalBusy) return;
    setSourceRemovalBusy(true);
    setSourceRemovalError('');
    try {
      const result = await removeSavedSource(sourceToRemove.sourceId, sourceToRemove.assetId);
      const linkedCount = Object.values(result.removed).reduce((sum, count) => sum + count, 0);
      const linkedDetails = linkedCount ? ` and ${linkedCount} linked saved item${linkedCount === 1 ? '' : 's'}` : '';
      const message = result.serviceStatus === 'not_needed'
        ? `Removed “${sourceToRemove.title}”${linkedDetails} from this app.`
        : result.alreadyRemoved
          ? `Finished clearing “${sourceToRemove.title}”${linkedDetails} from this app. Its content had already been removed from the local preview service.`
          : `Removed “${sourceToRemove.title}”${linkedDetails} from this app and the local preview service.`;
      setSourceRemovalNotice(message);
      setSourceToRemove(null);
    } catch (error) {
      setSourceRemovalError(error instanceof Error ? error.message : 'Nura could not remove this source. Try again.');
    } finally { setSourceRemovalBusy(false); }
  }

  async function confirmClear() {
    if (!confirmAction) return;
    const clearingDevice = confirmAction === 'device';
    setBusy(true); setConfirmError(''); setNotice('');
    try {
      if (confirmAction === 'export') {
        const sourceFiles = await readSavedSourceFilesForExport(assets);
        const processingPreferences = privacyPreferences ? {
          policyVersion: privacyPreferences.policyVersion,
          settings: privacyPreferences.settings,
          events: privacyPreferences.events,
        } : { status: 'Could not be loaded from the local preview service at export time.' };
        const data = buildNuraLocalExport({
          exportedAt: new Date().toISOString(),
          profile: { name, birthday, country, email, phone },
          setupProgress,
          topics,
          assets,
          intakeNotes,
          facts,
          treatments,
          treatmentEvents,
          visits,
          visitEvents,
          links,
          policyReplacements,
          policyClarifications,
          feedItems,
          savedQuestions,
          agentMessages,
          askConversations,
          registryBriefs,
          consentReceipts,
          processingPreferences,
          sourceFiles,
        });
        const archive = createNuraExportArchive(data, sourceFiles);
        const fileName = `nura-record-export-${new Date().toISOString().slice(0, 10)}-${Date.now()}.zip`;
        if (Platform.OS === 'web') {
          if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') throw new Error('This browser cannot create a local export file.');
          const archiveBuffer = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
          const url = URL.createObjectURL(new Blob([archiveBuffer], { type: 'application/zip' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          const file = new File(Paths.cache, fileName);
          file.create();
          try {
            file.write(archive);
            if (!await Sharing.isAvailableAsync()) throw new Error('The device share sheet is unavailable.');
            await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: 'Export your Nura data' });
          } finally {
            if (file.exists) file.delete();
          }
        }
        const unavailableCount = Array.isArray(data.sourceFilesUnavailable) ? data.sourceFilesUnavailable.length : 0;
        setNotice(unavailableCount
          ? `Your Nura data export is ready. ${unavailableCount} original file${unavailableCount === 1 ? ' is' : 's are'} listed as unavailable inside the export. Keep this file somewhere private.`
          : 'Your Nura data export is ready with the available original files. Keep this file somewhere private.');
      } else if (confirmAction === 'processor') {
        const removed = await clearLocalDemoProcessingData();
        setNotice(`Cleared ${removed.sources} saved file detail${removed.sources === 1 ? '' : 's'}, ${removed.claims} suggested detail${removed.claims === 1 ? '' : 's'}, ${removed.assertions} approved profile entr${removed.assertions === 1 ? 'y' : 'ies'} and ${removed.deletionReceipts} removal retry marker${removed.deletionReceipts === 1 ? '' : 's'} from Nura’s preview service.`);
      } else if (confirmAction === 'sample') {
        resetDemo();
        setNotice('Starter examples have been restored in this browser.');
      } else {
        const result = await clearAllLocalData();
        if (result.fileCleanupFailed) {
          setNotice('Your profile and records were cleared, but Nura couldn’t remove every saved file. Try again to finish clearing your files.');
        } else {
          setNotice('Your profile, records, conversations and saved file copies have been cleared from this device.');
        }
      }
      setConfirmAction(null);
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : confirmAction === 'export' ? 'Nura could not create the export. Try again.' : 'Nura could not complete this deletion. Try again.');
      return;
    } finally { setBusy(false); }

    if (clearingDevice) {
      try {
        await signOut();
        router.replace('/sign-in');
      } catch {
        setNotice('Your profile data was cleared. Nura could not end this preview session; use Sign out before sharing the device.');
      }
    }
  }

  const confirmTitle = confirmAction === 'export' ? 'Create a copy of your Nura data?' : confirmAction === 'processor' ? 'Clear document review data?' : confirmAction === 'sample' ? 'Restore the starter examples?' : 'Clear Nura data from this device?';
  return <View style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Profile</Text></Pressable>
      <Label>YOUR INFORMATION</Label>
      <Text style={styles.title}>Data & privacy</Text>
      <Text style={styles.intro}>See what Nura holds, where it lives, and what happens when you ask it to do something.</Text>

      <View style={styles.storageCard}>
        <View style={styles.storageHead}><View style={styles.storageMark}><Text style={styles.storageMarkText}>i</Text></View><Text style={styles.storageTitle}>{Platform.OS === 'web' ? 'Preview data stays in this browser' : 'Stored on this device'}</Text></View>
        <Text style={styles.storageCopy}>{Platform.OS === 'web' ? 'Profile details and original files stay in this browser. A file is sent to Nura’s AI service only after you approve it for reading. This preview does not sync to an online Nura account.' : 'Your profile and health records are stored on this device. Original file copies stay inside Nura. This preview does not sync to an online account.'}</Text>
        {Platform.OS === 'web' && <Pressable accessibilityRole="button" disabled={!ready || busy} onPress={() => { setConfirmError(''); setConfirmAction('sample'); }} style={({ pressed }) => [styles.resetSampleButton, (!ready || busy) && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.resetSampleTitle}>Restore starter examples</Text>
          <Text style={styles.resetSampleCopy}>Replace the preview data and selected files in this browser with the original examples.</Text>
        </Pressable>}
      </View>

      <View style={styles.storageMap} accessibilityLabel="Where each copy of your information lives">
        <Label>WHERE EACH COPY LIVES</Label>
        <Text style={styles.storageMapIntro}>These controls apply to the copies Nura can reach in this preview.</Text>
        {storageLocations.map((location, index) => <View key={location.id} style={[styles.storageMapRow, index === storageLocations.length - 1 && styles.storageMapRowLast]}>
          <View style={styles.storageMapHeading}><Text style={styles.storageMapTitle}>{location.title}</Text><Text style={styles.storageMapStatus}>{location.status}</Text></View>
          <Text style={styles.storageMapDetail}>{location.detail}</Text>
          <Text style={styles.storageMapControl}>{location.control}</Text>
        </View>)}
      </View>

      <View style={styles.sectionHead}><View><Label>DATA INVENTORY</Label><Text style={styles.sectionTitle}>What Nura has right now</Text></View><Text style={styles.total}>{rows.reduce((sum, row) => sum + row.count, 0)}</Text></View>
      {factRemovalNotice || sourceRemovalNotice ? <View accessibilityLiveRegion="polite" style={styles.notice}><Text style={styles.noticeText}>{sourceRemovalNotice || factRemovalNotice}</Text></View> : null}
      <View style={styles.inventory}>{rows.map((row) => <View key={row.id} style={styles.rowWrap}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === row.id }} onPress={() => toggleRow(row.id)} style={({ pressed }) => [styles.inventoryRow, pressed && styles.pressed]}>
          <View style={styles.rowCopy}><Text style={styles.rowTitle}>{row.title}</Text><Text style={styles.rowSummary}>{row.summary}</Text></View>
          <Text style={styles.rowCount}>{String(row.count).padStart(2, '0')}</Text><Text style={styles.rowChevron}>{expanded === row.id ? '−' : '+'}</Text>
        </Pressable>
        {expanded === row.id && <View style={styles.rowDetails}>{row.details}</View>}
      </View>)}</View>

      <View style={styles.sectionHead}><View><Label>HOW IT IS USED</Label><Text style={styles.sectionTitle}>Before Nura uses your context</Text></View></View>
      <Surface style={styles.explainer}>
        <Text style={styles.explainerTitle}>Ask Nura and health searches</Text>
        <Text style={styles.explainerBody}>Choose which services can be used at all. Each Ask question, public search or file review still asks for its own approval before anything is sent.</Text>
        <Text style={styles.explainerFoot}>These choices and their change history are saved by the local preview service. This preview does not sync to an online account.</Text>
      </Surface>

      <View style={styles.sectionHead}><View><Label>YOUR PROCESSING CHOICES</Label><Text style={styles.sectionTitle}>You can turn either off</Text></View></View>
      <View style={styles.preferencesCard}>
        {privacyPreferencesLoading ? <View style={styles.preferenceLoading}><ActivityIndicator color={colors.aqua} /><Text style={styles.preferenceDescription}>Loading your choices…</Text></View> : privacyPreferences ? <>
          <Pressable accessibilityRole="switch" accessibilityLabel="AI answers and assisted file reading" accessibilityState={{ checked: privacyPreferences.settings.aiProcessing, disabled: privacyPreferencesBusy }} disabled={privacyPreferencesBusy} onPress={() => changeProcessingPreference('aiProcessing', !privacyPreferences.settings.aiProcessing)} style={({ pressed }) => [styles.preferenceRow, pressed && styles.pressed, privacyPreferencesBusy && styles.disabled]}>
            <View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>AI answers and file reading</Text><Text style={styles.preferenceDescription}>Allow Ask Nura and assisted document review after you approve each run.</Text></View>
            <View style={[styles.switchTrack, privacyPreferences.settings.aiProcessing && styles.switchTrackOn]}><View style={[styles.switchThumb, privacyPreferences.settings.aiProcessing && styles.switchThumbOn]} /></View>
          </Pressable>
          <View style={styles.preferenceDivider} />
          <Pressable accessibilityRole="switch" accessibilityLabel="Public health searches" accessibilityState={{ checked: privacyPreferences.settings.publicHealthSearch, disabled: privacyPreferencesBusy || !privacyPreferences.settings.aiProcessing }} disabled={privacyPreferencesBusy || !privacyPreferences.settings.aiProcessing} onPress={() => changeProcessingPreference('publicHealthSearch', !privacyPreferences.settings.publicHealthSearch)} style={({ pressed }) => [styles.preferenceRow, pressed && styles.pressed, (privacyPreferencesBusy || !privacyPreferences.settings.aiProcessing) && styles.disabled]}>
            <View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Public health searches</Text><Text style={styles.preferenceDescription}>{privacyPreferences.settings.aiProcessing ? 'Allow Nura to search trusted public sources after you approve each search.' : 'Turn AI answers back on before enabling public searches.'}</Text></View>
            <View style={[styles.switchTrack, privacyPreferences.settings.publicHealthSearch && styles.switchTrackOn]}><View style={[styles.switchThumb, privacyPreferences.settings.publicHealthSearch && styles.switchThumbOn]} /></View>
          </Pressable>
          <Text style={styles.preferenceMeta}>{privacyPreferences.settings.updatedAt ? `Last changed ${new Date(privacyPreferences.settings.updatedAt).toLocaleString()}` : 'No changes yet · per-run approval is still required'}</Text>
        </> : <Text style={styles.preferenceDescription}>Your choices could not be loaded. Try again before using Ask, searches or file review.</Text>}
        {privacyPreferencesError ? <Text accessibilityLiveRegion="assertive" style={styles.preferenceError}>{privacyPreferencesError}</Text> : null}
        {!privacyPreferencesLoading && !privacyPreferences && <Pressable accessibilityRole="button" onPress={() => { setPrivacyPreferencesError(''); void getPrivacyConsentState().then(setPrivacyPreferences).catch((error) => setPrivacyPreferencesError(error instanceof Error ? error.message : 'Nura could not load your processing choices.')).finally(() => setPrivacyPreferencesLoading(false)); setPrivacyPreferencesLoading(true); }} style={styles.preferenceRetry}><Text style={styles.preferenceRetryText}>Try again</Text></Pressable>}
      </View>

      <View style={styles.sectionHead}><View><Label>YOUR COPY</Label><Text style={styles.sectionTitle}>Take your records with you</Text></View></View>
      <View style={styles.exportCard}>
        <Text style={styles.exportCopy}>Create a local ZIP with your profile and source-linked records, plus original files that are still saved on this device. The export lists any originals it cannot include.</Text>
        <Text style={styles.scopeNote}>Data that may be retained by external services and cloud accounts are not included.</Text>
        {notice ? <View accessibilityLiveRegion="polite" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
        {storageError ? <Text style={styles.warning}>{storageError}</Text> : null}
        <Pressable accessibilityRole="button" disabled={!ready || busy} onPress={() => { setConfirmError(''); setConfirmAction('export'); }} style={({ pressed }) => [styles.exportButton, (!ready || busy) && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.exportButtonTitle}>{Platform.OS === 'web' ? 'Download my Nura data' : 'Export my Nura data'}</Text>
          <Text style={styles.exportButtonArrow}>↗</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHead}><View><Label>YOUR CONTROL</Label><Text style={styles.sectionTitle}>Clear stored information</Text></View></View>
      <Pressable accessibilityRole="button" disabled={!ready || busy} onPress={() => { setConfirmError(''); setConfirmAction('device'); }} style={({ pressed }) => [styles.deleteButton, (!ready || busy) && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.deleteTitle}>{Platform.OS === 'web' ? 'Clear Nura data in this browser' : 'Clear Nura data on this device'}</Text>
        <Text style={styles.deleteSub}>Profile · records · conversations · saved file copies</Text>
      </Pressable>
      <Text style={styles.scopeNote}>Files you saved or shared outside Nura may need to be removed separately.</Text>

      <View style={styles.processorCard}>
        <Label>DOCUMENT REVIEW DATA</Label>
        <Text style={styles.processorCopy}>Nura keeps document details, suggestions and your review decisions so you can return to them. This review history is stored separately from your profile. After a source is removed, the local preview service keeps only its opaque IDs so a device cleanup can be retried; it does not keep the report text, values or file in that retry marker.</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setConfirmError(''); setConfirmAction('processor'); }} style={({ pressed }) => [styles.processorButton, busy && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.processorButtonText}>Clear document review data</Text>
        </Pressable>
        <Text style={styles.scopeNote}>This also removes saved source details, review decisions and local removal retry markers. It can’t remove information the AI service may retain.</Text>
      </View>
      <Text style={styles.footer}>Remove one saved source to permanently clear its Nura-stored file copy, extracted details, review data and source-linked saved answers. Removing one health detail keeps its original source. Copies already sent to an external AI service, family profiles and cloud accounts cannot be deleted from this local preview.</Text>
    </ScrollView>

    <Modal transparent visible={sourceToRemove !== null} animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => { if (!sourceRemovalBusy) setSourceToRemove(null); }}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}>
        <Label>PERMANENTLY REMOVE SOURCE</Label>
        <Text style={styles.modalTitle}>Remove “{sourceToRemove?.title ?? 'this source'}” and its saved details?</Text>
        <Text style={styles.modalCopy}>Nura will remove this report or note, its saved file copy, extracted claims, approved details, source-linked summaries and local review history from this app and the local preview service. Other saved sources will stay. The local preview service keeps only opaque source and record IDs as a retry marker until document review data is cleared. This cannot remove information already retained by an external AI service.</Text>
        {sourceRemovalError ? <Text accessibilityLiveRegion="assertive" style={styles.warning}>{sourceRemovalError}</Text> : null}
        <View style={styles.modalActions}>
          <Pressable accessibilityRole="button" disabled={sourceRemovalBusy} onPress={() => setSourceToRemove(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Keep source</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={sourceRemovalBusy} onPress={() => void confirmRemoveSource()} style={[styles.confirmButton, sourceRemovalBusy && styles.disabled]}>{sourceRemovalBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>Remove source</Text>}</Pressable>
        </View>
      </View></View>
    </Modal>

    <Modal transparent visible={factToRemoveId !== null} animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => { if (!factRemovalBusy) setFactToRemoveId(null); }}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}>
        <Label>REMOVE SAVED DETAIL</Label>
        <Text style={styles.modalTitle}>{pendingLocalRetraction?.factId === factToRemoveId ? 'Finish removing this detail on this device?' : `Remove “${facts.find((fact) => fact.id === factToRemoveId)?.label ?? 'this detail'}” from your active profile?`}</Text>
        <Text style={styles.modalCopy}>{pendingLocalRetraction?.factId === factToRemoveId ? 'The source review is already marked as removed. Sync the saved profile copy now so future answers stop using it.' : 'This removes the detail from your active profile and future Ask Nura context. The original file, source and review history stay available. It cannot remove information already sent to an AI service.'}</Text>
        {factRemovalError ? <Text accessibilityLiveRegion="assertive" style={styles.warning}>{factRemovalError}</Text> : null}
        <View style={styles.modalActions}>
          <Pressable accessibilityRole="button" disabled={factRemovalBusy} onPress={() => setFactToRemoveId(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Keep detail</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={factRemovalBusy} onPress={() => void confirmRemoveFact()} style={[styles.confirmButton, factRemovalBusy && styles.disabled]}>{factRemovalBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>{pendingLocalRetraction?.factId === factToRemoveId ? 'Sync removal' : 'Remove detail'}</Text>}</Pressable>
        </View>
      </View></View>
    </Modal>
    <Modal transparent visible={confirmAction !== null} animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => { if (!busy) setConfirmAction(null); }}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}>
        <Label>{confirmAction === 'export' ? 'DATA EXPORT' : confirmAction === 'sample' ? 'CONFIRM RESET' : 'CONFIRM DELETION'}</Label>
        <Text style={styles.modalTitle}>{confirmTitle}</Text>
        <Text style={styles.modalCopy}>{confirmAction === 'export' ? 'The ZIP contains your saved profile, health areas and details, source names and metadata, written notes, treatment and visit history, record links, policy notes, saved reading, Ask history, saved questions, consent receipts and local processing choices. Original files still saved on this device are included; unavailable originals are listed in the manifest. Unreviewed extraction workspace, external-provider data and cloud accounts are not included. Anyone with the exported file can read it.' : confirmAction === 'processor' ? 'This removes saved document details, suggested information, your review decisions and activity from Nura’s preview service. It doesn’t remove information the AI service may retain.' : confirmAction === 'sample' ? 'This replaces profile details, selected areas, health records, reading and selected files in this browser with the starter examples. Separately stored document-review data has its own control below.' : 'This removes profile details, selected areas, health records, treatment and visit details, links, saved questions, Ask history and file copies saved by Nura on this device, then signs out of this preview.'}</Text>
        {confirmError ? <Text accessibilityLiveRegion="assertive" style={styles.warning}>{confirmError}</Text> : null}
        <View style={styles.modalActions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirmAction(null)} style={styles.cancelButton}><Text style={styles.cancelText}>{confirmAction === 'export' ? 'Cancel' : 'Keep my data'}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void confirmClear()} style={[styles.confirmButton, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>{confirmAction === 'export' ? 'Create export' : confirmAction === 'sample' ? 'Restore examples' : 'Delete this data'}</Text>}</Pressable>
        </View>
      </View></View>
    </Modal>
    <Modal transparent visible={enablePurpose !== null} animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => { if (!privacyPreferencesBusy) setEnablePurpose(null); }}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}>
        <Label>CONFIRM PROCESSING CHOICE</Label>
        <Text style={styles.modalTitle}>{enablePurpose === 'publicHealthSearch' ? 'Turn on public health searches?' : 'Turn on AI answers and file reading?'}</Text>
        <Text style={styles.modalCopy}>{enablePurpose === 'publicHealthSearch' ? 'Nura may search trusted public health sources when you ask. The search still needs your separate approval each time.' : 'Nura may prepare answers and read files you select. Your question, chosen health context or selected file is sent only after you approve that run.'} This choice applies to the local preview profile and can be turned off at any time.</Text>
        {privacyPreferencesError ? <Text accessibilityLiveRegion="assertive" style={styles.warning}>{privacyPreferencesError}</Text> : null}
        <View style={styles.modalActions}>
          <Pressable accessibilityRole="button" disabled={privacyPreferencesBusy} onPress={() => setEnablePurpose(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Keep off</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={privacyPreferencesBusy} onPress={confirmEnableProcessing} style={[styles.confirmButton, privacyPreferencesBusy && styles.disabled]}>{privacyPreferencesBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>Turn on</Text>}</Pressable>
        </View>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, content: { padding: 20, paddingTop: 24, paddingBottom: 36, width: '100%', maxWidth: 560, alignSelf: 'center' },
  back: { minHeight: 42, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 16, marginBottom: 18 }, backText: { color: colors.aqua, fontSize: 14, fontWeight: '600' },
  title: { color: colors.text, fontSize: 34, lineHeight: 40, fontWeight: '300', letterSpacing: -1, marginTop: 7 }, intro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 20 },
  storageCard: { backgroundColor: 'rgba(169,212,227,.12)', borderColor: 'rgba(169,212,227,.30)', borderWidth: 1, borderRadius: radius.md, padding: 15, marginBottom: 14 }, storageHead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, storageMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(169,212,227,.18)', alignItems: 'center', justifyContent: 'center' }, storageMarkText: { color: colors.aqua, fontSize: 13, fontWeight: '700' }, storageTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, storageCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9 }, resetSampleButton: { minHeight: 54, justifyContent: 'center', padding: 11, marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, resetSampleTitle: { color: colors.text, fontSize: 12, fontWeight: '700' }, resetSampleCopy: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  storageMap: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 3, marginBottom: 25 }, storageMapIntro: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 7, marginBottom: 3 }, storageMapRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border }, storageMapRowLast: { borderBottomWidth: 0 }, storageMapHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 5 }, storageMapTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700', flexShrink: 1 }, storageMapStatus: { color: colors.aqua, fontSize: 10, lineHeight: 15, fontWeight: '700' }, storageMapDetail: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, storageMapControl: { color: colors.quiet, fontSize: 10, lineHeight: 14, marginTop: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 11, marginTop: 2 }, sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '400', marginTop: 5 }, total: { color: colors.aqua, fontSize: 21, fontWeight: '600' },
  inventory: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', marginBottom: 25 }, rowWrap: { borderBottomWidth: 1, borderBottomColor: colors.border }, inventoryRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 }, rowCopy: { flex: 1 }, rowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' }, rowSummary: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 3 }, rowCount: { minWidth: 26, color: colors.aqua, fontSize: 14, fontWeight: '700', textAlign: 'right' }, rowChevron: { color: colors.violet, fontSize: 19, width: 18, textAlign: 'right' }, rowDetails: { paddingHorizontal: 15, paddingTop: 1, paddingBottom: 14, backgroundColor: 'rgba(255,246,236,.06)' }, factRecordRow: { paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,226,205,.16)' }, sourceRecordRow: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,226,205,.16)' }, removeFactAction: { minHeight: 38, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 11, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(169,212,227,.34)', marginTop: 3 }, removeFactActionText: { color: colors.aqua, fontSize: 11, fontWeight: '700' }, removeSourceAction: { minHeight: 38, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 11, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,188,174,.42)', marginTop: 3, backgroundColor: 'rgba(139,73,62,.14)' }, removeSourceActionText: { color: '#FFD2C4', fontSize: 11, fontWeight: '700' }, recordLine: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,226,205,.16)' }, recordTitle: { color: colors.text, fontSize: 12, fontWeight: '600' }, recordValue: { color: colors.text, fontSize: 12, lineHeight: 17, marginTop: 3 }, recordSource: { color: colors.quiet, fontSize: 10, lineHeight: 14, marginTop: 3 }, empty: { color: colors.quiet, fontSize: 12, lineHeight: 17, paddingVertical: 7 }, pressed: { opacity: 0.78 },
  explainer: { padding: 15, marginBottom: 26 }, explainerTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, explainerBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }, explainerFoot: { color: colors.warning, fontSize: 11, lineHeight: 16, marginTop: 9 },
  preferencesCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, marginBottom: 24 }, preferenceRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }, preferenceCopy: { flex: 1 }, preferenceTitle: { color: colors.text, fontSize: 13, fontWeight: '700' }, preferenceDescription: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, preferenceDivider: { height: 1, backgroundColor: colors.border }, preferenceLoading: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10 }, switchTrack: { width: 46, height: 27, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceStrong, justifyContent: 'center', paddingHorizontal: 3 }, switchTrackOn: { backgroundColor: colors.aqua, borderColor: colors.aqua }, switchThumb: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#FFFFFF' }, switchThumbOn: { alignSelf: 'flex-end' }, preferenceMeta: { color: colors.quiet, fontSize: 10, lineHeight: 14, paddingBottom: 11 }, preferenceError: { color: '#FFD2C4', backgroundColor: 'rgba(180,90,78,.20)', borderRadius: 10, padding: 10, fontSize: 11, lineHeight: 15, marginBottom: 10 }, preferenceRetry: { paddingVertical: 10, alignSelf: 'flex-start' }, preferenceRetryText: { color: colors.aqua, fontSize: 12, fontWeight: '700' },
  exportCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 15, marginBottom: 24 }, exportCopy: { color: colors.muted, fontSize: 12, lineHeight: 18 }, exportButton: { minHeight: 48, borderRadius: radius.pill, backgroundColor: '#98563F', marginTop: 13, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, exportButtonTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' }, exportButtonArrow: { color: colors.aqua, fontSize: 18, fontWeight: '700' },
  deleteButton: { backgroundColor: 'rgba(139,73,62,.18)', borderColor: '#E8C9C1', borderWidth: 1, borderRadius: radius.md, padding: 15 }, deleteTitle: { color: '#FFD2C4', fontSize: 14, fontWeight: '700' }, deleteSub: { color: colors.muted, fontSize: 11, marginTop: 5 }, scopeNote: { color: colors.quiet, fontSize: 10, lineHeight: 15, marginTop: 8 }, warning: { color: '#FFD2C4', backgroundColor: 'rgba(180,90,78,.20)', borderRadius: 12, padding: 11, fontSize: 12, lineHeight: 17, marginBottom: 11 }, notice: { borderRadius: 12, backgroundColor: colors.mint, borderWidth: 1, borderColor: 'rgba(159,216,199,.38)', padding: 12, marginBottom: 12 }, noticeText: { color: '#C9EBDD', fontSize: 12, lineHeight: 17 }, disabled: { opacity: 0.55 },
  processorCard: { backgroundColor: colors.surfaceStrong, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 15, marginTop: 20 }, processorCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9 }, processorButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: '#98563F', borderRadius: radius.pill, marginTop: 13, paddingHorizontal: 12 }, processorButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' }, footer: { color: colors.quiet, fontSize: 10, lineHeight: 15, marginTop: 24 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(18,12,10,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20 }, modalCard: { width: '100%', maxWidth: 390, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20 }, modalTitle: { color: colors.text, fontSize: 21, lineHeight: 27, fontWeight: '500', marginTop: 9 }, modalCopy: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 9 }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 18 }, cancelButton: { minHeight: 44, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: colors.text, fontSize: 12, fontWeight: '600' }, confirmButton: { minWidth: 125, minHeight: 44, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: '#A74742', alignItems: 'center', justifyContent: 'center' }, confirmText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
