import React, { useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Asset } from 'expo-asset';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { AccessibilityInfo, ActivityIndicator, Alert, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Orb } from '../src/components/Orb';
import { Atmosphere } from '../src/components/ambient/Atmosphere';
import { GlassMaterial } from '../src/components/GlassMaterial';
import { ProfileSetupProgress } from '../src/components/ProfileSetupProgress';
import { Label, Surface } from '../src/components/Surface';
import { useNura, IntakeAsset } from '../src/state/NuraContext';
import { colors, radius } from '../src/theme';
import { resolveStagedIntakeMediaType, stagedIntakeKind } from '../src/services/audioIntakePresentation.mjs';
import { DOCUMENT_PICKER_MIME_TYPES, MEDICAL_DOCUMENT_PICKER_MIME_TYPES } from '../src/services/intakeFileTypes.mjs';
import { isReviewableIntakeAsset } from '../src/services/reviewableIntakeAsset.mjs';
import { getHealthAreaContext } from '../src/services/healthAreaContext.mjs';
import { documentDisplayName, documentOriginalName } from '../src/services/documentPresentation.mjs';
function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
const SAMPLE_REPORT_NAME = 'PL0005-sample-lipid-profile.pdf';
const SAMPLE_FOLLOW_UP_NAME = 'EXAMPLE-lipid-follow-up.pdf';
const SAMPLE_REPORT_SET = [
  { name: SAMPLE_REPORT_NAME, fixtureId: 'lipid-panel-jan-2025', module: require('../assets/samples/PL0005-sample-lipid-profile.pdf'), size: 62447 },
  { name: SAMPLE_FOLLOW_UP_NAME, fixtureId: 'lipid-panel-apr-2025', module: require('../assets/samples/EXAMPLE-lipid-follow-up.pdf'), size: 2859 },
] as const;
const SAMPLE_POLICY = {
  name: 'Nura-Example-Policy-2025.pdf',
  fixtureId: 'insurance-sample-standard-2025',
  module: require('../assets/samples/Nura-Example-Policy-2025.pdf'),
  size: 1465,
} as const;
const SAMPLE_INDEPENDENT_POLICY = {
  name: 'Nura-Independent-Policy-2024.pdf',
  fixtureId: 'insurance-independent-sample-2024',
  module: require('../assets/samples/Nura-Independent-Policy-2024.pdf'),
  size: 3397,
} as const;
// Sample records are opt-in, including during local development. This keeps a
// fresh personal-data preview free of fictional intake shortcuts by default.
const SAMPLE_PREVIEW_ENABLED = process.env.EXPO_PUBLIC_SAMPLE_PREVIEW === 'true';
export default function Intake() {
  const params = useLocalSearchParams<{ purpose?: string; firstRun?: string; areaId?: string; capture?: string; captureDetail?: string }>();
  const purpose: 'medical' | 'insurance' = params.purpose === 'insurance' ? 'insurance' : 'medical';
  const firstRun = params.firstRun === 'true';
  const areaContext = purpose === 'medical' ? getHealthAreaContext(typeof params.areaId === 'string' ? params.areaId : '') : null;
  const captureKind = typeof params.capture === 'string' ? params.capture : '';
  const captureDetail = typeof params.captureDetail === 'string' ? params.captureDetail.trim() : '';
  const captureGuidance = captureKind === 'family-history'
    ? { title: 'FAMILY HISTORY · YOUR WORDS', prompt: `You selected ${captureDetail || 'a relative and condition'}. Add what you know, such as the condition and approximate age when it began. Leave uncertain details blank. This stays family-history context; it does not add a diagnosis to your own record.` }
    : captureKind === 'symptom'
      ? { title: 'SYMPTOM DETAILS · YOUR WORDS', prompt: `${captureDetail ? `You selected ${captureDetail}. ` : ''}If you know, describe when it started, how often it happens, how it affects you, and anything that seems to bring it on. Leave uncertain details blank.` }
      : captureKind === 'food-routine'
        ? { title: 'FOOD AND ROUTINES · YOUR WORDS', prompt: 'Describe your usual eating pattern or routine, what has changed, and the question you want to understand. Add only what you know; this is not a diet assessment.' }
        : captureKind === 'routine'
          ? { title: 'ROUTINE DETAILS · YOUR WORDS', prompt: 'Describe the change, when it began, how often it happens, and how it affects your day. Leave anything uncertain blank.' }
          : captureKind === 'condition'
            ? { title: 'CONDITION DETAILS · YOUR WORDS', prompt: 'Name the condition if you know it, whether it is current or part of your past history, and when it was diagnosed. Leave uncertain details blank.' }
            : { title: 'HEALTH CONTEXT · YOUR WORDS', prompt: 'Add the details you know, what changed, and what you would like Nura to understand. Leave anything uncertain blank.' };
  const { assets, topics, facts, intakeNotes, addAssets, saveIntakeNote, resolveProfileSetupSection } = useNura();
  const mainTopics = useMemo(() => topics.filter((topic) => !topic.id.includes('::')), [topics]);
  const purposeAssets = assets.filter((asset) => (asset.purpose ?? 'medical') === purpose && isReviewableIntakeAsset(asset, purpose));
  const sampleReportCount = purposeAssets.filter((asset) => SAMPLE_REPORT_SET.some((report) => report.fixtureId === asset.localSampleFixtureId)).length;
  const sampleReportSetComplete = sampleReportCount === SAMPLE_REPORT_SET.length;
  const samplePolicyAdded = purposeAssets.some((asset) => asset.localSampleFixtureId === SAMPLE_POLICY.fixtureId);
  const independentSamplePolicyAdded = purposeAssets.some((asset) => asset.localSampleFixtureId === SAMPLE_INDEPENDENT_POLICY.fixtureId);
  const [addingSampleSet, setAddingSampleSet] = useState(false);
  const [addingSamplePolicy, setAddingSamplePolicy] = useState(false);
  const [addingIndependentSamplePolicy, setAddingIndependentSamplePolicy] = useState(false);
  const pendingMedicalNote = useMemo(() => intakeNotes[0], [intakeNotes]);
  const [showSelfReport, setShowSelfReport] = useState(Boolean(captureKind));
  const [selfReportOverride, setSelfReportOverride] = useState<string | undefined>();
  const [selfReportTopicOverride, setSelfReportTopicOverride] = useState<string | undefined>();
  const selfReport = selfReportOverride ?? pendingMedicalNote?.text ?? '';
  const selfReportTopicId = selfReportTopicOverride ?? areaContext?.id ?? pendingMedicalNote?.topicId ?? '';
  const [continuing, setContinuing] = useState(false);
  const [intakeError, setIntakeError] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  const accept = (name: string, uri: string, mimeType?: string, size?: number, localSampleFixtureId?: IntakeAsset['localSampleFixtureId']): Omit<IntakeAsset, 'addedAt'> => { const normalizedType = resolveStagedIntakeMediaType({ name, mimeType }); return { id: makeId(), name, uri, mimeType: normalizedType || mimeType, size, purpose, ...(areaContext ? { healthAreaId: areaContext.id } : {}), ...(localSampleFixtureId ? { localSampleFixtureId } : {}), kind: stagedIntakeKind(normalizedType) }; };
  async function stageFiles(files: Omit<IntakeAsset, 'addedAt'>[]) {
    if (!files.length) return;
    await addAssets(files);
    if (firstRun) await resolveProfileSetupSection(purpose === 'insurance' ? 'insurance' : 'healthRecords', 'pending');
  }
  async function chooseFiles() {
    try { const types = purpose === 'insurance' ? [...DOCUMENT_PICKER_MIME_TYPES] : [...MEDICAL_DOCUMENT_PICKER_MIME_TYPES]; const result = await DocumentPicker.getDocumentAsync({ type: types, multiple: true, copyToCacheDirectory: true }); if (!result.canceled) await stageFiles(result.assets.map((asset) => accept(asset.name, asset.uri, asset.mimeType, asset.size))); } catch { Alert.alert('Could not open files', 'Try choosing the file again.'); }
  }
  async function choosePhotos() {
    try { const mediaTypes = purpose === 'insurance' ? ['images'] as const : ['images', 'videos'] as const; const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [...mediaTypes], allowsMultipleSelection: true, quality: 0.9 }); if (!result.canceled) await stageFiles(result.assets.map((asset) => accept(asset.fileName ?? (asset.type === 'video' ? (Platform.OS === 'ios' ? 'health-video.mov' : 'health-video.mp4') : purpose === 'insurance' ? 'Policy photo' : 'Health photo'), asset.uri, asset.mimeType ?? (asset.type === 'video' ? (Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4') : 'image/*'), asset.fileSize))); } catch { Alert.alert('Could not open photos', 'Try choosing them again.'); }
  }
  async function takePhoto() {
    try { const permission = await ImagePicker.requestCameraPermissionsAsync(); if (!permission.granted) { Alert.alert('Camera permission needed', purpose === 'insurance' ? 'Allow camera access when you want to photograph a policy page.' : 'Allow camera access when you want to photograph a health document.'); return; } const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 }); if (!result.canceled) await stageFiles(result.assets.map((asset) => accept(asset.fileName ?? (purpose === 'insurance' ? 'Photographed policy document' : 'Photographed health document'), asset.uri, asset.mimeType ?? 'image/*', asset.fileSize))); } catch { Alert.alert('Could not open camera', 'Try choosing a photo instead.'); }
  }
  async function addSampleReportSet() {
    if (addingSampleSet) return;
    const alreadyAdded = new Set(purposeAssets.map((asset) => asset.localSampleFixtureId).filter(Boolean));
    const missing = SAMPLE_REPORT_SET.filter((report) => !alreadyAdded.has(report.fixtureId));
    if (!missing.length) return;
    setAddingSampleSet(true);
    try {
      const loaded = await Asset.loadAsync(missing.map((report) => report.module));
      const staged = missing.map((report, index) => {
        const asset = loaded[index];
        const uri = Platform.OS === 'web' ? asset?.uri : asset?.localUri ?? asset?.uri;
        if (!uri) throw new Error('A sample report could not be opened.');
        return accept(report.name, uri, 'application/pdf', report.size, report.fixtureId);
      });
      await stageFiles(staged);
    } catch (error) {
      Alert.alert('Sample reports unavailable', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setAddingSampleSet(false);
    }
  }
  async function addSamplePolicy() {
    if (addingSamplePolicy || samplePolicyAdded) return;
    setAddingSamplePolicy(true);
    try {
      const [asset] = await Asset.loadAsync(SAMPLE_POLICY.module);
      const uri = Platform.OS === 'web' ? asset?.uri : asset?.localUri ?? asset?.uri;
      if (!uri) throw new Error('The sample policy could not be opened.');
      await stageFiles([accept(SAMPLE_POLICY.name, uri, 'application/pdf', SAMPLE_POLICY.size, SAMPLE_POLICY.fixtureId)]);
    } catch (error) {
      Alert.alert('Sample policy unavailable', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setAddingSamplePolicy(false);
    }
  }
  async function addIndependentSamplePolicy() {
    if (addingIndependentSamplePolicy || independentSamplePolicyAdded) return;
    setAddingIndependentSamplePolicy(true);
    try {
      const [asset] = await Asset.loadAsync(SAMPLE_INDEPENDENT_POLICY.module);
      const uri = Platform.OS === 'web' ? asset?.uri : asset?.localUri ?? asset?.uri;
      if (!uri) throw new Error('The independent sample policy could not be opened.');
      await stageFiles([accept(SAMPLE_INDEPENDENT_POLICY.name, uri, 'application/pdf', SAMPLE_INDEPENDENT_POLICY.size, SAMPLE_INDEPENDENT_POLICY.fixtureId)]);
    } catch (error) {
      Alert.alert('Sample policy unavailable', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setAddingIndependentSamplePolicy(false);
    }
  }
  async function continueToReview() {
    if (continuing) return;
    setContinuing(true); setIntakeError('');
    try {
      if (purpose === 'medical' && selfReport.trim()) {
        const topic = topics.find((item) => item.id === selfReportTopicId);
        await saveIntakeNote({ id: pendingMedicalNote?.id, text: selfReport, topicId: topic?.id, topicLabel: topic?.label });
        if (firstRun) await resolveProfileSetupSection('healthRecords', 'pending');
      }
      const hasFiles = purposeAssets.length > 0;
      const hasNote = purpose === 'medical' && (Boolean(selfReport.trim()) || intakeNotes.length > 0);
      if (hasFiles || hasNote) router.push({ pathname: '/review', params: { purpose, ...(firstRun ? { firstRun: 'true' } : {}), ...(areaContext ? { areaId: areaContext.id } : {}) } });
      else if (firstRun) { await resolveProfileSetupSection(purpose === 'insurance' ? 'insurance' : 'healthRecords', 'none'); router.replace('/setup'); }
      else router.replace(purpose === 'insurance' ? '/insurance' : '/(tabs)/home');
    } catch (error) {
      setIntakeError(error instanceof Error ? error.message : 'Your intake could not be saved. Please try again.');
    } finally {
      setContinuing(false);
    }
  }
  return <View style={styles.page}><Atmosphere /><StatusBar style="light" /><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>‹  Back</Text></Pressable>{firstRun ? <ProfileSetupProgress step={purpose === 'insurance' ? 5 : 3} /> : null}<View style={styles.heading}><Orb size={42} state="idle" /><View style={{ flex: 1 }}><Label style={styles.pageLabel}>{purpose === 'insurance' ? 'YOUR INSURANCE REGISTRY' : 'YOUR MEDICAL REGISTRY'}</Label><Text style={styles.title}>{purpose === 'insurance' ? 'Add a policy document.' : 'Add what you have.'}</Text></View></View>
    <Text style={styles.body}>{purpose === 'insurance' ? 'Choose a policy document. Nura will show its terms for your review.' : 'Choose a report, photo or short video to review. Audio recordings can be stored here, but aren’t reviewed yet.'}</Text>
    {areaContext ? <Surface tone="dark" style={styles.areaContextCard}><Text style={styles.areaContextEyebrow}>FILE UNDER</Text><Text style={styles.areaContextTitle}>{areaContext.label}</Text><Text style={styles.areaContextBody}>This keeps the record with the health area you selected.</Text></Surface> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={purpose === 'insurance' ? 'Take a photo of a policy document' : 'Take a photo of a health document'} accessibilityHint="Opens the camera so you can capture a page." style={styles.option} onPress={takePhoto}><GlassMaterial tone="dark" radius={radius.md} intensity={28} /><Text style={styles.optionIcon}>◎</Text><View style={styles.optionCopy}><Text style={styles.optionTitle}>Take a photo</Text><Text style={styles.optionSub}>Hold it flat, in good light</Text></View><Text style={styles.chevron}>›</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose files" accessibilityHint={purpose === 'insurance' ? 'Select policy PDFs, Word documents, RTF or OpenDocument files, or images.' : 'Select health documents, images, short videos or audio recordings. Audio stays on this device and is not reviewed yet.'} style={styles.option} onPress={chooseFiles}><GlassMaterial tone="dark" radius={radius.md} intensity={28} /><Text style={styles.optionIcon}>⌑</Text><View style={styles.optionCopy}><Text style={styles.optionTitle}>Choose files</Text><Text style={styles.optionSub}>{purpose === 'insurance' ? 'Documents or images' : 'Documents, photos, videos or audio (stored locally)'}</Text></View><Text style={styles.chevron}>›</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={purpose === 'insurance' ? 'Choose policy photos' : 'Choose photos or videos'} accessibilityHint={purpose === 'insurance' ? 'Select policy pages or images.' : 'Select several pages or a video up to 3 minutes.'} style={styles.option} onPress={choosePhotos}><GlassMaterial tone="dark" radius={radius.md} intensity={28} /><Text style={styles.optionIcon}>▧</Text><View style={styles.optionCopy}><Text style={styles.optionTitle}>{purpose === 'insurance' ? 'Choose photos' : 'Choose photos or videos'}</Text><Text style={styles.optionSub}>{purpose === 'insurance' ? 'Select policy pages or images' : 'Select pages or a video up to 3 minutes'}</Text></View><Text style={styles.chevron}>›</Text></Pressable>
    {purpose === 'medical' && SAMPLE_PREVIEW_ENABLED && <Pressable accessibilityRole="button" accessibilityLabel={sampleReportSetComplete ? 'Review sample report comparison' : sampleReportCount ? 'Add the remaining sample report' : 'Preview two sample reports'} accessibilityHint={sampleReportSetComplete ? 'Opens two fictional lipid reports from January and April 2025.' : 'Adds two fictional lipid reports from January and April 2025 for review.'} accessibilityState={{ disabled: addingSampleSet, busy: addingSampleSet }} disabled={addingSampleSet} style={[styles.sample, { minHeight: 84 }, addingSampleSet && styles.sampleDisabled]} onPress={() => sampleReportSetComplete ? void continueToReview() : void addSampleReportSet()}>
      <GlassMaterial tone="dark" radius={radius.md} intensity={28} />
      <View style={styles.sampleContentRow}><View style={styles.sampleBadge}><Text style={styles.sampleBadgeText}>SAMPLE</Text></View><View style={styles.optionCopy}><Text style={styles.optionTitle}>{sampleReportSetComplete ? 'Compare sample reports' : 'Preview a report comparison'}</Text><Text style={styles.optionSub}>{addingSampleSet ? 'Adding reports…' : sampleReportCount ? `${sampleReportCount} of 2 sample reports added` : 'Two fictional lipid reports · Jan + Apr 2025'}</Text></View>{addingSampleSet ? <ActivityIndicator size="small" color="#FFD09E" /> : <Text style={styles.sampleAction}>{sampleReportSetComplete ? 'Review →' : sampleReportCount ? 'Add second →' : 'Preview →'}</Text>}</View>
    </Pressable>}
    {purpose === 'insurance' && SAMPLE_PREVIEW_ENABLED && <Pressable accessibilityRole="button" accessibilityLabel={samplePolicyAdded ? 'Review sample policy' : 'Preview a sample policy'} accessibilityHint={samplePolicyAdded ? 'Opens the fictional policy for review.' : 'Adds one fictional policy to your review queue.'} accessibilityState={{ disabled: addingSamplePolicy, busy: addingSamplePolicy }} disabled={addingSamplePolicy} style={[styles.sample, { minHeight: 84 }, addingSamplePolicy && styles.sampleDisabled]} onPress={() => samplePolicyAdded ? void continueToReview() : void addSamplePolicy()}><GlassMaterial tone="dark" radius={radius.md} intensity={28} /><View style={styles.sampleContentRow}><View style={styles.sampleBadge}><Text style={styles.sampleBadgeText}>SAMPLE</Text></View><View style={styles.optionCopy}><Text style={styles.optionTitle}>{samplePolicyAdded ? 'Review sample policy' : 'See how policy review works'}</Text><Text style={styles.optionSub}>{addingSamplePolicy ? 'Adding policy…' : samplePolicyAdded ? 'Policy added · ready to review' : 'Fictional policy · quoted coverage terms'}</Text></View>{addingSamplePolicy ? <ActivityIndicator size="small" color="#FFD09E" /> : <Text style={styles.sampleAction}>{samplePolicyAdded ? 'Review →' : 'Preview →'}</Text>}</View></Pressable>}
    {purpose === 'insurance' && SAMPLE_PREVIEW_ENABLED && (samplePolicyAdded || independentSamplePolicyAdded) && <Pressable accessibilityRole="button" accessibilityLabel={independentSamplePolicyAdded ? 'Review independent sample policy' : 'Add independent sample policy'} accessibilityHint={independentSamplePolicyAdded ? 'Opens the separate fictional policy for review.' : 'Adds a second fictional policy so you can compare its terms with the first.'} accessibilityState={{ disabled: addingIndependentSamplePolicy, busy: addingIndependentSamplePolicy }} disabled={addingIndependentSamplePolicy} style={[styles.sample, { minHeight: 84 }, addingIndependentSamplePolicy && styles.sampleDisabled]} onPress={() => independentSamplePolicyAdded ? void continueToReview() : void addIndependentSamplePolicy()}><GlassMaterial tone="dark" radius={radius.md} intensity={28} /><View style={styles.sampleContentRow}><View style={styles.sampleBadge}><Text style={styles.sampleBadgeText}>SAMPLE 2</Text></View><View style={styles.optionCopy}><Text style={styles.optionTitle}>{independentSamplePolicyAdded ? 'Review independent sample policy' : 'Add a second sample policy'}</Text><Text style={styles.optionSub}>{addingIndependentSamplePolicy ? 'Adding policy…' : independentSamplePolicyAdded ? 'Separate policy · ready to review' : 'Compare separate policy terms side by side'}</Text></View>{addingIndependentSamplePolicy ? <ActivityIndicator size="small" color="#FFD09E" /> : <Text style={styles.sampleAction}>{independentSamplePolicyAdded ? 'Review →' : 'Add →'}</Text>}</View></Pressable>}
    {purpose === 'medical' && <View style={styles.noteSection}>
      <Pressable accessibilityRole="button" accessibilityLabel={(showSelfReport ? 'Hide' : 'Add') + ' an optional health note'} accessibilityHint="Opens a private note that stays separate from extracted report details." accessibilityState={{ expanded: showSelfReport }} onPress={() => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowSelfReport((current) => !current); }} style={styles.noteDisclosure}>
        <GlassMaterial tone="dark" radius={18} intensity={28} />
        <View style={{ flex: 1 }}><Text style={styles.noteDisclosureTitle}>{showSelfReport ? 'OPTIONAL HEALTH NOTE' : 'ADD CONTEXT · OPTIONAL'}</Text><Text style={styles.noteDisclosureSub}>{selfReport.trim() ? 'Note added · tap to edit' : 'Your words stay separate from report results'}</Text></View><Text style={styles.noteDisclosureMark}>{showSelfReport ? '−' : '+'}</Text>
      </Pressable>
      {showSelfReport && <Surface tone="dark" style={styles.noteCard}>
        {!areaContext && mainTopics.length > 0 && <><Text style={styles.noteTopicLabel}>FILE THIS NOTE UNDER · OPTIONAL</Text><View style={styles.topicChoices}><Pressable accessibilityRole="button" accessibilityState={{ selected: !selfReportTopicId }} onPress={() => setSelfReportTopicOverride('')} style={[styles.topicChip, !selfReportTopicId && styles.topicChipSelected]}><Text style={[styles.topicChipText, !selfReportTopicId && styles.topicChipTextSelected]}>No area</Text></Pressable>{mainTopics.map((topic) => <Pressable key={topic.id} accessibilityRole="button" accessibilityState={{ selected: selfReportTopicId === topic.id }} onPress={() => setSelfReportTopicOverride(selfReportTopicId === topic.id ? '' : topic.id)} style={[styles.topicChip, selfReportTopicId === topic.id && styles.topicChipSelected]}><Text style={[styles.topicChipText, selfReportTopicId === topic.id && styles.topicChipTextSelected]}>{topic.label}</Text></Pressable>)}</View></>}
        {captureKind ? <View style={styles.areaContextCard}><Text style={styles.areaContextEyebrow}>{captureGuidance.title}</Text><Text style={styles.areaContextBody}>{captureGuidance.prompt}</Text></View> : null}
        <TextInput value={selfReport} onChangeText={setSelfReportOverride} multiline maxLength={2000} textAlignVertical="top" accessibilityLabel="Your health note" placeholder={captureKind ? 'Add the details you know…' : 'Add a short note…'} placeholderTextColor={colors.quiet} style={styles.noteInput} /><Text style={styles.noteFoot}>{selfReport.length}/2,000 characters</Text>
      </Surface>}
    </View>}
    {purposeAssets.length > 0 && <View style={styles.fileSection}><Label style={styles.pageLabel}>YOUR FILES · {purposeAssets.length}</Label>{purposeAssets.map((asset) => <Surface key={asset.id} tone="dark" style={styles.file}><Text style={styles.fileIcon}>{asset.kind === 'audio' ? '♪' : asset.kind === 'pdf' ? 'PDF' : asset.kind === 'video' ? '▶' : asset.kind === 'image' ? 'IMG' : 'DOC'}</Text><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.fileName}>{documentDisplayName(asset, facts)}</Text><Text style={styles.fileSub}>Original file · {documentOriginalName(asset)} · {asset.possibleRepeat ? 'Possible duplicate · please check' : asset.kind === 'audio' ? 'Stored on this device · audio review unavailable' : asset.kind === 'video' ? 'Ready for timestamped review' : 'Ready for your review'}</Text></View>{asset.possibleRepeat && <Text style={styles.repeat}>!</Text>}</Surface>)}</View>}
    {intakeError ? <Surface tone="dark" style={styles.intakeError}><Text style={styles.intakeErrorText}>{intakeError}</Text></Surface> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: continuing, busy: continuing }} disabled={continuing} onPress={() => void continueToReview()} style={[styles.primary, continuing && styles.primaryDisabled]}><Text style={styles.primaryText}>{continuing ? 'Saving…' : purposeAssets.length > 0 || (purpose === 'medical' && (selfReport.trim() || intakeNotes.length)) ? firstRun ? 'Review these records' : 'Review this intake' : firstRun ? purpose === 'insurance' ? 'No policy to add' : 'No records to add' : 'Continue without details'}</Text><Text style={styles.chevronDark}>→</Text></Pressable>
  </ScrollView></View>;
}
const styles = StyleSheet.create({ sceneGlow: { position: 'absolute', top: 0, right: 0, width: '100%', height: 320, opacity: .8 }, pageLabel: { color: 'rgba(255,248,240,.72)' }, areaContextCard: { marginTop: 15, marginBottom: 4, padding: 15, backgroundColor: 'rgba(112,72,54,.30)', borderColor: 'rgba(242,189,157,.34)' }, areaContextEyebrow: { color: '#F2BD9D', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 }, areaContextTitle: { color: '#FFF8F0', fontSize: 17, fontWeight: '600', marginTop: 5 }, areaContextBody: { color: 'rgba(255,248,240,.72)', fontSize: 12, lineHeight: 17, marginTop: 4 }, page: { flex: 1, backgroundColor: '#211A17' }, content: { padding: 24, paddingTop: 42, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }, back: { color: 'rgba(255,248,240,.78)', fontSize: 16, marginBottom: 25 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, title: { color: '#FFF8F0', fontSize: 28, fontWeight: '300', marginTop: 7 }, body: { color: 'rgba(255,248,240,.78)', fontSize: 15, lineHeight: 22, marginTop: 13, marginBottom: 22 }, privacyCard: { backgroundColor: 'rgba(46,121,85,.10)', borderColor: 'rgba(46,121,85,.28)', marginBottom: 24 }, privacyTitle: { color: '#C9EBDD', fontSize: 14, fontWeight: '700' }, privacyBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }, option: { position: 'relative', overflow: 'hidden', minHeight: 75, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,.30)', backgroundColor: 'rgba(66,43,35,.24)', marginBottom: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }, optionIcon: { color: '#A9D3FF', fontSize: 25, width: 30, textAlign: 'center' }, optionCopy: { flex: 1 }, optionTitle: { color: '#FFF8F0', fontWeight: '500', fontSize: 15 }, optionSub: { color: 'rgba(255,248,240,.72)', fontSize: 12, marginTop: 4 }, chevron: { color: '#F2BD9D', fontSize: 23 }, sample: { position: 'relative', overflow: 'hidden', minHeight: 112, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(242,189,157,.45)', backgroundColor: 'rgba(112,72,54,.30)', marginTop: 7, marginBottom: 13, padding: 14, gap: 11 }, sampleContentRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, sampleActionRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.16)', paddingTop: 7 }, sampleActionHint: { color: 'rgba(255,248,240,.62)', fontSize: 9, fontWeight: '700', letterSpacing: .7 }, sampleDisabled: { opacity: 0.72 }, sampleBadge: { minWidth: 54, height: 38, borderRadius: 19, paddingHorizontal: 8, backgroundColor: 'rgba(183,145,207,.30)', alignItems: 'center', justifyContent: 'center' }, sampleBadgeText: { color: '#F6D5E9', fontSize: 8, fontWeight: '800', letterSpacing: 0.6 }, sampleAction: { color: '#A9D3FF', fontSize: 12, fontWeight: '700' }, fileSection: { marginTop: 18 }, file: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: radius.md, marginTop: 9, gap: 10, backgroundColor: 'rgba(66,43,35,.28)', borderColor: 'rgba(255,255,255,.24)' }, fileIcon: { color: '#91D7C0', fontSize: 10, fontWeight: '700', borderColor: 'rgba(255,255,255,.30)', borderWidth: 1, borderRadius: 10, padding: 8 }, fileName: { color: '#FFF8F0', fontSize: 13, fontWeight: '500' }, fileSub: { color: 'rgba(255,248,240,.70)', fontSize: 11, marginTop: 3 }, fileNameHint: { color: 'rgba(255,248,240,.62)', fontSize: 10, lineHeight: 15, marginTop: 7, marginLeft: 3 }, repeat: { color: '#F2BD9D', fontSize: 15, paddingHorizontal: 6 }, noteSection: { marginTop: 12, marginBottom: 4 }, noteDisclosure: { position: 'relative', overflow: 'hidden', minHeight: 64, paddingHorizontal: 15, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,.28)', borderRadius: 18, backgroundColor: 'rgba(66,43,35,.22)', flexDirection: 'row', alignItems: 'center', gap: 12 }, noteDisclosureTitle: { color: '#F2BD9D', fontSize: 10, fontWeight: '800', letterSpacing: .8 }, noteDisclosureSub: { color: 'rgba(255,248,240,.72)', fontSize: 11, marginTop: 4 }, noteDisclosureMark: { color: '#A9D3FF', fontSize: 22, fontWeight: '500' }, noteCard: { marginTop: 9, marginBottom: 7, borderColor: 'rgba(255,255,255,.24)', backgroundColor: 'rgba(66,43,35,.34)' }, noteSub: { color: 'rgba(255,248,240,.72)', fontSize: 12, lineHeight: 17, marginTop: 3 }, noteTopicLabel: { color: '#F2BD9D', fontSize: 9, fontWeight: '800', letterSpacing: .7, marginTop: 14 }, topicChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9, marginBottom: 2 }, topicChip: { borderWidth: 1, borderColor: 'rgba(255,255,255,.28)', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: 'rgba(255,255,255,.08)' }, topicChipSelected: { borderColor: '#BCA2D5', backgroundColor: 'rgba(151,99,75,.62)' }, topicChipText: { color: 'rgba(255,248,240,.78)', fontSize: 10 }, topicChipTextSelected: { color: '#FFF8F0', fontWeight: '600' }, noteInput: { minHeight: 105, borderWidth: 1, borderColor: 'rgba(255,255,255,.32)', borderRadius: 14, backgroundColor: 'rgba(42,28,23,.48)', color: '#FFF8F0', padding: 12, fontSize: 13, lineHeight: 19, marginTop: 12, position: 'relative', zIndex: 2 }, noteFoot: { color: 'rgba(255,248,240,.58)', fontSize: 9, lineHeight: 13, marginTop: 6 }, intakeError: { marginTop: 12, borderColor: 'rgba(242,189,157,.55)', backgroundColor: 'rgba(115,54,54,.36)' }, intakeErrorText: { color: '#FFE2D9', fontSize: 12, lineHeight: 17 }, primary: { backgroundColor: colors.cobalt, borderRadius: radius.pill, minHeight: 54, marginTop: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, primaryDisabled: { opacity: 0.6 }, primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 }, chevronDark: { color: '#FFFFFF', fontSize: 20 }, demoNote: { color: 'rgba(255,248,240,.68)', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 11 } });
