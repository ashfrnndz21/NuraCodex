import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useNura } from '../src/state/NuraContext';
import type { HealthFact, HealthVisit, IntakeAsset, TreatmentRecord, VisitFollowUpAction, VisitInput } from '../src/state/NuraContext';
import { motion } from '../src/theme';

type Scene = 'overview' | 'create' | 'detail' | 'builder' | 'preview' | 'outcome';
const C = { canvas: '#F6F4F7', white: '#FFFFFF', ink: '#292731', muted: '#777480', quiet: '#A29DA9', line: '#E5E1E9', blue: '#1264F5', bluePale: '#EAF1FF', plum: '#483250', lilac: '#E9DDF0', lilacInk: '#735A83', peach: '#F2DDD6', mint: '#E3F3EC', green: '#38795F', amber: '#A66D22' };

function fmtDate(value: string) {
  if (!value) return 'Date not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}
function shortDate(value: string) {
  if (!value) return 'UNSCHEDULED';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
}
function hasValidDate(value: string) {
  if (!value.trim()) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const [year, month, day] = value.trim().split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}
export default function VisitsScreen() {
  const params = useLocalSearchParams<{ visitId?: string }>();
  const { ready, storageError, facts, assets, treatments, savedQuestions, visits, addVisit, updateVisit } = useNura();
  const routeVisitId = typeof params.visitId === 'string' ? params.visitId : null;
  const [scene, setScene] = useState<Scene>(routeVisitId ? 'detail' : 'overview');
  const [visitId, setVisitId] = useState<string | null>(routeVisitId);
  const [dateDraft, setDateDraft] = useState('');
  const [purposeDraft, setPurposeDraft] = useState('');
  const [clinicianDraft, setClinicianDraft] = useState('');
  const [locationDraft, setLocationDraft] = useState('');
  const [selectedFacts, setSelectedFacts] = useState<string[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [questionDraft, setQuestionDraft] = useState('');
  const [outcomeDraft, setOutcomeDraft] = useState('');
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [followUpActionDraft, setFollowUpActionDraft] = useState('');
  const [followUpDueDraft, setFollowUpDueDraft] = useState('');
  const [outcomeSources, setOutcomeSources] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [enter] = useState(() => new Animated.Value(1));
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; sub.remove(); };
  }, []);
  useEffect(() => {
    if (reducedMotion) { enter.setValue(1); return; }
    enter.setValue(0.94);
    Animated.timing(enter, { toValue: 1, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }).start();
  }, [scene, reducedMotion, enter]);

  const activeVisit = visits.find((visit) => visit.id === visitId) ?? null;
  const confirmedFacts = useMemo(() => facts.filter((fact) => !fact.validUntil && (fact.status === 'reviewed' || fact.status === 'confirmed') && fact.reviewState === 'user_confirmed'), [facts]);
  const eligibleAssets = useMemo(() => assets.filter((asset) => asset.purpose !== 'insurance'), [assets]);
  const currentTreatments = useMemo(() => treatments.filter((record) => record.status === 'current'), [treatments]);
  const visibleVisits = useMemo(() => visits.filter((visit) => showPast ? visit.status === 'completed' : visit.status === 'upcoming').sort((a, b) => (showPast ? b.appointmentAt.localeCompare(a.appointmentAt) : a.appointmentAt.localeCompare(b.appointmentAt))), [visits, showPast]);
  const selectedFactRecords = useMemo(() => selectedFacts.map((id) => confirmedFacts.find((item) => item.id === id)).filter((item): item is HealthFact => Boolean(item)), [selectedFacts, confirmedFacts]);
  const selectedAssetRecords = useMemo(() => selectedAssets.map((id) => eligibleAssets.find((item) => item.id === id)).filter((item): item is IntakeAsset => Boolean(item)), [selectedAssets, eligibleAssets]);
  const selectedTreatmentRecords = useMemo(() => selectedTreatments.map((id) => currentTreatments.find((item) => item.id === id)).filter((item): item is TreatmentRecord => Boolean(item)), [selectedTreatments, currentTreatments]);
  const visitFactRecords = useMemo(() => (activeVisit?.briefFactIds ?? []).map((id) => facts.find((item) => item.id === id)).filter((item): item is HealthFact => Boolean(item)), [activeVisit, facts]);
  const visitAssetRecords = useMemo(() => (activeVisit?.briefAssetIds ?? []).map((id) => assets.find((item) => item.id === id)).filter((item): item is IntakeAsset => Boolean(item)), [activeVisit, assets]);
  const visitOutcomeSourceRecords = useMemo(() => (activeVisit?.outcomeSourceAssetIds ?? []).map((id) => assets.find((item) => item.id === id)).filter((item): item is IntakeAsset => Boolean(item)), [activeVisit, assets]);
  const visitTreatmentRecords = useMemo(() => (activeVisit?.briefTreatmentIds ?? []).map((id) => treatments.find((item) => item.id === id)).filter((item): item is TreatmentRecord => Boolean(item)), [activeVisit, treatments]);

  function move(next: Scene) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setError(''); setScene(next);
  }
  function openVisit(visit: HealthVisit) { setVisitId(visit.id); move('detail'); }
  function startNew() { setVisitId(null); setDateDraft(''); setPurposeDraft(''); setClinicianDraft(''); setLocationDraft(''); setError(''); move('create'); }
  function createVisit() {
    const cleanDate = dateDraft.trim();
    if (!hasValidDate(cleanDate)) { setError('Enter the date as YYYY-MM-DD, or leave it blank for an unscheduled visit.'); return; }
    if (!purposeDraft.trim() && !clinicianDraft.trim() && !locationDraft.trim()) { setError('Add a visit reason, clinician, or care location to continue.'); return; }
    const appointmentAt = cleanDate ? new Date(`${cleanDate}T12:00:00`).toISOString() : '';
    const input: VisitInput = { appointmentAt, purpose: purposeDraft, clinician: clinicianDraft, location: locationDraft, status: 'upcoming', briefFactIds: [], briefAssetIds: [], briefTreatmentIds: [], questions: [], outcome: '', followUp: '', outcomeSourceAssetIds: [], source: 'Added by you' };
    const visit = addVisit(input);
    if (!visit) { setError('The visit could not be saved. Try again.'); return; }
    setVisitId(visit.id); setSelectedFacts([]); setSelectedAssets([]); setSelectedTreatments([]); setSelectedQuestions([]); move('builder');
  }
  function beginBrief(visit: HealthVisit) {
    setVisitId(visit.id); setSelectedFacts(visit.briefFactIds.filter((id) => confirmedFacts.some((fact) => fact.id === id))); setSelectedAssets(visit.briefAssetIds); setSelectedTreatments(visit.briefTreatmentIds.filter((id) => currentTreatments.some((item) => item.id === id))); setSelectedQuestions(visit.questions); setQuestionDraft(''); move('builder');
  }
  function toggle(value: string, values: string[], setter: (next: string[]) => void) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setter(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }
  function addQuestion() {
    const question = questionDraft.trim(); if (!question) return;
    setSelectedQuestions((current) => current.includes(question) ? current : [...current, question]); setQuestionDraft('');
  }
  function saveBrief() {
    if (!activeVisit) return;
    updateVisit(activeVisit.id, { briefFactIds: selectedFacts, briefAssetIds: selectedAssets, briefTreatmentIds: selectedTreatments, questions: selectedQuestions });
    move('preview');
  }
  function beginOutcome(visit: HealthVisit) {
    setVisitId(visit.id); setOutcomeDraft(visit.outcome); setFollowUpDraft(visit.followUp); setOutcomeSources(visit.outcomeSourceAssetIds); move('outcome');
  }
  function saveOutcome() {
    if (!activeVisit) return;
    if (!outcomeDraft.trim() && !followUpDraft.trim() && outcomeSources.length === 0 && !(activeVisit.followUpActions?.length)) { setError('Add a note, follow-up action, or source before saving.'); return; }
    updateVisit(activeVisit.id, { outcome: outcomeDraft, followUp: followUpDraft, outcomeSourceAssetIds: outcomeSources, status: 'completed' });
    move('detail');
  }
  function addFollowUpAction() {
    if (!activeVisit) return;
    const title = followUpActionDraft.trim();
    const dueOn = followUpDueDraft.trim();
    if (!title) { setError('Write the follow-up action first.'); return; }
    if (!hasValidDate(dueOn)) { setError('Enter the due date as YYYY-MM-DD, or leave it blank.'); return; }
    const now = new Date().toISOString();
    const action: VisitFollowUpAction = { id: Crypto.randomUUID(), title, dueOn, status: 'open', source: outcomeSources.length ? 'Added by you · linked to selected source' : 'Added by you', sourceAssetIds: [...outcomeSources], createdAt: now, updatedAt: now };
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    updateVisit(activeVisit.id, { followUpActions: [...(activeVisit.followUpActions ?? []), action] });
    setFollowUpActionDraft(''); setFollowUpDueDraft(''); setError('');
  }
  function toggleFollowUpAction(action: VisitFollowUpAction) {
    if (!activeVisit) return;
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const now = new Date().toISOString();
    const next: VisitFollowUpAction = { ...action, status: action.status === 'open' ? 'done' : 'open', updatedAt: now, completedAt: action.status === 'open' ? now : undefined };
    updateVisit(activeVisit.id, { followUpActions: (activeVisit.followUpActions ?? []).map((item) => item.id === action.id ? next : item) });
  }
  function back() {
    if (scene === 'create' || scene === 'detail') { move('overview'); return; }
    if (scene === 'builder') { if (activeVisit) move('detail'); else move('overview'); return; }
    if (scene === 'preview') { move('builder'); return; }
    if (scene === 'outcome') { move('detail'); return; }
    router.back();
  }
  function toggleFacts(id: string) { toggle(id, selectedFacts, setSelectedFacts); }
  function toggleAssets(id: string) { toggle(id, selectedAssets, setSelectedAssets); }
  function toggleTreatments(id: string) { toggle(id, selectedTreatments, setSelectedTreatments); }
  function toggleQuestions(question: string) { toggle(question, selectedQuestions, setSelectedQuestions); }

  return <View style={s.page}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={s.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={scene === 'overview' ? 'Back' : 'Back to previous step'} onPress={back} style={s.backButton}><Text style={s.backGlyph}>‹</Text></Pressable>
        <View style={s.brandBlock}><Text style={s.brand}>nura</Text><Text style={s.brandTag}>YOUR HEALTH, UNDERSTOOD</Text></View>
        <View style={s.orb}><View style={s.orbCore} /></View>
      </View>
      {storageError ? <View style={s.errorBanner}><Text style={s.errorText}>A local save needs attention: {storageError}</Text></View> : null}
      {!ready ? <View style={s.formCard}><Text style={s.body}>Opening your saved visit history…</Text></View> : <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
        {scene === 'overview' && <>
          <Text style={s.eyebrow}>VISITS + CARE</Text><Text style={s.title}>Get ready for care.</Text><Text style={s.subtitle}>Bring the details you choose, then keep the visit outcome connected to your history.</Text>
          <View style={s.introCard}><View style={s.introOrb}><Text style={s.introOrbText}>✦</Text></View><View style={{ flex: 1 }}><Text style={s.cardTitle}>Your visit, in one place</Text><Text style={s.body}>Prepare a source-linked brief. Saving it keeps it on this device; nothing is shared automatically.</Text></View></View>
          <View style={s.segment}><Pressable accessibilityRole="button" accessibilityState={{ selected: !showPast }} onPress={() => setShowPast(false)} style={[s.segmentButton, !showPast && s.segmentSelected]}><Text style={[s.segmentText, !showPast && s.segmentTextSelected]}>Upcoming · {visits.filter((item) => item.status === 'upcoming').length}</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ selected: showPast }} onPress={() => setShowPast(true)} style={[s.segmentButton, showPast && s.segmentSelected]}><Text style={[s.segmentText, showPast && s.segmentTextSelected]}>Past · {visits.filter((item) => item.status === 'completed').length}</Text></Pressable></View>
          <View style={s.sectionHead}><Text style={s.sectionLabel}>{showPast ? 'RECENT VISITS' : 'UPCOMING CARE'}</Text><Text style={s.quiet}>{visibleVisits.length} {visibleVisits.length === 1 ? 'visit' : 'visits'}</Text></View>
          {visibleVisits.map((visit) => <Pressable key={visit.id} accessibilityRole="button" onPress={() => openVisit(visit)} style={({ pressed }) => [s.visitCard, pressed && s.pressed]}><View style={s.visitDate}><Text style={s.visitDateDay}>{visit.appointmentAt ? new Date(visit.appointmentAt).toLocaleDateString(undefined, { day: '2-digit' }) : '—'}</Text><Text style={s.visitDateMonth}>{visit.appointmentAt ? new Date(visit.appointmentAt).toLocaleDateString(undefined, { month: 'short' }).toUpperCase() : 'DATE'}</Text></View><View style={s.visitRail}><View style={[s.visitNode, visit.status === 'completed' && s.visitNodeDone]}><Text style={s.visitNodeGlyph}>{visit.status === 'completed' ? '✓' : '⌂'}</Text></View></View><View style={s.visitCopy}><View style={s.rowBetween}><Text style={s.cardTitle} numberOfLines={2}>{visit.purpose || 'Visit'}</Text><Text style={[s.statusPill, visit.status === 'completed' ? s.statusDone : s.statusUpcoming]}>{visit.status === 'completed' ? 'COMPLETED' : 'UPCOMING'}</Text></View><Text style={s.body}>{[visit.clinician, visit.location].filter(Boolean).join(' · ') || visit.source}</Text><Text style={s.visitMeta}>{visit.questions.length} saved question{visit.questions.length === 1 ? '' : 's'} · {visit.briefFactIds.length + visit.briefAssetIds.length + visit.briefTreatmentIds.length} selected record{visit.briefFactIds.length + visit.briefAssetIds.length + visit.briefTreatmentIds.length === 1 ? '' : 's'}</Text><Text style={s.cardLink}>{visit.status === 'completed' ? (visit.outcome ? 'Review visit outcome' : 'Add visit outcome') : (visit.briefFactIds.length || visit.questions.length ? 'Continue your brief' : 'Prepare a visit brief')}  →</Text></View></Pressable>)}
          {visibleVisits.length === 0 && <View style={s.emptyCard}><View style={s.emptyDot}><Text style={s.emptyDotText}>⌂</Text></View><Text style={s.cardTitle}>{showPast ? 'Your visit history starts here.' : 'No upcoming visit saved.'}</Text><Text style={s.body}>{showPast ? 'After an appointment, add what happened and any follow-up you want to remember.' : 'Add an appointment or create an unscheduled brief. You can enter the details yourself.'}</Text><Pressable accessibilityRole="button" style={s.secondaryButton} onPress={startNew}><Text style={s.secondaryText}>{showPast ? 'ADD A PAST VISIT' : 'ADD A VISIT'}</Text></Pressable></View>}
          <Pressable accessibilityRole="button" onPress={startNew} style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}><Text style={s.primaryText}>＋  ADD A VISIT OR START A BRIEF</Text></Pressable>
          <Text style={s.footer}>Visit details and selected records stay on this device. Nura does not share a brief, contact a clinic, or create medical advice.</Text>
        </>}

        {scene === 'create' && <>
          <Text style={s.eyebrow}>VISITS · NEW</Text><Text style={s.title}>What are you preparing for?</Text><Text style={s.subtitle}>A date is optional. You can start a brief before an appointment is booked.</Text>
          <View style={s.formCard}><Text style={s.fieldLabel}>VISIT OR REASON</Text><TextInput value={purposeDraft} onChangeText={setPurposeDraft} placeholder="e.g. Cardiology follow-up" placeholderTextColor={C.quiet} style={s.input} returnKeyType="next" /><Text style={s.fieldLabel}>DATE · YYYY-MM-DD</Text><TextInput value={dateDraft} onChangeText={setDateDraft} placeholder="Leave blank if not scheduled" placeholderTextColor={C.quiet} style={s.input} autoCapitalize="none" /><Text style={s.fieldLabel}>CLINICIAN · OPTIONAL</Text><TextInput value={clinicianDraft} onChangeText={setClinicianDraft} placeholder="Name or care team" placeholderTextColor={C.quiet} style={s.input} returnKeyType="next" /><Text style={s.fieldLabel}>CLINIC OR LOCATION · OPTIONAL</Text><TextInput value={locationDraft} onChangeText={setLocationDraft} placeholder="Hospital, clinic, or telehealth" placeholderTextColor={C.quiet} style={s.input} /></View>
          {error ? <Text style={s.validation}>{error}</Text> : null}<Pressable accessibilityRole="button" onPress={createVisit} style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}><Text style={s.primaryText}>SAVE VISIT · CHOOSE WHAT GOES WITH YOU</Text></Pressable><Text style={s.footer}>The appointment is marked as entered by you. Calendar access is not required.</Text>
        </>}

        {scene === 'detail' && activeVisit && <>
          <Text style={s.eyebrow}>{activeVisit.status === 'completed' ? 'VISIT HISTORY' : 'UPCOMING VISIT'}</Text><Text style={s.title}>{activeVisit.purpose || 'Your visit'}</Text><Text style={s.subtitle}>{shortDate(activeVisit.appointmentAt)}{activeVisit.clinician ? ` · ${activeVisit.clinician}` : ''}{activeVisit.location ? ` · ${activeVisit.location}` : ''}</Text>
          <View style={s.detailCard}><View style={s.rowBetween}><Text style={s.sectionLabel}>VISIT BRIEF</Text><Text style={s.statusPill}>{activeVisit.briefFactIds.length + activeVisit.briefAssetIds.length + activeVisit.briefTreatmentIds.length} ITEMS</Text></View><Text style={s.cardTitle}>{activeVisit.questions.length} question{activeVisit.questions.length === 1 ? '' : 's'} · {visitFactRecords.length + visitAssetRecords.length + visitTreatmentRecords.length} selected records</Text><Text style={s.body}>Each selection keeps its source or is labeled as information you entered.</Text>
            {visitFactRecords.map((item) => <View key={item.id} style={s.sourceRow}><View style={s.sourceMark}><Text style={s.sourceMarkText}>✳</Text></View><View style={{ flex: 1 }}><Text style={s.sourceTitle}>{item.label}</Text><Text style={s.sourceDetail}>{item.value}</Text><Text style={s.sourceMeta}>{item.source} · {fmtDate(item.date)}</Text></View></View>)}
            {visitTreatmentRecords.map((item) => <View key={item.id} style={s.sourceRow}><View style={[s.sourceMark, { backgroundColor: '#F8EBDD' }]}><Text style={[s.sourceMarkText, { color: C.amber }]}>✚</Text></View><View style={{ flex: 1 }}><Text style={s.sourceTitle}>{item.name}</Text><Text style={s.sourceDetail}>{[item.dose, item.schedule].filter(Boolean).join(' · ') || 'Dose and timing not provided'}</Text><Text style={s.sourceMeta}>{item.source} · current</Text></View></View>)}
            {visitAssetRecords.map((item) => <View key={item.id} style={s.sourceRow}><View style={[s.sourceMark, { backgroundColor: C.bluePale }]}><Text style={[s.sourceMarkText, { color: C.blue }]}>▤</Text></View><View style={{ flex: 1 }}><Text style={s.sourceTitle}>{item.name}</Text><Text style={s.sourceDetail}>{item.kind.toUpperCase()} · original file stays attached</Text><Text style={s.sourceMeta}>{item.serverSourceId ? 'Extraction available for review' : 'File contents not analyzed'}</Text></View></View>)}
            {activeVisit.questions.map((question, index) => <View key={`${question}-${index}`} style={s.questionRow}><Text style={s.questionNum}>{String(index + 1).padStart(2, '0')}</Text><Text style={s.questionText}>{question}</Text></View>)}
            {!activeVisit.briefFactIds.length && !activeVisit.briefAssetIds.length && !activeVisit.briefTreatmentIds.length && !activeVisit.questions.length ? <View style={s.inlineEmpty}><Text style={s.body}>Nothing selected yet. Choose confirmed details and questions that you want to bring.</Text></View> : null}
          </View>
          {activeVisit.outcome || activeVisit.followUp || visitOutcomeSourceRecords.length > 0 ? <View style={s.outcomeCard}><Text style={s.sectionLabel}>AFTER THE VISIT · YOUR NOTE</Text>{activeVisit.outcome ? <Text style={s.outcomeText}>{activeVisit.outcome}</Text> : null}{activeVisit.followUp ? <Text style={s.followText}>FOLLOW-UP · {activeVisit.followUp}</Text> : null}{visitOutcomeSourceRecords.map((item) => <Text key={item.id} style={s.sourceMeta}>Source attached · {item.name}</Text>)}</View> : null}
          {(activeVisit.followUpActions ?? []).length > 0 && <View style={s.followUpCard}><Text style={s.sectionLabel}>FOLLOW-UP ACTIONS · {activeVisit.followUpActions?.length}</Text>{(activeVisit.followUpActions ?? []).map((action) => <FollowUpRow key={action.id} action={action} assets={assets} onPress={() => toggleFollowUpAction(action)} />)}</View>}
          {error ? <Text style={s.validation}>{error}</Text> : null}<Pressable accessibilityRole="button" onPress={() => beginBrief(activeVisit)} style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}><Text style={s.primaryText}>{activeVisit.briefFactIds.length || activeVisit.questions.length ? 'EDIT THE VISIT BRIEF' : 'CHOOSE DETAILS FOR YOUR BRIEF'}  →</Text></Pressable><Pressable accessibilityRole="button" onPress={() => beginOutcome(activeVisit)} style={s.secondaryButton}><Text style={s.secondaryText}>{activeVisit.outcome || activeVisit.followUp ? 'EDIT VISIT OUTCOME' : 'ADD WHAT HAPPENED'}</Text></Pressable>
          <Text style={s.footer}>This record reflects what you selected or wrote. It does not confirm what a clinician said unless you attach and review a source.</Text>
        </>}

        {scene === 'builder' && activeVisit && <>
          <Text style={s.eyebrow}>VISIT BRIEF · BUILD</Text><Text style={s.title}>What should go with you?</Text><Text style={s.subtitle}>{activeVisit.purpose || 'Unscheduled visit'} · {shortDate(activeVisit.appointmentAt)}. Select each detail yourself; unconfirmed items are left out.</Text>
          <View style={s.scopeBanner}><View style={s.scopeMark}><Text style={s.scopeMarkText}>✓</Text></View><Text style={s.scopeText}>Only your selections appear in the preview. Nothing is sent or shared by saving the brief.</Text></View>
          <Text style={s.sectionLabel}>CONFIRMED HEALTH DETAILS</Text>{confirmedFacts.length ? confirmedFacts.map((item) => <Selectable key={item.id} selected={selectedFacts.includes(item.id)} onPress={() => toggleFacts(item.id)} title={item.label} detail={`${item.value} · ${item.source}`} meta={fmtDate(item.date)} />) : <View style={s.inlineEmpty}><Text style={s.body}>No confirmed details are ready to select. Add or review a record first.</Text></View>}
          {currentTreatments.length > 0 && <><Text style={[s.sectionLabel, s.sectionGap]}>CURRENT TREATMENT · OPTIONAL</Text>{currentTreatments.map((item) => <Selectable key={item.id} selected={selectedTreatments.includes(item.id)} onPress={() => toggleTreatments(item.id)} title={item.name} detail={[item.dose, item.schedule].filter(Boolean).join(' · ') || 'Dose and timing not provided'} meta={item.source} />)}</>}
          {eligibleAssets.length > 0 && <><Text style={[s.sectionLabel, s.sectionGap]}>SOURCE FILES · ORIGINALS STAY ATTACHED</Text>{eligibleAssets.map((item) => <Selectable key={item.id} selected={selectedAssets.includes(item.id)} onPress={() => toggleAssets(item.id)} title={item.name} detail={`${item.kind.toUpperCase()} · ${item.serverSourceId ? 'extracted details available' : 'contents not analyzed'}`} meta={item.serverSourceId ?? (item.possibleRepeat ? 'Possible duplicate · kept separately' : 'Added by you')} />)}</>}
          <Text style={[s.sectionLabel, s.sectionGap]}>QUESTIONS FOR YOUR CARE TEAM</Text>{savedQuestions.map((question) => <Selectable key={question} selected={selectedQuestions.includes(question)} onPress={() => toggleQuestions(question)} title={question} detail="Saved question" />)}{selectedQuestions.filter((question) => !savedQuestions.includes(question)).map((question, index) => <Selectable key={`${question}-${index}`} selected onPress={() => toggleQuestions(question)} title={question} detail="Your question" />)}
          <View style={s.addQuestionRow}><TextInput value={questionDraft} onChangeText={setQuestionDraft} placeholder="Write a question in your own words" placeholderTextColor={C.quiet} style={[s.input, s.questionInput]} multiline /><Pressable accessibilityRole="button" disabled={!questionDraft.trim()} onPress={addQuestion} style={[s.addQuestionButton, !questionDraft.trim() && s.disabled]}><Text style={s.addQuestionText}>ADD</Text></Pressable></View>
          <View style={s.selectionCount}><Text style={s.selectionCountText}>SELECTED FOR PREVIEW</Text><Text style={s.selectionCountValue}>{selectedFacts.length + selectedAssets.length + selectedTreatments.length + selectedQuestions.length}</Text></View>
          {error ? <Text style={s.validation}>{error}</Text> : null}<Pressable accessibilityRole="button" onPress={saveBrief} style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}><Text style={s.primaryText}>PREVIEW MY BRIEF  →</Text></Pressable><Text style={s.footer}>Only confirmed facts can be included. Selection is not a medical recommendation.</Text>
        </>}

        {scene === 'preview' && activeVisit && <>
          <Text style={s.eyebrow}>YOUR VISIT BRIEF</Text><Text style={s.title}>Ready to review.</Text><Text style={s.subtitle}>{activeVisit.purpose || 'Visit'} · {shortDate(activeVisit.appointmentAt)}</Text>
          <View style={s.previewCard}><View style={s.previewHead}><View><Text style={s.sectionLabel}>NURA · VISIT NOTES</Text><Text style={s.cardTitle}>{activeVisit.clinician || 'For your care team'}</Text></View><Text style={s.previewCount}>{activeVisit.briefFactIds.length + activeVisit.briefAssetIds.length + activeVisit.briefTreatmentIds.length} SOURCES</Text></View>
            {[...selectedFactRecords.map((item) => ({ id: item.id, title: item.label, detail: item.value, source: item.source, date: fmtDate(item.date) })), ...selectedTreatmentRecords.map((item) => ({ id: item.id, title: item.name, detail: [item.dose, item.schedule].filter(Boolean).join(' · ') || 'Dose and timing not provided', source: item.source, date: 'Current record' })), ...selectedAssetRecords.map((item) => ({ id: item.id, title: item.name, detail: `${item.kind.toUpperCase()} · original attached`, source: item.serverSourceId ? 'Extraction available for review' : 'Contents not analyzed', date: fmtDate(item.addedAt) }))].map((item) => <View key={item.id} style={s.previewItem}><View style={s.previewDot} /><View style={{ flex: 1 }}><Text style={s.sourceTitle}>{item.title}</Text><Text style={s.sourceDetail}>{item.detail}</Text><Text style={s.sourceMeta}>{item.source} · {item.date}</Text></View></View>)}
            {activeVisit.questions.length ? <><Text style={[s.sectionLabel, s.sectionGap]}>QUESTIONS YOU WROTE</Text>{activeVisit.questions.map((question, index) => <View key={`${question}-${index}`} style={s.questionRow}><Text style={s.questionNum}>{String(index + 1).padStart(2, '0')}</Text><Text style={s.questionText}>{question}</Text></View>)}</> : <View style={s.inlineEmpty}><Text style={s.body}>No questions selected.</Text></View>}
            <View style={s.nothingShared}><Text style={s.nothingSharedMark}>✓</Text><Text style={s.nothingSharedText}>Saved on this device. Nothing has been shared.</Text></View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => beginBrief(activeVisit)} style={s.secondaryButton}><Text style={s.secondaryText}>EDIT WHAT’S INCLUDED</Text></Pressable><Pressable accessibilityRole="button" onPress={() => beginOutcome(activeVisit)} style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}><Text style={s.primaryText}>AFTER THE VISIT · ADD OUTCOME  →</Text></Pressable><Pressable accessibilityRole="button" onPress={() => move('detail')} style={s.textButton}><Text style={s.textButtonText}>DONE FOR NOW</Text></Pressable><Text style={s.footer}>This preview is not a document export. Sharing or sending has not happened.</Text>
        </>}

        {scene === 'outcome' && activeVisit && <>
          <Text style={s.eyebrow}>AFTER THE VISIT</Text><Text style={s.title}>What happened?</Text><Text style={s.subtitle}>{activeVisit.purpose || 'Visit'} · {shortDate(activeVisit.appointmentAt)}. Write only what you want to remember.</Text>
          <View style={s.formCard}><Text style={s.fieldLabel}>YOUR NOTES · IN YOUR WORDS</Text><TextInput value={outcomeDraft} onChangeText={setOutcomeDraft} placeholder="What did you discuss or decide?" placeholderTextColor={C.quiet} style={[s.input, s.textArea]} multiline textAlignVertical="top" /><Text style={s.fieldLabel}>FOLLOW-UP NOTE · OPTIONAL</Text><TextInput value={followUpDraft} onChangeText={setFollowUpDraft} placeholder="Anything else you want to remember" placeholderTextColor={C.quiet} style={[s.input, s.textAreaSmall]} multiline textAlignVertical="top" /></View>
          <View style={s.formCard}><Text style={s.sectionLabel}>ADD A FOLLOW-UP ACTION</Text><Text style={s.body}>Only actions you enter are saved. Choose an optional due date and attach any source files you selected below.</Text><TextInput value={followUpActionDraft} onChangeText={setFollowUpActionDraft} placeholder="e.g. Book the next appointment" placeholderTextColor={C.quiet} style={[s.input, { marginTop: 10 }]} accessibilityLabel="Follow-up action" returnKeyType="done" /><TextInput value={followUpDueDraft} onChangeText={setFollowUpDueDraft} placeholder="Due date · YYYY-MM-DD · optional" placeholderTextColor={C.quiet} style={[s.input, { marginTop: 7 }]} accessibilityLabel="Follow-up due date" autoCapitalize="none" /><Pressable accessibilityRole="button" onPress={addFollowUpAction} style={({ pressed }) => [s.addQuestionButton, { alignSelf: 'flex-start', marginTop: 9 }, pressed && s.pressed]}><Text style={s.addQuestionText}>＋ ADD ACTION</Text></Pressable>{(activeVisit.followUpActions ?? []).map((action) => <FollowUpRow key={action.id} action={action} assets={assets} onPress={() => toggleFollowUpAction(action)} />)}</View>
          <Text style={s.sectionLabel}>ATTACH A SOURCE ALREADY IN YOUR RECORDS</Text>{eligibleAssets.length ? eligibleAssets.map((item) => <Selectable key={item.id} selected={outcomeSources.includes(item.id)} onPress={() => toggle(item.id, outcomeSources, setOutcomeSources)} title={item.name} detail={`${item.kind.toUpperCase()} · original file remains attached`} meta={item.serverSourceId ? 'Source extraction available' : 'Contents not analyzed'} />) : <View style={s.inlineEmpty}><Text style={s.body}>No source files yet. You can add a visit summary later from Add a health record.</Text><Pressable onPress={() => router.push('/intake')}><Text style={s.cardLink}>ADD A HEALTH RECORD  ↗</Text></Pressable></View>}
          {error ? <Text style={s.validation}>{error}</Text> : null}<Pressable accessibilityRole="button" onPress={saveOutcome} style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}><Text style={s.primaryText}>SAVE VISIT OUTCOME  →</Text></Pressable><Text style={s.footer}>Saving marks this visit complete as your record. It does not verify a clinician’s instructions. Attached extracted details still need review.</Text>
        </>}
      </Animated.View>}
      <View style={s.bottomBar}><Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/home')} style={s.bottomNav}><Text style={s.bottomGlyph}>⌂</Text><Text style={s.bottomText}>Home</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/health')} style={s.bottomNav}><Text style={s.bottomGlyph}>◉</Text><Text style={s.bottomText}>History</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/ask')} style={s.bottomNav}><Text style={s.bottomGlyph}>✦</Text><Text style={s.bottomText}>Ask</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/profile')} style={s.bottomNav}><Text style={s.bottomGlyph}>○</Text><Text style={s.bottomText}>Profile</Text></Pressable></View>
    </ScrollView>
  </View>;
}

function Selectable({ selected, onPress, title, detail, meta }: { selected: boolean; onPress: () => void; title: string; detail: string; meta?: string }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [s.selectRow, selected && s.selectSelected, pressed && s.pressed]}><View style={[s.checkbox, selected && s.checkboxSelected]}>{selected ? <Text style={s.checkboxTick}>✓</Text> : null}</View><View style={{ flex: 1 }}><Text style={s.selectTitle}>{title}</Text><Text style={s.selectDetail}>{detail}</Text>{meta ? <Text style={s.selectMeta}>{meta}</Text> : null}</View><View style={[s.selectNode, selected && s.selectNodeOn]}><Text style={[s.selectNodeText, selected && s.selectNodeTextOn]}>{selected ? '−' : '+'}</Text></View></Pressable>;
}

function FollowUpRow({ action, assets, onPress }: { action: VisitFollowUpAction; assets: IntakeAsset[]; onPress: () => void }) {
  const completed = action.status === 'done';
  const overdue = !completed && Boolean(action.dueOn) && action.dueOn < new Date().toISOString().slice(0, 10);
  const dueLabel = action.dueOn ? new Date(`${action.dueOn}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'No due date';
  const sourceNames = action.sourceAssetIds.map((id) => assets.find((asset) => asset.id === id)?.name).filter((name): name is string => Boolean(name));
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: completed }} accessibilityLabel={`${completed ? 'Reopen' : 'Mark'} follow-up action: ${action.title}`} onPress={onPress} style={({ pressed }) => [s.followUpRow, pressed && s.pressed]}><View style={[s.followUpCheck, completed && s.followUpCheckDone]}><Text style={[s.followUpCheckGlyph, completed && s.followUpCheckGlyphDone]}>{completed ? '✓' : ''}</Text></View><View style={{ flex: 1 }}><Text style={[s.followUpTitle, completed && s.followUpTitleDone]}>{action.title}</Text><Text style={[s.followUpMeta, overdue && s.followUpMetaOverdue]}>{completed ? 'COMPLETED BY YOU' : overdue ? `OVERDUE · ${dueLabel}` : `DUE · ${dueLabel}`}</Text><Text style={s.followUpSource}>{sourceNames.length ? `Source · ${sourceNames.join(' · ')}` : action.source}</Text></View><Text style={s.followUpAction}>{completed ? 'REOPEN' : 'DONE'}</Text></Pressable>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.canvas }, content: { paddingHorizontal: 20, paddingTop: 42, paddingBottom: 26, width: '100%', maxWidth: 520, alignSelf: 'center' },
  topbar: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 24 }, backButton: { width: 35, height: 35, borderRadius: 18, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }, backGlyph: { color: C.plum, fontSize: 28, lineHeight: 30, marginTop: -3 }, brandBlock: { flex: 1 }, brand: { color: C.plum, fontSize: 17, fontWeight: '700', letterSpacing: 1.1 }, brandTag: { color: C.quiet, fontSize: 7, letterSpacing: 1.4, marginTop: 2 }, orb: { width: 32, height: 32, borderRadius: 18, backgroundColor: C.lilac, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DACBE5' }, orbCore: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#8F69C3', borderWidth: 2, borderColor: '#EEDCE1' },
  eyebrow: { color: C.lilacInk, fontSize: 8, fontWeight: '800', letterSpacing: 1.6 }, title: { color: C.ink, fontSize: 30, lineHeight: 35, fontWeight: '500', letterSpacing: -.8, marginTop: 7 }, subtitle: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 15 }, body: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }, quiet: { color: C.quiet, fontSize: 9 },
  introCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#F0EAF5', borderWidth: 1, borderColor: '#E1D5E9', borderRadius: 17, padding: 13, marginBottom: 14 }, introOrb: { width: 39, height: 39, borderRadius: 16, backgroundColor: C.peach, alignItems: 'center', justifyContent: 'center' }, introOrbText: { color: C.plum, fontSize: 19 }, cardTitle: { color: C.ink, fontSize: 13, fontWeight: '600', lineHeight: 18 }, segment: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: '#ECE9EF', borderWidth: 1, borderColor: C.line, marginTop: 4, marginBottom: 19 }, segmentButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, segmentSelected: { backgroundColor: C.plum }, segmentText: { color: C.muted, fontSize: 10, fontWeight: '600' }, segmentTextSelected: { color: C.white }, sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, sectionLabel: { color: C.lilacInk, fontSize: 8, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  visitCard: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 12, marginBottom: 9, minHeight: 112 }, visitDate: { width: 40, alignItems: 'center', paddingTop: 3 }, visitDateDay: { color: C.ink, fontSize: 17, fontWeight: '600' }, visitDateMonth: { color: C.quiet, fontSize: 7, fontWeight: '700', letterSpacing: .7, marginTop: 1 }, visitRail: { width: 27, alignItems: 'center' }, visitNode: { width: 24, height: 24, borderRadius: 13, backgroundColor: C.blue, borderWidth: 2, borderColor: '#C7D9FF', alignItems: 'center', justifyContent: 'center', marginTop: 2 }, visitNodeDone: { backgroundColor: '#5A9B83', borderColor: '#D7EADF' }, visitNodeGlyph: { color: C.white, fontSize: 11, fontWeight: '700' }, visitCopy: { flex: 1 }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 }, statusPill: { color: C.lilacInk, backgroundColor: '#F1ECF5', borderRadius: 12, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontSize: 7, fontWeight: '800', letterSpacing: .6 }, statusDone: { color: C.green, backgroundColor: C.mint }, statusUpcoming: { color: C.blue, backgroundColor: C.bluePale }, visitMeta: { color: C.quiet, fontSize: 8, marginTop: 7 }, cardLink: { color: C.blue, fontSize: 8, fontWeight: '800', letterSpacing: .6, marginTop: 9 },
  emptyCard: { alignItems: 'center', padding: 20, borderRadius: 19, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, marginTop: 5 }, emptyDot: { width: 43, height: 43, borderRadius: 17, backgroundColor: C.bluePale, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }, emptyDotText: { color: C.blue, fontSize: 22 }, primaryButton: { minHeight: 49, borderRadius: 15, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12, marginTop: 10, shadowColor: C.blue, shadowOpacity: .14, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, primaryText: { color: C.white, fontSize: 9, fontWeight: '800', letterSpacing: .65, textAlign: 'center' }, secondaryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DCD2E3', backgroundColor: C.white, borderRadius: 14, paddingHorizontal: 12, marginTop: 8 }, secondaryText: { color: C.plum, fontSize: 9, fontWeight: '700', letterSpacing: .55 }, footer: { color: C.quiet, fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 12, paddingHorizontal: 8 },
  formCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 19, padding: 14, marginTop: 5 }, fieldLabel: { color: C.lilacInk, fontSize: 7, fontWeight: '800', letterSpacing: 1, marginTop: 12, marginBottom: 5 }, input: { minHeight: 43, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#FCFBFD', paddingHorizontal: 11, color: C.ink, fontSize: 11 }, validation: { color: '#A34E53', fontSize: 10, lineHeight: 14, marginTop: 10 },
  detailCard: { backgroundColor: C.white, borderRadius: 19, borderWidth: 1, borderColor: C.line, padding: 14, marginTop: 2 }, sourceRow: { flexDirection: 'row', gap: 9, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0EDF2', marginTop: 8 }, sourceMark: { width: 25, height: 25, borderRadius: 10, backgroundColor: '#EAF3EF', alignItems: 'center', justifyContent: 'center' }, sourceMarkText: { color: '#45836F', fontSize: 12 }, sourceTitle: { color: C.ink, fontSize: 10, fontWeight: '700' }, sourceDetail: { color: C.muted, fontSize: 9, lineHeight: 13, marginTop: 2 }, sourceMeta: { color: C.quiet, fontSize: 8, lineHeight: 12, marginTop: 3 }, questionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderTopWidth: 1, borderTopColor: '#F0EDF2', paddingTop: 9, marginTop: 8 }, questionNum: { color: C.blue, fontSize: 8, fontWeight: '800', letterSpacing: .4, marginTop: 2 }, questionText: { flex: 1, color: C.ink, fontSize: 10, lineHeight: 15 }, inlineEmpty: { borderRadius: 12, backgroundColor: '#F8F7F9', padding: 11, marginTop: 10 }, outcomeCard: { borderRadius: 17, backgroundColor: '#F3EEF5', borderWidth: 1, borderColor: '#E2D6EA', padding: 13, marginTop: 10 }, outcomeText: { color: C.ink, fontSize: 11, lineHeight: 17, marginTop: 3 }, followText: { color: C.lilacInk, fontSize: 9, lineHeight: 14, marginTop: 8, fontWeight: '600' },
  scopeBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: '#EEF5F1', borderWidth: 1, borderColor: '#D7E9DF', borderRadius: 14, padding: 10, marginBottom: 15 }, scopeMark: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#D9EFE3', alignItems: 'center', justifyContent: 'center' }, scopeMarkText: { color: C.green, fontSize: 10, fontWeight: '800' }, scopeText: { flex: 1, color: '#496759', fontSize: 9, lineHeight: 13 }, sectionGap: { marginTop: 16 }, selectRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: C.line, borderRadius: 15, backgroundColor: C.white, padding: 10, marginTop: 6 }, selectSelected: { borderColor: '#AFCBFF', backgroundColor: '#F4F8FF' }, checkbox: { width: 19, height: 19, borderRadius: 6, borderWidth: 1.4, borderColor: '#C9C4D0', alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { backgroundColor: C.blue, borderColor: C.blue }, checkboxTick: { color: C.white, fontSize: 12, fontWeight: '800' }, selectTitle: { color: C.ink, fontSize: 10, fontWeight: '700' }, selectDetail: { color: C.muted, fontSize: 8, lineHeight: 12, marginTop: 3 }, selectMeta: { color: C.quiet, fontSize: 7, marginTop: 3 }, selectNode: { width: 23, height: 23, borderRadius: 12, backgroundColor: '#F4F1F6', alignItems: 'center', justifyContent: 'center' }, selectNodeOn: { backgroundColor: '#DDE9FF' }, selectNodeText: { color: C.quiet, fontSize: 16, lineHeight: 19 }, selectNodeTextOn: { color: C.blue, fontWeight: '700' }, addQuestionRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 }, questionInput: { flex: 1, minHeight: 43, paddingVertical: 8 }, addQuestionButton: { minHeight: 39, paddingHorizontal: 10, borderRadius: 11, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center' }, addQuestionText: { color: C.white, fontSize: 8, fontWeight: '800', letterSpacing: .8 }, disabled: { opacity: .42 }, selectionCount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, marginTop: 14 }, selectionCountText: { color: C.quiet, fontSize: 7, fontWeight: '800', letterSpacing: 1 }, selectionCountValue: { color: C.blue, fontSize: 17, fontWeight: '600' },
  previewCard: { backgroundColor: C.white, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 14, marginTop: 3 }, previewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 10, marginBottom: 3 }, previewCount: { color: C.blue, backgroundColor: C.bluePale, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, fontSize: 7, fontWeight: '800', letterSpacing: .5, overflow: 'hidden' }, previewItem: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: '#F0EDF2', paddingVertical: 9 }, previewDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.blue, marginTop: 5 }, nothingShared: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, backgroundColor: '#EEF5F1', padding: 10, marginTop: 12 }, nothingSharedMark: { color: C.green, fontSize: 11, fontWeight: '800' }, nothingSharedText: { color: '#496759', fontSize: 9, fontWeight: '600' }, textButton: { alignItems: 'center', padding: 12 }, textButtonText: { color: C.lilacInk, fontSize: 8, fontWeight: '700', letterSpacing: 1 }, textArea: { minHeight: 106, paddingTop: 11 }, textAreaSmall: { minHeight: 66, paddingTop: 11 }, errorBanner: { borderRadius: 12, padding: 10, backgroundColor: '#FFF0ED', borderWidth: 1, borderColor: '#F0D3CB', marginBottom: 10 }, errorText: { color: '#8F4639', fontSize: 9, lineHeight: 13 }, pressed: { opacity: .88, transform: [{ scale: motion.pressScale }] },
  followUpCard: { borderRadius: 17, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, padding: 12, marginTop: 10 }, followUpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderTopWidth: 1, borderTopColor: '#F0EDF2', paddingTop: 10, marginTop: 8 }, followUpCheck: { width: 19, height: 19, borderRadius: 6, borderWidth: 1.3, borderColor: '#B8C5D9', alignItems: 'center', justifyContent: 'center', marginTop: 1 }, followUpCheckDone: { backgroundColor: '#DFF2EA', borderColor: '#95C4AA' }, followUpCheckGlyph: { color: C.green, fontSize: 12, fontWeight: '800' }, followUpCheckGlyphDone: { color: C.green }, followUpTitle: { color: C.ink, fontSize: 10, lineHeight: 15, fontWeight: '700' }, followUpTitleDone: { color: C.muted, textDecorationLine: 'line-through' }, followUpMeta: { color: C.blue, fontSize: 7, fontWeight: '800', letterSpacing: .6, marginTop: 3 }, followUpMetaOverdue: { color: C.amber }, followUpSource: { color: C.quiet, fontSize: 8, lineHeight: 12, marginTop: 3 }, followUpAction: { color: C.lilacInk, fontSize: 7, fontWeight: '800', letterSpacing: .5, paddingTop: 4 },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, borderRadius: 17, paddingVertical: 9, marginTop: 20 }, bottomNav: { alignItems: 'center', minWidth: 42 }, bottomGlyph: { color: C.lilacInk, fontSize: 16 }, bottomText: { color: C.quiet, fontSize: 7, marginTop: 2 },
});
