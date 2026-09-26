import React, { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Asset } from 'expo-asset';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Orb } from '../src/components/Orb';
import { Label, Surface } from '../src/components/Surface';
import { useNura, IntakeAsset } from '../src/state/NuraContext';
import { colors, radius } from '../src/theme';
import { resolveIntakeMediaType } from '../src/services/intakeClient';
import { isReviewableIntakeAsset } from '../src/services/reviewableIntakeAsset.mjs';
function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
const SAMPLE_REPORT_NAME = 'PL0005-sample-lipid-profile.pdf';
const SAMPLE_FOLLOW_UP_NAME = 'EXAMPLE-lipid-follow-up.pdf';
const SAMPLE_REPORT_SET = [
  { name: SAMPLE_REPORT_NAME, module: require('../assets/samples/PL0005-sample-lipid-profile.pdf'), size: 62447 },
  { name: SAMPLE_FOLLOW_UP_NAME, module: require('../assets/samples/EXAMPLE-lipid-follow-up.pdf'), size: 2859 },
] as const;
const SAMPLE_PREVIEW_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_SAMPLE_PREVIEW === 'true';
export default function Intake() {
  const params = useLocalSearchParams<{ purpose?: string; firstRun?: string }>();
  const purpose: 'medical' | 'insurance' = params.purpose === 'insurance' ? 'insurance' : 'medical';
  const firstRun = purpose === 'medical' && params.firstRun === 'true';
  const { assets, topics, intakeNotes, addAssets, saveIntakeNote } = useNura();
  const purposeAssets = assets.filter((asset) => (asset.purpose ?? 'medical') === purpose && isReviewableIntakeAsset(asset, purpose));
  const sampleReportCount = purposeAssets.filter((asset) => SAMPLE_REPORT_SET.some((report) => report.name === asset.name)).length;
  const sampleReportSetComplete = sampleReportCount === SAMPLE_REPORT_SET.length;
  const [addingSampleSet, setAddingSampleSet] = useState(false);
  const pendingMedicalNote = useMemo(() => intakeNotes[0], [intakeNotes]);
  const [selfReportOverride, setSelfReportOverride] = useState<string | undefined>();
  const [selfReportTopicOverride, setSelfReportTopicOverride] = useState<string | undefined>();
  const selfReport = selfReportOverride ?? pendingMedicalNote?.text ?? '';
  const selfReportTopicId = selfReportTopicOverride ?? pendingMedicalNote?.topicId ?? '';
  const [continuing, setContinuing] = useState(false);
  const [intakeError, setIntakeError] = useState('');
  const accept = (name: string, uri: string, mimeType?: string, size?: number): Omit<IntakeAsset, 'addedAt'> => { const normalizedType = resolveIntakeMediaType({ name, mimeType }); return { id: makeId(), name, uri, mimeType: normalizedType || mimeType, size, purpose, kind: normalizedType === 'application/pdf' ? 'pdf' : normalizedType.startsWith('video/') ? 'video' : normalizedType.startsWith('image/') ? 'image' : 'file' }; };
  async function chooseFiles() {
    try { const types = purpose === 'insurance' ? ['application/pdf', 'image/*'] : ['application/pdf', 'image/*', 'video/*']; const result = await DocumentPicker.getDocumentAsync({ type: types, multiple: true, copyToCacheDirectory: true }); if (!result.canceled) await addAssets(result.assets.map((asset) => accept(asset.name, asset.uri, asset.mimeType, asset.size))); } catch { Alert.alert('Could not open files', 'Try choosing the file again.'); }
  }
  async function choosePhotos() {
    try { const mediaTypes = purpose === 'insurance' ? ['images'] as const : ['images', 'videos'] as const; const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [...mediaTypes], allowsMultipleSelection: true, quality: 0.9 }); if (!result.canceled) await addAssets(result.assets.map((asset) => accept(asset.fileName ?? (asset.type === 'video' ? (Platform.OS === 'ios' ? 'health-video.mov' : 'health-video.mp4') : 'Health photo'), asset.uri, asset.mimeType ?? (asset.type === 'video' ? (Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4') : 'image/*'), asset.fileSize))); } catch { Alert.alert('Could not open photos', 'Try choosing them again.'); }
  }
  async function takePhoto() {
    try { const permission = await ImagePicker.requestCameraPermissionsAsync(); if (!permission.granted) { Alert.alert('Camera permission needed', 'Allow camera access when you want to photograph a health document.'); return; } const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 }); if (!result.canceled) await addAssets(result.assets.map((asset) => accept(asset.fileName ?? 'Photographed health document', asset.uri, asset.mimeType ?? 'image/*', asset.fileSize))); } catch { Alert.alert('Could not open camera', 'Try choosing a photo instead.'); }
  }
  async function addSampleReportSet() {
    if (addingSampleSet) return;
    const alreadyAdded = new Set(purposeAssets.map((asset) => asset.name));
    const missing = SAMPLE_REPORT_SET.filter((report) => !alreadyAdded.has(report.name));
    if (!missing.length) return;
    setAddingSampleSet(true);
    try {
      const loaded = await Asset.loadAsync(missing.map((report) => report.module));
      const staged = missing.map((report, index) => {
        const asset = loaded[index];
        const uri = Platform.OS === 'web' ? asset?.uri : asset?.localUri ?? asset?.uri;
        if (!uri) throw new Error('A sample report could not be opened.');
        return accept(report.name, uri, 'application/pdf', report.size);
      });
      await addAssets(staged);
    } catch (error) {
      Alert.alert('Sample reports unavailable', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setAddingSampleSet(false);
    }
  }
  async function continueToReview() {
    if (continuing) return;
    setContinuing(true); setIntakeError('');
    try {
      if (purpose === 'medical' && selfReport.trim()) {
        const topic = topics.find((item) => item.id === selfReportTopicId);
        await saveIntakeNote({ id: pendingMedicalNote?.id, text: selfReport, topicId: topic?.id, topicLabel: topic?.label });
      }
      const hasFiles = purposeAssets.length > 0;
      const hasNote = purpose === 'medical' && (Boolean(selfReport.trim()) || intakeNotes.length > 0);
      if (hasFiles || hasNote) router.push({ pathname: '/review', params: { purpose, ...(firstRun ? { firstRun: 'true' } : {}) } });
      else router.replace(purpose === 'insurance' ? '/insurance' : firstRun ? '/(tabs)/health' : '/(tabs)/home');
    } catch (error) {
      setIntakeError(error instanceof Error ? error.message : 'Your intake could not be saved. Please try again.');
    } finally {
      setContinuing(false);
    }
  }
  return <View style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>‹  Back</Text></Pressable>{firstRun && <Label>YOUR PROFILE · ADD YOUR HISTORY</Label>}<View style={styles.heading}><Orb size={42} state="idle" /><View style={{ flex: 1 }}><Label>{purpose === 'insurance' ? 'YOUR INSURANCE REGISTRY' : 'YOUR MEDICAL REGISTRY'}</Label><Text style={styles.title}>{purpose === 'insurance' ? 'Add a policy document.' : 'Add what you have.'}</Text></View></View>
    <Text style={styles.body}>{purpose === 'insurance' ? 'Choose a policy or benefits document. With your permission, Nura will highlight stated benefits, limits and exclusions with quotes from the original.' : 'Bring reports and your own description together. Add several files, then write what you want Nura to understand. File reading needs your approval; the preview can organize a description locally after a separate choice.'}</Text>
    <Surface style={styles.privacyCard}><Text style={styles.privacyTitle}>Nothing gets filed without your review.</Text><Text style={styles.privacyBody}>{purpose === 'insurance' ? 'Only policy terms you accept appear in this registry. Missing wording is not treated as a confirmed coverage gap.' : 'Nura can organize and suggest connections. You decide what becomes part of your health record.'}</Text></Surface>
    <Pressable accessibilityRole="button" accessibilityLabel="Take a photo of a health document" accessibilityHint="Opens the camera so you can capture a page." style={styles.option} onPress={takePhoto}><Text style={styles.optionIcon}>◎</Text><View style={styles.optionCopy}><Text style={styles.optionTitle}>Take a photo</Text><Text style={styles.optionSub}>Hold it flat, in good light</Text></View><Text style={styles.chevron}>›</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose files" accessibilityHint={purpose === 'insurance' ? 'Select policy PDFs or images.' : 'Select one or more PDFs, photos or short videos.'} style={styles.option} onPress={chooseFiles}><Text style={styles.optionIcon}>⌑</Text><View style={styles.optionCopy}><Text style={styles.optionTitle}>Choose files</Text><Text style={styles.optionSub}>{purpose === 'insurance' ? 'PDFs or images' : 'PDFs, photos or short videos'}</Text></View><Text style={styles.chevron}>›</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={purpose === 'insurance' ? 'Choose policy photos' : 'Choose photos or videos'} accessibilityHint={purpose === 'insurance' ? 'Select policy pages or images.' : 'Select several pages or a video up to 3 minutes.'} style={styles.option} onPress={choosePhotos}><Text style={styles.optionIcon}>▧</Text><View style={styles.optionCopy}><Text style={styles.optionTitle}>{purpose === 'insurance' ? 'Choose photos' : 'Choose photos or videos'}</Text><Text style={styles.optionSub}>{purpose === 'insurance' ? 'Select policy pages or images' : 'Select pages or a video up to 3 minutes'}</Text></View><Text style={styles.chevron}>›</Text></Pressable>
    {purpose === 'medical' && SAMPLE_PREVIEW_ENABLED && <Pressable accessibilityRole="button" accessibilityLabel={sampleReportCount ? 'Add the missing sample report' : 'Add two sample reports'} accessibilityHint={sampleReportCount ? 'Stages the remaining dated sample report. Nura will not read it until you approve file review.' : 'Stages two dated sample reports. Nura will not read them until you approve file review.'} accessibilityState={{ disabled: addingSampleSet || sampleReportSetComplete, busy: addingSampleSet }} disabled={addingSampleSet || sampleReportSetComplete} style={[styles.sample, (addingSampleSet || sampleReportSetComplete) && styles.sampleDisabled]} onPress={() => void addSampleReportSet()}><View style={styles.sampleBadge}><Text style={styles.sampleBadgeText}>PDF ×2</Text></View><View style={styles.optionCopy}><Text style={styles.optionTitle}>Load a sample report set</Text><Text style={styles.optionSub}>{addingSampleSet ? 'Preparing two reports…' : sampleReportSetComplete ? 'Both reports added · ready for review' : sampleReportCount ? 'One report added · add the follow-up' : 'Two lipid panels · Jan and Apr 2025'}</Text></View><Text style={styles.sampleAction}>{addingSampleSet ? '…' : sampleReportSetComplete ? 'Added' : sampleReportCount ? 'Add remaining' : 'Add both'}</Text></Pressable>}
    {purpose === 'medical' && <Surface style={styles.noteCard}><Label>YOUR DESCRIPTION · OPTIONAL</Label><Text style={styles.noteTitle}>What would you like Nura to know?</Text><Text style={styles.noteSub}>Write it in your own words. You can review and change it before deciding whether to keep it in your record.</Text>{topics.length > 0 && <View style={styles.topicChoices}><Pressable accessibilityRole="button" accessibilityState={{ selected: !selfReportTopicId }} onPress={() => setSelfReportTopicOverride('')} style={[styles.topicChip, !selfReportTopicId && styles.topicChipSelected]}><Text style={[styles.topicChipText, !selfReportTopicId && styles.topicChipTextSelected]}>No topic</Text></Pressable>{topics.map((topic) => <Pressable key={topic.id} accessibilityRole="button" accessibilityState={{ selected: selfReportTopicId === topic.id }} onPress={() => setSelfReportTopicOverride(selfReportTopicId === topic.id ? '' : topic.id)} style={[styles.topicChip, selfReportTopicId === topic.id && styles.topicChipSelected]}><Text style={[styles.topicChipText, selfReportTopicId === topic.id && styles.topicChipTextSelected]}>{topic.label}</Text></Pressable>)}</View>}<TextInput value={selfReport} onChangeText={setSelfReportOverride} multiline maxLength={2000} textAlignVertical="top" accessibilityLabel="Your health description" placeholder="For example: what changed, when it began, or what you want to keep track of…" placeholderTextColor={colors.quiet} style={styles.noteInput} /><Text style={styles.noteFoot}>{selfReport.length}/2,000 · Saved on this device. The local preview uses simple text rules; it does not call an AI provider.</Text></Surface>}
    {purposeAssets.length > 0 && <View style={styles.fileSection}><Label>YOUR FILES · {purposeAssets.length}</Label>{purposeAssets.map((asset) => <Surface key={asset.id} style={styles.file}><Text style={styles.fileIcon}>{asset.kind === 'pdf' ? 'PDF' : asset.kind === 'video' ? '▶' : 'IMG'}</Text><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.fileName}>{asset.name}</Text><Text style={styles.fileSub}>{asset.possibleRepeat ? 'Possible duplicate · please check' : asset.kind === 'video' ? 'Saved · ready for timestamped review' : 'Saved · ready for your review'}</Text></View>{asset.possibleRepeat && <Text style={styles.repeat}>!</Text>}</Surface>)}</View>}
    {intakeError ? <Surface style={styles.intakeError}><Text style={styles.intakeErrorText}>{intakeError}</Text></Surface> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: continuing, busy: continuing }} disabled={continuing} onPress={() => void continueToReview()} style={[styles.primary, continuing && styles.primaryDisabled]}><Text style={styles.primaryText}>{continuing ? 'Saving your intake…' : purposeAssets.length > 0 || (purpose === 'medical' && (selfReport.trim() || intakeNotes.length)) ? firstRun ? 'Review your health details' : 'Review this intake' : firstRun ? 'Skip for now · open health history' : 'Continue without adding details'}</Text><Text style={styles.chevronDark}>→</Text></Pressable>
    <Text style={styles.demoNote}>Preview workspace · Use sample details only. Files are read only after you approve; notes stay on this device.</Text>
  </ScrollView></View>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.bg }, content: { padding: 24, paddingTop: 42, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }, back: { color: colors.muted, fontSize: 16, marginBottom: 25 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, title: { color: colors.text, fontSize: 28, fontWeight: '300', marginTop: 7 }, body: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 13, marginBottom: 22 }, privacyCard: { backgroundColor: 'rgba(154,231,209,0.07)', borderColor: 'rgba(154,231,209,0.21)', marginBottom: 24 }, privacyTitle: { color: colors.mint, fontSize: 14, fontWeight: '600' }, privacyBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }, option: { minHeight: 75, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }, optionIcon: { color: colors.violet, fontSize: 25, width: 30, textAlign: 'center' }, optionCopy: { flex: 1 }, optionTitle: { color: colors.text, fontWeight: '500', fontSize: 15 }, optionSub: { color: colors.quiet, fontSize: 12, marginTop: 4 }, chevron: { color: colors.quiet, fontSize: 23 }, sample: { minHeight: 72, borderRadius: radius.md, borderWidth: 1, borderColor: '#C9B8D9', backgroundColor: '#F7F2FA', marginTop: 7, marginBottom: 13, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 13 }, sampleDisabled: { opacity: 0.72 }, sampleBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E9E1F1', alignItems: 'center', justifyContent: 'center' }, sampleBadgeText: { color: colors.violet, fontSize: 9, fontWeight: '700', letterSpacing: 0.6 }, sampleAction: { color: colors.violet, fontSize: 12, fontWeight: '700' }, fileSection: { marginTop: 18 }, file: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: radius.md, marginTop: 9, gap: 10 }, fileIcon: { color: colors.aqua, fontSize: 10, fontWeight: '700', borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 8 }, fileName: { color: colors.text, fontSize: 13, fontWeight: '500' }, fileSub: { color: colors.quiet, fontSize: 11, marginTop: 3 }, repeat: { color: colors.warning, fontSize: 15, paddingHorizontal: 6 }, noteCard: { marginTop: 12, marginBottom: 7, borderColor: '#BDA9CA', backgroundColor: '#F8F2F8' }, noteTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 8 }, noteSub: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 5 }, topicChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11, marginBottom: 2 }, topicChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: colors.surface }, topicChipSelected: { borderColor: colors.violet, backgroundColor: '#EEE5F2' }, topicChipText: { color: colors.muted, fontSize: 10 }, topicChipTextSelected: { color: colors.violet, fontWeight: '600' }, noteInput: { minHeight: 105, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, color: colors.text, padding: 12, fontSize: 13, lineHeight: 19, marginTop: 12 }, noteFoot: { color: colors.quiet, fontSize: 9, lineHeight: 13, marginTop: 6 }, intakeError: { marginTop: 12, borderColor: '#E5BDB5', backgroundColor: '#FFF3F0' }, intakeErrorText: { color: '#9B4E42', fontSize: 12, lineHeight: 17 }, primary: { backgroundColor: '#E8E0FF', borderRadius: radius.pill, minHeight: 54, marginTop: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, primaryDisabled: { opacity: 0.6 }, primaryText: { color: colors.ink, fontWeight: '600', fontSize: 14 }, chevronDark: { color: colors.ink, fontSize: 20 }, demoNote: { color: colors.quiet, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 11 } });
