import React, { useEffect, useMemo, useRef, useState } from 'react';
import { animatedNativeDriver } from '../src/services/animatedDriver';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Orb } from '../src/components/Orb';
import { Atmosphere } from '../src/components/ambient/Atmosphere';
import { GlassMaterial } from '../src/components/GlassMaterial';
import { useNura, HealthTopic, ProfileSetupProgress } from '../src/state/NuraContext';
import { brandScenes, motion } from '../src/theme';
import { ageFromDateOfBirth, hasExistingProfileEvidence, validateRequiredMeasurements, validateRequiredProfileDetails } from '../src/services/profileDemographics.mjs';
import { buildProfileEvidenceRows } from '../src/services/profileOverview.mjs';
import { shouldUseMotion } from '../src/services/motionPolicy.mjs';
import { createFamilyHistoryTopic, familyRelationships, withAreaTopicId } from '../src/services/familyHistoryTopic.mjs';
import type { ProfileOverviewAsset, ProfileOverviewFact, ProfileOverviewTreatment, ProfileOverviewVisit } from '../src/services/profileOverview.mjs';

type Signal = { id: string; label: string; choiceKind?: 'symptom' | 'medicine' | 'relative'; quickChoices?: readonly string[]; actionKind?: 'marker' | 'visits' | 'record' | 'treatment' | 'note'; markerLabel?: string; captureKind?: string };
type FocusArea = {
  id: string;
  label: string;
  color: string;
  pale: string;
  ink: string;
  signals: Signal[];
};

function formatOverviewDate(value: string) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

type OnboardingStep = 'welcome' | 'identity' | 'focus';

const palette = {
  canvas: brandScenes.atmosphere.base,
  ink: '#FFF9F4',
  muted: '#F2EAF0',
  soft: '#DED0E0',
  line: 'rgba(255,255,255,0.20)',
  cream: '#FBF6F0',
  peach: '#E8B48F',
  lilac: '#C7A8E5',
  blue: '#8CC9F5',
  mint: '#A9D3AE',
  amber: '#F3B562',
};

const countries = [
  'Australia', 'Bangladesh', 'Brazil', 'Brunei', 'Cambodia', 'Canada', 'China',
  'France', 'Germany', 'Hong Kong', 'India', 'Indonesia', 'Ireland', 'Italy',
  'Japan', 'Kenya', 'Malaysia', 'Mexico', 'Myanmar', 'Nepal', 'Netherlands',
  'New Zealand', 'Nigeria', 'Pakistan', 'Philippines', 'Singapore', 'South Africa',
  'South Korea', 'Sri Lanka', 'Taiwan', 'Thailand', 'Türkiye', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Vietnam',
];

const reportedConditionSignal: Signal = { id: 'reported-condition', label: 'I have a diagnosis or condition', actionKind: 'note', captureKind: 'condition' };

const focusAreas: FocusArea[] = [
  { id: 'bp-topic', label: 'Blood pressure', color: '#318FF2', pale: '#D8E9FF', ink: '#12529C', signals: [reportedConditionSignal, { id: 'readings', label: 'Enter a blood pressure reading', actionKind: 'marker', markerLabel: 'Systolic blood pressure' }, { id: 'medicine', label: 'Blood pressure medicine', choiceKind: 'medicine', quickChoices: ['Amlodipine', 'Losartan', 'Ramipril', 'Indapamide', 'Bisoprolol', 'Candesartan', 'Nifedipine', 'Valsartan'] }, { id: 'visits', label: 'Related visits', actionKind: 'visits' }, { id: 'symptoms', label: 'Symptoms', choiceKind: 'symptom', quickChoices: ['Headache', 'Dizziness or lightheadedness', 'Blurred vision', 'Shortness of breath', 'Chest discomfort', 'Nosebleeds'] }] },
  { id: 'cholesterol', label: 'Cholesterol', color: '#28A5D2', pale: '#D9F0F4', ink: '#12597A', signals: [reportedConditionSignal, { id: 'lipid-panel', label: 'Add a lipid panel', actionKind: 'record' }, { id: 'ldl', label: 'Enter LDL cholesterol', actionKind: 'marker', markerLabel: 'LDL cholesterol' }, { id: 'hdl', label: 'Enter HDL cholesterol', actionKind: 'marker', markerLabel: 'HDL cholesterol' }, { id: 'total-cholesterol', label: 'Enter total cholesterol', actionKind: 'marker', markerLabel: 'Total cholesterol' }, { id: 'triglycerides', label: 'Enter triglycerides', actionKind: 'marker', markerLabel: 'Triglycerides' }, { id: 'statin', label: 'Cholesterol medicine', choiceKind: 'medicine', quickChoices: ['Atorvastatin', 'Rosuvastatin', 'Simvastatin', 'Ezetimibe', 'Pravastatin', 'Fluvastatin'] }, { id: 'diet', label: 'Food and routines', actionKind: 'note', captureKind: 'food-routine' }] },
  { id: 'sleep', label: 'Sleep', color: '#9876DE', pale: '#E9DFFA', ink: '#5F479C', signals: [reportedConditionSignal, { id: 'sleep-study', label: 'Add a sleep study', actionKind: 'record' }, { id: 'apnea', label: 'Sleep condition or diagnosis', actionKind: 'note', captureKind: 'condition' }, { id: 'sleep-medicine', label: 'Sleep medicine', choiceKind: 'medicine', quickChoices: ['Zopiclone', 'Zolpidem', 'Temazepam'] }, { id: 'routine', label: 'Sleep routine', actionKind: 'note', captureKind: 'routine' }, { id: 'fatigue', label: 'Symptoms', choiceKind: 'symptom', quickChoices: ['Trouble falling asleep', 'Waking during the night', 'Snoring', 'Breathing pauses', 'Daytime tiredness'] }] },
  { id: 'heart', label: 'Heart health', color: '#E3778A', pale: '#F7DCE0', ink: '#913A51', signals: [reportedConditionSignal, { id: 'cardiology', label: 'Related heart visits', actionKind: 'visits' }, { id: 'ecg', label: 'Add ECG or imaging', actionKind: 'record' }, { id: 'heart-medicine', label: 'Heart medicine', choiceKind: 'medicine', quickChoices: ['Bisoprolol', 'Metoprolol', 'Ramipril', 'Furosemide', 'Spironolactone', 'Warfarin', 'Apixaban', 'Clopidogrel'] }, { id: 'rhythm', label: 'Symptoms', choiceKind: 'symptom', quickChoices: ['Palpitations', 'Chest discomfort', 'Shortness of breath', 'Dizziness or fainting', 'Swelling'] }, { id: 'family-heart', label: 'Heart condition in family', choiceKind: 'relative', quickChoices: familyRelationships }] },
  { id: 'sugar', label: 'Blood sugar', color: '#D99B34', pale: '#F6E8C9', ink: '#825613', signals: [reportedConditionSignal, { id: 'a1c', label: 'Enter an HbA1c result', actionKind: 'marker', markerLabel: 'HbA1c' }, { id: 'glucose', label: 'Enter a glucose reading', actionKind: 'marker', markerLabel: 'Blood glucose' }, { id: 'diabetes-medicine', label: 'Related medicine', choiceKind: 'medicine', quickChoices: ['Metformin', 'Empagliflozin', 'Insulin', 'Semaglutide', 'Gliclazide', 'Sitagliptin', 'Dapagliflozin'] }, { id: 'sugar-routine', label: 'Symptoms', choiceKind: 'symptom', quickChoices: ['Increased thirst', 'Frequent urination', 'Fatigue', 'Blurred vision', 'Shakiness or sweating'] }] },
  { id: 'medicines', label: 'Medicines', color: '#24A99E', pale: '#D7EFEB', ink: '#116B65', signals: [{ id: 'medicine-list', label: 'Add a medicine record', actionKind: 'treatment' }, { id: 'dose', label: 'Update dose and timing', actionKind: 'treatment' }, { id: 'effects', label: 'Record a side effect', actionKind: 'note', captureKind: 'symptom' }, { id: 'prescriber', label: 'Add prescriber details', actionKind: 'treatment' }] },
  { id: 'family', label: 'Family history', color: '#A17AC0', pale: '#EADDF0', ink: '#624877', signals: [
    { id: 'heart-family', label: 'Heart condition', choiceKind: 'relative', quickChoices: familyRelationships },
    { id: 'sugar-family', label: 'Diabetes', choiceKind: 'relative', quickChoices: familyRelationships },
    { id: 'cancer-family', label: 'Cancer history', choiceKind: 'relative', quickChoices: familyRelationships },
  ] },
  { id: 'joints', label: 'Joints and movement', color: '#54A89A', pale: '#DDEEE9', ink: '#2F6C63', signals: [reportedConditionSignal, { id: 'joint-pain', label: 'Symptoms', choiceKind: 'symptom', quickChoices: ['Pain', 'Stiffness', 'Swelling', 'Tenderness', 'Limited movement', 'Warmth or redness'] }, { id: 'joint-medicine', label: 'Pain relief medicine', choiceKind: 'medicine', quickChoices: ['Paracetamol', 'Ibuprofen', 'Naproxen', 'Diclofenac gel', 'Capsaicin cream'] }, { id: 'joint-scan', label: 'Add an X-ray or scan', actionKind: 'record' }, { id: 'physio', label: 'Related visits or treatment', actionKind: 'visits' }, { id: 'mobility', label: 'Movement changes', actionKind: 'note', captureKind: 'routine' }] },
  { id: 'other', label: 'Something else', color: '#8293AA', pale: '#E3E9F0', ink: '#44576F', signals: [{ id: 'other-note', label: 'Add your own words' }] },
];

const domains = [
  { number: '01', title: 'Today', detail: 'Biometrics', color: '#85C8F1' },
  { number: '02', title: 'History', detail: 'Conditions and labs', color: '#BD9CE3' },
  { number: '03', title: 'Records', detail: 'Reports and images', color: '#78AFE9' },
  { number: '04', title: 'Treatment', detail: 'Medicines and care', color: '#83C7B3' },
  { number: '05', title: 'Life', detail: 'Routines and wellbeing', color: '#E6B995' },
  { number: '06', title: 'Cover', detail: 'Insurance', color: '#E7C27A' },
];

const stepOrder: OnboardingStep[] = ['welcome', 'identity', 'focus'];
const stepNames = ['WELCOME', 'YOU', 'AREAS', 'RECORDS', 'MEDICINES', 'INSURANCE', 'REVIEW'];

function topicFor(area: FocusArea): HealthTopic {
  return { id: area.id, label: area.label };
}

function PressScale({
  children,
  selected,
  expanded,
  onPress,
  style,
  containerStyle,
  label,
  reducedMotion,
  floatMotion = false,
  floatDelay = 0,
  glassTone,
  glassRadius = 18,
}: {
  children: React.ReactNode;
  selected?: boolean;
  expanded?: boolean;
  onPress: () => void;
  style: any;
  containerStyle?: any;
  label: string;
  reducedMotion: boolean;
  floatMotion?: boolean;
  floatDelay?: number;
  glassTone?: 'light' | 'dark';
  glassRadius?: number;
}) {
  const scale = useMemo(() => new Animated.Value(1), []);
  const drift = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (!floatMotion || reducedMotion) {
      drift.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(floatDelay),
      Animated.timing(drift, { toValue: 1, duration: motion.bob / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: animatedNativeDriver }),
      Animated.timing(drift, { toValue: 0, duration: motion.bob / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: animatedNativeDriver }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [drift, floatDelay, floatMotion, reducedMotion]);

  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  return (
    <Animated.View style={[containerStyle, { transform: [{ translateY }, { scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, expanded }}
        onPress={onPress}
        onPressIn={() => {
          if (!reducedMotion) Animated.timing(scale, { toValue: motion.pressScale, duration: motion.pressIn, easing: Easing.linear, useNativeDriver: animatedNativeDriver }).start();
        }}
        onPressOut={() => {
          if (!reducedMotion) Animated.timing(scale, { toValue: 1, duration: motion.pressOut, easing: Easing.bezier(...motion.easing.bouncy), useNativeDriver: animatedNativeDriver }).start();
        }}
        style={style}
      >
        {glassTone ? <GlassMaterial tone={glassTone} radius={glassRadius} /> : null}
        {children}
      </Pressable>
    </Animated.View>
  );
}

function EvidenceFirstProfileOverview({
  name,
  topics,
  facts,
  treatments,
  assets,
  visits,
  reducedMotion,
  allowEntranceMotion,
}: {
  name: string;
  topics: HealthTopic[];
  facts: ProfileOverviewFact[];
  treatments: ProfileOverviewTreatment[];
  assets: ProfileOverviewAsset[];
  visits: ProfileOverviewVisit[];
  reducedMotion: boolean;
  allowEntranceMotion: boolean;
}) {
  const entrance = useMemo(() => new Animated.Value(1), []);
  const entranceHasPlayed = useRef(false);
  const [expandedEvidenceRows, setExpandedEvidenceRows] = useState<Set<string>>(() => new Set());
  const [savedRecordDetailsOpen, setSavedRecordDetailsOpen] = useState(false);
  const evidenceRows = buildProfileEvidenceRows({ facts, assets, treatments, visits });
  const detailCount = topics.filter((topic) => topic.id.includes('::')).length;

  useEffect(() => {
    if (!allowEntranceMotion || reducedMotion || entranceHasPlayed.current) {
      entrance.setValue(1);
      return;
    }
    entranceHasPlayed.current = true;
    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: motion.cardEnter,
      easing: Easing.bezier(...motion.easing.gentle),
      useNativeDriver: animatedNativeDriver,
    });
    animation.start();
    return () => animation.stop();
  }, [allowEntranceMotion, entrance, reducedMotion]);

  const overviewY = entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const shownEvidence = evidenceRows.slice(0, 3);

  function openEvidenceRow(row: (typeof evidenceRows)[number]) {
    if (row.kind === 'source') {
      const asset = assets.find((item) => row.assetIds?.includes(item.id));
      if (!asset) return;
      router.push({ pathname: '/review', params: { purpose: asset.purpose ?? 'medical', assetId: asset.id, ...(row.sourceId ? { sourceId: row.sourceId } : asset.serverSourceId ? { sourceId: asset.serverSourceId } : {}) } });
      return;
    }
    if (row.kind === 'detail') {
      const factId = row.id.slice('fact:'.length);
      router.push({ pathname: '/(tabs)/health', params: { focusId: `fact:${factId}` } });
      return;
    }
    if (row.kind === 'visit') {
      const visitId = row.id.slice('visit:'.length);
      router.push({ pathname: '/visits', params: { visitId } });
      return;
    }
    const treatmentId = row.id.slice('treatment:'.length);
    router.push({ pathname: '/treatment', params: { treatmentId } });
  }

  function toggleEvidenceDetails(rowId: string) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedEvidenceRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  return (
    <Animated.View style={[styles.profileOverview, { opacity: entrance, transform: [{ translateY: overviewY }] }]}>
      <View style={styles.overviewHeading}>
        <View style={styles.overviewTitleGroup}>
          <Text style={styles.overviewEyebrow}>YOUR 720 PROFILE</Text>
          <Text style={styles.overviewTitle}>{name.trim() || 'Your health profile'}</Text>
        </View>
        <View style={styles.overviewStatus}><View style={styles.overviewStatusDot} /><Text style={styles.overviewStatusText}>SETUP IN PROGRESS</Text></View>
      </View>
      <Text style={styles.overviewIntro}>Your reported context stays separate from source-linked records.</Text>

      <View style={styles.overviewMetrics}>
        <View style={styles.overviewMetric}><Text style={styles.overviewMetricValue}>{String(detailCount).padStart(2, '0')}</Text><Text style={styles.overviewMetricLabel}>CONTEXT SIGNALS</Text></View>
        <View style={styles.overviewMetricRule} />
        <View style={styles.overviewMetric}><Text style={styles.overviewMetricValue}>{String(evidenceRows.length).padStart(2, '0')}</Text><Text style={styles.overviewMetricLabel}>RECORD GROUPS</Text></View>
      </View>

      {shownEvidence.length > 0 ? (
        <View style={styles.overviewSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={savedRecordDetailsOpen ? 'Hide saved record details' : 'Show saved record details'}
            accessibilityState={{ expanded: savedRecordDetailsOpen }}
            onPress={() => {
              if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setSavedRecordDetailsOpen((open) => !open);
            }}
            style={styles.overviewDisclosure}
          >
            <Text style={styles.overviewSectionTitle}>SAVED RECORD DETAILS</Text>
            <Text style={styles.overviewDisclosureAction}>{savedRecordDetailsOpen ? 'HIDE −' : 'VIEW +'}</Text>
          </Pressable>
          {savedRecordDetailsOpen ? (
          <View style={styles.overviewEvidenceList}>
            {shownEvidence.map((row) => {
              const expanded = expandedEvidenceRows.has(row.id);
              const shownDetails = expanded ? row.details : row.details.slice(0, 2);
              const actionLabel = row.kind === 'source' ? 'Open saved source for review' : row.kind === 'detail' ? 'Open saved health detail in history' : row.kind === 'visit' ? 'Open care visit' : 'Open treatment record';
              const recordMeta = row.kind === 'source'
                ? [row.sourceType?.toUpperCase(), row.addedAt ? `Added ${formatOverviewDate(row.addedAt)}` : null, row.counts ? `${row.counts.total} linked item${row.counts.total === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')
                : row.kind === 'visit' && row.date ? formatOverviewDate(row.date) : null;
              return <View key={row.id} style={styles.overviewEvidenceCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${actionLabel}: ${row.title}`}
                  accessibilityHint="Opens this saved item using its existing record identifier."
                  onPress={() => openEvidenceRow(row)}
                  style={({ pressed }) => [styles.overviewEvidenceHeader, pressed && { opacity: 0.78 }]}
                >
                  <View style={[styles.overviewEvidenceMark, row.kind === 'source' ? styles.overviewSourceMark : styles.overviewDetailMark]}><Text style={styles.overviewEvidenceGlyph}>{row.kind === 'source' ? '▤' : row.kind === 'treatment' ? '+' : '•'}</Text></View>
                  <View style={styles.overviewEvidenceCopy}>
                    <Text style={styles.overviewEvidenceState}>{row.state}</Text>
                    <Text numberOfLines={2} style={styles.overviewEvidenceTitle}>{row.title}</Text>
                    {recordMeta ? <Text style={styles.overviewEvidenceMeta}>{recordMeta}</Text> : null}
                    <Text style={styles.overviewEvidenceSummary}>{row.summary}</Text>
                  </View>
                  <Text style={styles.overviewEvidenceOpen}>OPEN  ↗</Text>
                </Pressable>
                {shownDetails.map((detail) => (
                  <View key={detail.id} style={styles.overviewEvidenceDetail}><Text style={styles.overviewEvidenceDetailTitle}>{detail.label}</Text><Text style={styles.overviewEvidenceDetailValue}>{[detail.value, detail.date === 'Date not stated' ? null : `Report date ${formatOverviewDate(detail.date)}`].filter(Boolean).join(' · ')}</Text></View>
                ))}
                {row.details.length > 2 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={expanded ? `Show fewer details for ${row.title}` : `Show all ${row.details.length} details for ${row.title}`} onPress={() => toggleEvidenceDetails(row.id)} style={styles.overviewEvidenceMoreButton}><Text style={styles.overviewEvidenceMore}>{expanded ? 'SHOW FEWER DETAILS' : `SHOW ALL ${row.details.length} DETAILS`}</Text></Pressable> : null}
              </View>;
            })}
            {evidenceRows.length > shownEvidence.length ? <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/health')} style={styles.overviewAllRecords}><Text style={styles.overviewAllRecordsText}>VIEW ALL RECORD GROUPS  ↗</Text></Pressable> : null}
          </View>
          ) : null}
        </View>
      ) : null}

    </Animated.View>
  );
}

function FocusAreaChoice({ area, selected, reducedMotion, onPress }: {
  area: FocusArea;
  selected: boolean;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const glyph = area.id === 'bp-topic' ? '↕' : area.id === 'cholesterol' ? '◌' : area.id === 'sleep' ? '☾' : area.id === 'heart' ? '♡' : area.id === 'sugar' ? '⌁' : area.id === 'medicines' ? '+' : area.id === 'family' ? '⌂' : area.id === 'joints' ? '↗' : '＋';
  return (
    <PressScale
      selected={selected}
      reducedMotion={reducedMotion}
      label={selected ? 'Open context details for ' + area.label : 'Follow ' + area.label + ' and choose its context'}
      onPress={onPress}
      containerStyle={styles.focusChoiceSlot}
      style={[styles.focusChoice, selected && styles.focusChoiceSelected, { borderColor: selected ? area.color + 'FF' : 'rgba(255,249,244,.78)', backgroundColor: selected ? area.color + '62' : 'rgba(255,249,244,.10)', shadowColor: selected ? area.color : '#E7C9FF' }]}
    >
      <LinearGradient colors={[area.color + 'FF', area.color, area.ink]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={[styles.focusChoiceIcon, { borderColor: 'rgba(255,255,255,.98)' }]}>
        <Text style={styles.focusChoiceGlyph}>{glyph}</Text>
        <View style={styles.focusIconSheen} />
      </LinearGradient>
      <Text numberOfLines={2} style={[styles.focusChoiceLabel, selected && styles.focusChoiceLabelSelected]}>{area.label}</Text>
      <View style={[styles.focusChoiceMark, selected && { backgroundColor: area.color, borderColor: area.pale }]}>
        <Text style={[styles.focusChoiceMarkText, selected && styles.focusChoiceMarkTextSelected]}>{selected ? '✓' : '+'}</Text>
      </View>
    </PressScale>
  );
}

function CountryPicker({
  visible,
  value,
  reducedMotion,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: string;
  reducedMotion: boolean;
  onSelect: (country: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = countries.filter((country) => country.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Modal transparent visible={visible} animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <View style={styles.modalShade}>
        <View style={styles.countrySheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetTitleRow}>
            <View><Text style={styles.sheetOverline}>PROFILE DETAILS</Text><Text style={styles.sheetTitle}>Choose your country</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close country picker" onPress={onClose} style={styles.sheetClose}><Text style={styles.sheetCloseText}>×</Text></Pressable>
          </View>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search countries" placeholderTextColor="rgba(42,34,51,.45)" style={styles.countrySearch} accessibilityLabel="Search countries" autoCorrect={false} />
          <ScrollView style={styles.countryList} keyboardShouldPersistTaps="handled">
            {filtered.map((country) => (
              <Pressable key={country} accessibilityRole="button" accessibilityState={{ selected: value === country }} onPress={() => onSelect(country)} style={[styles.countryOption, value === country && styles.countryOptionSelected]}>
                <Text style={[styles.countryOptionText, value === country && styles.countryOptionTextSelected]}>{country}</Text>
                <Text style={styles.countryOptionMark}>{value === country ? '✓' : '→'}</Text>
              </Pressable>
            ))}
            {filtered.length === 0 ? <Text style={styles.noCountry}>No match in this quick list. Choose “Other” to enter any country.</Text> : null}
            <Pressable accessibilityRole="button" onPress={() => onSelect('Other')} style={styles.otherCountry}><Text style={styles.otherCountryText}>Other country · enter it yourself</Text><Text style={styles.countryOptionMark}>＋</Text></Pressable>
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.sheetDone}><Text style={styles.sheetDoneText}>DONE</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function ProfileSetup() {
  const {
    ready, name, birthday, country, updateProfile, topics, toggleTopic,
    facts, treatments, assets, visits, addFact, correctFact, commitProfileSetup, beginProfileSetup, setupProgress,
  } = useNura();
  const { width: viewportWidth } = useWindowDimensions();
  const compactHeader = viewportWidth < 420;
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [customArea, setCustomArea] = useState('');
  const [height, setHeight] = useState<string | null>(null);
  const [weight, setWeight] = useState<string | null>(null);
  const savedMeasurement = (label: string) => facts.find((fact) => fact.label.trim().toLowerCase() === label.toLowerCase() && !fact.validUntil)?.value.match(/^\s*([0-9]+(?:[.,][0-9]+)?)/)?.[1] ?? '';
  const heightValue = height ?? savedMeasurement('Height');
  const weightValue = weight ?? savedMeasurement('Weight');
  const [customCountry, setCustomCountry] = useState('');
  const [customCountryEdited, setCustomCountryEdited] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [motionPreference, setMotionPreference] = useState<boolean | null>(null);
  // Suppress movement until the OS preference has arrived; then honor it for all onboarding motion.
  const reducedMotion = !shouldUseMotion(motionPreference);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const sceneScrollRef = useRef<ScrollView | null>(null);
  const [existingProfileAtLoad, setExistingProfileAtLoad] = useState(false);
  const profileLoadChecked = useRef(false);
  const panelOpacity = useMemo(() => new Animated.Value(1), []);
  const panelX = useMemo(() => new Animated.Value(0), []);
  const panelScale = useMemo(() => new Animated.Value(1), []);
  const transitionAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const pendingStep = useRef<OnboardingStep | null>(null);
  const sceneIndex = stepOrder.indexOf(step);

  useEffect(() => {
    sceneScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  useEffect(() => {
    if (!ready || profileLoadChecked.current) return;
    profileLoadChecked.current = true;
    setExistingProfileAtLoad(hasExistingProfileEvidence({ name, birthday, country, topics, facts, assets, treatments, visits }));
  }, [assets, birthday, country, facts, name, ready, topics, treatments, visits]);

  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => { preferenceChanged = true; setMotionPreference(value); });
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active && !preferenceChanged) setMotionPreference(value); });
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!reducedMotion || !transitionAnimation.current) return;
    const nextStep = pendingStep.current;
    const animation = transitionAnimation.current;
    transitionAnimation.current = null;
    pendingStep.current = null;
    animation.stop();
    if (nextStep) setStep(nextStep);
    panelOpacity.setValue(1);
    panelX.setValue(0);
    panelScale.setValue(1);
    setMoving(false);
  }, [panelOpacity, panelScale, panelX, reducedMotion]);

  useEffect(() => () => { transitionAnimation.current?.stop(); }, []);

  const selectedAreas = useMemo(() => focusAreas.filter((area) => topics.some((topic) => topic.id === area.id)), [topics]);
  const currentFacts = useMemo(() => facts.filter((fact) => !fact.validUntil), [facts]);
  const activeArea = focusAreas.find((area) => area.id === activeAreaId) ?? null;
  const countryIsCustom = country === 'Other' || (!!country && !countries.includes(country));
  const age = ageFromDateOfBirth(birthday);

  function transitionTo(next: OnboardingStep) {
    if (moving || next === step) return;
    const direction = stepOrder.indexOf(next) > stepOrder.indexOf(step) ? 1 : -1;
    if (reducedMotion) {
      setStep(next);
      panelOpacity.setValue(1);
      panelX.setValue(0);
      panelScale.setValue(1);
      setError('');
      return;
    }
    setMoving(true);
    pendingStep.current = next;
    const exitAnimation = Animated.parallel([
      Animated.timing(panelOpacity, { toValue: 0, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(panelX, { toValue: -direction * 24, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(panelScale, { toValue: 0.985, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
    ]);
    transitionAnimation.current = exitAnimation;
    exitAnimation.start(({ finished }) => {
      if (transitionAnimation.current !== exitAnimation) return;
      if (!finished) { transitionAnimation.current = null; pendingStep.current = null; setMoving(false); return; }
      setStep(next);
      pendingStep.current = null;
      panelX.setValue(direction * 28);
      panelScale.setValue(0.985);
      setError('');
      const enterAnimation = Animated.parallel([
        Animated.timing(panelOpacity, { toValue: 1, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
        Animated.timing(panelX, { toValue: 0, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
        Animated.spring(panelScale, { toValue: 1, speed: 20, bounciness: 3, useNativeDriver: animatedNativeDriver }),
      ]);
      transitionAnimation.current = enterAnimation;
      enterAnimation.start(() => {
        if (transitionAnimation.current !== enterAnimation) return;
        transitionAnimation.current = null;
        setMoving(false);
      });
    });
  }

  function selectArea(area: FocusArea) {
    const exists = topics.some((topic) => topic.id === area.id);
    if (exists) {
      setActiveAreaId(area.id);
      return;
    }
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    toggleTopic(topicFor(area));
    setActiveAreaId(area.id);
  }

  function removeArea(area: FocusArea) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    topics.filter((topic) => topic.id.startsWith(area.id + '::')).forEach((topic) => toggleTopic(topic));
    toggleTopic(topicFor(area));
    if (activeAreaId === area.id) setActiveAreaId(null);
  }

  function toggleDetail(area: FocusArea, signal: Signal) {
    if (signal.actionKind === 'marker') {
      router.push({ pathname: '/registry', params: { topicId: area.id, marker: signal.markerLabel ?? signal.label, ...(setupProgress.started && !setupProgress.complete ? { firstRun: 'true' } : {}) } });
      return;
    }
    if (signal.actionKind === 'visits') { router.push('/visits'); return; }
    if (signal.actionKind === 'treatment') { router.push({ pathname: '/treatment', params: { areaId: area.id } }); return; }
    if (signal.actionKind === 'record' || signal.actionKind === 'note') {
      router.push({ pathname: '/intake', params: { purpose: 'medical', areaId: area.id, ...(signal.actionKind === 'note' ? { capture: signal.captureKind ?? 'note', captureDetail: signal.label } : {}), ...(setupProgress.started && !setupProgress.complete ? { firstRun: 'true' } : {}) } });
      return;
    }
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    toggleTopic(withAreaTopicId(area.id, signal));
  }

  function addCustom() {
    const label = customArea.trim();
    if (!label) return;
    toggleTopic({ id: 'other::custom-' + Date.now().toString(36), label: 'Something else · ' + label });
    setCustomArea('');
  }

  function saveMeasurement(label: string, rawValue: string, unit: 'cm' | 'kg') {
    const entered = rawValue.trim();
    if (!entered) return;
    const value = /\b(cm|kg)\b/i.test(entered) ? entered : entered + ' ' + unit;
    const existing = currentFacts.find((fact) => fact.label.toLowerCase() === label.toLowerCase());
    if (existing?.value === value) return;
    if (existing) correctFact(existing.id, label, value);
    else addFact(label, value, { category: 'Biometrics', source: 'Entered by you', note: 'Self-reported measurement.' });
  }

  async function continueIdentity() {
    Keyboard.dismiss();
    const profileName = name.trim();
    const profileCountry = customCountry.trim() || country.trim();
    const validationCountry = customCountryEdited && countryIsCustom && !customCountry.trim() ? '' : country;
    const validationError = validateRequiredProfileDetails({
      name: profileName,
      country: validationCountry,
      customCountry,
      birthday,
      requireName: !existingProfileAtLoad,
      requireCountry: !existingProfileAtLoad,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    const measurementError = validateRequiredMeasurements({ heightCm: heightValue, weightKg: weightValue });
    if (measurementError) {
      setError(measurementError);
      return;
    }
    if (profileName !== name || profileCountry !== country.trim() || birthday.trim() !== birthday) {
      updateProfile({ name: profileName, country: profileCountry, birthday: birthday.trim() });
    }
    saveMeasurement('Height', heightValue, 'cm');
    saveMeasurement('Weight', weightValue, 'kg');
    setError('');
    try { await beginProfileSetup(); }
    catch { setError('Nura couldn’t save your setup progress on this device. Please retry.'); return; }
    transitionTo('focus');
  }

  async function continueFocus() {
    if (savingProfile) return;
    setSavingProfile(true);
    setError('');
    try {
      await commitProfileSetup();
      await beginProfileSetup();
      router.push('/setup');
    } catch {
      setError('Nura couldn’t finish saving this profile on your device. Your details have not been sent. Please retry.');
    } finally {
      setSavingProfile(false);
    }
  }

  const profileOverview = () => (
    <EvidenceFirstProfileOverview
      name={name}
      topics={topics}
      facts={currentFacts}
      treatments={treatments}
      assets={assets}
      visits={visits}
      reducedMotion={reducedMotion}
      allowEntranceMotion={motionPreference !== null && !reducedMotion}
    />
  );

  const stepIntro = (eyebrow: string, title: string, body: string) => (
    <View style={styles.stepIntro}>
      <Text style={styles.stepEyebrow}>{eyebrow}</Text>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepBody}>{body}</Text>
    </View>
  );

  const currentContent = (() => {
    if (step === 'welcome') {
      return (
        <View style={styles.welcomeScene}>
          <View style={styles.welcomeOrb}><Orb size={124} state="idle" /></View>
          <Text style={styles.welcomeEyebrow}>START WITH WHAT MATTERS</Text>
          <Text style={styles.welcomeTitle}>A clearer view of your health.</Text>
          <Text style={styles.welcomeBody}>Bring your health details, records and care into one connected view. Add only what you want, whenever you’re ready.</Text>
          <View style={styles.journeyPreview}>
            {domains.map((domain, index) => (
              <View key={domain.number} style={styles.journeyItem}>
                <View style={[styles.journeyDot, { backgroundColor: domain.color }]} />
                <Text style={styles.journeyNumber}>{domain.number}</Text>
                <Text style={styles.journeyName}>{domain.title}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.welcomePrivacy}>Your focus areas are choices. Health details remain connected to their source.</Text>
          <Pressable accessibilityRole="button" onPress={() => transitionTo('identity')} style={({ pressed }) => [styles.primaryButton, pressed && (reducedMotion ? styles.buttonPressedReduced : styles.buttonPressed)]}>
            <Text style={styles.primaryButtonText}>START MY PROFILE</Text><Text style={styles.primaryArrow}>→</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 'identity') {
      return (
        <View>
          {stepIntro(
            '01  ·  YOUR PROFILE',
            'The person behind the profile.',
            existingProfileAtLoad
              ? 'Review or update these details for this health profile. Your records stay connected to this profile.'
              : 'Add a display name, choose a country and enter your date of birth to set up your health profile. It is used to calculate the age shown here.',
          )}
          <View style={styles.identityCard}>
            <View style={styles.cardHeadingRow}>
              <View style={styles.cardIcon}><Text style={styles.cardIconText}>01</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.cardOverline}>PROFILE DETAILS</Text><Text style={styles.cardTitle}>Set up your health profile</Text></View>
            </View>
            <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
            <TextInput value={name} onChangeText={(value) => { updateProfile({ name: value }); setError(''); }} placeholder="Name or nickname" placeholderTextColor="#8D8792" style={styles.fieldInput} accessibilityLabel="Profile display name" autoComplete="name" returnKeyType="done" />
            <Text style={styles.fieldHelper}>{existingProfileAtLoad ? 'You can update this name at any time.' : 'Use a name or nickname for this profile. A legal name is not required.'}</Text>
            <Text style={styles.fieldLabel}>COUNTRY</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={country ? 'Country: ' + country + '. Change country' : 'Select your country'} onPress={() => setCountryPickerOpen(true)} style={styles.countryButton}>
              <Text style={[styles.countryButtonText, !country && styles.countryPlaceholder]}>{countryIsCustom ? customCountry || (country === 'Other' ? 'Enter your country' : country) : country || 'Select your country'}</Text><Text style={styles.countryChevron}>⌄</Text>
            </Pressable>
            {countryIsCustom ? <TextInput value={customCountryEdited ? customCountry : country === 'Other' ? '' : country} onChangeText={(value) => { setCustomCountry(value); setCustomCountryEdited(true); setError(''); }} placeholder="Enter country name" placeholderTextColor="#8D8792" style={[styles.fieldInput, styles.customCountryInput]} accessibilityLabel="Enter another country" autoComplete="postal-address-country" /> : null}
            <Text style={styles.fieldLabel}>DATE OF BIRTH · REQUIRED</Text>
            <TextInput value={birthday} onChangeText={(value) => { updateProfile({ birthday: value }); setError(''); }} placeholder="YYYY-MM-DD" placeholderTextColor="#8D8792" style={styles.fieldInput} accessibilityLabel="Date of birth, required" keyboardType="numbers-and-punctuation" maxLength={10} autoComplete="birthdate-full" />
            <Text style={styles.fieldHelper}>Required to calculate the age shown below. You can update it later.</Text>
            {age !== null ? <View style={styles.ageReadout}><View style={[styles.liveSignalDot, { backgroundColor: palette.blue }]} /><Text style={styles.ageReadoutText}>{age} years old · calculated from the date you entered</Text></View> : null}
            <Text style={styles.fieldLabel}>MEASUREMENTS · REQUIRED</Text>
            <Text style={styles.fieldHelper}>Height and weight are self-reported profile details. You can change them later.</Text>
            <View style={styles.contactFields}>
              <View style={styles.measureInputRow}><TextInput value={heightValue} onChangeText={(value) => { setHeight(value); setError(''); }} placeholder="Height · e.g. 168" placeholderTextColor="#8D8792" style={[styles.fieldInput, styles.measureInput]} accessibilityLabel="Height in centimetres, required" keyboardType="decimal-pad" /><Text style={styles.unitLabel}>cm</Text></View>
              <View style={styles.measureInputRow}><TextInput value={weightValue} onChangeText={(value) => { setWeight(value); setError(''); }} placeholder="Weight · e.g. 62" placeholderTextColor="#8D8792" style={[styles.fieldInput, styles.measureInput]} accessibilityLabel="Weight in kilograms, required" keyboardType="decimal-pad" /><Text style={styles.unitLabel}>kg</Text></View>
            </View>
          </View>
          {error ? <Text accessibilityRole="alert" style={styles.inlineError}>{error}</Text> : null}
          <Pressable accessibilityRole="button" onPress={continueIdentity} style={({ pressed }) => [styles.primaryButton, pressed && (reducedMotion ? styles.buttonPressedReduced : styles.buttonPressed)]}>
            <Text style={styles.primaryButtonText}>CONTINUE TO HEALTH AREAS</Text><Text style={styles.primaryArrow}>→</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View>
        {stepIntro('02  ·  YOUR HEALTH AREAS', 'What matters to your health?', 'Choose an area to follow. Selecting it opens related context choices.')}
        {profileOverview()}
        <View style={styles.focusPicker}>
          <GlassMaterial tone="dark" intensity={48} radius={20} />
          <View style={styles.focusHeading}>
            <Text style={styles.cardOverline}>CHOOSE HEALTH AREAS</Text>
            <Text style={styles.focusCount}>{String(selectedAreas.length).padStart(2, '0')} SELECTED</Text>
          </View>
          <Text style={styles.focusHelper}>Tap a selected bubble to edit context or remove it.</Text>
          <View style={styles.focusChoices}>
            {focusAreas.map((area) => (
              <FocusAreaChoice
                key={area.id}
                area={area}
                selected={selectedAreas.some((item) => item.id === area.id)}
                reducedMotion={reducedMotion}
                onPress={() => selectArea(area)}
              />
            ))}
          </View>
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.inlineError}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: savingProfile, busy: savingProfile }} disabled={savingProfile} onPress={continueFocus} style={({ pressed }) => [styles.primaryButton, pressed && (reducedMotion ? styles.buttonPressedReduced : styles.buttonPressed), savingProfile && styles.buttonDisabled]}>
          <Text style={styles.primaryButtonText}>{savingProfile ? 'SAVING YOUR PROFILE…' : 'ADD RECORDS OR A NOTE'}</Text>{savingProfile ? (reducedMotion ? <Text style={styles.savingStatus}>IN PROGRESS</Text> : <ActivityIndicator color="#2A203B" size="small" />) : <Text style={styles.primaryArrow}>→</Text>}
        </Pressable>
      </View>
    );
  })();

  return (
    <View style={styles.page}>
      <Atmosphere />
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={[styles.topbar, compactHeader && styles.topbarCompact]}>
          <View style={styles.brand}>
            <View style={styles.brandOrb}><Orb size={23} state="idle" /></View>
            <View><Text style={styles.brandName}>nura</Text><Text style={styles.brandTag}>HEALTH, IN CONTEXT</Text></View>
          </View>
        </View>
        {step !== 'welcome' ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTop}><Text style={styles.progressLabel}>PROFILE SETUP</Text><Text style={styles.progressCount}>{String(sceneIndex).padStart(2, '0')} / 06</Text></View>
            <View style={styles.progressRail}>{stepNames.slice(1).map((item, index) => <View key={item} style={[styles.progressSegment, index < sceneIndex - 1 && styles.progressSegmentDone, index === sceneIndex - 1 && styles.progressSegmentCurrent]} />)}</View>
            <View style={styles.progressNames}>{stepNames.slice(1).map((item, index) => <Text key={item} style={[styles.progressName, index === sceneIndex - 1 && styles.progressNameActive]}>{item}</Text>)}</View>
          </View>
        ) : null}
        <Animated.View pointerEvents={savingProfile ? 'none' : 'auto'} style={[styles.sceneFrame, { opacity: panelOpacity, transform: [{ translateX: panelX }, { scale: panelScale }] }]}>
          <ScrollView ref={sceneScrollRef} key={step} contentContainerStyle={styles.sceneContent} keyboardShouldPersistTaps="handled">
            {step === 'welcome' ? currentContent : (
              <View>
                <View style={styles.sceneBackRow}>
                  <Pressable accessibilityRole="button" onPress={() => transitionTo(stepOrder[sceneIndex - 1])} style={styles.backButton}><Text style={styles.backButtonText}>‹  BACK</Text></Pressable>
                  <Text style={styles.sceneCount}>{String(sceneIndex).padStart(2, '0')} OF 06</Text>
                </View>
                {currentContent}
              </View>
            )}
          </ScrollView>
        </Animated.View>
        {activeArea ? <FollowupBubbles key={activeArea.id} area={activeArea} areas={selectedAreas} topics={topics} setupProgress={setupProgress} reducedMotion={reducedMotion} onSwitchArea={(area) => setActiveAreaId(area.id)} onToggle={toggleDetail} onRemove={removeArea} onClose={() => setActiveAreaId(null)} customArea={customArea} setCustomArea={setCustomArea} onAddCustom={addCustom} /> : null}
        <CountryPicker
          key={countryPickerOpen ? 'open' : 'closed'}
          visible={countryPickerOpen}
          value={country}
          reducedMotion={reducedMotion}
          onClose={() => setCountryPickerOpen(false)}
          onSelect={(selectedCountry) => {
            updateProfile({ country: selectedCountry });
            setCustomCountry('');
            setCustomCountryEdited(false);
            setError('');
            setCountryPickerOpen(false);
          }}
        />
      </View>
    </View>
  );
}

function choiceSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
}

function FollowupBubbles({
  area, areas, topics, setupProgress, reducedMotion, onSwitchArea, onToggle, onRemove, onClose, customArea, setCustomArea, onAddCustom,
}: {
  area: FocusArea; areas: FocusArea[]; topics: HealthTopic[]; setupProgress: ProfileSetupProgress; reducedMotion: boolean;
  onSwitchArea: (area: FocusArea) => void; onToggle: (area: FocusArea, signal: Signal) => void;
  onRemove: (area: FocusArea) => void; onClose: () => void; customArea: string;
  setCustomArea: (value: string) => void; onAddCustom: () => void;
}) {
  const opacity = useMemo(() => new Animated.Value(0), []);
  const y = useMemo(() => new Animated.Value(44), []);
  const scale = useMemo(() => new Animated.Value(0.985), []);
  const shadeOpacity = useMemo(() => new Animated.Value(0), []);
  const nestedOpacity = useMemo(() => new Animated.Value(0), []);
  const nestedY = useMemo(() => new Animated.Value(10), []);
  const [expandedSignalId, setExpandedSignalId] = useState<string | null>(null);
  const [customChoice, setCustomChoice] = useState('');
  const choiceScrollRef = useRef<ScrollView | null>(null);
  const sheetAnimation = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    sheetAnimation.current?.stop();
    sheetAnimation.current = null;
    opacity.setValue(reducedMotion ? 1 : 0);
    y.setValue(reducedMotion ? 0 : 44);
    scale.setValue(reducedMotion ? 1 : 0.985);
    shadeOpacity.setValue(reducedMotion ? 1 : 0);
    if (reducedMotion) return;
    const animation = Animated.parallel([
      Animated.timing(shadeOpacity, { toValue: 1, duration: motion.standard, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.sequence([
        Animated.delay(65),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: motion.sheetEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
          Animated.spring(y, { toValue: 0, speed: 19, bounciness: 3, useNativeDriver: animatedNativeDriver }),
          Animated.spring(scale, { toValue: 1, speed: 20, bounciness: 2, useNativeDriver: animatedNativeDriver }),
        ]),
      ]),
    ]);
    sheetAnimation.current = animation;
    animation.start(() => { if (sheetAnimation.current === animation) sheetAnimation.current = null; });
    return () => {
      if (sheetAnimation.current === animation) { animation.stop(); sheetAnimation.current = null; }
    };
  }, [area.id, opacity, reducedMotion, scale, shadeOpacity, y]);

  useEffect(() => {
    nestedOpacity.stopAnimation();
    nestedY.stopAnimation();
    if (!expandedSignalId || reducedMotion) {
      nestedOpacity.setValue(expandedSignalId ? 1 : 0);
      nestedY.setValue(0);
      return;
    }
    nestedOpacity.setValue(0);
    nestedY.setValue(12);
    const animation = Animated.sequence([
      Animated.delay(45),
      Animated.parallel([
        Animated.timing(nestedOpacity, { toValue: 1, duration: motion.statusIn, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
        Animated.timing(nestedY, { toValue: 0, duration: motion.statusIn, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      ]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [expandedSignalId, nestedOpacity, nestedY, reducedMotion]);

  function closeSheet() {
    if (reducedMotion) { onClose(); return; }
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(y, { toValue: 18, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(scale, { toValue: 0.99, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(shadeOpacity, { toValue: 0, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
    ]);
    sheetAnimation.current?.stop();
    sheetAnimation.current = animation;
    animation.start(({ finished }) => {
      if (sheetAnimation.current !== animation) return;
      sheetAnimation.current = null;
      if (finished) onClose();
    });
  }

  const expandedSignal = area.signals.find((signal) => signal.id === expandedSignalId && signal.quickChoices?.length) ?? null;
  function toggleSignal(signal: Signal) {
    if (!signal.quickChoices?.length) { onToggle(area, signal); return; }
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSignalId((current) => current === signal.id ? null : signal.id);
    setCustomChoice('');
  }
  function addQuickChoice(signal: Signal, choice: string, ignoreDuplicate = false) {
    const cleanChoice = choice.trim();
    if (!cleanChoice) return;
    if (signal.choiceKind === 'medicine') {
      router.push({ pathname: '/treatment', params: { areaId: area.id, medicine: cleanChoice, ...(setupProgress.started && !setupProgress.complete ? { firstRun: 'true' } : {}) } });
      return;
    }
    const nestedSignal = signal.choiceKind === 'relative'
      ? createFamilyHistoryTopic(area.id, signal.id, signal.label, cleanChoice)
      : { id: signal.id + '::' + choiceSlug(cleanChoice), label: `Symptom · ${cleanChoice}` };
    const topic = withAreaTopicId(area.id, nestedSignal);
    const exists = topics.some((candidate) => candidate.id === topic.id);
    if (exists && ignoreDuplicate) return;
    if (!exists && !reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle(area, topic);
    if (signal.choiceKind === 'relative' || signal.choiceKind === 'symptom') {
      router.push({ pathname: '/intake', params: { purpose: 'medical', areaId: area.id, capture: signal.choiceKind === 'relative' ? 'family-history' : 'symptom', captureDetail: `${signal.label} · ${cleanChoice}`, ...(setupProgress.started && !setupProgress.complete ? { firstRun: 'true' } : {}) } });
    }
  }
  function addCustomChoice() {
    if (!expandedSignal || !customChoice.trim()) return;
    addQuickChoice(expandedSignal, customChoice, true);
    setCustomChoice('');
  }

  return (
    <Animated.View style={[styles.focusSheetShade, { opacity: shadeOpacity }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close health area details" onPress={closeSheet} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.focusSheet, { opacity, transform: [{ translateY: y }, { scale }] }]}>
        <GlassMaterial tone="dark" intensity={48} radius={26} />
        <View style={[styles.focusSheetAccent, { backgroundColor: area.color }]} />
        <View style={styles.sheetHandle} />
        <View style={styles.followupHeading}>
          <View style={[styles.followupIcon, { backgroundColor: area.pale }]}><Text style={[styles.followupGlyph, { color: area.ink }]}>{area.id === 'bp-topic' ? '↕' : area.id === 'cholesterol' ? '◌' : area.id === 'sleep' ? '☾' : area.id === 'heart' ? '♡' : area.id === 'sugar' ? '⌁' : area.id === 'medicines' ? '+' : '•'}</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.followupOverline}>CONTEXT FOR THIS AREA</Text><Text style={styles.followupTitle}>{area.label}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={'Remove ' + area.label + ' from your profile'} onPress={() => onRemove(area)} style={styles.followupRemove}><Text style={styles.followupRemoveText}>REMOVE</Text></Pressable>
        </View>
        <ScrollView
          ref={choiceScrollRef}
          style={styles.focusSheetScroll}
          contentContainerStyle={styles.focusSheetScrollContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (expandedSignalId !== null) choiceScrollRef.current?.scrollToEnd({ animated: !reducedMotion });
          }}
        >
          <Text style={styles.followupHint}>{area.id === 'other' ? 'Name a topic you would like to follow. This does not add a diagnosis or record.' : area.id === 'family' ? 'Choose the condition first, then select the family relationship. This is self-reported family context, not a diagnosis for you.' : 'Choose any context that applies. A diagnosis selection is self-reported; add its name and status in a note or record.'}</Text>
          {areas.length > 1 ? (
            <View style={styles.detailAreaSwitcherWrap}>
              <Text style={styles.detailAreaSwitcherLabel}>SWITCH HEALTH AREA</Text>
              <View style={styles.detailAreaSwitcher}>
                {areas.map((selectedArea) => {
                  const current = selectedArea.id === area.id;
                  const detailCount = topics.filter((topic) => topic.id.startsWith(selectedArea.id + '::')).length;
                  return <PressScale key={selectedArea.id} selected={current} reducedMotion={reducedMotion} label={'Show ' + selectedArea.label + ' details' + (detailCount ? ', ' + detailCount + ' selected' : '')} onPress={() => onSwitchArea(selectedArea)} containerStyle={styles.detailAreaChipSlot} style={[styles.detailAreaChip, { borderColor: selectedArea.color + 'B0', backgroundColor: current ? selectedArea.color + '48' : 'rgba(255,255,255,.06)' }]}><View style={[styles.detailAreaChipDot, { backgroundColor: selectedArea.color }]} /><Text numberOfLines={1} style={styles.detailAreaChipText}>{selectedArea.label}</Text>{detailCount > 0 ? <Text style={styles.detailAreaChipCount}>{detailCount}</Text> : null}</PressScale>;
                })}
              </View>
            </View>
          ) : null}
          <View style={styles.detailBubbleRow}>
            {area.signals.filter((signal) => area.id !== 'other' || signal.id !== 'other-note').map((signal) => {
              const nestedPrefix = area.id + '::' + signal.id + '::';
              const nestedCount = signal.quickChoices?.length ? topics.filter((topic) => topic.id.startsWith(nestedPrefix)).length : 0;
              const legacySelected = topics.some((topic) => topic.id === area.id + '::' + signal.id);
              const selected = legacySelected || nestedCount > 0;
              const expanded = expandedSignalId === signal.id;
              const choiceKind = signal.choiceKind === 'symptom' ? 'symptoms' : signal.choiceKind === 'relative' ? 'family relationships' : 'medicines';
              const accessibilityLabel = signal.quickChoices?.length
                ? (expanded ? 'Collapse ' : 'Expand ') + signal.label + ' choices, ' + signal.quickChoices.length + ' common ' + choiceKind + (nestedCount ? ', ' + nestedCount + ' selected' : '')
                : (selected ? 'Remove ' : 'Add ') + signal.label;
              const disclosure = signal.quickChoices?.length
                ? (nestedCount ? `${nestedCount} selected · ` : '') + (expanded ? `TAP TO CLOSE · ${signal.quickChoices.length} COMMON ${choiceKind.toUpperCase()}` : `TAP TO OPEN · ${signal.quickChoices.length} COMMON ${choiceKind.toUpperCase()}`)
                : null;
              return <PressScale key={signal.id} selected={selected} expanded={expanded} reducedMotion={reducedMotion} label={accessibilityLabel} onPress={() => toggleSignal(signal)} containerStyle={styles.detailChoiceSlot} glassTone="dark" glassRadius={15} style={[styles.detailChoice, selected && { backgroundColor: area.color + '70', borderColor: area.pale }]}><View style={[styles.detailChoiceMark, { backgroundColor: selected ? area.pale : area.color + '45' }]}><Text style={[styles.detailChoiceMarkText, { color: selected ? area.ink : area.pale }]}>{signal.quickChoices?.length ? expanded ? '⌃' : '⌄' : selected ? '✓' : '+'}</Text></View><View style={styles.detailChoiceCopy}><Text style={styles.detailChoiceText}>{signal.label}</Text>{disclosure ? <Text style={styles.detailChoiceMeta}>{disclosure}</Text> : null}</View></PressScale>;
            })}
          </View>
          {expandedSignal ? (
            <Animated.View style={[styles.nestedChoicePanel, { opacity: nestedOpacity, transform: [{ translateY: nestedY }] }]}>
              <GlassMaterial tone="dark" intensity={42} radius={16} />
              <Text style={styles.nestedChoiceEyebrow}>{expandedSignal.choiceKind === 'symptom' ? 'SYMPTOMS TO ADD' : expandedSignal.choiceKind === 'relative' ? 'WHO IN YOUR FAMILY?' : 'MEDICINES YOU MAY RECOGNIZE'}</Text>
              <Text style={styles.nestedChoiceHint}>{expandedSignal.choiceKind === 'symptom'
                ? 'Choose what you have noticed. These starter examples are self-reported signals, not a diagnosis; add any other symptom in your own words.'
                : expandedSignal.choiceKind === 'relative'
                  ? `Choose the relationship for this ${expandedSignal.label.toLowerCase()}. Only family-history context is recorded; this does not add a diagnosis to your profile.`
                  : 'Choose only a medicine you already take or have taken for this area. These examples are not complete or recommendations; add another name if yours is not listed.'}</Text>
              <View style={styles.nestedChoiceGrid}>
                {expandedSignal.quickChoices?.map((choice) => {
                  const topicId = area.id + '::' + expandedSignal.id + '::' + choiceSlug(choice);
                  const selected = topics.some((topic) => topic.id === topicId);
                  const choiceKind = expandedSignal.choiceKind === 'symptom' ? 'symptom' : expandedSignal.choiceKind === 'relative' ? 'family relationship' : 'medicine';
                  return <Pressable key={choice} accessibilityRole="button" accessibilityLabel={(selected ? 'Remove ' : 'Add ') + choiceKind + ': ' + choice} accessibilityState={{ selected }} onPress={() => addQuickChoice(expandedSignal, choice)} style={[styles.nestedChoiceButton, selected && styles.nestedChoiceButtonSelected]}><Text style={styles.nestedChoiceMark}>{selected ? '✓' : '+'}</Text><Text style={styles.nestedChoiceText}>{choice}</Text></Pressable>;
                })}
              </View>
              {expandedSignal.choiceKind !== 'relative' ? <View style={styles.customChoiceRow}>
                <TextInput value={customChoice} onChangeText={setCustomChoice} onSubmitEditing={addCustomChoice} placeholder={'Add another ' + (expandedSignal.choiceKind === 'symptom' ? 'symptom' : 'medicine')} placeholderTextColor="rgba(255,249,244,.48)" accessibilityLabel={expandedSignal.choiceKind === 'symptom' ? 'Add another symptom' : 'Add another medicine name'} returnKeyType="done" style={[styles.fieldInput, styles.customChoiceInput]} />
                <Pressable accessibilityRole="button" accessibilityLabel={'Save ' + (expandedSignal.choiceKind === 'symptom' ? 'symptom' : 'medicine')} onPress={addCustomChoice} style={styles.customChoiceAdd}><Text style={styles.customChoiceAddText}>ADD</Text></Pressable>
              </View> : null}
            </Animated.View>
          ) : null}
          {area.id === 'other' ? <View style={styles.customAreaRow}><TextInput value={customArea} onChangeText={setCustomArea} onSubmitEditing={onAddCustom} placeholder="Add your own words" placeholderTextColor="rgba(255,249,244,.48)" style={[styles.fieldInput, styles.customAreaInput]} returnKeyType="done" /><Pressable accessibilityRole="button" onPress={onAddCustom} style={styles.customAreaAdd}><Text style={styles.customAreaAddText}>ADD</Text></Pressable></View> : null}
          {area.id !== 'other' ? <View style={styles.reportEntryCard}><Text style={styles.reportEntryTitle}>Add a report or image for {area.label}</Text><Text style={styles.reportEntryHint}>Choose a PDF, Word document or photo, then approve reading. Nura shows source-linked suggestions for your review before anything is saved.</Text><Pressable accessibilityRole="button" accessibilityLabel={'Add a health report or image for ' + area.label} onPress={() => router.push({ pathname: '/intake', params: { purpose: 'medical', areaId: area.id, ...(setupProgress.started && !setupProgress.complete ? { firstRun: 'true' } : {}) } })} style={styles.reportEntryButton}><Text style={styles.reportEntryButtonText}>CHOOSE REPORT OR IMAGE →</Text></Pressable></View> : null}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={closeSheet} style={styles.focusSheetDone}><Text style={styles.focusSheetDoneText}>DONE</Text></Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas },
  ambientFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  ambientWarm: { position: 'absolute', top: -86, right: -120, width: 310, height: 310, borderRadius: 160, opacity: 0.9 },
  ambientViolet: { position: 'absolute', left: -150, bottom: 35, width: 330, height: 330, borderRadius: 170, opacity: 0.8 },
  content: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 48 : 27, paddingBottom: 8 },
  topbar: { minHeight: 46, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  topbarCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 4 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandOrb: { width: 31, height: 31, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: palette.lilac, shadowOpacity: 0.48, shadowRadius: 14 },
  brandName: { color: palette.ink, fontSize: 17, fontWeight: '700', letterSpacing: 1.1 },
  brandTag: { color: 'rgba(255,249,244,.64)', fontSize: 10, letterSpacing: 1.35, marginTop: 2 },
  topActions: { alignItems: 'flex-end', gap: 3 },
  topActionsCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  private: { color: 'rgba(255,249,244,.62)', fontSize: 10, fontWeight: '700', letterSpacing: 1.3 },
  homeLink: { minHeight: 29, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 12 },
  homeLinkPressed: { backgroundColor: 'rgba(255,255,255,.12)' },
  homeLinkText: { color: '#F8EDE7', fontSize: 10, fontWeight: '700', letterSpacing: 0.7 },
  browserPrivacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 9, borderRadius: 13, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', marginBottom: 8 },
  browserPrivacyMark: { width: 17, height: 17, borderRadius: 9, backgroundColor: 'rgba(199,168,229,.3)', alignItems: 'center', justifyContent: 'center' },
  browserPrivacyMarkText: { color: palette.ink, fontSize: 10, fontWeight: '700' },
  browserPrivacyText: { flex: 1, color: 'rgba(255,249,244,.78)', fontSize: 9, lineHeight: 13 },
  progressWrap: { paddingHorizontal: 2, marginBottom: 10 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { color: 'rgba(255,249,244,.63)', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  progressCount: { color: '#F0D9CC', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  setupHeaderStatus: { color: 'rgba(255,249,244,.73)', fontSize: 9, fontWeight: '700', letterSpacing: 1.1, paddingHorizontal: 8 },
  progressRail: { flexDirection: 'row', gap: 4, marginTop: 6 },
  progressSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.16)' },
  progressSegmentDone: { backgroundColor: 'rgba(232,180,143,.82)' },
  progressSegmentCurrent: { backgroundColor: '#F7E6DB' },
  progressNames: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  progressName: { color: 'rgba(255,249,244,.45)', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  progressNameActive: { color: '#F8DECC' },
  sceneFrame: { flex: 1, minHeight: 0 },
  sceneContent: { paddingBottom: 26, flexGrow: 1 },
  sceneBackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backButton: { minHeight: 38, minWidth: 66, justifyContent: 'center' },
  backButtonText: { color: 'rgba(255,249,244,.7)', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  sceneCount: { color: 'rgba(255,249,244,.52)', fontSize: 10, fontWeight: '700', letterSpacing: 1.3 },
  welcomeScene: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10, paddingBottom: 14 },
  welcomeOrb: { width: 152, height: 152, alignItems: 'center', justifyContent: 'center', marginBottom: 19 },
  welcomeEyebrow: { color: 'rgba(255,249,244,.65)', fontSize: 10, fontWeight: '700', letterSpacing: 2, textAlign: 'center' },
  welcomeTitle: { color: palette.ink, fontSize: 31, lineHeight: 36, fontWeight: '300', letterSpacing: -1.2, textAlign: 'center', marginTop: 12, maxWidth: 340 },
  welcomeBody: { color: 'rgba(255,249,244,.78)', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 10, maxWidth: 330 },
  journeyPreview: { width: '100%', marginTop: 25, paddingVertical: 15, paddingHorizontal: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', backgroundColor: 'rgba(255,255,255,.06)', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  journeyItem: { minWidth: '27%', flexDirection: 'row', alignItems: 'center', gap: 5 },
  journeyDot: { width: 7, height: 7, borderRadius: 4 },
  journeyNumber: { color: 'rgba(255,249,244,.52)', fontSize: 10, fontWeight: '700' },
  journeyName: { color: palette.ink, fontSize: 9, fontWeight: '600' },
  welcomePrivacy: { color: 'rgba(255,249,244,.57)', fontSize: 9, lineHeight: 13, textAlign: 'center', marginTop: 15, maxWidth: 310 },
  stepIntro: { marginTop: 4, marginBottom: 16 },
  stepEyebrow: { color: '#E5C7B7', fontSize: 10, fontWeight: '700', letterSpacing: 1.55 },
  stepTitle: { color: palette.ink, fontSize: 28, lineHeight: 33, fontWeight: '400', letterSpacing: -0.8, marginTop: 7 },
  stepBody: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 7 },
  identityCard: { padding: 15, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(255,255,255,.22)', backgroundColor: 'rgba(255,255,255,.075)', marginBottom: 12 },
  cardHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  cardIcon: { width: 34, height: 34, borderRadius: 13, backgroundColor: 'rgba(232,180,143,.2)', borderWidth: 1, borderColor: 'rgba(232,180,143,.42)', alignItems: 'center', justifyContent: 'center' },
  measureIcon: { backgroundColor: 'rgba(140,201,245,.18)', borderColor: 'rgba(140,201,245,.42)' },
  cardIconText: { color: palette.cream, fontSize: 12, fontWeight: '700' },
  cardOverline: { color: 'rgba(255,249,244,.62)', fontSize: 10, fontWeight: '700', letterSpacing: 1.35 },
  cardTitle: { color: palette.ink, fontSize: 15, fontWeight: '600', marginTop: 3 },
  fieldLabel: { color: 'rgba(255,249,244,.66)', fontSize: 10, fontWeight: '700', letterSpacing: 1.1, marginTop: 9, marginBottom: 5 },
  fieldInput: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,.86)', backgroundColor: 'rgba(255,246,236,.08)', paddingHorizontal: 12, color: '#FFF8F0', fontSize: 14 },
  countryButton: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,.86)', backgroundColor: 'rgba(255,246,236,.08)', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countryButtonText: { color: '#FFF8F0', fontSize: 12 },
  countryPlaceholder: { color: '#8D8792' },
  countryChevron: { color: '#745487', fontSize: 19 },
  customCountryInput: { marginTop: 7 },
  contactFields: { gap: 7 },
  contactInput: { width: '100%' },
  fieldHelper: { color: 'rgba(255,249,244,.58)', fontSize: 9, lineHeight: 14, marginTop: 9 },
  ageReadout: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, paddingHorizontal: 3 },
  ageReadoutText: { color: '#D9EAF9', fontSize: 9 },
  profileOverview: { backgroundColor: 'rgba(83,55,42,.90)', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,248,240,.27)', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, marginBottom: 13, overflow: 'hidden' },
  overviewHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  overviewTitleGroup: { flex: 1, minWidth: 0 },
  overviewEyebrow: { color: '#F2C2A2', fontSize: 10, fontWeight: '800', letterSpacing: 1.35 },
  overviewTitle: { color: '#FFF8F0', fontSize: 19, lineHeight: 23, fontWeight: '700', marginTop: 3, maxWidth: '100%' },
  overviewStatus: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 16, backgroundColor: 'rgba(199,168,229,.16)', borderWidth: 1, borderColor: 'rgba(255,248,240,.24)' },
  overviewStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#D2A8EF' },
  overviewStatusText: { color: '#F5E5F5', fontSize: 9, fontWeight: '800', letterSpacing: .55 },
  overviewIntro: { color: '#E8DDEB', fontSize: 12, lineHeight: 17, marginTop: 8 },
  overviewMetrics: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', minHeight: 48, marginTop: 11, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,248,240,.20)', backgroundColor: 'rgba(255,248,240,.075)' },
  overviewMetric: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  overviewMetricValue: { color: '#FFF8F0', fontSize: 18, lineHeight: 21, fontWeight: '700' },
  overviewMetricLabel: { color: '#D9CBDE', fontSize: 9, lineHeight: 12, letterSpacing: .25, textAlign: 'center', marginTop: 2 },
  overviewMetricRule: { width: 1, height: 25, backgroundColor: 'rgba(255,248,240,.24)' },
  overviewSection: { marginTop: 13 },
  overviewDisclosure: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,248,240,.18)', marginTop: 8, paddingTop: 7 },
  overviewDisclosureAction: { color: '#D9C1EA', fontSize: 9, fontWeight: '800', letterSpacing: .8 },
  overviewSectionTitle: { color: '#F2C2A2', fontSize: 10, fontWeight: '800', letterSpacing: .95 },
  overviewEvidenceList: { gap: 7 },
  overviewEvidenceCard: { borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,248,240,.21)', backgroundColor: 'rgba(255,248,240,.065)', padding: 10 },
  overviewEvidenceHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  overviewEvidenceMark: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  overviewSourceMark: { backgroundColor: 'rgba(112,174,255,.17)' },
  overviewDetailMark: { backgroundColor: 'rgba(214,179,238,.18)' },
  overviewEvidenceGlyph: { color: '#D7E8FF', fontSize: 14, fontWeight: '700' },
  overviewEvidenceCopy: { flex: 1, minWidth: 0 },
  overviewEvidenceState: { color: '#B9D6FF', fontSize: 9, fontWeight: '800', letterSpacing: .7 },
  overviewEvidenceTitle: { color: '#FFF8F0', fontSize: 13, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  overviewEvidenceMeta: { color: '#D9CBDE', fontSize: 10, lineHeight: 14, marginTop: 2 },
  overviewEvidenceSummary: { color: '#E8DDEB', fontSize: 11, lineHeight: 15, marginTop: 3 },
  overviewEvidenceOpen: { color: '#A9CCFF', fontSize: 8.5, fontWeight: '800', letterSpacing: .45, marginLeft: 'auto' },
  overviewEvidenceDetail: { marginTop: 7, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,248,240,.18)' },
  overviewEvidenceDetailTitle: { color: '#FFF8F0', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  overviewEvidenceDetailValue: { color: '#D9CBDE', fontSize: 10, lineHeight: 14, marginTop: 2 },
  overviewEvidenceMoreButton: { minHeight: 44, alignItems: 'flex-start', justifyContent: 'center', marginTop: 3 },
  overviewEvidenceMore: { color: '#E4C4F4', fontSize: 10, fontWeight: '700' },
  overviewAllRecords: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#1769E8', backgroundColor: '#1769E8', alignItems: 'center', justifyContent: 'center' },
  overviewAllRecordsText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: .5 },
  liveSignalDot: { width: 6, height: 6, borderRadius: 3 },
  measureInputRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  measureInput: { flex: 1 },
  unitLabel: { color: '#B7DFFF', fontSize: 13, fontWeight: '700', width: 34 },
  followupCard: { padding: 13, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,.20)', backgroundColor: 'rgba(66,43,35,.62)', marginTop: 8, marginBottom: 12, overflow: 'hidden' },
  followupHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  followupIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  followupGlyph: { fontSize: 17, fontWeight: '500' },
  followupOverline: { color: 'rgba(255,249,244,.55)', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  followupTitle: { color: palette.ink, fontSize: 14, marginTop: 2, fontWeight: '600' },
  followupHint: { color: palette.muted, fontSize: 9, lineHeight: 14, marginTop: 7 },
  detailAreaSwitcherWrap: { marginTop: 12 },
  detailAreaSwitcherLabel: { color: 'rgba(255,249,244,.52)', fontSize: 8, fontWeight: '700', letterSpacing: .9, marginBottom: 6 },
  detailAreaSwitcher: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, paddingRight: 2, paddingVertical: 2 },
  detailAreaChipSlot: { flexShrink: 0 },
  detailAreaChip: { minHeight: 34, maxWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 17, borderWidth: 1 },
  detailAreaChipDot: { width: 7, height: 7, borderRadius: 4 },
  detailAreaChipText: { color: palette.ink, fontSize: 9, fontWeight: '600', maxWidth: 126 },
  detailAreaChipCount: { minWidth: 15, textAlign: 'center', color: 'rgba(255,249,244,.72)', fontSize: 8, fontWeight: '700' },
  focusSheetShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, elevation: 1000, backgroundColor: 'rgba(18,12,10,.72)', justifyContent: 'flex-end', paddingTop: 36 },
  focusSheet: { width: '100%', maxWidth: 520, maxHeight: '88%', alignSelf: 'center', backgroundColor: 'rgba(61,41,33,.96)', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: 'rgba(255,255,255,.34)', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, overflow: 'hidden' },
  focusSheetAccent: { height: 3, position: 'absolute', left: 0, right: 0, top: 0, opacity: .95 },
  detailBubbleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'space-between' },
  detailChoiceSlot: { width: '48%' },
  detailChoice: { width: '100%', minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,.24)', backgroundColor: 'rgba(255,255,255,.075)', paddingHorizontal: 9, paddingVertical: 8 },
  detailChoiceMark: { width: 24, height: 24, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  detailChoiceMarkText: { fontSize: 15, fontWeight: '700', lineHeight: 18 },
  detailChoiceCopy: { flex: 1, gap: 3 },
  detailChoiceText: { color: palette.ink, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  detailChoiceMeta: { color: '#F0DFF8', fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: .3 },
  nestedChoicePanel: { position: 'relative', overflow: 'hidden', marginTop: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.34)', backgroundColor: 'rgba(242,197,167,.10)' },
  nestedChoiceEyebrow: { color: '#E7C9EE', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  nestedChoiceHint: { color: 'rgba(255,249,244,.82)', fontSize: 11, lineHeight: 16, marginTop: 5 },
  nestedChoiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  nestedChoiceButton: { minHeight: 42, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(255,255,255,.23)', backgroundColor: 'rgba(255,255,255,.07)', paddingHorizontal: 12, paddingVertical: 8 },
  nestedChoiceButtonSelected: { backgroundColor: 'rgba(130,183,243,.32)', borderColor: '#B8D9FF' },
  nestedChoiceMark: { color: '#BDD9FF', fontSize: 12, fontWeight: '800' },
  nestedChoiceText: { color: palette.ink, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  customChoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  customChoiceInput: { flex: 1, minHeight: 40, fontSize: 11 },
  customChoiceAdd: { minWidth: 56, minHeight: 40, borderRadius: 12, backgroundColor: palette.cream, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  customChoiceAddText: { color: '#30223B', fontSize: 8, fontWeight: '800', letterSpacing: .5 },
  reportEntryCard: { marginTop: 11, padding: 11, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(140,201,245,.32)', backgroundColor: 'rgba(140,201,245,.08)' },
  reportEntryTitle: { color: '#DDEEFF', fontSize: 10, fontWeight: '700' },
  reportEntryHint: { color: 'rgba(255,249,244,.67)', fontSize: 8, lineHeight: 12, marginTop: 3 },
  reportEntryButton: { minHeight: 42, borderRadius: 12, backgroundColor: 'rgba(35,104,222,.88)', alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingHorizontal: 10 },
  reportEntryButtonText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: .5 },
  focusSheetScroll: { flexShrink: 1, minHeight: 0 },
  focusSheetScrollContent: { paddingBottom: 3 },
  customAreaRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  customAreaInput: { flex: 1 },
  customAreaAdd: { minWidth: 65, borderRadius: 13, backgroundColor: palette.cream, alignItems: 'center', justifyContent: 'center' },
  customAreaAddText: { color: '#30223B', fontSize: 10, fontWeight: '800', letterSpacing: .6 },
  focusHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8, marginBottom: 5 },
  focusCount: { color: '#F2D4C1', fontSize: 10, fontWeight: '700', letterSpacing: .7, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 11, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)' },
  focusHelper: { color: 'rgba(255,249,244,.68)', fontSize: 11, lineHeight: 15, marginBottom: 4 },
  focusPicker: { position: 'relative', overflow: 'hidden', padding: 13, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,.30)', backgroundColor: 'rgba(255,255,255,.045)', marginTop: 2, marginBottom: 12 },
  focusChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  focusChoiceSlot: { width: '31%' },
  focusChoice: { position: 'relative', minHeight: 96, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 7, paddingTop: 12, paddingBottom: 8, borderRadius: 52, borderWidth: 1, backgroundColor: 'rgba(255,249,244,.08)', shadowOpacity: .32, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  focusChoiceSelected: { backgroundColor: 'rgba(255,249,244,.12)' },
  focusChoiceIcon: { position: 'relative', overflow: 'hidden', width: 39, height: 39, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,.98)', alignItems: 'center', justifyContent: 'center', shadowColor: '#FFFFFF', shadowOpacity: .68, shadowRadius: 15, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  focusIconSheen: { position: 'absolute', left: 6, top: 3, width: 24, height: 9, borderRadius: 7, backgroundColor: 'rgba(255,255,255,.36)' },
  focusChoiceGlyph: { color: '#FFFFFF', fontSize: 17, lineHeight: 21, fontWeight: '800' },
  focusChoiceLabel: { width: '100%', color: '#FFF9F4', fontSize: 11, lineHeight: 13, fontWeight: '600', textAlign: 'center' },
  focusChoiceLabelSelected: { color: '#FFFFFF', fontWeight: '700' },
  focusChoiceMark: { position: 'absolute', top: 5, right: 7, width: 18, height: 18, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,.56)', backgroundColor: 'rgba(48,32,25,.84)', alignItems: 'center', justifyContent: 'center' },
  focusChoiceMarkText: { color: 'rgba(255,249,244,.98)', fontSize: 14, lineHeight: 16, fontWeight: '500' },
  focusChoiceMarkTextSelected: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  followupRemove: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,.17)' },
  followupRemoveText: { color: '#F1D3C4', fontSize: 8, fontWeight: '800', letterSpacing: .7 },
  inlineError: { color: '#FFE1CF', backgroundColor: 'rgba(188,77,71,.18)', borderWidth: 1, borderColor: 'rgba(243,181,98,.45)', borderRadius: 12, padding: 10, marginBottom: 9, fontSize: 10, lineHeight: 15 },
  primaryButton: { minHeight: 56, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,.72)', backgroundColor: 'rgba(255,249,244,.94)', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, shadowColor: '#D7B8F5', shadowOpacity: .24, shadowRadius: 15, shadowOffset: { width: 0, height: 6 } },
  buttonPressed: { opacity: .9, transform: [{ scale: motion.pressScale }] }, buttonPressedReduced: { opacity: .9 }, savingStatus: { color: '#57486A', fontSize: 8, fontWeight: '800', letterSpacing: .5 },
  buttonDisabled: { opacity: .8 },
  primaryButtonText: { color: '#30223B', fontSize: 9, fontWeight: '800', letterSpacing: .9 },
  primaryArrow: { color: '#30223B', fontSize: 22, fontWeight: '300' },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  secondaryButtonText: { color: 'rgba(255,249,244,.76)', fontSize: 10, fontWeight: '700', letterSpacing: .8 },
  modalShade: { flex: 1, backgroundColor: 'rgba(18,12,10,.72)', justifyContent: 'flex-end', paddingTop: 40 },
  countrySheet: { width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '82%', backgroundColor: '#30221D', borderWidth: 1, borderColor: 'rgba(255,226,205,.30)', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14 },
  sheetHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,246,236,.48)', alignSelf: 'center', marginBottom: 15 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetOverline: { color: 'rgba(255,235,222,.72)', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  sheetTitle: { color: '#FFF8F0', fontSize: 19, fontWeight: '500', marginTop: 3 },
  sheetClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,246,236,.10)' },
  sheetCloseText: { color: '#FFF8F0', fontSize: 22 },
  countrySearch: { minHeight: 46, backgroundColor: 'rgba(255,246,236,.08)', borderWidth: 1, borderColor: 'rgba(255,226,205,.30)', borderRadius: 13, paddingHorizontal: 12, color: '#FFF8F0', marginTop: 12, marginBottom: 6, fontSize: 12 },
  countryList: { minHeight: 160 },
  countryOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,226,205,.16)', paddingHorizontal: 8 },
  countryOptionSelected: { backgroundColor: 'rgba(242,197,167,.16)' },
  countryOptionText: { color: '#FFF8F0', fontSize: 12 },
  countryOptionTextSelected: { color: '#F2BD9D', fontWeight: '700' },
  countryOptionMark: { color: '#D9B9E8', fontSize: 14 },
  noCountry: { color: 'rgba(255,235,222,.68)', fontSize: 10, lineHeight: 15, padding: 10 },
  otherCountry: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginTop: 5, borderTopWidth: 1, borderTopColor: 'rgba(255,226,205,.20)' },
  otherCountryText: { color: 'rgba(255,248,240,.82)', fontSize: 11, fontWeight: '600' },
  sheetDone: { minHeight: 46, borderRadius: 23, backgroundColor: '#BD7656', alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  sheetDoneText: { color: '#FFF9F4', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  focusSheetDone: { minHeight: 46, borderRadius: 23, backgroundColor: palette.cream, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  focusSheetDoneText: { color: '#30223B', fontSize: 10, fontWeight: '800', letterSpacing: .8 },
});
