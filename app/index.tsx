import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Orb } from '../src/components/Orb';
import { useNura, HealthTopic } from '../src/state/NuraContext';
import { motion } from '../src/theme';

type Signal = { id: string; label: string };
type FocusArea = {
  id: string;
  label: string;
  color: string;
  pale: string;
  ink: string;
  signals: Signal[];
};
type OnboardingStep = 'welcome' | 'identity' | 'today' | 'focus';
type LiveSignal = { label: string; value: string; color: string; complete: boolean };

const palette = {
  canvas: '#21182F',
  ink: '#FFF9F4',
  muted: 'rgba(255,249,244,0.78)',
  soft: 'rgba(255,249,244,0.58)',
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

const stepOrder: OnboardingStep[] = ['welcome', 'identity', 'today', 'focus'];
const stepNames = ['WELCOME', 'YOU', 'TODAY', 'FOCUS'];

function ageFromBirthday(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const now = new Date();
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date > now) return null;
  let age = now.getFullYear() - year;
  if (now.getMonth() < month - 1 || (now.getMonth() === month - 1 && now.getDate() < day)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

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
  label,
  reducedMotion,
  floatMotion = false,
  floatDelay = 0,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onPress: () => void;
  style: any;
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
      Animated.timing(drift, { toValue: 1, duration: motion.bob / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: motion.bob / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [drift, floatDelay, floatMotion, reducedMotion]);

  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  return (
    <Animated.View style={{ transform: [{ translateY }, { scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={onPress}
        onPressIn={() => {
          if (!reducedMotion) Animated.timing(scale, { toValue: motion.pressScale, duration: motion.pressIn, easing: Easing.linear, useNativeDriver: true }).start();
        }}
        onPressOut={() => {
          if (!reducedMotion) Animated.timing(scale, { toValue: 1, duration: motion.pressOut, easing: Easing.bezier(...motion.easing.bouncy), useNativeDriver: true }).start();
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
  reducedMotion,
}: {
  area: FocusArea;
  left: number;
  top: number;
  count: number;
  reducedMotion: boolean;
}) {
  const enter = useMemo(() => new Animated.Value(0.72), []);
  useEffect(() => {
    enter.setValue(reducedMotion ? 1 : 0.72);
    if (!reducedMotion) Animated.spring(enter, { toValue: 1, speed: 22, bounciness: 5, useNativeDriver: true }).start();
  }, [enter, reducedMotion]);

  return (
    <Animated.View style={[styles.mapNode, { left, top, opacity: enter, transform: [{ scale: enter }] }]}>
      <View style={[styles.mapNodeDot, { backgroundColor: area.color, shadowColor: area.color }]}>
        <Text style={styles.mapNodeGlyph}>{area.label === 'Blood pressure' ? '↕' : area.label === 'Cholesterol' ? '◌' : area.label === 'Sleep' ? '☾' : area.label === 'Heart health' ? '♡' : area.label === 'Blood sugar' ? '⌁' : area.label === 'Medicines' ? '+' : '•'}</Text>
      </View>
      <Text numberOfLines={1} style={styles.mapNodeLabel}>{area.label}</Text>
      {count > 0 ? <Text style={styles.mapNodeMeta}>{count} linked</Text> : null}
    </Animated.View>
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
  signals,
}: {
  name: string;
  areas: FocusArea[];
  topics: HealthTopic[];
  facts: { id: string; category: string; validUntil?: string | null }[];
  treatments: { id: string }[];
  assets: { id: string }[];
  reducedMotion: boolean;
  signals: LiveSignal[];
}) {
  const [width, setWidth] = useState(320);
  const visible = areas.slice(0, 4);
  const centerX = width / 2;
  const centerY = 66;
  const slots = [
    { left: 2, top: 4 },
    { left: width - 82, top: 4 },
    { left: 2, top: 88 },
    { left: width - 82, top: 88 },
  ];
  const connectors = visible.map((area, index) => {
    const slot = slots[index];
    const x2 = slot.left + 41;
    const y2 = slot.top + 20;
    const dx = x2 - centerX;
    const dy = y2 - centerY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) + 'rad';
    return (
      <View
        key={'connection-' + area.id}
        pointerEvents="none"
        style={[
          styles.mapLine,
          {
            left: centerX - length / 2,
            top: centerY,
            width: length,
            backgroundColor: area.color + 'B0',
            transform: [{ rotate: angle }],
          },
        ]}
      />
    );
  });
  const detailCount = topics.filter((topic) => topic.id.includes('::')).length;

  return (
    <View style={styles.mapCard}>
      <View style={styles.mapHeading}>
        <View>
          <Text style={styles.eyebrow}>YOUR 720 PROFILE</Text>
          <Text style={styles.mapTitle}>A living picture</Text>
        </View>
        <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveBadgeText}>UPDATING AS YOU ADD</Text></View>
      </View>
      <Text style={styles.mapSub}>Your entries take shape here. Focus areas are choices, not diagnoses.</Text>
      <View style={styles.mapGraph} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {connectors}
        {visible.map((area, index) => {
          const count = topics.filter((topic) => topic.id.startsWith(area.id + '::')).length;
          const slot = slots[index];
          return <MapNode key={area.id} area={area} left={slot.left} top={slot.top} count={count} reducedMotion={reducedMotion} />;
        })}
        <View style={styles.mapOrbRing}><Orb size={38} state="idle" /></View>
        <Text numberOfLines={1} style={styles.mapYou}>{name.trim() || 'You'}</Text>
        {areas.length === 0 ? <Text style={styles.mapEmpty}>Your first connection appears when you choose a focus.</Text> : null}
        {areas.length > 4 ? <Text style={styles.mapMore}>+{areas.length - 4} more</Text> : null}
      </View>
      {signals.length > 0 ? (
        <View style={styles.liveSignalRow}>
          {signals.map((signal, index) => <LiveMapSignalChip key={signal.label} signal={signal} index={index} reducedMotion={reducedMotion} />)}
        </View>
      ) : null}
      <View style={styles.mapStats}>
        <View style={styles.mapStat}><Text style={styles.mapStatNumber}>{String(areas.length).padStart(2, '0')}</Text><Text style={styles.mapStatLabel}>AREAS</Text></View>
        <View style={styles.mapStatRule} />
        <View style={styles.mapStat}><Text style={styles.mapStatNumber}>{String(detailCount + facts.filter((fact) => !fact.validUntil).length + treatments.length).padStart(2, '0')}</Text><Text style={styles.mapStatLabel}>DETAILS</Text></View>
        <View style={styles.mapStatRule} />
        <View style={styles.mapStat}><Text style={styles.mapStatNumber}>{String(assets.length).padStart(2, '0')}</Text><Text style={styles.mapStatLabel}>RECORDS</Text></View>
      </View>
    </View>
  );
}

function FocusBubble({
  area,
  diameter,
  selected,
  label,
  index,
  reducedMotion,
  onPress,
}: {
  area: FocusArea;
  diameter: number;
  selected: boolean;
  label: string;
  index: number;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const scale = useMemo(() => new Animated.Value(1), []);
  const drift = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (reducedMotion) {
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.delay((index % 5) * motion.stagger.dense),
      Animated.timing(drift, { toValue: 1, duration: motion.bob / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: motion.bob / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [drift, index, reducedMotion]);
  const y = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const colors: [string, string] = selected ? [area.color, area.ink] : ['rgba(255,255,255,.13)', 'rgba(205,183,228,.10)'];

  return (
    <Animated.View style={[styles.focusBubblePosition, { width: diameter, height: diameter, transform: [{ translateY: y }, { scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label + (selected ? ', selected' : '')}
        accessibilityState={{ selected }}
        onPress={onPress}
        onPressIn={() => {
          if (!reducedMotion) Animated.timing(scale, { toValue: motion.pressScale, duration: motion.pressIn, easing: Easing.linear, useNativeDriver: true }).start();
        }}
        onPressOut={() => {
          if (!reducedMotion) Animated.timing(scale, { toValue: 1, duration: motion.pressOut, easing: Easing.bezier(...motion.easing.bouncy), useNativeDriver: true }).start();
        }}
        style={styles.focusBubbleTouch}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.focusBubble,
            {
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              borderColor: selected ? area.pale : 'rgba(255,255,255,.28)',
              shadowColor: area.color,
              shadowOpacity: selected ? 0.46 : 0.14,
            },
          ]}
        >
          <Text numberOfLines={3} style={[styles.focusBubbleText, selected && styles.focusBubbleTextSelected]}>{label}</Text>
          {selected ? <Text style={styles.focusCheck}>✓</Text> : null}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function useLiveSignalMotion(signal: LiveSignal, index: number, reducedMotion: boolean) {
  const enterOpacity = useMemo(() => new Animated.Value(0), []);
  const enterY = useMemo(() => new Animated.Value(5), []);
  const scale = useMemo(() => new Animated.Value(1), []);
  const glow = useMemo(() => new Animated.Value(0), []);
  const valueOpacity = useMemo(() => new Animated.Value(1), []);
  const valueY = useMemo(() => new Animated.Value(0), []);
  const previous = useRef({ complete: signal.complete, value: signal.value });

  useEffect(() => {
    if (reducedMotion) {
      enterOpacity.setValue(1);
      enterY.setValue(0);
      return;
    }
    enterOpacity.setValue(0);
    enterY.setValue(5);
    const entrance = Animated.parallel([
      Animated.timing(enterOpacity, { toValue: 1, delay: index * motion.stagger.dense, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
      Animated.timing(enterY, { toValue: 0, delay: index * motion.stagger.dense, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
    ]);
    entrance.start();
    return () => entrance.stop();
  }, [enterOpacity, enterY, index, reducedMotion]);

  useEffect(() => {
    const before = previous.current;
    const valueChanged = before.value !== signal.value;
    const meaningfulUpdate = signal.complete && (!before.complete || (valueChanged && signal.label !== 'YOU' && signal.label !== 'TODAY'));
    previous.current = { complete: signal.complete, value: signal.value };
    if (!meaningfulUpdate) return;
    if (reducedMotion) {
      scale.setValue(1);
      glow.setValue(0);
      valueOpacity.setValue(1);
      valueY.setValue(0);
      return;
    }

    glow.setValue(0.2);
    scale.setValue(1);
    valueOpacity.setValue(0.42);
    valueY.setValue(3);
    Animated.parallel([
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.035, speed: 28, bounciness: 3, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, speed: 30, bounciness: 2, useNativeDriver: true }),
      ]),
      Animated.timing(glow, { toValue: 0, duration: motion.standard, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(valueOpacity, { toValue: 1, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
        Animated.timing(valueY, { toValue: 0, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
      ]),
    ]).start();
  }, [glow, reducedMotion, scale, signal.complete, signal.label, signal.value, valueOpacity, valueY]);

  return {
    container: { opacity: enterOpacity, transform: [{ translateY: enterY }, { scale }] },
    glow: { opacity: glow },
    value: { opacity: valueOpacity, transform: [{ translateY: valueY }] },
  };
}

function LiveMapSignalChip({ signal, index, reducedMotion }: { signal: LiveSignal; index: number; reducedMotion: boolean }) {
  const animated = useLiveSignalMotion(signal, index, reducedMotion);
  return (
    <Animated.View style={[styles.liveSignal, signal.complete && { borderColor: signal.color + '99', backgroundColor: signal.color + '1A' }, animated.container]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.liveSignalGlow, { backgroundColor: signal.color }, animated.glow]} />
      <View style={[styles.liveSignalDot, { backgroundColor: signal.complete ? signal.color : 'rgba(255,255,255,.24)' }]} />
      <Text style={styles.liveSignalLabel}>{signal.label}</Text>
      <Animated.Text numberOfLines={1} style={[styles.liveSignalValue, signal.complete && styles.liveSignalValueComplete, animated.value]}>{signal.value}</Animated.Text>
    </Animated.View>
  );
}

function IdentityLiveStrip({ signals, reducedMotion }: { signals: LiveSignal[]; reducedMotion: boolean }) {
  return (
    <View style={styles.identityRibbon} accessibilityLabel="Your live profile preview">
      <View style={styles.ribbonHeading}>
        <View style={styles.ribbonOrb}><Orb size={17} state="idle" /></View>
        <Text style={styles.ribbonTitle}>YOUR PROFILE TAKES SHAPE</Text>
        <View style={styles.ribbonLive}><View style={styles.ribbonLiveDot} /><Text style={styles.ribbonLiveText}>LIVE</Text></View>
      </View>
      <View style={styles.ribbonSignals}>
        {signals.map((signal, index) => <IdentitySignalChip key={signal.label} signal={signal} index={index} reducedMotion={reducedMotion} />)}
      </View>
    </View>
  );
}

function IdentitySignalChip({ signal, index, reducedMotion }: { signal: LiveSignal; index: number; reducedMotion: boolean }) {
  const animated = useLiveSignalMotion(signal, index, reducedMotion);
  return (
    <Animated.View style={[styles.ribbonSignal, { borderColor: signal.color + (signal.complete ? '9A' : '44') }, animated.container]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ribbonSignalGlow, { backgroundColor: signal.color }, animated.glow]} />
      <View style={[styles.ribbonSignalDot, { backgroundColor: signal.complete ? signal.color : 'rgba(255,255,255,.28)' }]} />
      <View style={styles.ribbonSignalCopy}>
        <Text style={styles.ribbonSignalLabel}>{signal.label}</Text>
        <Animated.Text numberOfLines={1} style={[styles.ribbonSignalValue, signal.complete && styles.ribbonSignalValueComplete, animated.value]}>{signal.complete ? signal.value : 'Add later'}</Animated.Text>
      </View>
    </Animated.View>
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
    name, birthday, country, email, phone, updateProfile, topics, toggleTopic,
    facts, treatments, assets, addFact, correctFact, commitProfileSetup,
  } = useNura();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [customArea, setCustomArea] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [customCountry, setCustomCountry] = useState('');
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [cloudWidth, setCloudWidth] = useState(315);
  const cloudScale = Math.min(cloudWidth / 315, 1);
  const panelOpacity = useMemo(() => new Animated.Value(1), []);
  const panelX = useMemo(() => new Animated.Value(0), []);
  const sceneIndex = stepOrder.indexOf(step);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  const selectedAreas = useMemo(() => focusAreas.filter((area) => topics.some((topic) => topic.id === area.id)), [topics]);
  const currentFacts = useMemo(() => facts.filter((fact) => !fact.validUntil), [facts]);
  const activeArea = focusAreas.find((area) => area.id === activeAreaId) ?? null;
  const countryIsCustom = country === 'Other' || (!!country && !countries.includes(country));
  const age = ageFromBirthday(birthday);
  const liveSignals: LiveSignal[] = [
    { label: 'YOU', value: name.trim() || 'Add your name', color: palette.peach, complete: !!name.trim() },
    { label: 'COUNTRY', value: country || 'Add later', color: palette.peach, complete: !!country && country !== 'Other' },
    { label: 'AGE', value: age === null ? 'Add later' : age + ' years', color: palette.blue, complete: age !== null },
    { label: 'TODAY', value: [height.trim() ? height.trim() + ' cm' : '', weight.trim() ? weight.trim() + ' kg' : ''].filter(Boolean).join(' · ') || 'Add later', color: palette.mint, complete: !!height.trim() || !!weight.trim() },
  ];

  function transitionTo(next: OnboardingStep) {
    if (moving || next === step) return;
    const direction = stepOrder.indexOf(next) > stepOrder.indexOf(step) ? 1 : -1;
    if (reducedMotion) {
      setStep(next);
      panelOpacity.setValue(1);
      panelX.setValue(0);
      setError('');
      return;
    }
    setMoving(true);
    Animated.parallel([
      Animated.timing(panelOpacity, { toValue: 0, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
      Animated.timing(panelX, { toValue: -direction * 18, duration: motion.fast, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) { setMoving(false); return; }
      setStep(next);
      panelX.setValue(direction * 18);
      setError('');
      Animated.parallel([
        Animated.timing(panelOpacity, { toValue: 1, duration: motion.standard, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
        Animated.timing(panelX, { toValue: 0, duration: motion.standard, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
      ]).start(() => setMoving(false));
    });
  }

  function selectArea(area: FocusArea) {
    const exists = topics.some((topic) => topic.id === area.id);
    if (!exists) toggleTopic(topicFor(area));
    setActiveAreaId((current) => current === area.id ? null : area.id);
  }

  function removeArea(area: FocusArea) {
    topics.filter((topic) => topic.id.startsWith(area.id + '::')).forEach((topic) => toggleTopic(topic));
    toggleTopic(topicFor(area));
    if (activeAreaId === area.id) setActiveAreaId(null);
  }

  function toggleDetail(area: FocusArea, signal: Signal) {
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
    if (!name.trim()) {
      setError('Add the name you want Nura to use before continuing.');
      return;
    }
    setError('');
    transitionTo('today');
  }

  function continueToday(save: boolean) {
    if (save) {
      saveMeasurement('Height', height, 'cm');
      saveMeasurement('Weight', weight, 'kg');
    }
    transitionTo('focus');
  }

  async function continueFocus() {
    if (savingProfile) return;
    if (selectedAreas.length === 0) {
      setError('Choose a health area or select “Something else” to add your own.');
      return;
    }
    setSavingProfile(true);
    setError('');
    try {
      await commitProfileSetup();
      router.push('/profile-summary');
    } catch {
      setError('Nura couldn’t finish saving this profile on your device. Your details have not been sent. Please retry.');
    } finally {
      setSavingProfile(false);
    }
  }

  const profileMap = (signals: LiveSignal[] = []) => (
    <LiveProfileMap
      name={name}
      areas={selectedAreas}
      topics={topics}
      facts={currentFacts}
      treatments={treatments}
      assets={assets}
      reducedMotion={reducedMotion}
      signals={signals}
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
          <Text style={styles.welcomeEyebrow}>THE 720 HEALTH PROFILE</Text>
          <Text style={styles.welcomeTitle}>Your health, in one living picture.</Text>
          <Text style={styles.welcomeBody}>A personal record that connects today’s details, your history, care, treatment, daily life and insurance — at your pace.</Text>
          <View style={styles.journeyPreview}>
            {domains.map((domain, index) => (
              <View key={domain.number} style={styles.journeyItem}>
                <View style={[styles.journeyDot, { backgroundColor: domain.color }]} />
                <Text style={styles.journeyNumber}>{domain.number}</Text>
                <Text style={styles.journeyName}>{domain.title}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.welcomePrivacy}>You choose what to add. Nura keeps focus areas, records and confirmed details distinct.</Text>
          <Pressable accessibilityRole="button" onPress={() => transitionTo('identity')} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
            <Text style={styles.primaryButtonText}>START MY PROFILE</Text><Text style={styles.primaryArrow}>→</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 'identity') {
      return (
        <View>
          {stepIntro('01  ·  THE PERSON BEHIND THE PROFILE', 'Let’s start with you.', 'A few details help Nura keep this profile organized. Contact details are not included in health questions.')}
          <View style={styles.identityCard}>
            <View style={styles.cardHeadingRow}>
              <View style={styles.cardIcon}><Text style={styles.cardIconText}>01</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.cardOverline}>YOUR DETAILS</Text><Text style={styles.cardTitle}>What should Nura know?</Text></View>
              <Text style={styles.optionalLabel}>EDITABLE</Text>
            </View>
            <Text style={styles.fieldLabel}>NAME</Text>
            <TextInput value={name} onChangeText={(value) => updateProfile({ name: value })} placeholder="What should Nura call you?" placeholderTextColor="rgba(255,249,244,.46)" style={styles.fieldInput} accessibilityLabel="Your name" autoComplete="name" returnKeyType="next" />
            <Text style={styles.fieldLabel}>COUNTRY</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={country ? 'Country: ' + country + '. Change country' : 'Select your country'} onPress={() => setCountryPickerOpen(true)} style={styles.countryButton}>
              <Text style={[styles.countryButtonText, !country && styles.countryPlaceholder]}>{countryIsCustom ? customCountry || (country === 'Other' ? 'Enter your country' : country) : country || 'Select your country'}</Text><Text style={styles.countryChevron}>⌄</Text>
            </Pressable>
            {countryIsCustom ? <TextInput value={customCountry} onChangeText={(value) => { setCustomCountry(value); updateProfile({ country: value }); }} placeholder="Enter country name" placeholderTextColor="rgba(255,249,244,.46)" style={[styles.fieldInput, styles.customCountryInput]} accessibilityLabel="Enter another country" /> : null}
            <Text style={styles.fieldLabel}>BIRTHDAY <Text style={styles.optionalInline}>· OPTIONAL</Text></Text>
            <TextInput value={birthday} onChangeText={(value) => updateProfile({ birthday: value })} placeholder="YYYY-MM-DD" placeholderTextColor="rgba(255,249,244,.46)" style={styles.fieldInput} accessibilityLabel="Birthday" keyboardType="numbers-and-punctuation" maxLength={10} />
            {age !== null ? <View style={styles.ageReadout}><View style={[styles.liveSignalDot, { backgroundColor: palette.blue }]} /><Text style={styles.ageReadoutText}>{age} years old · calculated from the birthday you entered</Text></View> : null}
            <Text style={styles.fieldLabel}>CONTACT <Text style={styles.optionalInline}>· OPTIONAL</Text></Text>
            <View style={styles.contactFields}>
              <TextInput value={phone} onChangeText={(value) => updateProfile({ phone: value })} placeholder="Phone number" placeholderTextColor="rgba(255,249,244,.46)" keyboardType="phone-pad" style={[styles.fieldInput, styles.contactInput]} accessibilityLabel="Phone number" autoComplete="tel" />
              <TextInput value={email} onChangeText={(value) => updateProfile({ email: value })} placeholder="Email address" placeholderTextColor="rgba(255,249,244,.46)" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={[styles.fieldInput, styles.contactInput]} accessibilityLabel="Email address" autoComplete="email" returnKeyType="done" />
            </View>
            <Text style={styles.fieldHelper}>The live profile preview updates as you type. You can add, correct or remove these details later.</Text>
          </View>
          {error ? <Text accessibilityRole="alert" style={styles.inlineError}>{error}</Text> : null}
          <Pressable accessibilityRole="button" onPress={continueIdentity} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
            <Text style={styles.primaryButtonText}>CONTINUE TO TODAY</Text><Text style={styles.primaryArrow}>→</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 'today') {
      return (
        <View>
          {stepIntro('02  ·  TODAY', 'What do you know about your body today?', 'Add current measurements if you have them. They’re dated as self-reported and never treated as a diagnosis.')}
          <View style={styles.measureCard}>
            <View style={styles.cardHeadingRow}>
              <View style={[styles.cardIcon, styles.measureIcon]}><Text style={styles.cardIconText}>↕</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.cardOverline}>OPTIONAL BIOMETRICS</Text><Text style={styles.cardTitle}>Measurements you provide</Text></View>
              <Text style={styles.optionalLabel}>SKIP ANY</Text>
            </View>
            <Text style={styles.fieldLabel}>HEIGHT</Text>
            <View style={styles.measureInputRow}>
              <TextInput value={height} onChangeText={setHeight} placeholder="e.g. 168" placeholderTextColor="rgba(255,249,244,.46)" style={[styles.fieldInput, styles.measureInput]} accessibilityLabel="Height" keyboardType="decimal-pad" />
              <Text style={styles.unitLabel}>cm</Text>
            </View>
            <Text style={styles.fieldLabel}>WEIGHT</Text>
            <View style={styles.measureInputRow}>
              <TextInput value={weight} onChangeText={setWeight} placeholder="e.g. 62" placeholderTextColor="rgba(255,249,244,.46)" style={[styles.fieldInput, styles.measureInput]} accessibilityLabel="Weight" keyboardType="decimal-pad" />
              <Text style={styles.unitLabel}>kg</Text>
            </View>
            <View style={styles.metricPreview}>
              <View style={styles.metricPreviewOrb}><Orb size={31} state="idle" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.metricPreviewTitle}>{name.trim() || 'Your profile'}{age !== null ? ', ' + age : ''}</Text>
                <Text style={styles.metricPreviewMeta}>{height.trim() || 'Height'} cm  ·  {weight.trim() || 'Weight'} kg</Text>
              </View>
              <View style={styles.metricLive}><View style={[styles.liveSignalDot, { backgroundColor: palette.mint }]} /><Text style={styles.metricLiveText}>LIVE</Text></View>
            </View>
            <Text style={styles.fieldHelper}>These values appear in your profile only after you save them. You can leave both blank.</Text>
          </View>
          {profileMap(liveSignals)}
          {error ? <Text accessibilityRole="alert" style={styles.inlineError}>{error}</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => continueToday(true)} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
            <Text style={styles.primaryButtonText}>{height.trim() || weight.trim() ? 'SAVE & CONTINUE TO YOUR HEALTH AREAS' : 'CONTINUE TO YOUR HEALTH AREAS'}</Text><Text style={styles.primaryArrow}>→</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => continueToday(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>SKIP MEASUREMENTS</Text></Pressable>
        </View>
      );
    }

    return (
      <View>
        {stepIntro('03  ·  YOUR HISTORY AND FOCUS', 'What is part of your health?', 'Tap a bubble to select it. Tap a selected area to reveal related details. These are your choices, not diagnoses.')}
        {profileMap(liveSignals)}
        <View style={styles.focusHeading}>
          <View><Text style={styles.cardOverline}>YOUR FOCUS AREAS</Text><Text style={styles.focusTitle}>What’s on your mind?</Text></View>
          <Text style={styles.focusCount}>{String(selectedAreas.length).padStart(2, '0')} SELECTED</Text>
        </View>
        <View style={styles.focusCloud} onLayout={(event) => setCloudWidth(event.nativeEvent.layout.width)}>
          {focusAreas.map((area, index) => {
            const position = focusPositions[index];
            const selected = selectedAreas.some((item) => item.id === area.id);
            const open = activeAreaId === area.id;
            return (
              <View key={area.id} style={{ position: 'absolute', left: position.x * cloudScale, top: position.y * cloudScale }}>
                <FocusBubble
                  area={area}
                  diameter={position.size * cloudScale}
                  selected={selected}
                  label={(selected ? 'Selected ' : 'Select ') + area.label + (open ? ', details open' : '')}
                  index={index}
                  reducedMotion={reducedMotion}
                  onPress={() => selectArea(area)}
                />
              </View>
            );
          })}
        </View>
        {selectedAreas.length > 0 ? (
          <View style={styles.selectedSection}>
            <Text style={styles.selectedOverline}>IN YOUR PROFILE · TAP × TO REMOVE</Text>
            <View style={styles.selectedRow}>
              {selectedAreas.map((area) => (
                <Pressable key={area.id} accessibilityRole="button" accessibilityLabel={'Remove ' + area.label + ' and its unanswered details'} onPress={() => removeArea(area)} style={[styles.selectedToken, { borderColor: area.color + 'AA' }]}>
                  <View style={[styles.selectedTokenDot, { backgroundColor: area.color }]} />
                  <Text style={styles.selectedTokenText}>{area.label}</Text><Text style={styles.removeMark}>×</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {activeArea ? <FollowupBubbles area={activeArea} topics={topics} reducedMotion={reducedMotion} onToggle={toggleDetail} customArea={customArea} setCustomArea={setCustomArea} onAddCustom={addCustom} /> : null}
        <View style={styles.domainHeading}><View><Text style={styles.cardOverline}>YOUR 720 PROFILE</Text><Text style={styles.domainTitle}>Six parts. One connected story.</Text></View><Text style={styles.domainTotal}>720</Text></View>
        <View style={styles.domainGrid}>
          {domains.map((domain, index) => {
            const count = index === 0 ? currentFacts.filter((fact) => /biometric|vital/i.test(fact.category)).length : index === 1 ? topics.length : index === 2 ? assets.length : index === 3 ? treatments.length : 0;
            return (
              <View key={domain.number} style={styles.domainCard}>
                <View style={[styles.domainOrb, { backgroundColor: domain.color }]}><Text style={styles.domainOrbText}>{domain.number}</Text></View>
                <View style={{ flex: 1 }}><Text style={styles.domainName}>{domain.title}</Text><Text style={styles.domainDetail}>{domain.detail}</Text></View>
                <Text style={styles.domainCount}>{String(count).padStart(2, '0')}</Text>
              </View>
            );
          })}
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.inlineError}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: savingProfile, busy: savingProfile }} disabled={savingProfile} onPress={continueFocus} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, savingProfile && styles.buttonDisabled]}>
          <Text style={styles.primaryButtonText}>{savingProfile ? 'SAVING YOUR PROFILE…' : 'REVIEW MY FIRST UNDERSTANDING'}</Text>{savingProfile ? <ActivityIndicator color="#2A203B" size="small" /> : <Text style={styles.primaryArrow}>→</Text>}
        </Pressable>
        <Text style={styles.focusNext}>NURA WILL SHOW WHAT IT KNOWS, WHAT IT DOESN’T, AND WHERE EACH DETAIL CAME FROM.</Text>
      </View>
    );
  })();

  return (
    <View style={styles.page}>
      <LinearGradient pointerEvents="none" colors={['#49365F', '#765777', '#A77B8D', '#765777', '#24182F']} locations={[0, 0.28, 0.5, 0.72, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ambientFill} />
      <LinearGradient pointerEvents="none" colors={['rgba(237,180,145,.30)', 'rgba(237,180,145,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ambientWarm} />
      <LinearGradient pointerEvents="none" colors={['rgba(162,135,205,.23)', 'rgba(162,135,205,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ambientViolet} />
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={styles.topbar}>
          <View style={styles.brand}>
            <View style={styles.brandOrb}><Orb size={23} state="idle" /></View>
            <View><Text style={styles.brandName}>nura</Text><Text style={styles.brandTag}>YOUR HEALTH, UNDERSTOOD</Text></View>
          </View>
          <View style={styles.topActions}>
            <Text style={styles.private}>PRIVATE BY DESIGN</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Open Nura Home" onPress={() => router.replace('/(tabs)/home')} style={({ pressed }) => [styles.homeLink, pressed && styles.homeLinkPressed]}>
              <Text style={styles.homeLinkText}>OPEN HOME  ↗</Text>
            </Pressable>
          </View>
        </View>
        {Platform.OS === 'web' ? (
          <View style={styles.browserPrivacy}>
            <View style={styles.browserPrivacyMark}><Text style={styles.browserPrivacyMarkText}>i</Text></View>
            <Text style={styles.browserPrivacyText}>Preview mode keeps fictional sample information in this browser, even after refresh, until you clear it. This isn’t a personal Nura account. Please use fictional details and files only.</Text>
          </View>
        ) : null}
        {step !== 'welcome' ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTop}><Text style={styles.progressLabel}>BUILDING YOUR PROFILE</Text><Text style={styles.progressCount}>{String(sceneIndex).padStart(2, '0')} / 03</Text></View>
            <View style={styles.progressRail}>{stepOrder.slice(1).map((item, index) => <View key={item} style={[styles.progressSegment, index < sceneIndex && styles.progressSegmentDone, index === sceneIndex - 1 && styles.progressSegmentCurrent]} />)}</View>
            <View style={styles.progressNames}>{stepNames.slice(1).map((item, index) => <Text key={item} style={[styles.progressName, index === sceneIndex - 1 && styles.progressNameActive]}>{item}</Text>)}</View>
          </View>
        ) : null}
        {step === 'identity' ? <IdentityLiveStrip signals={liveSignals} reducedMotion={reducedMotion} /> : null}
        <Animated.View pointerEvents={savingProfile ? 'none' : 'auto'} style={[styles.sceneFrame, { opacity: panelOpacity, transform: [{ translateX: panelX }] }]}> 
          <ScrollView key={step} contentContainerStyle={styles.sceneContent} keyboardShouldPersistTaps="handled">
            {step === 'welcome' ? currentContent : (
              <View>
                <View style={styles.sceneBackRow}>
                  <Pressable accessibilityRole="button" onPress={() => transitionTo(stepOrder[sceneIndex - 1])} style={styles.backButton}><Text style={styles.backButtonText}>‹  BACK</Text></Pressable>
                  <Text style={styles.sceneCount}>{String(sceneIndex).padStart(2, '0')} OF 03</Text>
                </View>
                {currentContent}
              </View>
            )}
          </ScrollView>
        </Animated.View>
        <CountryPicker
          key={countryPickerOpen ? 'open' : 'closed'}
          visible={countryPickerOpen}
          value={country}
          reducedMotion={reducedMotion}
          onClose={() => setCountryPickerOpen(false)}
          onSelect={(selectedCountry) => {
            updateProfile({ country: selectedCountry });
            if (selectedCountry !== 'Other') setCustomCountry('');
            setCountryPickerOpen(false);
          }}
        />
      </View>
    </View>
  );
}

function FollowupBubbles({
  area,
  topics,
  reducedMotion,
  onToggle,
  customArea,
  setCustomArea,
  onAddCustom,
}: {
  area: FocusArea;
  topics: HealthTopic[];
  reducedMotion: boolean;
  onToggle: (area: FocusArea, signal: Signal) => void;
  customArea: string;
  setCustomArea: (value: string) => void;
  onAddCustom: () => void;
}) {
  const opacity = useMemo(() => new Animated.Value(reducedMotion ? 1 : 0), [reducedMotion]);
  const y = useMemo(() => new Animated.Value(reducedMotion ? 0 : 10), [reducedMotion]);
  useEffect(() => {
    opacity.setValue(reducedMotion ? 1 : 0);
    y.setValue(reducedMotion ? 0 : 10);
    if (!reducedMotion) Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
    ]).start();
  }, [area.id, opacity, reducedMotion, y]);

  return (
    <Animated.View style={[styles.followupCard, { opacity, transform: [{ translateY: y }] }]}>
      <View style={styles.followupHeading}>
        <View style={[styles.followupIcon, { backgroundColor: area.pale }]}><Text style={[styles.followupGlyph, { color: area.ink }]}>↳</Text></View>
        <View style={{ flex: 1 }}><Text style={styles.followupOverline}>CONNECTED TO</Text><Text style={styles.followupTitle}>{area.label}</Text></View>
        <Text style={styles.followupMeta}>{String(topics.filter((topic) => topic.id.startsWith(area.id + '::')).length).padStart(2, '0')} ADDED</Text>
      </View>
      <Text style={styles.followupHint}>Choose related details if you want. Removing this focus later clears its unanswered choices.</Text>
      <View style={styles.detailBubbleRow}>
        {area.signals.map((signal, index) => {
          const selected = topics.some((topic) => topic.id === area.id + '::' + signal.id);
          return (
            <PressScale key={signal.id} selected={selected} reducedMotion={reducedMotion} floatMotion floatDelay={index * 80} label={(selected ? 'Remove ' : 'Add ') + signal.label} onPress={() => onToggle(area, signal)} style={styles.detailBubbleTouch}>
              <LinearGradient colors={selected ? [area.color, area.ink] : ['rgba(255,255,255,.12)', 'rgba(255,255,255,.05)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.detailBubble, { borderColor: selected ? area.pale : 'rgba(255,255,255,.24)' }]}>
                <Text style={styles.detailBubbleText}>{selected ? '✓ ' : ''}{signal.label}</Text>
              </LinearGradient>
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
    </Animated.View>
  );
}

const focusPositions = [
  { x: 0, y: 0, size: 102 },
  { x: 112, y: 0, size: 92 },
  { x: 215, y: 8, size: 82 },
  { x: 27, y: 104, size: 80 },
  { x: 121, y: 99, size: 86 },
  { x: 222, y: 103, size: 90 },
  { x: 0, y: 190, size: 92 },
  { x: 100, y: 190, size: 76 },
  { x: 187, y: 190, size: 92 },
  { x: 120, y: 273, size: 72 },
];

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas },
  ambientFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  ambientWarm: { position: 'absolute', top: -86, right: -120, width: 310, height: 310, borderRadius: 160, opacity: 0.9 },
  ambientViolet: { position: 'absolute', left: -150, bottom: 35, width: 330, height: 330, borderRadius: 170, opacity: 0.8 },
  content: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 48 : 27, paddingBottom: 8 },
  topbar: { minHeight: 46, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandOrb: { width: 31, height: 31, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: palette.lilac, shadowOpacity: 0.48, shadowRadius: 14 },
  brandName: { color: palette.ink, fontSize: 17, fontWeight: '700', letterSpacing: 1.1 },
  brandTag: { color: 'rgba(255,249,244,.64)', fontSize: 10, letterSpacing: 1.35, marginTop: 2 },
  topActions: { alignItems: 'flex-end', gap: 3 },
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
  identityRibbon: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', backgroundColor: 'rgba(255,255,255,.07)', marginBottom: 8 },
  ribbonHeading: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  ribbonOrb: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  ribbonTitle: { flex: 1, color: 'rgba(255,249,244,.68)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  ribbonLive: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(169,211,174,.12)' },
  ribbonLiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.mint },
  ribbonLiveText: { color: '#D9EADB', fontSize: 9, fontWeight: '800', letterSpacing: .7 },
  ribbonSignals: { flexDirection: 'row', gap: 5 },
  ribbonSignal: { flex: 1, minWidth: 0, minHeight: 34, borderRadius: 10, borderWidth: 1, backgroundColor: 'rgba(255,255,255,.035)', paddingHorizontal: 5, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
  ribbonSignalGlow: { borderRadius: 9 },
  ribbonSignalDot: { width: 6, height: 6, borderRadius: 4 },
  ribbonSignalCopy: { flex: 1, minWidth: 0 },
  ribbonSignalLabel: { color: 'rgba(255,249,244,.50)', fontSize: 8, fontWeight: '800', letterSpacing: .6 },
  ribbonSignalValue: { color: 'rgba(255,249,244,.48)', fontSize: 9, marginTop: 2 },
  ribbonSignalValueComplete: { color: palette.ink, fontWeight: '700' },
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
  optionalLabel: { color: '#E7CDBA', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  fieldLabel: { color: 'rgba(255,249,244,.66)', fontSize: 10, fontWeight: '700', letterSpacing: 1.1, marginTop: 9, marginBottom: 5 },
  optionalInline: { color: 'rgba(255,249,244,.43)', fontWeight: '500' },
  fieldInput: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,.22)', backgroundColor: 'rgba(255,255,255,.08)', paddingHorizontal: 12, color: palette.ink, fontSize: 14 },
  countryButton: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,.22)', backgroundColor: 'rgba(255,255,255,.08)', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countryButtonText: { color: palette.ink, fontSize: 12 },
  countryPlaceholder: { color: 'rgba(255,249,244,.46)' },
  countryChevron: { color: '#F2CDAF', fontSize: 19 },
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
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(169,211,174,.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.mint },
  liveBadgeText: { color: '#E8E1EA', fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  mapSub: { color: palette.muted, fontSize: 9, lineHeight: 13, marginTop: 4 },
  mapGraph: { height: 151, marginTop: 7, position: 'relative', overflow: 'hidden' },
  mapLine: { position: 'absolute', height: 1.4, borderRadius: 2, transformOrigin: 'center' } as any,
  mapNode: { position: 'absolute', width: 78, alignItems: 'center', zIndex: 2 },
  mapNodeDot: { width: 34, height: 34, borderRadius: 18, borderWidth: 2, borderColor: '#FBF6F0', alignItems: 'center', justifyContent: 'center', shadowOpacity: .4, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  mapNodeGlyph: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  mapNodeLabel: { color: palette.ink, fontSize: 10, fontWeight: '600', marginTop: 2, maxWidth: 80, textAlign: 'center' },
  mapNodeMeta: { color: 'rgba(255,249,244,.58)', fontSize: 9, marginTop: 1 },
  mapOrbRing: { position: 'absolute', width: 48, height: 48, borderRadius: 25, left: '50%', marginLeft: -24, top: 41, alignItems: 'center', justifyContent: 'center', zIndex: 4, backgroundColor: 'rgba(255,255,255,.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,.25)', shadowColor: palette.lilac, shadowOpacity: .38, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } },
  mapYou: { position: 'absolute', top: 93, left: '50%', width: 104, marginLeft: -52, textAlign: 'center', color: palette.ink, fontSize: 10, fontWeight: '700', zIndex: 4 },
  mapEmpty: { position: 'absolute', left: 4, right: 4, bottom: 1, color: 'rgba(255,249,244,.45)', textAlign: 'center', fontSize: 8 },
  mapMore: { position: 'absolute', right: 1, bottom: 1, color: 'rgba(255,249,244,.55)', fontSize: 7 },
  liveSignalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  liveSignal: { minHeight: 27, borderWidth: 1, borderColor: 'rgba(255,255,255,.13)', borderRadius: 14, backgroundColor: 'rgba(255,255,255,.045)', paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
  liveSignalGlow: { borderRadius: 13 },
  liveSignalDot: { width: 6, height: 6, borderRadius: 3 },
  liveSignalLabel: { color: 'rgba(255,249,244,.50)', fontSize: 9, fontWeight: '700', letterSpacing: .45 },
  liveSignalValue: { color: 'rgba(255,249,244,.43)', fontSize: 10, maxWidth: 94 },
  liveSignalValueComplete: { color: palette.ink, fontWeight: '600' },
  mapStats: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.16)', minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  mapStat: { alignItems: 'center', flex: 1 },
  mapStatNumber: { color: palette.ink, fontSize: 15, fontWeight: '400' },
  mapStatLabel: { color: 'rgba(255,249,244,.48)', fontSize: 9, letterSpacing: .75, marginTop: 1 },
  mapStatRule: { width: 1, height: 25, backgroundColor: 'rgba(255,255,255,.16)' },
  measureCard: { padding: 15, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(140,201,245,.34)', backgroundColor: 'rgba(255,255,255,.075)', marginBottom: 12 },
  measureInputRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  measureInput: { flex: 1 },
  unitLabel: { color: '#B7DFFF', fontSize: 13, fontWeight: '700', width: 34 },
  metricPreview: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, paddingHorizontal: 10, paddingVertical: 8, marginTop: 11, backgroundColor: 'rgba(140,201,245,.11)', borderWidth: 1, borderColor: 'rgba(140,201,245,.2)' },
  metricPreviewOrb: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  metricPreviewTitle: { color: palette.ink, fontSize: 10, fontWeight: '600' },
  metricPreviewMeta: { color: 'rgba(255,249,244,.65)', fontSize: 10, marginTop: 2 },
  metricLive: { alignItems: 'center', gap: 3, paddingHorizontal: 5 },
  metricLiveText: { color: palette.mint, fontSize: 9, fontWeight: '800', letterSpacing: .8 },
  selectedSection: { marginTop: 7, marginBottom: 10 },
  selectedOverline: { color: 'rgba(255,249,244,.53)', fontSize: 10, fontWeight: '700', letterSpacing: .9, marginBottom: 6 },
  selectedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selectedToken: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, backgroundColor: 'rgba(255,255,255,.08)' },
  selectedTokenDot: { width: 7, height: 7, borderRadius: 4 },
  selectedTokenText: { color: palette.ink, fontSize: 9, fontWeight: '600' },
  removeMark: { color: '#F3C9B7', fontSize: 17, marginLeft: 1 },
  followupCard: { padding: 13, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,.20)', backgroundColor: 'rgba(38,27,50,.58)', marginTop: 8, marginBottom: 12, overflow: 'hidden' },
  followupHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  followupIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  followupGlyph: { fontSize: 17, fontWeight: '500' },
  followupOverline: { color: 'rgba(255,249,244,.55)', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  followupTitle: { color: palette.ink, fontSize: 14, marginTop: 2, fontWeight: '600' },
  followupMeta: { color: palette.peach, fontSize: 10, fontWeight: '700', letterSpacing: .7 },
  followupHint: { color: palette.muted, fontSize: 9, lineHeight: 14, marginTop: 7 },
  detailBubbleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9, justifyContent: 'center' },
  detailBubbleTouch: { width: 74, height: 74, borderRadius: 38 },
  detailBubble: { flex: 1, borderWidth: 1, borderRadius: 38, alignItems: 'center', justifyContent: 'center', padding: 7 },
  detailBubbleText: { color: palette.ink, fontSize: 10, lineHeight: 11, fontWeight: '600', textAlign: 'center' },
  customAreaRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  customAreaInput: { flex: 1 },
  customAreaAdd: { minWidth: 65, borderRadius: 13, backgroundColor: palette.cream, alignItems: 'center', justifyContent: 'center' },
  customAreaAddText: { color: '#30223B', fontSize: 10, fontWeight: '800', letterSpacing: .6 },
  focusHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8, marginBottom: 5 },
  focusTitle: { color: palette.ink, fontSize: 21, fontWeight: '400', marginTop: 4 },
  focusCount: { color: '#F2D4C1', fontSize: 10, fontWeight: '700', letterSpacing: .7, paddingBottom: 4 },
  focusCloud: { width: '100%', height: 352, position: 'relative', overflow: 'visible', marginTop: 5, marginBottom: 11 },
  focusBubblePosition: { position: 'absolute', zIndex: 2 },
  focusBubbleTouch: { flex: 1, borderRadius: 999, overflow: 'visible' },
  focusBubble: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, overflow: 'hidden', shadowOffset: { width: 0, height: 5 }, shadowRadius: 10, elevation: 3 },
  focusBubbleText: { color: palette.ink, fontSize: 10, lineHeight: 13, fontWeight: '500', textAlign: 'center' },
  focusBubbleTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  focusCheck: { position: 'absolute', top: 9, right: 13, color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  domainHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 7 },
  domainTitle: { color: palette.ink, fontSize: 15, fontWeight: '600', marginTop: 3 },
  domainTotal: { color: '#E9C5B2', fontSize: 22, fontWeight: '300', letterSpacing: 1 },
  domainGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 13 },
  domainCard: { width: '48.5%', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 14, paddingHorizontal: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,.15)', backgroundColor: 'rgba(255,255,255,.065)' },
  domainOrb: { width: 21, height: 21, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  domainOrbText: { color: '#30223B', fontSize: 8, fontWeight: '900' },
  domainName: { color: palette.ink, fontSize: 10, fontWeight: '700' },
  domainDetail: { color: 'rgba(255,249,244,.56)', fontSize: 9, marginTop: 2 },
  domainCount: { color: palette.cream, fontSize: 9, fontWeight: '700' },
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
});
