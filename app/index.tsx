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
import { useNura, HealthTopic } from '../src/state/NuraContext';
import { brandScenes, motion } from '../src/theme';
import { ageFromDateOfBirth, hasExistingProfileEvidence, validateRequiredProfileDetails } from '../src/services/profileDemographics.mjs';
import { createProfileMapLayout } from '../src/services/profileMapLayout.mjs';

type Signal = { id: string; label: string };
type FocusArea = {
  id: string;
  label: string;
  color: string;
  pale: string;
  ink: string;
  signals: Signal[];
};
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

const focusAreas: FocusArea[] = [
  { id: 'bp-topic', label: 'Blood pressure', color: '#2785E6', pale: '#D8E9FF', ink: '#1557B9', signals: [{ id: 'readings', label: 'Recent readings' }, { id: 'medicine', label: 'Blood pressure medicine' }, { id: 'visits', label: 'Related visits' }, { id: 'symptoms', label: 'Symptoms' }] },
  { id: 'cholesterol', label: 'Cholesterol', color: '#238DC3', pale: '#D9F0F4', ink: '#176A9D', signals: [{ id: 'lipid-panel', label: 'Lipid panel' }, { id: 'ldl-hdl', label: 'LDL and HDL' }, { id: 'statin', label: 'Cholesterol medicine' }, { id: 'diet', label: 'Food and routines' }] },
  { id: 'sleep', label: 'Sleep', color: '#8066BC', pale: '#E9DFFA', ink: '#66559E', signals: [{ id: 'sleep-study', label: 'Sleep study' }, { id: 'apnea', label: 'Sleep apnea' }, { id: 'routine', label: 'Sleep routine' }, { id: 'fatigue', label: 'Daytime tiredness' }] },
  { id: 'heart', label: 'Heart health', color: '#C96876', pale: '#F7DCE0', ink: '#A84958', signals: [{ id: 'cardiology', label: 'Heart specialist' }, { id: 'ecg', label: 'ECG or imaging' }, { id: 'rhythm', label: 'Heart rhythm' }, { id: 'family-heart', label: 'Family history' }] },
  { id: 'sugar', label: 'Blood sugar', color: '#BC842E', pale: '#F6E8C9', ink: '#916317', signals: [{ id: 'a1c', label: 'A1C results' }, { id: 'glucose', label: 'Glucose readings' }, { id: 'diabetes-medicine', label: 'Related medicine' }, { id: 'sugar-routine', label: 'Food and activity' }] },
  { id: 'medicines', label: 'Medicines', color: '#168A83', pale: '#D7EFEB', ink: '#11756F', signals: [{ id: 'medicine-list', label: 'Current list' }, { id: 'dose', label: 'Dose and timing' }, { id: 'effects', label: 'Side effects' }, { id: 'prescriber', label: 'Who prescribed it' }] },
  { id: 'family', label: 'Family history', color: '#906DA8', pale: '#EADDF0', ink: '#775A90', signals: [{ id: 'heart-family', label: 'Heart conditions' }, { id: 'sugar-family', label: 'Diabetes' }, { id: 'cancer-family', label: 'Cancer history' }, { id: 'relative', label: 'Who in your family' }] },
  { id: 'joints', label: 'Joints and movement', color: '#47877E', pale: '#DDEEE9', ink: '#39766D', signals: [{ id: 'joint-pain', label: 'Pain or stiffness' }, { id: 'joint-scan', label: 'X-ray or scan' }, { id: 'physio', label: 'Physio or treatment' }, { id: 'mobility', label: 'Movement changes' }] },
  { id: 'other', label: 'Something else', color: '#687A91', pale: '#E3E9F0', ink: '#536379', signals: [{ id: 'other-note', label: 'Add your own words' }] },
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
const stepNames = ['WELCOME', 'YOU', 'AREAS'];

function topicFor(area: FocusArea): HealthTopic {
  return { id: area.id, label: area.label };
}

function detailFor(area: FocusArea, signal: Signal): HealthTopic {
  return { id: area.id + '::' + signal.id, label: signal.label };
}

function PressScale({
  children,
  selected,
  onPress,
  style,
  containerStyle,
  label,
  reducedMotion,
  floatMotion = false,
  floatDelay = 0,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onPress: () => void;
  style: any;
  containerStyle?: any;
  label: string;
  reducedMotion: boolean;
  floatMotion?: boolean;
  floatDelay?: number;
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
        accessibilityState={{ selected }}
        onPress={onPress}
        onPressIn={() => {
          if (!reducedMotion) Animated.timing(scale, { toValue: motion.pressScale, duration: motion.pressIn, easing: Easing.linear, useNativeDriver: animatedNativeDriver }).start();
        }}
        onPressOut={() => {
          if (!reducedMotion) Animated.timing(scale, { toValue: 1, duration: motion.pressOut, easing: Easing.bezier(...motion.easing.bouncy), useNativeDriver: animatedNativeDriver }).start();
        }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function MapNode({
  area,
  left,
  top,
  count,
  compact = false,
  width = 78,
  reducedMotion,
  onPress,
}: {
  area: FocusArea;
  left: number;
  top: number;
  count: number;
  compact?: boolean;
  width?: number;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const enter = useMemo(() => new Animated.Value(0.72), []);
  useEffect(() => {
    enter.setValue(reducedMotion ? 1 : 0.72);
    if (!reducedMotion) Animated.spring(enter, { toValue: 1, speed: 22, bounciness: 5, useNativeDriver: animatedNativeDriver }).start();
  }, [enter, reducedMotion]);

  return (
    <Animated.View style={[styles.mapNode, compact && styles.mapNodeCompact, { left, top, width, opacity: enter, transform: [{ scale: enter }] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + area.label + ' details, ' + count + ' selected'} accessibilityHint="Shows the details connected to this health area" onPress={onPress} style={styles.mapNodeButton}>
        <View style={[styles.mapNodeDot, compact && styles.mapNodeDotCompact, { backgroundColor: area.color, borderColor: area.pale, shadowColor: area.color }]}>
          <Text style={[styles.mapNodeGlyph, compact && styles.mapNodeGlyphCompact]}>{area.label === 'Blood pressure' ? '↕' : area.label === 'Cholesterol' ? '◌' : area.label === 'Sleep' ? '☾' : area.label === 'Heart health' ? '♡' : area.label === 'Blood sugar' ? '⌁' : area.label === 'Medicines' ? '+' : '•'}</Text>
        </View>
        <Text numberOfLines={compact ? 2 : 1} style={[styles.mapNodeLabel, compact && styles.mapNodeLabelCompact]}>{area.label}</Text>
        {count > 0 ? <Text style={styles.mapNodeMeta}>{count} detail{count === 1 ? '' : 's'}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

function ProfileLink({ area, left, top, width, angle, reducedMotion, subtle = false }: {
  area: FocusArea;
  left: number;
  top: number;
  width: number;
  angle: string;
  reducedMotion: boolean;
  subtle?: boolean;
}) {
  const reveal = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    reveal.setValue(reducedMotion ? 1 : 0);
    if (!reducedMotion) Animated.timing(reveal, { toValue: 1, delay: 70, duration: motion.standard, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }).start();
  }, [reducedMotion, reveal]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.mapLine, { left, top, width, backgroundColor: area.color + (subtle ? 'A0' : 'C8'), opacity: reveal, transform: [{ rotate: angle }, { scaleX: reveal }] }]}
    />
  );
}

function LiveProfileMap({
  name,
  areas,
  topics,
  facts,
  treatments,
  assets,
  reducedMotion,
  onAreaPress,
}: {
  name: string;
  areas: FocusArea[];
  topics: HealthTopic[];
  facts: { id: string; category: string; validUntil?: string | null }[];
  treatments: { id: string }[];
  assets: { id: string }[];
  reducedMotion: boolean;
  onAreaPress: (area: FocusArea) => void;
}) {
  const [width, setWidth] = useState(320);
  const visible = areas;
  const { expanded, graphHeight, centerX, centerY, nodeWidth, nodeDiameter, slots } = createProfileMapLayout(visible.length, width);
  const connectors = visible.map((area, index) => {
    const slot = slots[index];
    const x2 = slot.left + nodeWidth / 2;
    const y2 = slot.top + nodeDiameter / 2;
    const dx = x2 - centerX;
    const dy = y2 - centerY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) + 'rad';
    return (
      <ProfileLink
        key={'connection-' + area.id}
        area={area}
        left={centerX - length / 2}
        top={centerY}
        width={length}
        angle={angle}
        subtle={expanded}
        reducedMotion={reducedMotion}
      />
    );
  });
  const detailCount = topics.filter((topic) => topic.id.includes('::')).length;

  return (
    <View style={styles.mapCard}>
      <View style={styles.mapHeading}>
        <View>
          <Text style={styles.eyebrow}>YOUR TRACKING PROFILE</Text>
          <Text style={styles.mapTitle}>Areas you chose</Text>
        </View>
        <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveBadgeText}>YOUR CHOICES</Text></View>
      </View>
      <Text style={styles.mapSub}>{expanded ? `All ${visible.length} areas you chose to track are shown. These choices do not confirm a diagnosis or add records.` : 'These are tracking interests, not diagnoses or records. Tap an area to choose what you want to follow.'}</Text>
      <View style={[styles.mapGraph, { height: graphHeight }]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {connectors}
        {visible.map((area, index) => {
          const count = topics.filter((topic) => topic.id.startsWith(area.id + '::')).length;
          const slot = slots[index];
          return <MapNode key={area.id} area={area} left={slot.left} top={slot.top} width={expanded ? nodeWidth : 78} compact={expanded} count={count} reducedMotion={reducedMotion} onPress={() => onAreaPress(area)} />;
        })}
        <View style={[styles.mapOrbRing, expanded && styles.mapOrbRingExpanded]}><Orb size={expanded ? 34 : 40} state="idle" /></View>
        <Text numberOfLines={1} style={[styles.mapYou, expanded && styles.mapYouExpanded]}>{name.trim() || 'Your profile'}</Text>
        {areas.length === 0 ? <Text style={styles.mapEmpty}>Choose an area you would like to follow.</Text> : null}
      </View>
      <View style={styles.mapStats}>
        <View style={styles.mapStat}><Text style={styles.mapStatNumber}>{String(areas.length).padStart(2, '0')}</Text><Text style={styles.mapStatLabel}>AREAS</Text></View>
        <View style={styles.mapStatRule} />
        <View style={styles.mapStat}><Text style={styles.mapStatNumber}>{String(detailCount).padStart(2, '0')}</Text><Text style={styles.mapStatLabel}>DETAILS</Text></View>
        <View style={styles.mapStatRule} />
        <View style={styles.mapStat}><Text style={styles.mapStatNumber}>{String(assets.length + facts.filter((fact) => !fact.validUntil).length + treatments.length).padStart(2, '0')}</Text><Text style={styles.mapStatLabel}>SAVED ITEMS</Text></View>
      </View>
    </View>
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
      label={(selected ? 'Remove ' : 'Add ') + area.label + (selected ? ' from' : ' to') + ' your health map'}
      onPress={onPress}
      containerStyle={styles.focusChoiceSlot}
      style={[styles.focusChoice, selected && styles.focusChoiceSelected, { borderColor: selected ? area.color + 'CC' : 'rgba(255,255,255,.20)' }]}
    >
      <View style={[styles.focusChoiceIcon, { backgroundColor: selected ? area.color + '35' : 'rgba(255,255,255,.07)', borderColor: area.color + '88' }]}>
        <Text style={[styles.focusChoiceGlyph, { color: selected ? area.pale : area.color }]}>{glyph}</Text>
      </View>
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
    facts, treatments, assets, visits, addFact, correctFact, commitProfileSetup,
  } = useNura();
  const { width: viewportWidth } = useWindowDimensions();
  const compactHeader = viewportWidth < 420;
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [customArea, setCustomArea] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [measurementsOpen, setMeasurementsOpen] = useState(false);
  const [measurementsMounted, setMeasurementsMounted] = useState(false);
  const [customCountry, setCustomCountry] = useState('');
  const [customCountryEdited, setCustomCountryEdited] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const sceneScrollRef = useRef<ScrollView | null>(null);
  const [existingProfileAtLoad, setExistingProfileAtLoad] = useState(false);
  const initialBirthdayAtLoad = useRef('');
  const profileLoadChecked = useRef(false);
  const panelOpacity = useMemo(() => new Animated.Value(1), []);
  const panelX = useMemo(() => new Animated.Value(0), []);
  const panelScale = useMemo(() => new Animated.Value(1), []);
  const measurementsOpacity = useMemo(() => new Animated.Value(0), []);
  const measurementsY = useMemo(() => new Animated.Value(7), []);
  const sceneIndex = stepOrder.indexOf(step);

  useEffect(() => {
    sceneScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  useEffect(() => {
    if (!ready || profileLoadChecked.current) return;
    profileLoadChecked.current = true;
    initialBirthdayAtLoad.current = birthday;
    setExistingProfileAtLoad(hasExistingProfileEvidence({ name, birthday, country, topics, facts, assets, treatments, visits }));
  }, [assets.length, birthday, country, facts.length, name, ready, topics.length, treatments.length, visits.length]);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!measurementsMounted) return;
    const targetOpacity = measurementsOpen ? 1 : 0;
    const targetY = measurementsOpen ? 0 : 7;
    if (reducedMotion) {
      measurementsOpacity.setValue(targetOpacity);
      measurementsY.setValue(targetY);
      return;
    }
    measurementsOpacity.setValue(measurementsOpen ? 0 : 1);
    measurementsY.setValue(measurementsOpen ? 7 : 0);
    const animation = Animated.parallel([
      Animated.timing(measurementsOpacity, { toValue: targetOpacity, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(measurementsY, { toValue: targetY, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
    ]);
    animation.start(({ finished }) => { if (finished && !measurementsOpen) setMeasurementsMounted(false); });
    return () => animation.stop();
  }, [measurementsMounted, measurementsOpen, measurementsOpacity, measurementsY, reducedMotion]);

  function toggleMeasurements() {
    const next = !measurementsOpen;
    setMeasurementsOpen(next);
    if (next) setMeasurementsMounted(true);
    else if (reducedMotion) setMeasurementsMounted(false);
  }

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
    Animated.parallel([
      Animated.timing(panelOpacity, { toValue: 0, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(panelX, { toValue: -direction * 24, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(panelScale, { toValue: 0.985, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
    ]).start(({ finished }) => {
      if (!finished) { setMoving(false); return; }
      setStep(next);
      panelX.setValue(direction * 28);
      panelScale.setValue(0.985);
      setError('');
      Animated.parallel([
        Animated.timing(panelOpacity, { toValue: 1, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
        Animated.timing(panelX, { toValue: 0, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
        Animated.spring(panelScale, { toValue: 1, speed: 20, bounciness: 3, useNativeDriver: animatedNativeDriver }),
      ]).start(() => setMoving(false));
    });
  }

  function selectArea(area: FocusArea) {
    const exists = topics.some((topic) => topic.id === area.id);
    if (exists) {
      removeArea(area);
      return;
    }
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    toggleTopic(topicFor(area));
  }

  function removeArea(area: FocusArea) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    topics.filter((topic) => topic.id.startsWith(area.id + '::')).forEach((topic) => toggleTopic(topic));
    toggleTopic(topicFor(area));
    if (activeAreaId === area.id) setActiveAreaId(null);
  }

  function toggleDetail(area: FocusArea, signal: Signal) {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    toggleTopic(detailFor(area, signal));
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

  function continueIdentity() {
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
      validateBirthday: !existingProfileAtLoad || birthday.trim() !== initialBirthdayAtLoad.current.trim(),
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    if (profileName !== name || profileCountry !== country.trim() || birthday.trim() !== birthday) {
      updateProfile({ name: profileName, country: profileCountry, birthday: birthday.trim() });
    }
    saveMeasurement('Height', height, 'cm');
    saveMeasurement('Weight', weight, 'kg');
    setError('');
    transitionTo('focus');
  }

  async function continueFocus() {
    if (savingProfile) return;
    setSavingProfile(true);
    setError('');
    try {
      await commitProfileSetup();
      router.push({ pathname: '/intake', params: { firstRun: 'true' } });
    } catch {
      setError('Nura couldn’t finish saving this profile on your device. Your details have not been sent. Please retry.');
    } finally {
      setSavingProfile(false);
    }
  }

  const profileMap = () => (
    <LiveProfileMap
      name={name}
      areas={selectedAreas}
      topics={topics}
      facts={currentFacts}
      treatments={treatments}
      assets={assets}
      reducedMotion={reducedMotion}
      onAreaPress={(area) => setActiveAreaId(area.id)}
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
          <Pressable accessibilityRole="button" onPress={() => transitionTo('identity')} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
            <Text style={styles.primaryButtonText}>START MY PROFILE</Text><Text style={styles.primaryArrow}>→</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 'identity') {
      return (
        <View>
          {stepIntro('01  ·  YOUR PROFILE', 'The person behind the profile.', 'Choose a display name and country to set up your health profile. Your country sets local context for care and insurance details. Birth date is optional and only used to calculate the age shown here.')}
          <View style={styles.identityCard}>
            <View style={styles.cardHeadingRow}>
              <View style={styles.cardIcon}><Text style={styles.cardIconText}>01</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.cardOverline}>PROFILE DETAILS</Text><Text style={styles.cardTitle}>Set up your health profile</Text></View>
            </View>
            <Text style={styles.fieldLabel}>DISPLAY NAME · {existingProfileAtLoad ? 'OPTIONAL FOR EXISTING PROFILES' : 'REQUIRED'}</Text>
            <TextInput value={name} onChangeText={(value) => { updateProfile({ name: value }); setError(''); }} placeholder="Name or nickname" placeholderTextColor="#8D8792" style={styles.fieldInput} accessibilityLabel="Profile display name" autoComplete="name" returnKeyType="done" />
            <Text style={styles.fieldHelper}>A name or nickname is enough; you don’t need to use a legal name.</Text>
            <Text style={styles.fieldLabel}>COUNTRY · REQUIRED FOR NEW PROFILES</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={country ? 'Country: ' + country + '. Change country' : 'Select your country'} onPress={() => setCountryPickerOpen(true)} style={styles.countryButton}>
              <Text style={[styles.countryButtonText, !country && styles.countryPlaceholder]}>{countryIsCustom ? customCountry || (country === 'Other' ? 'Enter your country' : country) : country || 'Select your country'}</Text><Text style={styles.countryChevron}>⌄</Text>
            </Pressable>
            {countryIsCustom ? <TextInput value={customCountryEdited ? customCountry : country === 'Other' ? '' : country} onChangeText={(value) => { setCustomCountry(value); setCustomCountryEdited(true); setError(''); }} placeholder="Enter country name" placeholderTextColor="#8D8792" style={[styles.fieldInput, styles.customCountryInput]} accessibilityLabel="Enter another country" autoComplete="postal-address-country" /> : null}
            <Text style={styles.fieldLabel}>DATE OF BIRTH · OPTIONAL</Text>
            <TextInput value={birthday} onChangeText={(value) => { updateProfile({ birthday: value }); setError(''); }} placeholder="YYYY-MM-DD" placeholderTextColor="#8D8792" style={styles.fieldInput} accessibilityLabel="Date of birth" keyboardType="numbers-and-punctuation" maxLength={10} autoComplete="birthdate-full" />
            <Text style={styles.fieldHelper}>Used only to calculate the age shown below. Leave blank if you prefer not to share it.</Text>
            {age !== null ? <View style={styles.ageReadout}><View style={[styles.liveSignalDot, { backgroundColor: palette.blue }]} /><Text style={styles.ageReadoutText}>{age} years old · calculated from the date you entered</Text></View> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: measurementsOpen }} onPress={toggleMeasurements} style={styles.optionalDetailsButton}>
              <View style={{ flex: 1 }}><Text style={styles.optionalDetailsTitle}>{measurementsOpen ? 'Hide optional measurements' : 'Add optional measurements'}</Text><Text style={styles.optionalDetailsHint}>Height and weight, if useful to you</Text></View>
              <Text style={styles.optionalDetailsMark}>{measurementsOpen ? '−' : '+'}</Text>
            </Pressable>
            {measurementsMounted ? (
              <Animated.View style={[styles.optionalDetailsPanel, { opacity: measurementsOpacity, transform: [{ translateY: measurementsY }] }]}>
                <Text style={styles.fieldLabel}>MEASUREMENTS · OPTIONAL</Text>
                <View style={styles.contactFields}>
                  <View style={styles.measureInputRow}><TextInput value={height} onChangeText={setHeight} placeholder="Height · e.g. 168" placeholderTextColor="#8D8792" style={[styles.fieldInput, styles.measureInput]} accessibilityLabel="Height in centimetres" keyboardType="decimal-pad" /><Text style={styles.unitLabel}>cm</Text></View>
                  <View style={styles.measureInputRow}><TextInput value={weight} onChangeText={setWeight} placeholder="Weight · e.g. 62" placeholderTextColor="#8D8792" style={[styles.fieldInput, styles.measureInput]} accessibilityLabel="Weight in kilograms" keyboardType="decimal-pad" /><Text style={styles.unitLabel}>kg</Text></View>
                </View>
                <Text style={styles.fieldHelper}>Optional. If entered, these appear in your profile as self-reported measurements and may be included when you choose to share profile context.</Text>
              </Animated.View>
            ) : null}
          </View>
          {error ? <Text accessibilityRole="alert" style={styles.inlineError}>{error}</Text> : null}
          <Pressable accessibilityRole="button" onPress={continueIdentity} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
            <Text style={styles.primaryButtonText}>CONTINUE TO HEALTH AREAS</Text><Text style={styles.primaryArrow}>→</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View>
        {stepIntro('02  ·  YOUR HEALTH AREAS', 'What would you like to keep track of?', 'Choose any areas that matter to you. These are focus choices, not diagnoses.')}
        {profileMap()}
        <View style={styles.focusPicker}>
          <View style={styles.focusHeading}>
            <Text style={styles.cardOverline}>CHOOSE HEALTH AREAS</Text>
            <Text style={styles.focusCount}>{String(selectedAreas.length).padStart(2, '0')} SELECTED</Text>
          </View>
          <Text style={styles.focusHelper}>Choose areas you want to follow. This doesn’t add a diagnosis or record. After you review your profile, you can add past reports.</Text>
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
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: savingProfile, busy: savingProfile }} disabled={savingProfile} onPress={continueFocus} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, savingProfile && styles.buttonDisabled]}>
          <Text style={styles.primaryButtonText}>{savingProfile ? 'SAVING YOUR PROFILE…' : 'REVIEW MY PROFILE'}</Text>{savingProfile ? <ActivityIndicator color="#2A203B" size="small" /> : <Text style={styles.primaryArrow}>→</Text>}
        </Pressable>
        <Text style={styles.focusNext}>You can change these choices later. Nura keeps selected topics separate from confirmed health details.</Text>
      </View>
    );
  })();

  return (
    <View style={styles.page}>
      <LinearGradient pointerEvents="none" colors={brandScenes.atmosphere.colors} locations={brandScenes.atmosphere.locations} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ambientFill} />
        <LinearGradient pointerEvents="none" colors={[brandScenes.atmosphere.peachGlow, 'rgba(237,180,145,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ambientWarm} />
        <LinearGradient pointerEvents="none" colors={[brandScenes.atmosphere.lilacGlow, 'rgba(162,135,205,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ambientViolet} />
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={[styles.topbar, compactHeader && styles.topbarCompact]}>
          <View style={styles.brand}>
            <View style={styles.brandOrb}><Orb size={23} state="idle" /></View>
            <View><Text style={styles.brandName}>nura</Text><Text style={styles.brandTag}>HEALTH, IN CONTEXT</Text></View>
          </View>
          <View style={[styles.topActions, compactHeader && styles.topActionsCompact]}>
            <Text style={styles.private}>YOUR CHOICES, YOUR PACE</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Open Nura Home" onPress={() => router.replace('/(tabs)/home')} style={({ pressed }) => [styles.homeLink, pressed && styles.homeLinkPressed]}>
              <Text style={styles.homeLinkText}>OPEN HOME  ↗</Text>
            </Pressable>
          </View>
        </View>
        {Platform.OS === 'web' ? (
          <View style={styles.browserPrivacy}>
            <View style={styles.browserPrivacyMark}><Text style={styles.browserPrivacyMarkText}>i</Text></View>
            <Text style={styles.browserPrivacyText}>Sample app · Use sample details and files only.</Text>
          </View>
        ) : null}
        {step !== 'welcome' ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTop}><Text style={styles.progressLabel}>PROFILE SETUP</Text><Text style={styles.progressCount}>{String(sceneIndex).padStart(2, '0')} / 02</Text></View>
            <View style={styles.progressRail}>{stepOrder.slice(1).map((item, index) => <View key={item} style={[styles.progressSegment, index < sceneIndex && styles.progressSegmentDone, index === sceneIndex - 1 && styles.progressSegmentCurrent]} />)}</View>
            <View style={styles.progressNames}>{stepNames.slice(1).map((item, index) => <Text key={item} style={[styles.progressName, index === sceneIndex - 1 && styles.progressNameActive]}>{item}</Text>)}</View>
          </View>
        ) : null}
        <Animated.View pointerEvents={savingProfile ? 'none' : 'auto'} style={[styles.sceneFrame, { opacity: panelOpacity, transform: [{ translateX: panelX }, { scale: panelScale }] }]}>
          <ScrollView ref={sceneScrollRef} key={step} contentContainerStyle={styles.sceneContent} keyboardShouldPersistTaps="handled">
            {step === 'welcome' ? currentContent : (
              <View>
                <View style={styles.sceneBackRow}>
                  <Pressable accessibilityRole="button" onPress={() => transitionTo(stepOrder[sceneIndex - 1])} style={styles.backButton}><Text style={styles.backButtonText}>‹  BACK</Text></Pressable>
                  <Text style={styles.sceneCount}>{String(sceneIndex).padStart(2, '0')} OF 02</Text>
                </View>
                {currentContent}
              </View>
            )}
          </ScrollView>
        </Animated.View>
        {activeArea ? <FollowupBubbles area={activeArea} areas={selectedAreas} topics={topics} reducedMotion={reducedMotion} onSwitchArea={(area) => setActiveAreaId(area.id)} onToggle={toggleDetail} onRemove={removeArea} onClose={() => setActiveAreaId(null)} customArea={customArea} setCustomArea={setCustomArea} onAddCustom={addCustom} /> : null}
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

function FollowupBubbles({
  area,
  areas,
  topics,
  reducedMotion,
  onSwitchArea,
  onToggle,
  onRemove,
  onClose,
  customArea,
  setCustomArea,
  onAddCustom,
}: {
  area: FocusArea;
  areas: FocusArea[];
  topics: HealthTopic[];
  reducedMotion: boolean;
  onSwitchArea: (area: FocusArea) => void;
  onToggle: (area: FocusArea, signal: Signal) => void;
  onRemove: (area: FocusArea) => void;
  onClose: () => void;
  customArea: string;
  setCustomArea: (value: string) => void;
  onAddCustom: () => void;
}) {
  const opacity = useMemo(() => new Animated.Value(0), []);
  const y = useMemo(() => new Animated.Value(24), []);
  useEffect(() => {
    opacity.setValue(reducedMotion ? 1 : 0);
    y.setValue(reducedMotion ? 0 : 24);
    if (reducedMotion) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.spring(y, { toValue: 0, speed: 22, bounciness: 4, useNativeDriver: animatedNativeDriver }),
    ]).start();
  }, [area.id, opacity, reducedMotion, y]);

  function closeSheet() {
    if (reducedMotion) { onClose(); return; }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(y, { toValue: 18, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
    ]).start(({ finished }) => { if (finished) onClose(); });
  }

  return (
    <View style={styles.focusSheetShade}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close health area details" onPress={closeSheet} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.focusSheet, { opacity, transform: [{ translateY: y }] }]}>
          <View style={[styles.focusSheetAccent, { backgroundColor: area.color }]} />
          <View style={styles.sheetHandle} />
          <View style={styles.followupHeading}>
            <View style={[styles.followupIcon, { backgroundColor: area.pale }]}><Text style={[styles.followupGlyph, { color: area.ink }]}>{area.id === 'bp-topic' ? '↕' : area.id === 'cholesterol' ? '◌' : area.id === 'sleep' ? '☾' : area.id === 'heart' ? '♡' : area.id === 'sugar' ? '⌁' : area.id === 'medicines' ? '+' : '•'}</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.followupOverline}>TRACKING PREFERENCES</Text><Text style={styles.followupTitle}>{area.label}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={'Remove ' + area.label + ' from your profile'} onPress={() => onRemove(area)} style={styles.followupRemove}><Text style={styles.followupRemoveText}>REMOVE</Text></Pressable>
          </View>
          <Text style={styles.followupHint}>{area.id === 'other' ? 'Name a topic you would like to follow. This does not add a diagnosis or record.' : 'Choose what you would like to track under ' + area.label + '. These are preferences, not medical records.'}</Text>
          {areas.length > 1 ? (
            <View style={styles.detailAreaSwitcherWrap}>
              <Text style={styles.detailAreaSwitcherLabel}>SWITCH HEALTH AREA</Text>
              <View style={styles.detailAreaSwitcher}>
                {areas.map((selectedArea) => {
                  const current = selectedArea.id === area.id;
                  const detailCount = topics.filter((topic) => topic.id.startsWith(selectedArea.id + '::')).length;
                  return (
                    <PressScale
                      key={selectedArea.id}
                      selected={current}
                      reducedMotion={reducedMotion}
                      label={'Show ' + selectedArea.label + ' details' + (detailCount ? ', ' + detailCount + ' selected' : '')}
                      onPress={() => onSwitchArea(selectedArea)}
                      containerStyle={styles.detailAreaChipSlot}
                      style={[styles.detailAreaChip, { borderColor: selectedArea.color + 'B0', backgroundColor: current ? selectedArea.color + '48' : 'rgba(255,255,255,.06)' }]}
                    >
                      <View style={[styles.detailAreaChipDot, { backgroundColor: selectedArea.color }]} />
                      <Text numberOfLines={1} style={styles.detailAreaChipText}>{selectedArea.label}</Text>
                      {detailCount > 0 ? <Text style={styles.detailAreaChipCount}>{detailCount}</Text> : null}
                    </PressScale>
                  );
                })}
              </View>
            </View>
          ) : null}
          <View style={styles.detailBubbleRow}>
            {area.signals.filter((signal) => area.id !== 'other' || signal.id !== 'other-note').map((signal) => {
              const selected = topics.some((topic) => topic.id === area.id + '::' + signal.id);
              return (
                <PressScale key={signal.id} selected={selected} reducedMotion={reducedMotion} label={(selected ? 'Remove ' : 'Add ') + signal.label} onPress={() => onToggle(area, signal)} containerStyle={styles.detailChoiceSlot} style={[styles.detailChoice, selected && { backgroundColor: area.color + 'B8', borderColor: area.pale }]}>
                  <View style={[styles.detailChoiceMark, { backgroundColor: selected ? area.pale : area.color + '45' }]}><Text style={[styles.detailChoiceMarkText, { color: selected ? area.ink : area.pale }]}>{selected ? '✓' : '+'}</Text></View>
                  <Text style={styles.detailChoiceText}>{signal.label}</Text>
                </PressScale>
              );
            })}
          </View>
          {area.id === 'other' ? (
            <View style={styles.customAreaRow}>
              <TextInput value={customArea} onChangeText={setCustomArea} onSubmitEditing={onAddCustom} placeholder="Add your own words" placeholderTextColor="rgba(255,249,244,.48)" style={[styles.fieldInput, styles.customAreaInput]} returnKeyType="done" />
              <Pressable accessibilityRole="button" onPress={onAddCustom} style={styles.customAreaAdd}><Text style={styles.customAreaAddText}>ADD</Text></Pressable>
            </View>
          ) : null}
          <Pressable accessibilityRole="button" onPress={closeSheet} style={styles.focusSheetDone}><Text style={styles.focusSheetDoneText}>DONE</Text></Pressable>
      </Animated.View>
    </View>
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
  fieldInput: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,.86)', backgroundColor: '#FFFBF7', paddingHorizontal: 12, color: '#322936', fontSize: 14 },
  countryButton: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,.86)', backgroundColor: '#FFFBF7', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countryButtonText: { color: '#322936', fontSize: 12 },
  countryPlaceholder: { color: '#8D8792' },
  countryChevron: { color: '#745487', fontSize: 19 },
  customCountryInput: { marginTop: 7 },
  contactFields: { gap: 7 },
  contactInput: { width: '100%' },
  fieldHelper: { color: 'rgba(255,249,244,.58)', fontSize: 9, lineHeight: 14, marginTop: 9 },
  ageReadout: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, paddingHorizontal: 3 },
  ageReadoutText: { color: '#D9EAF9', fontSize: 9 },
  mapCard: { backgroundColor: 'rgba(255,255,255,.075)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,.21)', paddingHorizontal: 13, paddingTop: 13, marginBottom: 13, overflow: 'hidden' },
  mapHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: 'rgba(255,249,244,.64)', fontSize: 10, fontWeight: '700', letterSpacing: 1.3 },
  mapTitle: { color: palette.ink, fontSize: 14, fontWeight: '600', marginTop: 3 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(199,168,229,.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.lilac },
  liveBadgeText: { color: '#E8E1EA', fontSize: 8, fontWeight: '700', letterSpacing: 0.55 },
  mapSub: { color: palette.muted, fontSize: 10, lineHeight: 14, marginTop: 4 },
  mapGraph: { height: 185, marginTop: 7, position: 'relative', overflow: 'hidden' },
  mapLine: { position: 'absolute', height: 1.4, borderRadius: 2, transformOrigin: 'center' } as any,
  mapNode: { position: 'absolute', width: 78, alignItems: 'center', zIndex: 2 },
  mapNodeCompact: { alignItems: 'center' },
  mapNodeButton: { width: '100%', alignItems: 'center' },
  mapNodeDot: { width: 42, height: 42, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center', shadowOpacity: .4, shadowRadius: 9, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  mapNodeDotCompact: { width: 36, height: 36, borderRadius: 19 },
  mapNodeGlyph: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  mapNodeGlyphCompact: { fontSize: 15 },
  mapNodeLabel: { color: palette.ink, fontSize: 10, fontWeight: '600', marginTop: 2, maxWidth: 80, textAlign: 'center' },
  mapNodeLabelCompact: { color: palette.ink, fontSize: 8.5, lineHeight: 10, maxWidth: '100%', minHeight: 20 },
  mapNodeMeta: { color: 'rgba(255,249,244,.58)', fontSize: 9, marginTop: 1 },
  mapOrbRing: { position: 'absolute', width: 56, height: 56, borderRadius: 29, left: '50%', marginLeft: -28, top: 54, alignItems: 'center', justifyContent: 'center', zIndex: 4, backgroundColor: 'rgba(255,255,255,.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,.32)', shadowColor: palette.lilac, shadowOpacity: .42, shadowRadius: 13, shadowOffset: { width: 0, height: 3 } },
  mapOrbRingExpanded: { top: 0 },
  mapYou: { position: 'absolute', top: 111, left: '50%', width: 112, marginLeft: -56, textAlign: 'center', color: palette.ink, fontSize: 10, fontWeight: '700', zIndex: 4 },
  mapYouExpanded: { top: 60 },
  mapEmpty: { position: 'absolute', left: 4, right: 4, bottom: 1, color: 'rgba(255,249,244,.62)', textAlign: 'center', fontSize: 9 },
  liveSignalDot: { width: 6, height: 6, borderRadius: 3 },
  mapStats: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.16)', minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  mapStat: { alignItems: 'center', flex: 1 },
  mapStatNumber: { color: palette.ink, fontSize: 15, fontWeight: '400' },
  mapStatLabel: { color: 'rgba(255,249,244,.48)', fontSize: 8, letterSpacing: .6, marginTop: 1 },
  mapStatRule: { width: 1, height: 25, backgroundColor: 'rgba(255,255,255,.16)' },
  measureInputRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  measureInput: { flex: 1 },
  unitLabel: { color: '#B7DFFF', fontSize: 13, fontWeight: '700', width: 34 },
  followupCard: { padding: 13, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,.20)', backgroundColor: 'rgba(38,27,50,.58)', marginTop: 8, marginBottom: 12, overflow: 'hidden' },
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
  focusSheetShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, elevation: 1000, backgroundColor: 'rgba(14,10,20,.62)', justifyContent: 'flex-end', paddingTop: 36 },
  focusSheet: { width: '100%', maxWidth: 520, maxHeight: '84%', alignSelf: 'center', backgroundColor: '#35263F', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: 'rgba(255,255,255,.24)', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18, overflow: 'hidden' },
  focusSheetAccent: { height: 3, position: 'absolute', left: 0, right: 0, top: 0, opacity: .95 },
  detailBubbleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'space-between' },
  detailChoiceSlot: { width: '48%' },
  detailChoice: { width: '100%', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,.24)', backgroundColor: 'rgba(255,255,255,.075)', paddingHorizontal: 9, paddingVertical: 8 },
  detailChoiceMark: { width: 24, height: 24, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  detailChoiceMarkText: { fontSize: 15, fontWeight: '700', lineHeight: 18 },
  detailChoiceText: { flex: 1, color: palette.ink, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  customAreaRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  customAreaInput: { flex: 1 },
  customAreaAdd: { minWidth: 65, borderRadius: 13, backgroundColor: palette.cream, alignItems: 'center', justifyContent: 'center' },
  customAreaAddText: { color: '#30223B', fontSize: 10, fontWeight: '800', letterSpacing: .6 },
  focusHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8, marginBottom: 5 },
  focusCount: { color: '#F2D4C1', fontSize: 10, fontWeight: '700', letterSpacing: .7, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 11, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)' },
  focusHelper: { color: 'rgba(255,249,244,.68)', fontSize: 11, lineHeight: 15, marginBottom: 4 },
  focusPicker: { padding: 13, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', backgroundColor: 'rgba(255,255,255,.055)', marginTop: 2, marginBottom: 12 },
  focusChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  focusChoiceSlot: { width: '48%' },
  focusChoice: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 15, borderWidth: 1, backgroundColor: 'rgba(255,255,255,.045)' },
  focusChoiceSelected: { backgroundColor: 'rgba(255,255,255,.12)' },
  focusChoiceIcon: { width: 28, height: 28, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  focusChoiceGlyph: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  focusChoiceLabel: { flex: 1, color: 'rgba(255,249,244,.76)', fontSize: 10, lineHeight: 13, fontWeight: '500' },
  focusChoiceLabelSelected: { color: '#FFFFFF', fontWeight: '700' },
  focusChoiceMark: { width: 20, height: 20, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,.30)', alignItems: 'center', justifyContent: 'center' },
  focusChoiceMarkText: { color: 'rgba(255,249,244,.74)', fontSize: 14, lineHeight: 16, fontWeight: '500' },
  focusChoiceMarkTextSelected: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  optionalDetailsButton: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.15)', paddingTop: 12, marginTop: 13 },
  optionalDetailsTitle: { color: '#F3D8C9', fontSize: 11, fontWeight: '700' },
  optionalDetailsHint: { color: 'rgba(255,249,244,.54)', fontSize: 9, marginTop: 3 },
  optionalDetailsMark: { color: palette.cream, fontSize: 23, fontWeight: '300', paddingHorizontal: 8 },
  optionalDetailsPanel: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.12)', marginTop: 11, paddingTop: 2 },
  followupRemove: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,.17)' },
  followupRemoveText: { color: '#F1D3C4', fontSize: 8, fontWeight: '800', letterSpacing: .7 },
  inlineError: { color: '#FFE1CF', backgroundColor: 'rgba(188,77,71,.18)', borderWidth: 1, borderColor: 'rgba(243,181,98,.45)', borderRadius: 12, padding: 10, marginBottom: 9, fontSize: 10, lineHeight: 15 },
  primaryButton: { minHeight: 56, borderRadius: 30, backgroundColor: palette.cream, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, shadowColor: '#120D1B', shadowOpacity: .14, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  buttonPressed: { opacity: .9, transform: [{ scale: motion.pressScale }] },
  buttonDisabled: { opacity: .8 },
  primaryButtonText: { color: '#30223B', fontSize: 9, fontWeight: '800', letterSpacing: .9 },
  primaryArrow: { color: '#30223B', fontSize: 22, fontWeight: '300' },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  secondaryButtonText: { color: 'rgba(255,249,244,.76)', fontSize: 10, fontWeight: '700', letterSpacing: .8 },
  focusNext: { color: 'rgba(255,249,244,.45)', fontSize: 10, lineHeight: 12, textAlign: 'center', letterSpacing: .8, marginTop: 9, marginBottom: 8 },
  modalShade: { flex: 1, backgroundColor: 'rgba(14,10,20,.58)', justifyContent: 'flex-end', paddingTop: 40 },
  countrySheet: { width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '82%', backgroundColor: '#FAF7F4', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14 },
  sheetHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#D8D2D9', alignSelf: 'center', marginBottom: 15 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetOverline: { color: '#837D8A', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  sheetTitle: { color: '#272430', fontSize: 19, fontWeight: '500', marginTop: 3 },
  sheetClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEEAF0' },
  sheetCloseText: { color: '#352C40', fontSize: 22 },
  countrySearch: { minHeight: 46, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3DFE7', borderRadius: 13, paddingHorizontal: 12, color: '#292731', marginTop: 12, marginBottom: 6, fontSize: 12 },
  countryList: { minHeight: 160 },
  countryOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#EEEAF0', paddingHorizontal: 8 },
  countryOptionSelected: { backgroundColor: '#F0E7F4' },
  countryOptionText: { color: '#393542', fontSize: 12 },
  countryOptionTextSelected: { color: '#5A3B68', fontWeight: '700' },
  countryOptionMark: { color: '#77629A', fontSize: 14 },
  noCountry: { color: '#716C78', fontSize: 10, lineHeight: 15, padding: 10 },
  otherCountry: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginTop: 5, borderTopWidth: 1, borderTopColor: '#E3DFE7' },
  otherCountryText: { color: '#51485A', fontSize: 11, fontWeight: '600' },
  sheetDone: { minHeight: 46, borderRadius: 23, backgroundColor: '#382846', alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  sheetDoneText: { color: '#FFF9F4', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  focusSheetDone: { minHeight: 46, borderRadius: 23, backgroundColor: palette.cream, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  focusSheetDoneText: { color: '#30223B', fontSize: 10, fontWeight: '800', letterSpacing: .8 },
});
