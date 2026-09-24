import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Label, Surface } from '../src/components/Surface';
import { clearLocalDemoProcessingData } from '../src/services/agentClient';
import { useNura } from '../src/state/NuraContext';
import { colors, radius } from '../src/theme';

type InventoryRow = { id: string; title: string; count: number; summary: string; details: React.ReactNode };
type ConfirmAction = 'device' | 'processor' | null;

function RecordLine({ title, value, source }: { title: string; value?: string; source?: string }) {
  return <View style={styles.recordLine}><Text style={styles.recordTitle}>{title}</Text>{value ? <Text style={styles.recordValue}>{value}</Text> : null}{source ? <Text style={styles.recordSource}>{source}</Text> : null}</View>;
}

export default function Privacy() {
  const { ready, storageError, name, birthday, country, email, phone, topics, facts, assets, treatments, visits, links, feedItems, savedQuestions, agentMessages, registryBriefs, clearAllLocalData } = useNura();
  const [expanded, setExpanded] = useState<string | null>('profile');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [confirmError, setConfirmError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  const personalDetails = [
    ['Name', name], ['Birthday', birthday], ['Country', country], ['Email', email], ['Phone', phone],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  const rows = useMemo<InventoryRow[]>(() => [
    {
      id: 'profile', title: 'Profile details', count: personalDetails.length,
      summary: 'Details you entered yourself.',
      details: personalDetails.length ? personalDetails.map(([label, value]) => <RecordLine key={label} title={label} value={value} source="Entered by you · saved in the Nura profile" />) : <Text style={styles.empty}>No profile details saved.</Text>,
    },
    {
      id: 'topics', title: 'Health areas', count: topics.length,
      summary: 'Topics you chose to explore; these are not diagnoses.',
      details: topics.length ? topics.map((topic) => <RecordLine key={topic.id} title={topic.label} source="Selected by you" />) : <Text style={styles.empty}>No health areas selected.</Text>,
    },
    {
      id: 'facts', title: 'Health details', count: facts.length,
      summary: 'Saved facts with their source and review status.',
      details: facts.length ? facts.map((fact) => <RecordLine key={fact.id} title={fact.label} value={fact.value} source={`${fact.source} · ${fact.date} · ${fact.status}`} />) : <Text style={styles.empty}>No health details saved.</Text>,
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
      id: 'questions', title: 'Ask history and saved questions', count: agentMessages.length + savedQuestions.length,
      summary: 'Conversation messages and questions saved on this device or in this tab.',
      details: <>{savedQuestions.map((question, index) => <RecordLine key={`question-${index}`} title="Saved question" value={question} source="Saved by you" />)}{agentMessages.map((message) => <RecordLine key={message.id} title={message.role === 'user' ? 'You asked' : 'Nura answered'} value={message.text} source={`${new Date(message.createdAt).toLocaleString()} · ${message.citations.length} cited sources`} />)}{!savedQuestions.length && !agentMessages.length ? <Text style={styles.empty}>No conversation history saved.</Text> : null}</>,
    },
  ], [personalDetails, topics, facts, assets, treatments, visits, links, feedItems, agentMessages, registryBriefs, savedQuestions]);

  function toggleRow(id: string) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => current === id ? null : id);
  }

  async function confirmClear() {
    if (!confirmAction) return;
    setBusy(true); setConfirmError(''); setNotice('');
    try {
      if (confirmAction === 'processor') {
        const removed = await clearLocalDemoProcessingData();
        setNotice(`Cleared ${removed.sources} saved file detail${removed.sources === 1 ? '' : 's'}, ${removed.claims} suggested detail${removed.claims === 1 ? '' : 's'} and ${removed.assertions} approved profile entr${removed.assertions === 1 ? 'y' : 'ies'} from Nura’s preview service.`);
      } else {
        const result = await clearAllLocalData();
        setNotice(result.fileCleanupFailed ? 'Your profile and records were cleared, but Nura couldn’t remove every saved file. Try again to finish clearing your files.' : 'Your profile, records, conversations and saved file copies have been cleared from this device.');
      }
      setConfirmAction(null);
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : 'Nura could not complete this deletion. Try again.');
    } finally { setBusy(false); }
  }

  const confirmTitle = confirmAction === 'processor' ? 'Clear document review data?' : 'Clear Nura data from this device?';
  return <View style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Profile</Text></Pressable>
      <Label>YOUR INFORMATION</Label>
      <Text style={styles.title}>Data & privacy</Text>
      <Text style={styles.intro}>See what Nura holds, where it lives, and what happens when you ask it to do something.</Text>

      <View style={styles.storageCard}>
        <View style={styles.storageHead}><View style={styles.storageMark}><Text style={styles.storageMarkText}>i</Text></View><Text style={styles.storageTitle}>{Platform.OS === 'web' ? 'Preview mode · fictional sample data' : 'Stored on this device'}</Text></View>
        <Text style={styles.storageCopy}>{Platform.OS === 'web' ? 'This preview uses fictional sample records. Changes and files you add stay in this browser, even after refresh, until you clear Nura data. This is not a personal Nura account. Please use fictional details and documents only.' : 'Your profile and health records are stored on this device. Original file copies stay inside Nura. This preview does not sync to an online account.'}</Text>
      </View>

      <View style={styles.sectionHead}><View><Label>DATA INVENTORY</Label><Text style={styles.sectionTitle}>What Nura has right now</Text></View><Text style={styles.total}>{rows.reduce((sum, row) => sum + row.count, 0)}</Text></View>
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
        <Text style={styles.explainerBody}>Before each answer, you choose which details Nura can use. When you continue, your question and selected details are sent to Nura’s AI service to prepare a response. Its privacy practices apply to each request.</Text>
        <Text style={styles.explainerFoot}>Your choice is made for each request. Online accounts and cloud sync aren’t available in this preview.</Text>
      </Surface>

      <View style={styles.sectionHead}><View><Label>YOUR CONTROL</Label><Text style={styles.sectionTitle}>Clear stored information</Text></View></View>
      {storageError ? <Text style={styles.warning}>{storageError}</Text> : null}
      {notice ? <View accessibilityLiveRegion="polite" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
      <Pressable accessibilityRole="button" disabled={!ready || busy} onPress={() => { setConfirmError(''); setConfirmAction('device'); }} style={({ pressed }) => [styles.deleteButton, (!ready || busy) && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.deleteTitle}>{Platform.OS === 'web' ? 'Clear Nura data in this browser' : 'Clear Nura data on this device'}</Text>
        <Text style={styles.deleteSub}>Profile · records · conversations · saved file copies</Text>
      </Pressable>
      <Text style={styles.scopeNote}>Files you saved or shared outside Nura may need to be removed separately.</Text>

      <View style={styles.processorCard}>
        <Label>DOCUMENT REVIEW DATA</Label>
        <Text style={styles.processorCopy}>Nura keeps document details, suggestions and your review decisions so you can return to them. This review history is stored separately from your profile.</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setConfirmError(''); setConfirmAction('processor'); }} style={({ pressed }) => [styles.processorButton, busy && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.processorButtonText}>Clear document review data</Text>
        </Pressable>
        <Text style={styles.scopeNote}>This also removes saved source details and review decisions. It can’t remove information the AI service may retain.</Text>
      </View>
      <Text style={styles.footer}>Family sharing, online accounts, consent history and account deletion aren’t available in this preview.</Text>
    </ScrollView>

    <Modal transparent visible={confirmAction !== null} animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => { if (!busy) setConfirmAction(null); }}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}>
        <Label>CONFIRM DELETION</Label>
        <Text style={styles.modalTitle}>{confirmTitle}</Text>
        <Text style={styles.modalCopy}>{confirmAction === 'processor' ? 'This removes saved document details, suggested information, your review decisions and activity from Nura’s preview service. It doesn’t remove information the AI service may retain.' : 'This removes profile details, selected areas, health records, treatment and visit details, links, saved questions, Ask history and file copies saved by Nura on this device.'}</Text>
        {confirmError ? <Text accessibilityLiveRegion="assertive" style={styles.warning}>{confirmError}</Text> : null}
        <View style={styles.modalActions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirmAction(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Keep my data</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void confirmClear()} style={[styles.confirmButton, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>Delete this data</Text>}</Pressable>
        </View>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, content: { padding: 20, paddingTop: 24, paddingBottom: 36, width: '100%', maxWidth: 560, alignSelf: 'center' },
  back: { minHeight: 42, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 16, marginBottom: 18 }, backText: { color: colors.aqua, fontSize: 14, fontWeight: '600' },
  title: { color: colors.text, fontSize: 34, lineHeight: 40, fontWeight: '300', letterSpacing: -1, marginTop: 7 }, intro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 20 },
  storageCard: { backgroundColor: '#EFF5FF', borderColor: '#D7E6FB', borderWidth: 1, borderRadius: radius.md, padding: 15, marginBottom: 26 }, storageHead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, storageMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#D9E9FF', alignItems: 'center', justifyContent: 'center' }, storageMarkText: { color: colors.aqua, fontSize: 13, fontWeight: '700' }, storageTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, storageCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 11, marginTop: 2 }, sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '400', marginTop: 5 }, total: { color: colors.aqua, fontSize: 21, fontWeight: '600' },
  inventory: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', marginBottom: 25 }, rowWrap: { borderBottomWidth: 1, borderBottomColor: colors.border }, inventoryRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 }, rowCopy: { flex: 1 }, rowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' }, rowSummary: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 3 }, rowCount: { minWidth: 26, color: colors.aqua, fontSize: 14, fontWeight: '700', textAlign: 'right' }, rowChevron: { color: colors.violet, fontSize: 19, width: 18, textAlign: 'right' }, rowDetails: { paddingHorizontal: 15, paddingTop: 1, paddingBottom: 14, backgroundColor: '#FBFAFC' }, recordLine: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#EEEAF2' }, recordTitle: { color: colors.text, fontSize: 12, fontWeight: '600' }, recordValue: { color: colors.text, fontSize: 12, lineHeight: 17, marginTop: 3 }, recordSource: { color: colors.quiet, fontSize: 10, lineHeight: 14, marginTop: 3 }, empty: { color: colors.quiet, fontSize: 12, lineHeight: 17, paddingVertical: 7 }, pressed: { opacity: 0.78 },
  explainer: { padding: 15, marginBottom: 26 }, explainerTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, explainerBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }, explainerFoot: { color: colors.warning, fontSize: 11, lineHeight: 16, marginTop: 9 },
  deleteButton: { backgroundColor: '#FFF9F7', borderColor: '#E8C9C1', borderWidth: 1, borderRadius: radius.md, padding: 15 }, deleteTitle: { color: '#8F3B37', fontSize: 14, fontWeight: '700' }, deleteSub: { color: colors.muted, fontSize: 11, marginTop: 5 }, scopeNote: { color: colors.quiet, fontSize: 10, lineHeight: 15, marginTop: 8 }, warning: { color: '#8F3B37', backgroundColor: '#FFF2EF', borderRadius: 12, padding: 11, fontSize: 12, lineHeight: 17, marginBottom: 11 }, notice: { borderRadius: 12, backgroundColor: colors.mint, borderWidth: 1, borderColor: '#B9E0CC', padding: 12, marginBottom: 12 }, noticeText: { color: '#285B44', fontSize: 12, lineHeight: 17 }, disabled: { opacity: 0.55 },
  processorCard: { backgroundColor: colors.surfaceStrong, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 15, marginTop: 20 }, processorCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9 }, processorButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, borderRadius: radius.pill, marginTop: 13, paddingHorizontal: 12 }, processorButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' }, footer: { color: colors.quiet, fontSize: 10, lineHeight: 15, marginTop: 24 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(22,19,29,0.46)', alignItems: 'center', justifyContent: 'center', padding: 20 }, modalCard: { width: '100%', maxWidth: 390, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20 }, modalTitle: { color: colors.text, fontSize: 21, lineHeight: 27, fontWeight: '500', marginTop: 9 }, modalCopy: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 9 }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 18 }, cancelButton: { minHeight: 44, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: colors.text, fontSize: 12, fontWeight: '600' }, confirmButton: { minWidth: 125, minHeight: 44, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: '#A74742', alignItems: 'center', justifyContent: 'center' }, confirmText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
