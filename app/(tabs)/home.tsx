import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Orb } from '../../src/components/Orb';
import { useNura } from '../../src/state/NuraContext';
import { parseHealthDate } from '../../src/utils/healthDate';
import { brandScenes, colors, motion, shadow, timelineColors } from '../../src/theme';

type RecentItem = { id: string; title: string; detail: string; date: string; type: string; source: string; icon: string };
const domains = [
  { label: 'Today', detail: 'Biometrics', tint: '#EAF1FD', ink: '#1767D8', match: /vital|biometric|blood pressure/i },
  { label: 'History', detail: 'Medical history', tint: '#F0EAF5', ink: '#76629A', match: /history|condition|lab|result/i },
  { label: 'Records', detail: 'Sources', tint: '#E8F4F1', ink: '#287C70', match: /record|document|source/i },
  { label: 'Treatment', detail: 'Medicines + care', tint: '#F4E1D7', ink: '#A7654F', match: /treatment|medicine|care/i },
  { label: 'Life', detail: 'Lifestyle', tint: '#EAF3E7', ink: '#54804C', match: /life|routine|wellbeing/i },
  { label: 'Cover', detail: 'Insurance', tint: '#FBF0DF', ink: '#9A6B24', match: /insurance|cover/i },
];

function TapScale({ children, onPress, label, style, reducedMotion, containerStyle }: { children: React.ReactNode; onPress: () => void; label: string; style: any; reducedMotion: boolean; containerStyle?: any }) {
  const [scale] = useState(() => new Animated.Value(1));
  const pressIn = () => { if (!reducedMotion) Animated.timing(scale, { toValue: motion.pressScale, duration: motion.pressIn, easing: Easing.linear, useNativeDriver: true }).start(); };
  const pressOut = () => { if (!reducedMotion) Animated.timing(scale, { toValue: 1, duration: motion.pressOut, easing: Easing.bezier(...motion.easing.bouncy), useNativeDriver: true }).start(); };
  return <Animated.View style={[containerStyle, { transform: [{ scale }] }]}><Pressable accessibilityRole="button" accessibilityLabel={label} onPressIn={pressIn} onPressOut={pressOut} onPress={onPress} style={style}>{children}</Pressable></Animated.View>;
}
function Count({ value, label, tint, ink }: { value: number; label: string; tint: string; ink: string }) {
  return <View style={styles.countCell}><Text style={[styles.countValue, { color: ink }]}>{String(value).padStart(2, '0')}</Text><Text style={styles.countLabel}>{label}</Text><View style={[styles.countRule, { backgroundColor: tint }]} /></View>;
}
function formatDate(value: string) {
  const date = parseHealthDate(value);
  return date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : value;
}
function Arrow() { return <Text style={styles.arrow}>↗</Text>; }
function recentTone(type: string) {
  const value = type.toLowerCase();
  if (/care|visit|clinic|doctor|appointment/.test(value)) return timelineColors.care;
  if (/treatment|medicine|prescription/.test(value)) return timelineColors.treatment;
  if (/vital|biometric|blood|lab|result|cholesterol|glucose/.test(value)) return timelineColors.vitals;
  if (/life|sleep|routine|wellbeing/.test(value)) return timelineColors.life;
  return timelineColors.record;
}

export default function Home() {
  const { name, facts, assets, treatments, visits, topics, savedQuestions, storageError, ready, resetDemo } = useNura();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  const recent = useMemo<RecentItem[]>(() => [
    ...facts.filter((fact) => !fact.validUntil).map((fact) => ({ id: fact.id, title: fact.label, detail: fact.value, date: fact.date, type: fact.category, source: fact.source, icon: /lab|result|blood/i.test(fact.category) ? '▤' : /care|visit/i.test(fact.category) ? '⌂' : /treatment|medicine/i.test(fact.category) ? '＋' : '✳' })),
    ...treatments.map((item) => ({ id: item.id, title: item.name, detail: [item.dose, item.schedule].filter(Boolean).join(' · ') || 'Dose and timing not provided', date: item.startedOn || item.createdAt, type: item.status === 'current' ? 'Treatment · current' : 'Treatment · past', source: item.source, icon: '✚' })),
    ...visits.map((item) => ({ id: item.id, title: item.purpose || 'Care visit', detail: [item.clinician, item.location].filter(Boolean).join(' · ') || item.status, date: item.appointmentAt || item.createdAt, type: item.status === 'upcoming' ? 'Upcoming care' : 'Visit outcome', source: item.source, icon: '⌂' })),
    ...assets.map((asset) => ({ id: asset.id, title: asset.name, detail: asset.kind === 'video' ? 'Video saved · review not available yet' : 'File saved · ready to review', date: asset.addedAt, type: asset.kind.toUpperCase(), source: asset.uri.startsWith('demo:') ? 'Sample record' : 'Added by you', icon: asset.kind === 'video' ? '▶' : '▤' })),
  ].sort((a, b) => (parseHealthDate(b.date)?.getTime() ?? 0) - (parseHealthDate(a.date)?.getTime() ?? 0)).slice(0, 2), [facts, assets, treatments, visits]);

  return <View style={styles.page}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.topbar}>
        <View style={styles.brand}><Orb size={30} /><View><Text style={styles.wordmark}>nura</Text><Text style={styles.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open your profile" onPress={() => router.push('/(tabs)/profile')} style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}><Text style={styles.profileButtonText}>{name ? name.trim().slice(0, 1).toUpperCase() : '○'}</Text></Pressable>
      </View>

      {storageError ? <View style={styles.storageNotice}><Text style={styles.storageTitle}>Some profile changes may not have saved</Text><Text style={styles.storageBody}>Your information may be out of date. Try again before you leave this screen.</Text></View> : null}
      {!ready && <View style={styles.storageNotice}><Text style={styles.storageBody}>Opening your health profile…</Text></View>}

      <View style={styles.hero}>
        <LinearGradient pointerEvents="none" colors={brandScenes.home.colors} locations={brandScenes.home.locations} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <View style={styles.heroBloom} />
        <View style={styles.heroContent}>
          <View style={styles.heroKicker}><View style={styles.heroDot} /><Text style={styles.heroKickerText}>YOUR 720 PROFILE</Text></View>
          <Text style={styles.heroTitle}>{name.trim() ? 'A clearer picture, ' + name.trim() + '.' : 'Your health, in one clear picture.'}</Text>
          <Text style={styles.heroBody}>{facts.some((fact) => !fact.validUntil) || assets.length || treatments.length ? 'Your profile is growing from details and sources you chose to add.' : 'Bring your history, records and care into one place, at your pace.'}</Text>
          <TapScale reducedMotion={reducedMotion} onPress={() => router.push('/(tabs)/profile')} label="Open your 720 profile" style={styles.heroAction}>
            <Text style={styles.heroActionText}>View your profile</Text><Arrow />
          </TapScale>
        </View>
        <View pointerEvents="none" style={styles.heroOrb}><View style={styles.orbHalo} /><Orb size={70} /></View>
      </View>

      {typeof window !== 'undefined' && <View style={styles.demoNotice}>
        <View style={styles.demoIcon}><Text style={styles.demoIconText}>i</Text></View>
        <View style={styles.demoCopy}><Text style={styles.demoTitle}>Sample preview</Text><Text style={styles.demoBody}>Changes and uploaded files are saved in this browser until you reset the preview. Please use fictional health and contact details only.</Text>
          {confirmReset ? <View style={styles.resetConfirm}><Text style={styles.resetPrompt}>Reset this preview? Your changes and added files will be removed and the sample profile restored.</Text><Pressable accessibilityRole="button" accessibilityLabel="Reset preview and restore sample data" onPress={() => { resetDemo(); setConfirmReset(false); }}><Text style={styles.resetAction}>Reset preview</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setConfirmReset(false)}><Text style={styles.resetCancel}>Keep editing</Text></Pressable></View> : <Pressable accessibilityRole="button" accessibilityLabel="Reset preview" onPress={() => setConfirmReset(true)}><Text style={styles.resetLink}>Reset preview</Text></Pressable>}
        </View>
      </View>}

      <View style={styles.countStrip}>
        <Count value={topics.length} label="FOCUS AREAS" tint="#D9C9E8" ink={colors.violet} />
        <View style={styles.countDivider} />
        <Count value={facts.filter((fact) => !fact.validUntil).length} label="HEALTH DETAILS" tint="#D7C7E2" ink={colors.violet} />
        <View style={styles.countDivider} />
        <Count value={assets.length} label="SOURCES" tint="#C6E6D8" ink="#287954" />
      </View>

      <View style={styles.sectionHead}>
        <View><Text style={styles.eyebrow}>THE WHOLE PICTURE</Text><Text style={styles.sectionTitle}>Your health, connected.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="View the health history timeline" onPress={() => router.push('/(tabs)/health')} style={styles.textLink}><Text style={styles.textLinkText}>View timeline</Text><Arrow /></Pressable>
      </View>
      <View style={styles.domainGrid}>
        {domains.map((domain) => {
          const count = domain.label === 'Records' ? assets.length : domain.label === 'Treatment' ? treatments.length + visits.length : facts.filter((fact) => !fact.validUntil && domain.match.test(fact.category)).length + (domain.label === 'Cover' ? assets.filter((asset) => asset.purpose === 'insurance').length : 0);
          const selected = topics.some((topic) => domain.match.test(topic.label)) || count > 0;
          const filter = domain.label === 'Today' ? 'Vitals' : domain.label === 'History' ? 'History' : domain.label === 'Records' ? 'Documents' : 'Lifestyle';
          const openDomain = () => domain.label === 'Cover' ? router.push('/insurance') : domain.label === 'Treatment' ? router.push('/treatment') : router.push({ pathname: '/(tabs)/health', params: { filter } });
          return <TapScale key={domain.label} reducedMotion={reducedMotion} onPress={openDomain} label={domain.detail + ', ' + count + ' saved'} containerStyle={styles.domainCardWrap} style={[styles.domainCard, selected && styles.domainCardActive]}>
            <View style={styles.domainCardHead}><View style={[styles.domainMark, { backgroundColor: domain.tint }]}><View style={[styles.domainDotSmall, { backgroundColor: selected ? domain.ink : '#C8C5CE' }]} /></View><Text style={[styles.domainCount, selected && { color: domain.ink }]}>{String(count).padStart(2, '0')}</Text></View>
            <View style={styles.domainText}><Text numberOfLines={1} style={styles.domainTitle}>{domain.label}</Text><Text numberOfLines={2} style={styles.domainDetail}>{domain.detail}</Text></View>
          </TapScale>;
        })}
      </View>

      <View style={styles.sectionHeadRecent}><View><Text style={styles.eyebrow}>RECENTLY ADDED</Text><Text style={styles.sectionTitle}>Your record history.</Text></View><TapScale reducedMotion={reducedMotion} onPress={() => router.push('/(tabs)/health')} label="Open your full health timeline" style={styles.smallArrow}><Arrow /></TapScale></View>
      {recent.length ? <View style={styles.recentList}>{recent.map((item, index) => {
        const tone = recentTone(item.type);
        return <TapScale key={item.id} reducedMotion={reducedMotion} onPress={() => { const treatment = treatments.find((record) => record.id === item.id); const visit = visits.find((record) => record.id === item.id); router.push(treatment ? { pathname: '/treatment', params: { treatmentId: treatment.id } } : visit ? { pathname: '/visits', params: { visitId: visit.id } } : '/(tabs)/health'); }} label={'Open ' + item.title + ' in history'} style={[styles.recentCard, index > 0 && styles.recentCardNext]}>
        <View style={styles.recentDate}><Text style={styles.recentDateDay}>{parseHealthDate(item.date)?.getDate() ?? '—'}</Text><Text style={styles.recentDateMonth}>{formatDate(item.date).split(' ')[1]?.toUpperCase() ?? ''}</Text></View>
        <View style={[styles.recentNode, { backgroundColor: tone.node, borderColor: tone.line, shadowColor: tone.accent }]}><Text style={styles.recentNodeGlyph}>{item.icon}</Text></View>
        <View style={styles.recentText}><View style={styles.recentMeta}><Text style={[styles.recentType, { color: tone.accent }]}>{item.type.toUpperCase()}</Text><Text style={styles.recentMetaDot}>·</Text><Text style={styles.recentSource} numberOfLines={1}>{item.source}</Text></View><Text style={styles.recentTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.recentDetail} numberOfLines={1}>{item.detail}</Text></View>
      </TapScale>;
      })}</View> : <View style={styles.emptyRecord}><Text style={styles.emptyRecordTitle}>Your history starts with one detail.</Text><Text style={styles.emptyRecordBody}>Add a health record or a note when you’re ready. It will appear with its date and source.</Text><Pressable accessibilityRole="button" onPress={() => router.push('/intake')}><Text style={styles.emptyRecordLink}>Add a record  →</Text></Pressable></View>}

      {savedQuestions.length > 0 && <TapScale reducedMotion={reducedMotion} onPress={() => router.push('/ask')} label="Open your recent question" style={styles.questionCard}><Text style={styles.eyebrow}>YOUR RECENT QUESTION</Text><Text numberOfLines={2} style={styles.questionText}>{savedQuestions[0]}</Text><Text style={styles.questionLink}>Continue with Nura  →</Text></TapScale>}

      <View style={styles.sectionHeadRecent}><View><Text style={styles.eyebrow}>WHEN YOU’RE READY</Text><Text style={styles.sectionTitle}>A useful next step.</Text></View></View>
      <View style={styles.actions}>
        <TapScale reducedMotion={reducedMotion} onPress={() => router.push('/intake')} label="Add a medical record" style={styles.actionCard}>
          <View style={[styles.actionGlyphWrap, { backgroundColor: '#EAF1FD' }]}><Text style={[styles.actionGlyph, { color: '#1767D8' }]}>＋</Text></View><Text style={styles.actionTitle}>Add a record</Text><Text style={styles.actionSub}>PDF, photo or video</Text><Arrow />
        </TapScale>
        <TapScale reducedMotion={reducedMotion} onPress={() => router.push('/ask')} label="Ask Nura about your health" style={[styles.actionCard, styles.actionAsk]}>
          <View style={[styles.actionGlyphWrap, { backgroundColor: '#F0EAF5' }]}><Orb size={24} /></View><Text style={styles.actionTitle}>Ask Nura</Text><Text style={styles.actionSub}>Explore your saved context</Text><Arrow />
        </TapScale>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Open symptom support" onPress={() => router.push('/symptoms')} style={({ pressed }) => [styles.visitCallout, styles.symptomCallout, pressed && styles.pressed]}><View style={[styles.visitCalloutNode, styles.symptomNode]}><Text style={[styles.visitCalloutGlyph, styles.symptomGlyph]}>!</Text></View><View style={{ flex: 1 }}><Text style={styles.visitCalloutTitle}>Symptom support</Text><Text style={styles.visitCalloutBody}>Organize what you’re noticing and see safe next steps.</Text></View><Text style={[styles.visitCalloutArrow, styles.symptomArrow]}>→</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Prepare for a medical visit" onPress={() => router.push('/visits')} style={({ pressed }) => [styles.visitCallout, pressed && styles.pressed]}><View style={styles.visitCalloutNode}><Text style={styles.visitCalloutGlyph}>⌂</Text></View><View style={{ flex: 1 }}><Text style={styles.visitCalloutTitle}>Prepare for a visit</Text><Text style={styles.visitCalloutBody}>Choose the records and questions you want to bring.</Text></View><Text style={styles.visitCalloutArrow}>→</Text></Pressable>
      <Text style={styles.footerNote}>Nura organizes information you choose to add. Empty areas mean “not added yet,” not “no health concerns.”</Text>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 46, paddingBottom: 28, maxWidth: 540, width: '100%', alignSelf: 'center' },
  topbar: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, wordmark: { color: colors.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.7 }, tagline: { color: colors.quiet, fontSize: 8, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  profileButton: { width: 39, height: 39, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', ...shadow }, profileButtonText: { color: colors.violet, fontSize: 15, fontWeight: '600' }, pressed: { opacity: .9, transform: [{ scale: motion.pressScale }] },
  storageNotice: { padding: 12, borderRadius: 14, backgroundColor: '#FFF4E4', borderWidth: 1, borderColor: '#EBD5B4', marginBottom: 12 }, storageTitle: { color: '#7C541D', fontWeight: '700', fontSize: 12 }, storageBody: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  hero: { minHeight: 188, borderRadius: 24, overflow: 'hidden', backgroundColor: '#493452', padding: 18, borderWidth: 1, borderColor: '#E4E1E8', flexDirection: 'row', marginBottom: 14 },
  heroBloom: { position: 'absolute', right: -55, top: -75, width: 218, height: 218, borderRadius: 110, backgroundColor: '#EAB6A6', opacity: .24 },
  heroContent: { flex: 1, paddingRight: 74, zIndex: 1 }, heroKicker: { flexDirection: 'row', alignItems: 'center', gap: 7 }, heroDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F0C3A7' }, heroKickerText: { color: '#F2D8D0', fontSize: 9, fontWeight: '800', letterSpacing: 1.15 },
  heroTitle: { color: colors.cream, fontSize: 25, lineHeight: 29, fontWeight: '400', letterSpacing: -.8, marginTop: 11 }, heroBody: { color: 'rgba(255,248,240,.82)', fontSize: 12, lineHeight: 17, marginTop: 7, maxWidth: 245 },
  heroAction: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 9, marginTop: 10, borderRadius: 14, backgroundColor: colors.cream }, heroActionText: { color: colors.plum, fontSize: 11, fontWeight: '700' }, arrow: { color: colors.plum, fontSize: 16, lineHeight: 19 }, heroOrb: { position: 'absolute', right: 8, top: 39, width: 92, height: 92, alignItems: 'center', justifyContent: 'center' }, orbHalo: { position: 'absolute', height: 88, width: 88, borderRadius: 44, borderWidth: 1, borderColor: 'rgba(255,248,240,.38)', backgroundColor: 'rgba(255,248,240,.10)' },
  demoNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 11, borderRadius: 14, backgroundColor: '#F1EDF5', borderWidth: 1, borderColor: '#E4DCEB', marginBottom: 13 },
  demoIcon: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#DFD4EA', alignItems: 'center', justifyContent: 'center', marginTop: 1 }, demoIconText: { color: '#634C76', fontSize: 10, fontWeight: '700' }, demoCopy: { flex: 1 }, demoTitle: { color: '#4C3C5B', fontSize: 11, fontWeight: '700' }, demoBody: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2 }, resetLink: { color: '#1767D8', fontSize: 10, fontWeight: '700', marginTop: 4 }, resetConfirm: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 }, resetPrompt: { color: colors.ink, fontSize: 10, flex: 1 }, resetAction: { color: '#A44D48', fontSize: 10, fontWeight: '700' }, resetCancel: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  countStrip: { flexDirection: 'row', alignItems: 'center', borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingVertical: 11, marginBottom: 22, ...shadow }, countCell: { flex: 1, alignItems: 'center', gap: 2 }, countValue: { fontSize: 19, fontWeight: '500' }, countLabel: { color: colors.quiet, fontSize: 8, fontWeight: '700', letterSpacing: .45, textAlign: 'center' }, countRule: { height: 2, width: 19, borderRadius: 2, marginTop: 4 }, countDivider: { width: 1, height: 32, backgroundColor: colors.border },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }, eyebrow: { color: colors.violet, fontSize: 9, fontWeight: '800', letterSpacing: 1.25 }, sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '500', letterSpacing: -.35, marginTop: 4 }, textLink: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 2 }, textLinkText: { color: '#1767D8', fontSize: 10, fontWeight: '700' },
  domainGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginBottom: 23 }, domainCardWrap: { width: '48%' }, domainCard: { width: '100%', minWidth: 0, minHeight: 92, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between', gap: 8, ...shadow }, domainCardActive: { borderColor: '#D7D2DE', backgroundColor: colors.surface }, domainCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, domainMark: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, domainDotSmall: { width: 10, height: 10, borderRadius: 5 }, domainText: { minWidth: 0 }, domainTitle: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '700' }, domainDetail: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 3 }, domainCount: { color: '#777480', fontSize: 12, fontWeight: '700' },
  sectionHeadRecent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 2, marginBottom: 10 }, smallArrow: { width: 30, height: 30, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  recentList: { marginBottom: 20 }, recentCard: { minHeight: 73, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, ...shadow }, recentCardNext: { marginTop: 7 }, recentDate: { width: 30, alignItems: 'center' }, recentDateDay: { color: colors.ink, fontSize: 14, fontWeight: '600' }, recentDateMonth: { color: colors.quiet, fontSize: 8, fontWeight: '700', letterSpacing: .7, marginTop: 1 }, recentNode: { width: 35, height: 35, borderRadius: 18, backgroundColor: timelineColors.record.node, borderWidth: 1, borderColor: timelineColors.record.line, alignItems: 'center', justifyContent: 'center', shadowOpacity: .18, shadowRadius: 7, shadowOffset: { width: 0, height: 2 } }, recentNodeGlyph: { color: '#FFFFFF', fontSize: 16 }, recentText: { flex: 1 }, recentMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 }, recentType: { color: colors.violet, fontSize: 8, fontWeight: '800', letterSpacing: .7 }, recentMetaDot: { color: colors.quiet, fontSize: 9 }, recentSource: { color: colors.quiet, fontSize: 9, flex: 1 }, recentTitle: { color: colors.ink, fontSize: 12, fontWeight: '600', marginTop: 3 }, recentDetail: { color: colors.muted, fontSize: 10, marginTop: 2 },
  emptyRecord: { padding: 16, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 16 }, emptyRecordTitle: { color: colors.ink, fontSize: 13, fontWeight: '600' }, emptyRecordBody: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 5 }, emptyRecordLink: { color: '#1767D8', fontSize: 11, fontWeight: '700', marginTop: 9 },
  questionCard: { backgroundColor: colors.surface, padding: 14, borderRadius: 17, borderWidth: 1, borderColor: colors.border, marginBottom: 19 }, questionText: { color: colors.ink, fontSize: 12, lineHeight: 17, marginTop: 6 }, questionLink: { color: '#1767D8', fontSize: 10, fontWeight: '700', marginTop: 7 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 16 }, actionCard: { flex: 1, minHeight: 127, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, ...shadow }, actionAsk: { backgroundColor: '#F5F1F8' }, actionGlyphWrap: { width: 32, height: 32, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, actionGlyph: { fontSize: 20, fontWeight: '300' }, actionTitle: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 10 }, actionSub: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 3 }, footerNote: { color: colors.quiet, fontSize: 9, lineHeight: 14, textAlign: 'center', paddingHorizontal: 8, marginTop: 4 },
  visitCallout: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, borderRadius: 17, borderWidth: 1, borderColor: '#E6DCEB', backgroundColor: '#F4EEF6', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 }, visitCalloutNode: { width: 34, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7D8EB' }, visitCalloutGlyph: { color: '#735A83', fontSize: 18 }, visitCalloutTitle: { color: colors.ink, fontSize: 12, fontWeight: '700' }, visitCalloutBody: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 }, visitCalloutArrow: { color: '#735A83', fontSize: 19 }, symptomCallout: { backgroundColor: '#FFF7EA', borderColor: '#EADCC7' }, symptomNode: { backgroundColor: '#F3E4CC' }, symptomGlyph: { color: '#865B20', fontWeight: '800' }, symptomArrow: { color: '#865B20' },
});
