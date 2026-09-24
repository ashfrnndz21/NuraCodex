import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useNura, type TreatmentRecord, type TreatmentStatus } from '../src/state/NuraContext';
import { motion } from '../src/theme';

const C = { bg: '#F7F6F8', white: '#FFFFFF', ink: '#282630', muted: '#706D78', faint: '#96929D', border: '#E4E1E8', blue: '#1767D8', bluePale: '#EAF1FD', amber: '#B97721', amberPale: '#FBF0DE', mint: '#DFF2EA', plum: '#483250' };
const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = (value: string) => {
  if (!value) return 'Date not provided';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
type Fields = Pick<TreatmentRecord, 'name' | 'dose' | 'schedule' | 'purpose' | 'prescriber' | 'careLocation' | 'pharmacy' | 'status' | 'startedOn' | 'endedOn' | 'source' | 'sourceId'>;
const emptyFields = (): Fields => ({ name: '', dose: '', schedule: '', purpose: '', prescriber: '', careLocation: '', pharmacy: '', status: 'current', startedOn: today(), source: 'Entered by you', sourceId: undefined });

export default function TreatmentRegistry() {
  const params = useLocalSearchParams<{ treatmentId?: string }>();
  const { ready, storageError, treatments, treatmentEvents, assets, addTreatment, updateTreatment, markTreatmentPast } = useNura();
  const [filter, setFilter] = useState<TreatmentStatus>('current');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>(emptyFields());
  const [formOpen, setFormOpen] = useState(false);
  const [confirmPast, setConfirmPast] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [filterTouched, setFilterTouched] = useState(false);
  const [expansionTouched, setExpansionTouched] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  const currentCount = treatments.filter((item) => item.status === 'current').length;
  const pastCount = treatments.filter((item) => item.status === 'past').length;
  const requestedTreatmentId = typeof params.treatmentId === 'string' ? params.treatmentId : null;
  const requestedTreatment = requestedTreatmentId ? treatments.find((item) => item.id === requestedTreatmentId) : undefined;
  const selectedFilter = !filterTouched && requestedTreatment ? requestedTreatment.status : filter;
  const visible = useMemo(() => treatments.filter((item) => item.status === selectedFilter || item.id === requestedTreatmentId).sort((a, b) => (b.startedOn || b.createdAt).localeCompare(a.startedOn || a.createdAt)), [selectedFilter, requestedTreatmentId, treatments]);

  function animate() { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); }
  function openNew() { setEditingId(null); setFields(emptyFields()); setFormOpen(true); }
  function openEdit(item: TreatmentRecord) {
    setEditingId(item.id);
    setFields({ name: item.name, dose: item.dose, schedule: item.schedule, purpose: item.purpose, prescriber: item.prescriber, careLocation: item.careLocation, pharmacy: item.pharmacy, status: item.status, startedOn: item.startedOn, endedOn: item.endedOn, source: item.source, sourceId: item.sourceId });
    setFormOpen(true);
  }
  function save() {
    const cleanName = fields.name.trim();
    if (!cleanName) return;
    if (editingId) updateTreatment(editingId, { ...fields, name: cleanName });
    else addTreatment({ ...fields, name: cleanName });
    animate(); setFormOpen(false); setEditingId(null);
  }
  function updateField<K extends keyof Fields>(key: K, value: Fields[K]) { setFields((current) => ({ ...current, [key]: value })); }
  function toggleCard(id: string) { animate(); setExpansionTouched(true); setExpandedId((current) => current === id ? null : id); }

  return <View style={s.page}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.back}><Text style={s.backGlyph}>‹</Text></Pressable>
        <View style={s.brandBlock}><Text style={s.brand}>nura</Text><Text style={s.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View>
        <View style={s.topIcon}><Text style={s.topIconGlyph}>✚</Text></View>
      </View>

      <Text style={s.eyebrow}>YOUR TREATMENT REGISTRY</Text>
      <Text style={s.title}>Medicines, kept in context.</Text>
      <Text style={s.subtitle}>A dated record of what you’ve entered, who prescribed it, and where each detail came from.</Text>

      <View style={s.summary}>
        <View style={s.summaryDot}><Text style={s.summaryGlyph}>✚</Text></View>
        <View style={s.summaryText}><Text style={s.summaryTitle}>{treatments.length ? `${treatments.length} treatment ${treatments.length === 1 ? 'record' : 'records'}` : 'Your treatment history'}</Text><Text style={s.summaryDetail}>{currentCount} current · {pastCount} past</Text></View>
        <Text style={s.summaryArrow}>↗</Text>
      </View>

      {storageError && <View style={s.storageNote}><Text style={s.storageNoteText}>Local storage needs attention. New treatment changes may not persist on this device.</Text></View>}
      <View style={s.sectionHead}><View><Text style={s.sectionEyebrow}>MEDICINE HISTORY</Text><Text style={s.sectionTitle}>Your record, over time.</Text></View><Text style={s.sectionCount}>{String(treatments.length).padStart(2, '0')} ITEMS</Text></View>
      <View style={s.segment}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedFilter === 'current' }} onPress={() => { animate(); setFilter('current'); setFilterTouched(true); setConfirmPast(null); }} style={[s.segmentButton, selectedFilter === 'current' && s.segmentActive]}><Text style={[s.segmentText, selectedFilter === 'current' && s.segmentTextActive]}>Current · {currentCount}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedFilter === 'past' }} onPress={() => { animate(); setFilter('past'); setFilterTouched(true); setConfirmPast(null); }} style={[s.segmentButton, selectedFilter === 'past' && s.segmentActive]}><Text style={[s.segmentText, selectedFilter === 'past' && s.segmentTextActive]}>Past · {pastCount}</Text></Pressable>
      </View>

      {!ready && <View style={s.empty}><Text style={s.emptyTitle}>Opening your saved treatment record…</Text></View>}
      {ready && visible.length === 0 && <View style={s.empty}>
        <View style={s.emptyNode}><Text style={s.emptyGlyph}>✚</Text></View>
        <Text style={s.emptyTitle}>{filter === 'current' ? 'No current treatments saved.' : 'No past treatments saved.'}</Text>
        <Text style={s.emptyBody}>{filter === 'current' ? 'Add the details you want to keep together. Nura will label them as your entry until you attach a source.' : 'When a treatment changes, mark its record as past. Its details and dated history stay here.'}</Text>
      </View>}

      {visible.map((item) => {
        const expanded = expandedId === item.id || expandedId === `history:${item.id}` || (!expansionTouched && requestedTreatmentId === item.id);
        const history = treatmentEvents.filter((event) => event.treatmentId === item.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        const sourceAsset = assets.find((asset) => asset.id === item.sourceId);
        return <View key={item.id} style={[s.recordCard, expanded && s.recordCardExpanded]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => toggleCard(item.id)} style={({ pressed }) => [s.recordHead, pressed && s.pressed]}>
            <View style={s.recordNode}><Text style={s.recordNodeGlyph}>✚</Text></View>
            <View style={s.recordMain}>
              <View style={s.recordMeta}><Text style={s.recordDate}>{dateLabel(item.startedOn || item.createdAt)}</Text><View style={[s.status, item.status === 'current' ? s.statusCurrent : s.statusPast]}><Text style={[s.statusText, item.status === 'current' ? s.statusCurrentText : s.statusPastText]}>{item.status === 'current' ? 'CURRENT' : 'PAST'}</Text></View></View>
              <Text style={s.recordName}>{item.name}</Text>
              <Text style={s.recordDose}>{[item.dose, item.schedule].filter(Boolean).join(' · ') || 'Dose and schedule not provided'}</Text>
              <Text style={s.recordPurpose} numberOfLines={expanded ? undefined : 2}>{item.purpose || 'Purpose not provided'}</Text>
            </View>
            <Text style={s.expandGlyph}>{expanded ? '−' : '+'}</Text>
          </Pressable>
          {expanded && <View style={s.expandedBody}>
            <View style={s.rule} />
            <View style={s.detailGrid}>
              <Detail label="PRESCRIBER" value={item.prescriber} />
              <Detail label="CLINIC / CARE TEAM" value={item.careLocation} />
              <Detail label="PHARMACY" value={item.pharmacy} />
              <Detail label="STARTED" value={dateLabel(item.startedOn)} />
              {item.endedOn ? <Detail label="MARKED PAST" value={dateLabel(item.endedOn)} /> : null}
            </View>
            <View style={s.sourceBox}><Text style={s.sourceEyebrow}>SOURCE OF THIS ENTRY</Text><Text style={s.sourceText}>{sourceAsset?.name ?? item.source}</Text><Text style={s.sourceNote}>{sourceAsset ? 'Attached source stays in your health records.' : 'Entered by you · not independently verified.'}</Text>{sourceAsset && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/review', params: { purpose: 'medical', assetId: sourceAsset.id, ...(sourceAsset.serverSourceId ? { sourceId: sourceAsset.serverSourceId } : {}) } })} style={s.openSource}><Text style={s.openSourceText}>OPEN SOURCE + REVIEW  ↗</Text></Pressable>}</View>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: expandedId === `history:${item.id}` }} onPress={() => toggleCard(`history:${item.id}`)} style={s.historyToggle}><Text style={s.historyToggleText}>{expandedId === `history:${item.id}` ? 'HIDE DATED CHANGES' : `VIEW DATED CHANGES · ${history.length}`}</Text><Text style={s.historyToggleArrow}>{expandedId === `history:${item.id}` ? '−' : '↓'}</Text></Pressable>
            {expandedId === `history:${item.id}` && <View style={s.historyList}>{history.map((event) => <View key={event.id} style={s.historyRow}><View style={s.historyDot} /><View style={s.historyCopy}><Text style={s.historyTitle}>{event.summary}</Text><Text style={s.historyDate}>{dateLabel(event.occurredAt)}</Text><Text style={s.historyVersion}>{event.snapshot.dose || 'Dose not provided'}{event.snapshot.schedule ? ` · ${event.snapshot.schedule}` : ''}{event.snapshot.status === 'past' ? ' · Past record' : ''}</Text></View></View>)}</View>}
            <View style={s.actions}>
              <Pressable accessibilityRole="button" onPress={() => openEdit(item)} style={s.secondaryAction}><Text style={s.secondaryActionText}>EDIT DETAILS</Text></Pressable>
            </View>
            {item.status === 'current' && <>
              {confirmPast === item.id ? <View style={s.confirmBox}><Text style={s.confirmTitle}>Mark this record as past?</Text><Text style={s.confirmBody}>This saves a dated status change. It does not advise you to stop or change a medicine.</Text><View style={s.confirmActions}><Pressable onPress={() => setConfirmPast(null)} style={s.confirmCancel}><Text style={s.confirmCancelText}>Keep current</Text></Pressable><Pressable onPress={() => { markTreatmentPast(item.id); setConfirmPast(null); setFilter('past'); setFilterTouched(true); }} style={s.confirmGo}><Text style={s.confirmGoText}>Mark as past</Text></Pressable></View></View> : <Pressable accessibilityRole="button" onPress={() => setConfirmPast(item.id)} style={s.markPast}><Text style={s.markPastText}>MARK THIS RECORD AS PAST</Text></Pressable>}
            </>}
          </View>}
        </View>;
      })}

      <Pressable accessibilityRole="button" onPress={openNew} style={({ pressed }) => [s.addCard, pressed && s.pressed]}><View style={s.addMark}><Text style={s.addGlyph}>＋</Text></View><View style={s.addCopy}><Text style={s.addTitle}>Add medicine or treatment</Text><Text style={s.addSub}>Dose, timing, care team and source</Text></View><Text style={s.addArrow}>↗</Text></Pressable>
      <View style={s.safety}><Text style={s.safetyMark}>i</Text><Text style={s.safetyText}>Nura keeps the details you enter. This registry records your history; it does not tell you to start, stop or change treatment.</Text></View>
    </ScrollView>

    <Modal visible={formOpen} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setFormOpen(false)}>
      <View style={s.modalShade}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalKeyboard}>
        <View style={s.modalCard}>
          <View style={s.modalHandle} />
          <View style={s.modalTop}><View><Text style={s.modalEyebrow}>{editingId ? 'UPDATE YOUR RECORD' : 'ADD TO YOUR RECORD'}</Text><Text style={s.modalTitle}>{editingId ? 'Edit treatment details.' : 'What are you taking?'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setFormOpen(false)} style={s.modalClose}><Text style={s.modalCloseText}>×</Text></Pressable></View>
          <Text style={s.modalBody}>Enter what you know. Leave any detail blank if you’re unsure; Nura will not fill it in.</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.formScroll}>
            <Field label="MEDICINE OR TREATMENT" value={fields.name} onChange={(value) => updateField('name', value)} placeholder="Name" required />
            <View style={s.formRow}><Field label="DOSE / STRENGTH" value={fields.dose} onChange={(value) => updateField('dose', value)} placeholder="As shown on your record" /><Field label="SCHEDULE" value={fields.schedule} onChange={(value) => updateField('schedule', value)} placeholder="How often?" /></View>
            <Field label="WHAT FOR? · YOUR WORDS" value={fields.purpose} onChange={(value) => updateField('purpose', value)} placeholder="Purpose or reason" />
            <Field label="PRESCRIBER" value={fields.prescriber} onChange={(value) => updateField('prescriber', value)} placeholder="Clinician or service" />
            <View style={s.formRow}><Field label="CLINIC / CARE TEAM" value={fields.careLocation} onChange={(value) => updateField('careLocation', value)} placeholder="Where?" /><Field label="PHARMACY" value={fields.pharmacy} onChange={(value) => updateField('pharmacy', value)} placeholder="Where filled?" /></View>
            <Field label="START DATE · OPTIONAL" value={fields.startedOn} onChange={(value) => updateField('startedOn', value)} placeholder="YYYY-MM-DD" />
            {editingId && <View style={s.formStatus}><Text style={s.fieldLabel}>RECORD STATUS</Text><View style={s.formStatusRow}>{(['current', 'past'] as const).map((status) => <Pressable key={status} accessibilityRole="button" accessibilityState={{ selected: fields.status === status }} onPress={() => { updateField('status', status); if (status === 'current') updateField('endedOn', undefined); else if (!fields.endedOn) updateField('endedOn', today()); }} style={[s.statusChoice, fields.status === status && s.statusChoiceActive]}><Text style={[s.statusChoiceText, fields.status === status && s.statusChoiceTextActive]}>{status === 'current' ? 'Current' : 'Past'}</Text></Pressable>)}</View></View>}
            <Text style={s.fieldLabel}>LINK AN EXISTING SOURCE · OPTIONAL</Text>
            {assets.length === 0 ? <Text style={s.noAssets}>No saved files yet. Add a prescription or record from the Home screen, then attach it here.</Text> : <View style={s.sourceChoices}>{assets.filter((asset) => asset.purpose !== 'insurance').slice(0, 6).map((asset) => { const selected = fields.sourceId === asset.id; return <Pressable key={asset.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { updateField('sourceId', selected ? undefined : asset.id); updateField('source', selected ? 'Entered by you' : asset.name); }} style={[s.sourceChoice, selected && s.sourceChoiceActive]}><Text style={[s.sourceChoiceText, selected && s.sourceChoiceTextActive]}>{selected ? '✓ ' : '▤ '}{asset.name}</Text></Pressable>; })}</View>}
            <Text style={s.formFootnote}>Saved as your entry unless you choose a source. Earlier values stay in the dated history when details change.</Text>
          </ScrollView>
          <Pressable accessibilityRole="button" disabled={!fields.name.trim()} onPress={save} style={[s.saveButton, !fields.name.trim() && s.saveDisabled]}><Text style={s.saveButtonText}>{editingId ? 'SAVE THIS VERSION' : 'ADD TO TREATMENT HISTORY'}</Text><Text style={s.saveArrow}>→</Text></Pressable>
        </View>
      </KeyboardAvoidingView></View>
    </Modal>
  </View>;
}

function Detail({ label, value }: { label: string; value: string }) { return <View style={s.detailCell}><Text style={s.detailLabel}>{label}</Text><Text style={s.detailValue}>{value || 'Not provided'}</Text></View>; }
function Field({ label, value, onChange, placeholder, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean }) { return <View style={s.fieldWrap}><Text style={s.fieldLabel}>{label}{required ? ' · REQUIRED' : ''}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.faint} style={s.input} returnKeyType="next" /></View>; }

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg }, content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 27, maxWidth: 600, width: '100%', alignSelf: 'center' },
  topbar: { minHeight: 47, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 }, back: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }, backGlyph: { color: C.ink, fontSize: 27, lineHeight: 28, marginTop: -3 }, brandBlock: { flex: 1 }, brand: { color: C.ink, fontSize: 17, fontWeight: '700', letterSpacing: 1 }, tagline: { color: C.faint, fontSize: 7, fontWeight: '700', letterSpacing: 1.45, marginTop: 2 }, topIcon: { width: 31, height: 31, borderRadius: 16, backgroundColor: C.amberPale, alignItems: 'center', justifyContent: 'center' }, topIconGlyph: { color: C.amber, fontSize: 15 },
  eyebrow: { color: '#8A7793', fontSize: 8, fontWeight: '800', letterSpacing: 1.8 }, title: { color: C.ink, fontSize: 30, lineHeight: 35, fontWeight: '400', letterSpacing: -1, marginTop: 8, maxWidth: 320 }, subtitle: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 8, maxWidth: 340 }, summary: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 12, marginTop: 17 }, summaryDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.amberPale, alignItems: 'center', justifyContent: 'center' }, summaryGlyph: { color: C.amber, fontSize: 17 }, summaryText: { flex: 1 }, summaryTitle: { color: C.ink, fontSize: 11, fontWeight: '700' }, summaryDetail: { color: C.muted, fontSize: 9, marginTop: 3 }, summaryArrow: { color: C.blue, fontSize: 16 }, storageNote: { backgroundColor: '#FFF7EA', borderColor: '#F0DDB8', borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 10 }, storageNoteText: { color: '#76551E', fontSize: 9, lineHeight: 14 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 25, marginBottom: 10 }, sectionEyebrow: { color: C.faint, fontSize: 7, fontWeight: '800', letterSpacing: 1.45 }, sectionTitle: { color: C.ink, fontSize: 16, fontWeight: '600', marginTop: 4 }, sectionCount: { color: C.faint, fontSize: 7, fontWeight: '700', letterSpacing: 1 }, segment: { flexDirection: 'row', gap: 5, padding: 4, backgroundColor: '#EFEDF2', borderRadius: 14, marginBottom: 12 }, segmentButton: { flex: 1, minHeight: 35, justifyContent: 'center', alignItems: 'center', borderRadius: 11 }, segmentActive: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border }, segmentText: { color: C.muted, fontSize: 9, fontWeight: '600' }, segmentTextActive: { color: C.ink },
  empty: { alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 24, marginBottom: 11 }, emptyNode: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.amberPale, alignItems: 'center', justifyContent: 'center' }, emptyGlyph: { color: C.amber, fontSize: 20 }, emptyTitle: { color: C.ink, fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 12 }, emptyBody: { color: C.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 6 },
  recordCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 18, marginBottom: 10, overflow: 'hidden' }, recordCardExpanded: { borderColor: '#E8D2B0' }, recordHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 }, pressed: { opacity: .92, transform: [{ scale: motion.pressScale }] }, recordNode: { width: 37, height: 37, borderRadius: 20, backgroundColor: C.blue, borderColor: '#C5D8F5', borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 3 }, recordNodeGlyph: { color: C.white, fontSize: 15, fontWeight: '600' }, recordMain: { flex: 1 }, recordMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 }, recordDate: { color: C.faint, fontSize: 8, fontWeight: '600', flex: 1 }, status: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }, statusCurrent: { backgroundColor: C.mint }, statusPast: { backgroundColor: '#F0EDF2' }, statusText: { fontSize: 7, fontWeight: '800', letterSpacing: .55 }, statusCurrentText: { color: '#287954' }, statusPastText: { color: C.muted }, recordName: { color: C.ink, fontSize: 13, fontWeight: '700', marginTop: 7 }, recordDose: { color: C.blue, fontSize: 9, fontWeight: '600', lineHeight: 14, marginTop: 4 }, recordPurpose: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 5 }, expandGlyph: { color: C.blue, fontSize: 18, fontWeight: '400', paddingHorizontal: 4, paddingVertical: 2 }, expandedBody: { paddingHorizontal: 12, paddingBottom: 12 }, rule: { height: 1, backgroundColor: C.border, marginBottom: 10 }, detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, detailCell: { width: '48%', paddingVertical: 4 }, detailLabel: { color: C.faint, fontSize: 7, fontWeight: '800', letterSpacing: .7 }, detailValue: { color: C.ink, fontSize: 9, lineHeight: 14, marginTop: 4 }, sourceBox: { backgroundColor: '#F6F8FC', borderRadius: 12, borderWidth: 1, borderColor: '#E6EDF8', padding: 10, marginTop: 7 }, sourceEyebrow: { color: C.blue, fontSize: 7, fontWeight: '800', letterSpacing: .8 }, sourceText: { color: C.ink, fontSize: 9, fontWeight: '600', marginTop: 4 }, sourceNote: { color: C.muted, fontSize: 8, lineHeight: 12, marginTop: 3 }, openSource: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 5 }, openSourceText: { color: C.blue, fontSize: 7, fontWeight: '800', letterSpacing: .55 }, historyToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }, historyToggleText: { color: C.plum, fontSize: 7, fontWeight: '800', letterSpacing: .75 }, historyToggleArrow: { color: C.plum, fontSize: 12 }, historyList: { borderLeftWidth: 1.5, borderLeftColor: '#D8C8E2', marginLeft: 4, paddingLeft: 12, paddingBottom: 5 }, historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5 }, historyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.amber, marginTop: 4, marginLeft: -16 }, historyCopy: { flex: 1 }, historyTitle: { color: C.ink, fontSize: 9, fontWeight: '600' }, historyDate: { color: C.faint, fontSize: 8, marginTop: 2 }, historyVersion: { color: C.muted, fontSize: 8, lineHeight: 12, marginTop: 2 }, actions: { flexDirection: 'row', gap: 7, marginTop: 5 }, secondaryAction: { flex: 1, minHeight: 37, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#F5F3F7', borderWidth: 1, borderColor: C.border }, secondaryActionText: { color: C.ink, fontSize: 7, fontWeight: '800', letterSpacing: .45 }, markPast: { alignItems: 'center', paddingVertical: 10, marginTop: 2 }, markPastText: { color: C.amber, fontSize: 7, fontWeight: '800', letterSpacing: .8 }, confirmBox: { backgroundColor: C.amberPale, borderWidth: 1, borderColor: '#EDD4A8', borderRadius: 12, padding: 10, marginTop: 7 }, confirmTitle: { color: C.ink, fontSize: 10, fontWeight: '700' }, confirmBody: { color: C.muted, fontSize: 8, lineHeight: 13, marginTop: 4 }, confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 9 }, confirmCancel: { paddingHorizontal: 10, paddingVertical: 7 }, confirmCancelText: { color: C.muted, fontSize: 8, fontWeight: '600' }, confirmGo: { backgroundColor: C.amber, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 }, confirmGoText: { color: C.white, fontSize: 8, fontWeight: '700' },
  addCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 12, marginTop: 3 }, addMark: { width: 34, height: 34, borderRadius: 12, backgroundColor: C.bluePale, alignItems: 'center', justifyContent: 'center' }, addGlyph: { color: C.blue, fontSize: 20 }, addCopy: { flex: 1 }, addTitle: { color: C.ink, fontSize: 10, fontWeight: '700' }, addSub: { color: C.muted, fontSize: 8, marginTop: 3 }, addArrow: { color: C.blue, fontSize: 15 }, safety: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F1EFF4', borderRadius: 12, padding: 10, marginTop: 11 }, safetyMark: { color: C.plum, fontSize: 10, fontWeight: '800', width: 16, height: 16, borderRadius: 8, backgroundColor: '#E3DCEB', textAlign: 'center', overflow: 'hidden' }, safetyText: { flex: 1, color: C.muted, fontSize: 8, lineHeight: 13 },
  modalShade: { flex: 1, justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end', alignItems: 'center', padding: Platform.OS === 'web' ? 12 : 0, backgroundColor: 'rgba(28,24,35,.42)' }, modalKeyboard: { width: '100%', maxWidth: Platform.OS === 'web' ? 390 : undefined }, modalCard: { width: '100%', maxHeight: '94%', alignSelf: 'center', backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: Platform.OS === 'web' ? 24 : 0, borderBottomRightRadius: Platform.OS === 'web' ? 24 : 0, paddingHorizontal: 17, paddingTop: 9, paddingBottom: Platform.OS === 'ios' ? 28 : 16 }, modalHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#D1CCD5', alignSelf: 'center', marginBottom: 14 }, modalTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, modalEyebrow: { color: C.amber, fontSize: 7, fontWeight: '800', letterSpacing: 1.15 }, modalTitle: { color: C.ink, fontSize: 19, lineHeight: 25, fontWeight: '500', marginTop: 4 }, modalClose: { width: 29, height: 29, borderRadius: 15, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }, modalCloseText: { color: C.muted, fontSize: 20, lineHeight: 23 }, modalBody: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 7 }, formScroll: { paddingTop: 11, paddingBottom: 10 }, fieldWrap: { flex: 1, marginBottom: 10 }, formRow: { flexDirection: 'row', gap: 8 }, fieldLabel: { color: C.faint, fontSize: 7, fontWeight: '800', letterSpacing: .65, marginBottom: 5 }, input: { minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, paddingHorizontal: 10, paddingVertical: 8, color: C.ink, fontSize: 10 }, formStatus: { marginBottom: 11 }, formStatusRow: { flexDirection: 'row', gap: 7 }, statusChoice: { borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 8 }, statusChoiceActive: { backgroundColor: C.amberPale, borderColor: '#E9CDA0' }, statusChoiceText: { color: C.muted, fontSize: 9 }, statusChoiceTextActive: { color: C.amber, fontWeight: '700' }, sourceChoices: { gap: 6, marginBottom: 10 }, sourceChoice: { borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, paddingHorizontal: 10, paddingVertical: 8 }, sourceChoiceActive: { borderColor: '#9EC0F5', backgroundColor: C.bluePale }, sourceChoiceText: { color: C.muted, fontSize: 8 }, sourceChoiceTextActive: { color: C.blue, fontWeight: '700' }, noAssets: { color: C.muted, fontSize: 8, lineHeight: 12, marginBottom: 10 }, formFootnote: { color: C.faint, fontSize: 8, lineHeight: 12, marginBottom: 8 }, saveButton: { minHeight: 48, borderRadius: 14, backgroundColor: C.blue, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, saveDisabled: { opacity: .42 }, saveButtonText: { color: C.white, fontSize: 8, fontWeight: '800', letterSpacing: .65 }, saveArrow: { color: C.white, fontSize: 17 },
});
