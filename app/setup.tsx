import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Orb } from '../src/components/Orb';
import { GlassMaterial } from '../src/components/GlassMaterial';
import { Atmosphere } from '../src/components/ambient/Atmosphere';
import { ProfileSetupProgress } from '../src/components/ProfileSetupProgress';
import { ageFromDateOfBirth } from '../src/services/profileDemographics.mjs';
import { documentDisplayName, documentOriginalName } from '../src/services/documentPresentation.mjs';
import { setupHealthFactReview } from '../src/services/setupReviewPresentation.mjs';
import { useNura } from '../src/state/NuraContext';
import { colors } from '../src/theme';

export default function ProfileSetupChecklist() {
  const { ready, name, birthday, country, topics, assets, intakeNotes, facts, treatments, setupProgress, resolveProfileSetupSection, finishProfileSetup } = useNura();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const hasMedicalInput = assets.some((asset) => asset.purpose !== 'insurance') || intakeNotes.length > 0;
  const hasPolicyInput = assets.some((asset) => asset.purpose === 'insurance');
  const pendingMedical = setupProgress.healthRecords !== 'saved' && setupProgress.healthRecords !== 'deferred' && hasMedicalInput;
  const pendingPolicy = setupProgress.insurance !== 'saved' && setupProgress.insurance !== 'deferred' && hasPolicyInput;
  const deferredMedical = setupProgress.healthRecords === 'deferred';
  const deferredPolicy = setupProgress.insurance === 'deferred';
  const isProfileMeasurement = (fact: (typeof facts)[number]) => fact.category.trim().toLowerCase() === 'biometrics' && /^(height|weight)$/i.test(fact.label.trim());
  const profileMeasurements = facts.filter((fact) => isProfileMeasurement(fact) && !fact.validUntil && fact.reviewState !== 'user_retracted');
  const healthFacts = facts.filter((fact) => !isProfileMeasurement(fact) && !/insurance|policy|coverage/i.test(`${fact.category} ${fact.label}`) && !fact.validUntil && fact.reviewState !== 'user_retracted');
  const reviewedMedicalFiles = assets.filter((asset) => asset.purpose !== 'insurance' && Boolean(asset.serverSourceId));
  const activeTreatments = treatments.filter((item) => !item.id.startsWith('demo-') && item.status === 'current');
  const currentPolicyTerms = facts.filter((fact) => !fact.validUntil && /insurance|policy|coverage/i.test(`${fact.category} ${fact.label}`));
  const resolved = (key: 'healthRecords' | 'medicines' | 'insurance') => setupProgress[key] !== 'pending';
  const allResolved = resolved('healthRecords') && resolved('medicines') && resolved('insurance') && !pendingMedical && !pendingPolicy;
  const stepCount = 3 + Number(resolved('healthRecords')) + Number(resolved('medicines')) + Number(resolved('insurance'));
  const age = useMemo(() => ageFromDateOfBirth(birthday), [birthday]);

  useEffect(() => {
    if (setupProgress.healthRecords === 'none' && hasMedicalInput) void resolveProfileSetupSection('healthRecords', 'pending');
    if (setupProgress.healthRecords === 'pending' && healthFacts.length && !hasMedicalInput) void resolveProfileSetupSection('healthRecords', 'saved');
    if (setupProgress.medicines === 'pending' && activeTreatments.length) void resolveProfileSetupSection('medicines', 'saved');
    if (setupProgress.medicines === 'none' && activeTreatments.length) void resolveProfileSetupSection('medicines', 'saved');
    if (setupProgress.insurance === 'pending' && currentPolicyTerms.length && !hasPolicyInput) void resolveProfileSetupSection('insurance', 'saved');
    if (setupProgress.insurance === 'none' && (currentPolicyTerms.length || hasPolicyInput)) void resolveProfileSetupSection('insurance', currentPolicyTerms.length ? 'saved' : 'pending');
  }, [activeTreatments.length, currentPolicyTerms.length, hasMedicalInput, hasPolicyInput, healthFacts.length, resolveProfileSetupSection, setupProgress.healthRecords, setupProgress.insurance, setupProgress.medicines]);

  async function chooseNone(section: 'healthRecords' | 'medicines' | 'insurance') {
    setError('');
    try { await resolveProfileSetupSection(section, 'none'); }
    catch { setError('This choice could not be saved on your device. Please try again.'); }
  }

  async function leaveForLater(section: 'healthRecords' | 'insurance') {
    setError('');
    try { await resolveProfileSetupSection(section, 'deferred'); }
    catch { setError('This source is still saved, but setup could not be updated. Please try again.'); }
  }

  async function complete() {
    if (!allResolved || saving) return;
    setSaving(true); setError('');
    try { await finishProfileSetup(); router.replace('/(tabs)/home'); }
    catch { setError('Your profile setup is still saved, but Nura could not finish the last step. Please retry.'); }
    finally { setSaving(false); }
  }

  function backToAreas() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  const mainAreas = topics.filter((topic) => !topic.id.includes('::'));
  const areaReview = mainAreas.map((area) => {
    const context = topics.filter((topic) => topic.id.startsWith(`${area.id}::`)).map((topic) => topic.label.replace(/^.*?·\s*/, ''));
    return { title: area.label, detail: context.length ? `Following · ${context.join(', ')}` : 'Following this area' };
  });
  const healthReview = [
    ...assets.filter((asset) => asset.purpose !== 'insurance').map((asset) => ({ title: documentDisplayName(asset, facts), detail: deferredMedical ? `Source saved · suggestions pending · ${documentOriginalName(asset)}` : `Original file · ${documentOriginalName(asset)}` })),
    ...healthFacts.map((fact) => setupHealthFactReview(fact)),
    ...(intakeNotes.length ? [{ title: `${intakeNotes.length} written note${intakeNotes.length === 1 ? '' : 's'}`, detail: 'Kept in your own words' }] : []),
  ];
  const medicineReview = activeTreatments.map((item) => ({ title: item.name, detail: [item.dose, item.schedule].filter(Boolean).join(' · ') || 'Dose or timing not recorded' }));
  const insuranceReview = currentPolicyTerms.map((fact) => ({ title: fact.label, detail: [fact.value, fact.date].filter(Boolean).join(' · ') }));

  const nextAction = pendingMedical || !resolved('healthRecords')
    ? { label: 'Continue to health records', onPress: () => pendingMedical ? router.push({ pathname: '/review', params: { purpose: 'medical', firstRun: 'true' } }) : router.push({ pathname: '/intake', params: { firstRun: 'true' } }) }
    : !resolved('medicines')
      ? { label: 'Continue to medicines', onPress: () => router.push({ pathname: '/treatment', params: { firstRun: 'true' } }) }
      : pendingPolicy || !resolved('insurance')
        ? { label: 'Continue to insurance', onPress: () => pendingPolicy ? router.push({ pathname: '/review', params: { purpose: 'insurance', firstRun: 'true' } }) : router.push({ pathname: '/insurance', params: { firstRun: 'true' } }) }
        : { label: 'Review your profile', onPress: () => scrollRef.current?.scrollToEnd({ animated: true }) };

  const section = (number: string, title: string, done: boolean, description: string, actionLabel: string, onAction: () => void, noneLabel?: string, onNone?: () => void, noneDisabled = false, doneLabel = 'READY', doneActionLabel = 'REVIEW OR CHANGE', deferLabel?: string, onDefer?: () => void) => {
    const isDeferred = number === '03' ? deferredMedical : number === '05' ? deferredPolicy : false;
    const accent = number === '04'
      ? { line: 'rgba(157,211,183,.72)', badge: 'rgba(105,163,131,.22)', label: '#BFE3CE' }
      : number === '05'
        ? { line: 'rgba(224,177,151,.74)', badge: 'rgba(180,125,99,.22)', label: '#F0CDB8' }
        : { line: 'rgba(157,198,221,.76)', badge: 'rgba(92,145,177,.24)', label: '#C6E4F2' };
    return (
      <View style={[s.section, { borderColor: done ? 'rgba(143,216,180,.40)' : 'rgba(255,248,240,.24)', borderLeftColor: done ? 'rgba(143,216,180,.78)' : accent.line, backgroundColor: done ? 'rgba(47,91,77,.18)' : 'rgba(38,29,34,.28)' }]} key={number}>
        <GlassMaterial tone="dark" radius={18} intensity={34} />
        <View style={s.sectionTop}><View style={[s.number, { backgroundColor: done ? 'rgba(143,216,180,.26)' : accent.badge, borderColor: done ? 'rgba(178,226,197,.60)' : accent.line }]}><Text style={[s.numberText, done && s.numberTextDone]}>{done ? '✓' : number}</Text></View><View style={{ flex: 1 }}><Text style={s.sectionTitle}>{title}</Text><Text style={s.sectionBody}>{description}</Text></View><Text style={[s.status, { color: done ? '#C7F0D5' : accent.label }]}>{done ? doneLabel : 'TO DO'}</Text></View>
        <View style={s.sectionActions}>{done ? <Pressable accessibilityRole="button" accessibilityLabel={isDeferred ? `Review pending ${title.toLowerCase()}` : `Review or change ${title.toLowerCase()}`} accessibilityHint="Opens this section so you can review or change it." onPress={onAction} style={s.reviewAction}><Text style={[s.reviewActionText, { color: accent.label }]}>{doneActionLabel}  →</Text></Pressable> : <><Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={s.action}><Text style={s.actionText}>{actionLabel}</Text><Text style={[s.actionArrow, { color: accent.label }]}>→</Text></Pressable>{noneLabel && onNone ? <Pressable accessibilityRole="button" disabled={noneDisabled} onPress={onNone} style={[s.noneAction, noneDisabled && s.disabled]}><Text style={s.noneActionText}>{noneLabel}</Text></Pressable> : null}{deferLabel && onDefer ? <Pressable accessibilityRole="button" accessibilityLabel={deferLabel} accessibilityHint="Keeps this source for later without adding unapproved details to your profile." onPress={onDefer} style={s.deferAction}><Text style={s.deferActionText}>{deferLabel}</Text></Pressable> : null}{noneDisabled ? <Text style={s.reviewHint}>Review the saved files before marking this section complete.</Text> : null}</>}</View>
      </View>
    );
  };

  if (!ready) return <View style={s.loading}><ActivityIndicator color={colors.violet} /></View>;
  return <View style={s.page}>
    <Atmosphere />
    <StatusBar style="light" />
    <ScrollView ref={scrollRef} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.brandRow}><Orb size={34} /><View style={{ flex: 1 }}><Text style={s.brand}>nura</Text><Text style={s.tagline}>YOUR HEALTH, IN CONTEXT</Text></View></View>
      <ProfileSetupProgress step={stepCount} />
      <View style={s.glass}><GlassMaterial tone="dark" radius={22} intensity={32} /><Text style={s.eyebrow}>PROFILE SETUP</Text><Text style={s.title}>Let’s bring your profile together.</Text><Text style={s.intro}>Add what applies: health records, medicines and insurance.</Text></View>
      <View style={s.stepRail}><Text style={s.railLabel}>01 · YOUR DETAILS</Text><Text style={s.railDone}>{name.trim() ? `${name.trim()} · ${country || 'Country saved'} · ${age === null ? 'DOB needed' : `${age} years`}` : 'Details not saved yet'}</Text><Text style={s.railLabel}>02 · AREAS YOU FOLLOW</Text><Text style={s.railDone}>{topics.length ? topics.map((topic) => topic.label).join(' · ') : 'You chose no areas to follow'}</Text></View>
      <Text style={s.groupTitle}>YOUR REGISTRIES · NEXT</Text>
      {section('03', 'Health records', resolved('healthRecords'), deferredMedical ? 'Source suggestions remain for later · not added to your profile' : setupProgress.healthRecords === 'none' ? 'No records added' : pendingMedical ? 'Files ready to review' : healthFacts.length ? `${healthFacts.length} details reviewed${reviewedMedicalFiles.length ? ` · ${reviewedMedicalFiles.length} file${reviewedMedicalFiles.length === 1 ? '' : 's'}` : ''}` : 'Add a report, photo or note', pendingMedical ? 'Review health records' : deferredMedical ? 'Review pending suggestions' : 'Add a report or photo', () => pendingMedical || deferredMedical ? router.push({ pathname: '/review', params: { purpose: 'medical', firstRun: 'true' } }) : router.push({ pathname: '/intake', params: { firstRun: 'true' } }), hasMedicalInput ? undefined : 'No records to add', hasMedicalInput ? undefined : () => void chooseNone('healthRecords'), false, deferredMedical ? 'LEFT FOR LATER' : setupProgress.healthRecords === 'none' ? 'NONE ADDED' : 'REVIEWED', deferredMedical ? 'REVIEW PENDING' : 'REVIEW OR CHANGE', pendingMedical ? 'Leave files for later' : undefined, pendingMedical ? () => void leaveForLater('healthRecords') : undefined)}
      {section('04', 'Medicines', resolved('medicines'), setupProgress.medicines === 'none' ? 'No current medicines' : activeTreatments.length ? `${activeTreatments.length} current medicine${activeTreatments.length === 1 ? '' : 's'}` : 'Add medicines you take now', 'Add or review medicines', () => router.push({ pathname: '/treatment', params: { firstRun: 'true' } }), activeTreatments.length ? undefined : 'I take no medicines', activeTreatments.length ? undefined : () => void chooseNone('medicines'), false, setupProgress.medicines === 'none' ? 'NONE' : 'SAVED')}
      {section('05', 'Insurance', resolved('insurance'), deferredPolicy ? 'Policy source saved for later · terms not added to your profile' : setupProgress.insurance === 'none' ? 'No policy added' : pendingPolicy ? 'Policy ready to review' : currentPolicyTerms.length ? `${currentPolicyTerms.length} terms reviewed` : 'Add a policy or benefits summary', pendingPolicy ? 'Review insurance' : deferredPolicy ? 'Review pending policy' : 'Add or review insurance', () => pendingPolicy || deferredPolicy ? router.push({ pathname: '/review', params: { purpose: 'insurance', firstRun: 'true' } }) : router.push({ pathname: '/insurance', params: { firstRun: 'true' } }), currentPolicyTerms.length || hasPolicyInput ? undefined : 'I have no policy to add', currentPolicyTerms.length || hasPolicyInput ? undefined : () => void chooseNone('insurance'), false, deferredPolicy ? 'LEFT FOR LATER' : setupProgress.insurance === 'none' ? 'NONE' : 'REVIEWED', deferredPolicy ? 'REVIEW PENDING' : 'REVIEW OR CHANGE', pendingPolicy ? 'Leave policy file for later' : undefined, pendingPolicy ? () => void leaveForLater('insurance') : undefined)}
      {allResolved ? <>
      <Text style={s.groupTitle}>06 · FINAL PROFILE REVIEW</Text>
      <View style={[s.finalCard, s.finalCardReady]}><GlassMaterial tone="dark" radius={20} intensity={30} /><Text style={s.finalTitle}>Review your profile</Text>
        <View style={s.reviewGroups}>
          <ReviewGroup title="YOUR DETAILS" items={[{ title: name.trim() || 'Name not set', detail: `${country || 'Country not set'} · ${age === null ? 'Date of birth needed' : `${age} years old`}` }, ...profileMeasurements.map((fact) => ({ title: fact.label, detail: `${fact.value} · Self-reported` }))]} empty="Required details are missing." />
          <ReviewGroup title="AREAS AND CONTEXT" items={areaReview} empty="You chose not to follow a health area now." />
          <ReviewGroup title="HEALTH RECORDS" items={deferredMedical ? [...healthReview, { title: 'Pending source review', detail: 'Unreviewed suggestions stay attached to their files and are not part of your profile.' }] : healthReview} empty={setupProgress.healthRecords === 'none' ? 'No records added.' : 'No reviewed records.'} />
          <ReviewGroup title="MEDICINES" items={medicineReview} empty={setupProgress.medicines === 'none' ? 'No current medicines.' : 'No current medicine records.'} />
          <ReviewGroup title="INSURANCE" items={deferredPolicy ? [...insuranceReview, { title: 'Pending policy review', detail: 'No policy terms were added to your profile. Review the saved file when you are ready.' }] : insuranceReview} empty={setupProgress.insurance === 'none' ? 'No policy added.' : 'No accepted policy terms.'} />
        </View>
        <Pressable accessibilityRole="button" accessibilityHint="Completes setup and opens Home." disabled={saving} onPress={() => void complete()} style={[s.finish, saving && s.disabled]}><Text style={s.finishText}>{saving ? 'SAVING…' : 'FINISH SETUP · OPEN HOME  →'}</Text></Pressable>
      </View>
      </> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    </ScrollView>
    <View style={s.stickyFooter}><View style={s.footerTop}><Pressable accessibilityRole="button" accessibilityLabel="Back to health areas" onPress={backToAreas} style={s.footerBack}><Text style={s.footerBackText}>‹  BACK TO HEALTH AREAS</Text></Pressable><Text style={s.nextStepLabel}>{allResolved ? 'FINAL STEP' : 'NEXT STEP'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={nextAction.label} onPress={nextAction.onPress} style={s.nextAction}><GlassMaterial tone="light" radius={18} intensity={14} /><Text style={s.nextActionText}>{nextAction.label}</Text><Text style={s.nextActionArrow}>→</Text></Pressable></View>
  </View>;
}

function ReviewGroup({ title, items, empty }: { title: string; items: { title: string; detail: string; notice?: string }[]; empty: string }) {
  return <View style={s.reviewGroup}><Text style={s.reviewGroupTitle}>{title}</Text>{items.length ? items.map((item, index) => <View key={`${title}:${item.title}:${index}`} style={s.reviewRow}><Text style={s.reviewRowTitle}>{item.title}</Text><Text style={s.reviewRowDetail}>{item.detail}</Text>{item.notice ? <Text style={s.reviewRowNotice}>{item.notice}</Text> : null}</View>) : <Text style={s.reviewEmpty}>{empty}</Text>}</View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#211A17' }, content: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: 21, paddingTop: 42, paddingBottom: 150 }, glow: { ...StyleSheet.absoluteFill, opacity: 0.48 }, loading: { flex: 1, backgroundColor: '#211A17', alignItems: 'center', justifyContent: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 19 }, brand: { color: colors.cream, fontSize: 20, fontWeight: '700' }, tagline: { color: 'rgba(255,248,240,.7)', fontSize: 8, letterSpacing: 1.5, marginTop: 3 }, progress: { color: colors.cream, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }, glass: { position: 'relative', overflow: 'hidden', padding: 18, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,.28)', backgroundColor: 'rgba(83,55,42,.28)' }, eyebrow: { color: '#F2BD9D', fontSize: 9, fontWeight: '800', letterSpacing: 1.3 }, title: { color: colors.cream, fontSize: 25, lineHeight: 31, fontWeight: '600', marginTop: 8 }, intro: { color: 'rgba(255,248,240,.82)', fontSize: 13, lineHeight: 20, marginTop: 8 },
  stepRail: { marginTop: 15, marginBottom: 22, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.19)', backgroundColor: 'rgba(255,255,255,.10)' }, railLabel: { color: '#F2BD9D', fontSize: 9, fontWeight: '800', letterSpacing: 1.1 }, railDone: { color: colors.cream, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 12 }, groupTitle: { color: '#F2BD9D', fontSize: 9, fontWeight: '800', letterSpacing: 1.3, marginBottom: 9, marginTop: 6 },
  section: { position: 'relative', overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderLeftWidth: 2, padding: 14, marginBottom: 10 }, sectionTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, number: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(198,174,229,.32)', borderWidth: 1, borderColor: 'rgba(255,255,255,.42)' }, numberDone: { backgroundColor: 'rgba(143,216,180,.32)', borderColor: 'rgba(178,226,197,.65)' }, numberText: { color: colors.cream, fontSize: 10, fontWeight: '800' }, numberTextDone: { color: '#C7F0D5' }, sectionTitle: { color: colors.cream, fontSize: 15, fontWeight: '700' }, sectionBody: { color: 'rgba(255,248,240,.86)', fontSize: 11, lineHeight: 16, marginTop: 3 }, status: { color: '#F4C2A4', fontSize: 8, fontWeight: '800', letterSpacing: .8, marginTop: 4 }, statusDone: { color: '#C7F0D5' }, sectionActions: { marginLeft: 37, marginTop: 11, gap: 9 }, action: { minHeight: 42, borderRadius: 13, justifyContent: 'space-between', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,248,240,.09)', borderWidth: 1, borderColor: 'rgba(255,248,240,.30)' }, actionText: { color: colors.cream, fontSize: 11, fontWeight: '700', letterSpacing: .2 }, actionArrow: { fontSize: 18, fontWeight: '700', marginLeft: 8 }, reviewAction: { minHeight: 39, justifyContent: 'center', paddingHorizontal: 4 }, reviewActionText: { color: '#D5F1FF', fontSize: 9, fontWeight: '900', letterSpacing: .8 }, noneAction: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 4, alignSelf: 'flex-start' }, noneActionText: { color: 'rgba(255,248,240,.86)', fontSize: 10, textDecorationLine: 'underline' }, deferAction: { minHeight: 42, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(242,189,157,.46)', backgroundColor: 'rgba(242,189,157,.10)' }, deferActionText: { color: '#F4C2A4', fontSize: 10, fontWeight: '700' }, disabled: { opacity: .45 },
  nextStepLabel: { color: '#F3C4A7', fontSize: 8, fontWeight: '800', letterSpacing: 1.05, marginBottom: 6, marginLeft: 4 },
  finalCard: { position: 'relative', overflow: 'hidden', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.35)', backgroundColor: 'rgba(66,43,35,.32)' }, finalCardReady: { borderColor: 'rgba(242,189,157,.62)', backgroundColor: 'rgba(112,64,47,.40)' }, finalTitle: { color: colors.cream, fontSize: 15, fontWeight: '700' }, reviewGroups: { gap: 10, marginTop: 15 }, reviewGroup: { padding: 11, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,.28)', backgroundColor: 'rgba(255,248,240,.12)' }, reviewGroupTitle: { color: '#F3C4A7', fontSize: 9, fontWeight: '900', letterSpacing: .95, marginBottom: 7 }, reviewRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.14)' }, reviewRowTitle: { color: colors.cream, fontSize: 11, fontWeight: '700' }, reviewRowDetail: { color: 'rgba(255,248,240,.80)', fontSize: 10, lineHeight: 14, marginTop: 2 }, reviewRowNotice: { color: '#F0CDB8', fontSize: 9, lineHeight: 13, fontWeight: '800', marginTop: 4 }, reviewEmpty: { color: 'rgba(255,248,240,.72)', fontSize: 10, lineHeight: 15 }, finish: { minHeight: 49, justifyContent: 'center', alignItems: 'center', marginTop: 14, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,.78)', backgroundColor: 'rgba(255,248,240,.94)' }, finishText: { color: '#382742', fontSize: 10, fontWeight: '900', letterSpacing: .65 }, error: { color: '#FFD8CF', fontSize: 12, lineHeight: 18, marginTop: 10 }, reviewHint: { color: '#F7DCC8', fontSize: 10, lineHeight: 14, marginTop: 1 }, stickyFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 21, paddingTop: 8, paddingBottom: 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.34)', backgroundColor: 'rgba(43,32,35,.86)' }, footerTop: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }, footerBack: { paddingVertical: 4, paddingRight: 10 }, footerBackText: { color: '#D5EEFF', fontSize: 8, fontWeight: '900', letterSpacing: .8 }, nextAction: { position: 'relative', overflow: 'hidden', minHeight: 51, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.94)', backgroundColor: 'rgba(255,248,240,.97)', paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, nextActionText: { color: '#382742', fontSize: 12, fontWeight: '800', letterSpacing: .35 }, nextActionArrow: { color: colors.cobalt, fontSize: 21, fontWeight: '700' },
});
