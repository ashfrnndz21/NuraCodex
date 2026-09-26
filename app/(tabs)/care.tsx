import React, { useEffect, useMemo, useState } from 'react';
import { animatedNativeDriver } from '../../src/services/animatedDriver';
import { AccessibilityInfo, Animated, Easing, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useNura, type TreatmentStatus } from '../../src/state/NuraContext';
import { colors, motion, radius, shadow } from '../../src/theme';
import { parseHealthDate } from '../../src/utils/healthDate';

type MotionCardProps = { label: string; onPress: () => void; reducedMotion: boolean; children: React.ReactNode; style?: object };
function MotionCard({ label, onPress, reducedMotion, children, style }: MotionCardProps) {
  const [scale] = useState(() => new Animated.Value(1));
  const pressIn = () => { if (!reducedMotion) Animated.timing(scale, { toValue: motion.pressScale, duration: motion.pressIn, easing: Easing.linear, useNativeDriver: animatedNativeDriver }).start(); };
  const pressOut = () => { if (!reducedMotion) Animated.timing(scale, { toValue: 1, duration: motion.pressOut, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }).start(); };
  return <Animated.View style={[{ transform: [{ scale }] }, style]}><Pressable accessibilityRole="button" accessibilityLabel={label} onPressIn={pressIn} onPressOut={pressOut} onPress={onPress} style={s.motionCard}>{children}</Pressable></Animated.View>;
}

function formatDate(value: string) {
  if (!value) return 'Date not added';
  const date = parseHealthDate(value);
  return date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not added';
}

export default function CareOverview() {
  const { ready, storageError, treatments, visits } = useNura();
  const [treatmentFilter, setTreatmentFilter] = useState<TreatmentStatus>('current');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [entrance] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (reducedMotion) { entrance.setValue(1); return; }
    entrance.setValue(0);
    Animated.timing(entrance, { toValue: 1, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }).start();
  }, [entrance, reducedMotion]);

  const visibleTreatments = useMemo(() => treatments
    .filter((item) => item.status === treatmentFilter)
    .sort((a, b) => (b.startedOn || b.createdAt).localeCompare(a.startedOn || a.createdAt)), [treatmentFilter, treatments]);
  const currentCount = treatments.filter((item) => item.status === 'current').length;
  const pastCount = treatments.filter((item) => item.status === 'past').length;
  const upcomingVisits = useMemo(() => visits
    .filter((visit) => visit.status === 'upcoming')
    .sort((a, b) => {
      const left = parseHealthDate(a.appointmentAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const right = parseHealthDate(b.appointmentAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return left - right;
    }), [visits]);
  const openActions = useMemo(() => visits.flatMap((visit) => (visit.followUpActions ?? [])
    .filter((action) => action.status === 'open')
    .map((action) => ({ ...action, visitId: visit.id, visitPurpose: visit.purpose })))
    .sort((a, b) => (a.dueOn || '9999').localeCompare(b.dueOn || '9999')),
  [visits]);

  function changeTreatmentFilter(next: TreatmentStatus) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTreatmentFilter(next);
  }

  const firstVisit = upcomingVisits[0];
  const lift = entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return <View style={s.page}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.topbar}>
        <View><Text style={s.brand}>nura</Text><Text style={s.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open your profile" onPress={() => router.push('/(tabs)/profile')} style={({ pressed }) => [s.profileButton, pressed && s.pressed]}><Text style={s.profileGlyph}>⌂</Text></Pressable>
      </View>

      <Animated.View style={{ opacity: entrance, transform: [{ translateY: lift }] }}>
        <Text style={s.eyebrow}>CARE, IN CONTEXT</Text>
        <Text style={s.title}>Your care, connected.</Text>
        <Text style={s.subtitle}>Visits, treatment and follow-up details you’ve chosen to keep together.</Text>

        {storageError ? <View style={s.warning}><Text style={s.warningTitle}>Some changes may not have saved</Text><Text style={s.warningBody}>Your care record may be out of date. Reopen the relevant item and try again.</Text></View> : null}
        {!ready ? <View style={s.emptyCard}><Text style={s.body}>Opening your care record…</Text></View> : null}

        <View style={s.summaryRow}>
          <View style={s.summaryCell}><Text style={s.summaryValue}>{String(currentCount).padStart(2, '0')}</Text><Text style={s.summaryLabel}>CURRENT TREATMENTS</Text></View>
          <View style={s.summaryDivider} />
          <View style={s.summaryCell}><Text style={s.summaryValue}>{String(upcomingVisits.length).padStart(2, '0')}</Text><Text style={s.summaryLabel}>UPCOMING VISITS</Text></View>
        </View>

        <View style={s.sectionHead}><View><Text style={s.eyebrow}>NEXT IN YOUR CARE</Text><Text style={s.sectionTitle}>{firstVisit ? 'A visit on your calendar.' : 'Plan your next step.'}</Text></View><View style={s.sectionMark}><Text style={s.sectionMarkText}>⌂</Text></View></View>
        {firstVisit ? <MotionCard label={`Open visit: ${firstVisit.purpose || 'Care visit'}, ${formatDate(firstVisit.appointmentAt)}`} reducedMotion={reducedMotion} onPress={() => router.push({ pathname: '/visits', params: { visitId: firstVisit.id } })} style={s.visitWrap}>
          <View style={s.visitTop}><View style={s.visitDate}><Text style={s.visitDay}>{parseHealthDate(firstVisit.appointmentAt)?.getDate() ?? '—'}</Text><Text style={s.visitMonth}>{parseHealthDate(firstVisit.appointmentAt)?.toLocaleDateString(undefined, { month: 'short' }).toUpperCase() ?? 'DATE'}</Text></View><View style={s.visitCopy}><View style={s.visitMetaRow}><Text style={s.visitStatus}>UPCOMING</Text><Text style={s.metaDot}>·</Text><Text style={s.visitMeta}>{formatDate(firstVisit.appointmentAt)}</Text></View><Text style={s.visitTitle}>{firstVisit.purpose || 'Care visit'}</Text><Text style={s.visitDetail}>{[firstVisit.clinician, firstVisit.location].filter(Boolean).join(' · ') || 'Care team and location not added'}</Text></View><Text style={s.chevron}>›</Text></View>
          <View style={s.visitFooter}><Text style={s.footerContext}>{firstVisit.questions.length} saved question{firstVisit.questions.length === 1 ? '' : 's'} · {firstVisit.briefFactIds.length + firstVisit.briefAssetIds.length + firstVisit.briefTreatmentIds.length} selected record{firstVisit.briefFactIds.length + firstVisit.briefAssetIds.length + firstVisit.briefTreatmentIds.length === 1 ? '' : 's'}</Text><Text style={s.footerAction}>OPEN VISIT  ↗</Text></View>
        </MotionCard> : <View style={s.emptyCard}><Text style={s.emptyTitle}>No visit saved yet</Text><Text style={s.body}>Add an upcoming appointment or start an unscheduled visit brief. You choose which records to include.</Text><Pressable accessibilityRole="button" onPress={() => router.push('/visits')} style={({ pressed }) => [s.inlineAction, pressed && s.pressed]}><Text style={s.inlineActionText}>PREPARE FOR A VISIT  →</Text></Pressable></View>}

        {openActions.length > 0 && <View style={s.followUpCard}><View style={s.sectionHeadSmall}><Text style={s.eyebrow}>FOLLOW-UP YOU SAVED</Text><Text style={s.countChip}>{openActions.length} OPEN</Text></View>{openActions.slice(0, 3).map((action) => <Pressable key={action.id} accessibilityRole="button" accessibilityLabel={`Open follow-up: ${action.title}`} onPress={() => router.push({ pathname: '/visits', params: { visitId: action.visitId } })} style={({ pressed }) => [s.followUpRow, pressed && s.pressed]}><View style={s.taskDot} /><View style={{ flex: 1 }}><Text style={s.followUpTitle}>{action.title}</Text><Text style={s.followUpMeta}>{action.visitPurpose || 'Care follow-up'}{action.dueOn ? ` · ${formatDate(action.dueOn)}` : ''}</Text></View><Text style={s.chevron}>›</Text></Pressable>)}</View>}

        <View style={s.sectionHead}><View><Text style={s.eyebrow}>MEDICINES + TREATMENT</Text><Text style={s.sectionTitle}>What you’ve recorded.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Add a treatment record" onPress={() => router.push('/treatment')} style={({ pressed }) => [s.addButton, pressed && s.pressed]}><Text style={s.addGlyph}>＋</Text></Pressable></View>
        <View style={s.filterRow}>
          {([{ id: 'current', title: 'Current', count: currentCount }, { id: 'past', title: 'Past', count: pastCount }] as const).map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: treatmentFilter === item.id }} onPress={() => changeTreatmentFilter(item.id)} style={[s.filterPill, treatmentFilter === item.id && s.filterPillOn]}><Text style={[s.filterText, treatmentFilter === item.id && s.filterTextOn]}>{item.title} <Text style={[s.filterCount, treatmentFilter === item.id && s.filterTextOn]}>{item.count}</Text></Text></Pressable>)}
        </View>
        {visibleTreatments.length ? <View style={s.treatmentList}>{visibleTreatments.slice(0, 5).map((item) => <MotionCard key={item.id} label={`Open ${item.status} treatment record: ${item.name}`} reducedMotion={reducedMotion} onPress={() => router.push({ pathname: '/treatment', params: { treatmentId: item.id } })} style={s.treatmentWrap}>
          <View style={s.treatmentRow}><View style={[s.treatmentNode, item.status === 'past' && s.treatmentNodePast]}><Text style={s.treatmentGlyph}>✚</Text></View><View style={s.treatmentCopy}><View style={s.treatmentTitleRow}><Text numberOfLines={1} style={s.treatmentTitle}>{item.name}</Text><Text style={[s.treatmentBadge, item.status === 'past' ? s.pastBadge : s.currentBadge]}>{item.status === 'current' ? 'CURRENT' : 'PAST'}</Text></View><Text style={s.treatmentDetail}>{[item.dose, item.schedule].filter(Boolean).join(' · ') || 'Dose and schedule not added'}</Text><Text style={s.treatmentSource}>{item.purpose || 'Purpose not added'} · {item.source}</Text></View><Text style={s.chevron}>›</Text></View>
        </MotionCard>)}</View> : <View style={s.emptyCard}><Text style={s.emptyTitle}>{treatmentFilter === 'current' ? 'No current treatment records' : 'No past treatment records'}</Text><Text style={s.body}>Add a medicine or treatment exactly as you understand it. Nura won’t infer missing instructions.</Text><Pressable accessibilityRole="button" onPress={() => router.push('/treatment')} style={({ pressed }) => [s.inlineAction, pressed && s.pressed]}><Text style={s.inlineActionText}>{treatmentFilter === 'current' ? 'ADD A TREATMENT RECORD  →' : 'OPEN TREATMENT HISTORY  →'}</Text></Pressable></View>}

        <View style={s.actionSection}><Text style={s.eyebrow}>WHAT WOULD HELP TODAY?</Text>
          <MotionCard label="Prepare for a visit" reducedMotion={reducedMotion} onPress={() => router.push('/visits')} style={s.actionWrap}><View style={[s.actionIcon, s.actionBlue]}><Text style={[s.actionIconText, { color: colors.aqua }]}>⌂</Text></View><View style={s.actionCopy}><Text style={s.actionTitle}>Prepare for a visit</Text><Text style={s.actionBody}>Choose the details and questions you want to bring.</Text></View><Text style={s.actionArrow}>↗</Text></MotionCard>
          <MotionCard label="Open symptom support" reducedMotion={reducedMotion} onPress={() => router.push('/symptoms')} style={s.actionWrap}><View style={[s.actionIcon, s.actionPeach]}><Text style={[s.actionIconText, { color: '#A9654F' }]}>!</Text></View><View style={s.actionCopy}><Text style={s.actionTitle}>Organize a health concern</Text><Text style={s.actionBody}>Describe what you notice and review safe next steps.</Text></View><Text style={s.actionArrow}>↗</Text></MotionCard>
          <MotionCard label="Ask Nura about your care" reducedMotion={reducedMotion} onPress={() => router.push('/ask')} style={s.actionWrap}><View style={[s.actionIcon, s.actionLilac]}><Text style={[s.actionIconText, { color: colors.violet }]}>✦</Text></View><View style={s.actionCopy}><Text style={s.actionTitle}>Ask Nura about your care</Text><Text style={s.actionBody}>Choose what records Nura can use for this answer.</Text></View><Text style={s.actionArrow}>↗</Text></MotionCard>
        </View>

        <Text style={s.footerNote}>Your care record reflects what you add and confirm. Empty areas mean “not added yet.”</Text>
      </Animated.View>
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 43, paddingBottom: 30, maxWidth: 540, width: '100%', alignSelf: 'center' },
  topbar: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brand: { color: colors.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.7 }, tagline: { color: colors.quiet, fontSize: 8, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  profileButton: { width: 39, height: 39, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', ...shadow }, profileGlyph: { color: colors.violet, fontSize: 17 },
  eyebrow: { color: colors.violet, fontSize: 8, fontWeight: '800', letterSpacing: 1.4 }, title: { color: colors.ink, fontSize: 31, lineHeight: 37, fontWeight: '300', letterSpacing: -1.1, marginTop: 5 }, subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 15, maxWidth: 345 },
  summaryRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingVertical: 10, marginBottom: 21, ...shadow }, summaryCell: { flex: 1, alignItems: 'center' }, summaryValue: { color: colors.ink, fontSize: 20, fontWeight: '500' }, summaryLabel: { color: colors.quiet, fontSize: 7, fontWeight: '700', letterSpacing: .8, textAlign: 'center', marginTop: 4 }, summaryDivider: { height: 37, width: 1, backgroundColor: colors.border },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, marginBottom: 10 }, sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '400', letterSpacing: -.3, marginTop: 4 }, sectionMark: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#F0EAF5', alignItems: 'center', justifyContent: 'center' }, sectionMarkText: { color: colors.violet, fontSize: 17 },
  motionCard: { minHeight: 48 }, visitWrap: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 13, marginBottom: 21, ...shadow }, visitTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, visitDate: { width: 47, height: 52, borderRadius: 14, backgroundColor: '#EAF1FD', alignItems: 'center', justifyContent: 'center' }, visitDay: { color: colors.aqua, fontSize: 18, fontWeight: '600' }, visitMonth: { color: colors.aqua, fontSize: 7, fontWeight: '800', letterSpacing: .8, marginTop: 1 }, visitCopy: { flex: 1, minWidth: 0 }, visitMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, visitStatus: { color: colors.success, fontSize: 7, fontWeight: '800', letterSpacing: .8 }, metaDot: { color: colors.quiet, fontSize: 9 }, visitMeta: { color: colors.quiet, fontSize: 8 }, visitTitle: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 4 }, visitDetail: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 3 }, chevron: { color: colors.violet, fontSize: 23, fontWeight: '300', marginLeft: 4 }, visitFooter: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 11, paddingTop: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, footerContext: { flex: 1, color: colors.muted, fontSize: 8, lineHeight: 12 }, footerAction: { color: colors.aqua, fontSize: 7, fontWeight: '800', letterSpacing: .7 },
  emptyCard: { padding: 14, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 18 }, emptyTitle: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 4 }, body: { color: colors.muted, fontSize: 10, lineHeight: 15 }, inlineAction: { minHeight: 40, justifyContent: 'center', alignItems: 'center', marginTop: 8, backgroundColor: '#EAF1FD', borderRadius: 12 }, inlineActionText: { color: colors.aqua, fontSize: 8, fontWeight: '800', letterSpacing: .6 }, pressed: { opacity: .88, transform: [{ scale: motion.pressScale }] },
  followUpCard: { padding: 13, backgroundColor: '#FFFDF9', borderRadius: 18, borderWidth: 1, borderColor: '#EDE4D6', marginBottom: 19 }, sectionHeadSmall: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }, countChip: { color: '#8D631F', backgroundColor: '#FBF0DE', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, fontSize: 7, fontWeight: '800', letterSpacing: .6 }, followUpRow: { minHeight: 47, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: '#F0E8DD', paddingVertical: 7 }, taskDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D39B4A' }, followUpTitle: { color: colors.ink, fontSize: 10, fontWeight: '600' }, followUpMeta: { color: colors.muted, fontSize: 8, marginTop: 3 },
  addButton: { width: 37, height: 37, borderRadius: 19, backgroundColor: '#EAF1FD', alignItems: 'center', justifyContent: 'center' }, addGlyph: { color: colors.aqua, fontSize: 21, lineHeight: 24 }, filterRow: { flexDirection: 'row', gap: 7, marginBottom: 8 }, filterPill: { minHeight: 37, minWidth: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 }, filterPillOn: { backgroundColor: '#EAF1FD', borderColor: '#C8D9FB' }, filterText: { color: colors.muted, fontSize: 9, fontWeight: '600' }, filterTextOn: { color: colors.aqua }, filterCount: { color: colors.quiet, fontWeight: '500' },
  treatmentList: { gap: 7, marginBottom: 20 }, treatmentWrap: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11, paddingVertical: 10 }, treatmentRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, treatmentNode: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#EAF1FD', alignItems: 'center', justifyContent: 'center' }, treatmentNodePast: { backgroundColor: '#F0EDF2' }, treatmentGlyph: { color: colors.aqua, fontSize: 14 }, treatmentCopy: { flex: 1, minWidth: 0 }, treatmentTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, treatmentTitle: { color: colors.ink, fontSize: 10, fontWeight: '700', flex: 1 }, treatmentBadge: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, fontSize: 6, fontWeight: '800', letterSpacing: .5 }, currentBadge: { color: colors.success, backgroundColor: colors.mint }, pastBadge: { color: colors.muted, backgroundColor: '#F0EDF2' }, treatmentDetail: { color: colors.muted, fontSize: 8, marginTop: 3 }, treatmentSource: { color: colors.quiet, fontSize: 7, marginTop: 3 },
  actionSection: { marginTop: 4 }, actionWrap: { marginTop: 7, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11, paddingVertical: 10 }, actionIcon: { width: 35, height: 35, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, actionBlue: { backgroundColor: '#EAF1FD' }, actionPeach: { backgroundColor: colors.peach }, actionLilac: { backgroundColor: colors.lilac }, actionIconText: { fontSize: 17, fontWeight: '700' }, actionCopy: { flex: 1, marginHorizontal: 9 }, actionTitle: { color: colors.ink, fontSize: 10, fontWeight: '700' }, actionBody: { color: colors.muted, fontSize: 8, lineHeight: 12, marginTop: 3 }, actionArrow: { color: colors.violet, fontSize: 15 }, footerNote: { color: colors.quiet, fontSize: 8, lineHeight: 12, textAlign: 'center', marginTop: 18, paddingHorizontal: 12 },
  warning: { backgroundColor: '#FBF0DE', borderWidth: 1, borderColor: '#EAD7B9', borderRadius: 14, padding: 11, marginBottom: 12 }, warningTitle: { color: '#8D631F', fontSize: 10, fontWeight: '700' }, warningBody: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 3 },
});
