import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { HealthTopic } from '../state/NuraContext';
import { colors, motion } from '../theme';

type FocusOption = HealthTopic & { diameter: number; x: number; y: number; details: string[] };
const options: FocusOption[] = [
  { id: 'bp-topic', label: 'Blood\npressure', diameter: 108, x: 2, y: 1, details: ['Readings', 'Medicines', 'Tests', 'History'] },
  { id: 'cholesterol', label: 'Cholesterol', diameter: 94, x: 119, y: 0, details: ['Lab results', 'Medicine', 'Food + routine', 'History'] },
  { id: 'sugar', label: 'Blood\nsugar', diameter: 88, x: 230, y: 27, details: ['Lab results', 'Daily readings', 'Medicines', 'Food + routine'] },
  { id: 'heart', label: 'Heart health', diameter: 79, x: 35, y: 124, details: ['Symptoms', 'Tests', 'Medicines', 'Family history'] },
  { id: 'kidney', label: 'Kidneys', diameter: 73, x: 137, y: 113, details: ['Lab results', 'Tests', 'Medicines', 'History'] },
  { id: 'medicines', label: 'Medicines', diameter: 100, x: 229, y: 149, details: ['Current list', 'How I take them', 'Side effects', 'Past medicines'] },
  { id: 'sleep', label: 'Sleep', diameter: 92, x: 0, y: 228, details: ['Sleep pattern', 'Breathing', 'Daytime energy', 'Treatment'] },
  { id: 'joints', label: 'Joints', diameter: 74, x: 108, y: 226, details: ['Pain', 'Movement', 'Treatment', 'When it started'] },
  { id: 'family', label: 'Family\nhistory', diameter: 91, x: 214, y: 239, details: ['Heart health', 'Blood sugar', 'Cancer', 'Something else'] },
  { id: 'other', label: 'Something\nelse', diameter: 74, x: 129, y: 286, details: ['Add in my words'] },
];
const detailId = (parentId: string, value: string) => `focusdetail:${parentId}:${value.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

function FocusBubble({ label, diameter, x, y, selected, index, detail = false, onPress }: {
  label: string; diameter: number; x: number; y: number; selected: boolean; index: number; detail?: boolean; onPress: () => void;
}) {
  const [press] = useState(() => new Animated.Value(1));
  const [pop] = useState(() => new Animated.Value(1));
  const [drift] = useState(() => new Animated.Value(0));
  const [fill] = useState(() => new Animated.Value(selected ? 1 : 0));
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { alive = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    fill.stopAnimation();
    Animated.timing(fill, { toValue: selected ? 1 : 0, duration: reducedMotion ? 0 : motion.wordEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: false }).start();
    if (selected && !reducedMotion) {
      pop.setValue(0.94);
      Animated.sequence([
        Animated.spring(pop, { toValue: 1.065, speed: 26, bounciness: 5, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, speed: 24, bounciness: 3, useNativeDriver: true }),
      ]).start();
    } else if (reducedMotion) pop.setValue(1);
  }, [fill, pop, reducedMotion, selected]);

  useEffect(() => {
    if (reducedMotion) { drift.setValue(0); return; }
    const bob = Animated.loop(Animated.sequence([
      Animated.delay((index % 5) * motion.stagger.dense),
      Animated.timing(drift, { toValue: -7, duration: motion.bob / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: motion.bob / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    bob.start();
    return () => bob.stop();
  }, [drift, index, reducedMotion]);

  const backgroundColor = fill.interpolate({ inputRange: [0, 1], outputRange: [detail ? 'rgba(251,246,240,0.10)' : 'rgba(251,246,240,0.09)', detail ? '#E7B48F' : '#FBF6F0'] });
  const borderColor = fill.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,236,228,0.27)', detail ? '#F1C8A4' : '#FFF9F2'] });
  const translateY = drift.interpolate({ inputRange: [-7, 0], outputRange: [-7, 0] });
  const size = detail ? diameter : diameter;
  return <Animated.View style={[styles.bubblePosition, { width: size, height: size, left: x, top: y, transform: [{ translateY }, { scale: Animated.multiply(press, pop) }] }]}>
    <Animated.View style={[styles.bubbleSurface, { backgroundColor, borderColor, borderRadius: size / 2, shadowColor: selected ? (detail ? colors.peach : colors.cream) : '#2A1736', shadowOpacity: selected ? 0.34 : 0.12, shadowRadius: selected ? 16 : 8 }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${label.replace('\n', ' ')}${selected ? ', selected' : ''}`} onPress={onPress} onPressIn={() => { if (!reducedMotion) Animated.timing(press, { toValue: motion.pressScale, duration: motion.pressIn, easing: Easing.linear, useNativeDriver: true }).start(); }} onPressOut={() => { if (!reducedMotion) Animated.timing(press, { toValue: 1, duration: motion.pressOut, easing: Easing.bezier(...motion.easing.bouncy), useNativeDriver: true }).start(); }} style={styles.bubbleTouch}>
        {selected && !detail && <View pointerEvents="none" style={styles.selectedSpark}><Text style={styles.sparkText}>✦</Text></View>}
        <Text style={[styles.bubbleText, detail && styles.detailText, selected && styles.selectedText]}>{label}</Text>
      </Pressable>
    </Animated.View>
  </Animated.View>;
}

export function FocusCloud({ topics, onToggle }: { topics: HealthTopic[]; onToggle: (topic: HealthTopic) => void }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [customDetail, setCustomDetail] = useState('');
  const [cloudWidth, setCloudWidth] = useState(346);
  const parentIds = useMemo(() => new Set(options.map((item) => item.id)), []);
  const selectedParents = topics.filter((item) => parentIds.has(item.id));
  const active = options.find((item) => item.id === activeId) ?? null;
  const selectedDetails = active ? topics.filter((item) => item.id.startsWith(`focusdetail:${active.id}:`)) : [];
  const scale = Math.min(cloudWidth / 346, 1);

  const toggleParent = (topic: FocusOption) => {
    const alreadySelected = selectedParents.some((item) => item.id === topic.id);
    if (alreadySelected) {
      topics.filter((item) => item.id.startsWith(`focusdetail:${topic.id}:`)).forEach(onToggle);
      onToggle(topic);
      if (activeId === topic.id) setActiveId(null);
    } else {
      onToggle({ id: topic.id, label: topic.label.replace('\n', ' ') });
      setActiveId(topic.id);
    }
  };
  const toggleDetail = (label: string) => {
    if (!active) return;
    onToggle({ id: detailId(active.id, label), label: `${active.label.replace('\n', ' ')} · ${label}` });
  };
  const addCustom = () => {
    const value = customDetail.trim();
    if (!active || !value) return;
    onToggle({ id: detailId(active.id, value), label: `${active.label.replace('\n', ' ')} · ${value}` });
    setCustomDetail('');
  };

  return <View style={styles.wrap}>
    <View style={styles.cloudHeading}><View><Text style={styles.eyebrow}>YOUR FOCUS AREAS</Text><Text style={styles.heading}>What’s on your mind?</Text></View><Text style={styles.count}>{selectedParents.length.toString().padStart(2, '0')} SELECTED</Text></View>
    <Text style={styles.intro}>Tap any signal. Add detail if you want; these are your chosen focus areas, not diagnoses.</Text>
    <View style={[styles.cloud, { height: 380 * scale }]} onLayout={(event) => setCloudWidth(event.nativeEvent.layout.width)}>
      {options.map((option, index) => <FocusBubble key={option.id} label={option.label} diameter={option.diameter * scale} x={option.x * scale} y={option.y * scale} index={index} selected={selectedParents.some((item) => item.id === option.id)} onPress={() => toggleParent(option)} />)}
    </View>
    {active && <View key={active.id} style={styles.branch}>
      <View style={styles.branchStem} />
      <View style={styles.branchHeading}><View><Text style={styles.branchKicker}>IF YOU WANT TO ADD DETAIL</Text><Text style={styles.branchTitle}>{active.label.replace('\n', ' ')}</Text></View><Text style={styles.optional}>OPTIONAL</Text></View>
      <View style={styles.detailCloud}>
        {active.details.map((label, index) => {
          const id = detailId(active.id, label);
          return <FocusBubble key={id} label={label} diameter={[66, 76, 62, 72][index % 4]} x={[2, 81, 172, 244][index % 4]} y={[7, 1, 15, 3][index % 4]} index={index + 10} detail selected={topics.some((item) => item.id === id)} onPress={() => toggleDetail(label)} />;
        })}
      </View>
      {active.id === 'other' && <View style={styles.customRow}><TextInput value={customDetail} onChangeText={setCustomDetail} placeholder="Add it in your own words" placeholderTextColor={colors.quiet} style={styles.customInput} returnKeyType="done" onSubmitEditing={addCustom} /><Pressable accessibilityRole="button" onPress={addCustom} style={({ pressed }) => [styles.addCustom, pressed && styles.pressed]}><Text style={styles.addCustomText}>Add</Text></Pressable></View>}
      {selectedDetails.length > 0 && <Text style={styles.detailCount}>{selectedDetails.length} {selectedDetails.length === 1 ? 'detail' : 'details'} added under this focus.</Text>}
    </View>}
    <View style={styles.truth}><View style={styles.truthMark}><Text style={styles.truthStar}>✦</Text></View><Text style={styles.truthCopy}>{selectedParents.length === 0 ? 'Your profile is ready to take shape. Nothing here is treated as a diagnosis.' : selectedParents.length === 1 ? 'You’ve selected one focus area. Nura records this as your choice, not a medical conclusion.' : `You’ve selected ${selectedParents.length} focus areas. Nura records these as your choices, not medical conclusions.`}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10, marginBottom: 8 },
  cloudHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 7 },
  eyebrow: { color: '#F0DCEB', fontSize: 10, fontWeight: '700', letterSpacing: 1.7 },
  heading: { color: colors.text, fontSize: 24, fontWeight: '400', letterSpacing: -0.5, marginTop: 4 },
  count: { color: '#F2D4C1', fontSize: 9, fontWeight: '700', letterSpacing: 1, paddingBottom: 3 },
  intro: { color: '#E3D4D8', fontSize: 13, lineHeight: 19, marginBottom: 5 },
  cloud: { width: '100%', position: 'relative', marginTop: 5, overflow: 'visible' },
  bubblePosition: { position: 'absolute', zIndex: 2 },
  bubbleSurface: { flex: 1, borderWidth: 1, alignItems: 'stretch', justifyContent: 'flex-start', overflow: 'hidden', shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  bubbleTouch: { flex: 1, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  bubbleText: { color: '#F9EEF0', fontSize: 12, lineHeight: 14, fontWeight: '500', textAlign: 'center' },
  detailText: { fontSize: 11, lineHeight: 13 },
  selectedText: { color: '#30223B', fontWeight: '700' },
  selectedSpark: { position: 'absolute', right: 15, top: 12 },
  sparkText: { color: '#B47D8B', fontSize: 10 },
  branch: { marginTop: 5, paddingHorizontal: 13, paddingTop: 12, paddingBottom: 12, borderRadius: 22, backgroundColor: 'rgba(38,26,50,.46)', borderWidth: 1, borderColor: 'rgba(255,236,228,.2)', overflow: 'hidden' },
  branchStem: { position: 'absolute', top: 0, left: '50%', width: 1, height: 15, backgroundColor: 'rgba(231,180,143,.65)' },
  branchHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  branchKicker: { color: '#E8C5B0', fontSize: 8, letterSpacing: 1.2, fontWeight: '700' },
  branchTitle: { color: colors.text, fontSize: 16, marginTop: 4, fontWeight: '500' },
  optional: { color: '#D0B8C6', fontSize: 8, letterSpacing: 1 },
  detailCloud: { width: '100%', height: 98, position: 'relative', overflow: 'visible' },
  detailCount: { color: '#D4C4CF', fontSize: 11, marginTop: 2 },
  truth: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 11, paddingHorizontal: 2 },
  truthMark: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(231,180,143,.16)', alignItems: 'center', justifyContent: 'center' },
  truthStar: { color: '#F0C49E', fontSize: 12 },
  truthCopy: { flex: 1, color: '#E7D6DE', fontSize: 11, lineHeight: 16 },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 3 },
  customInput: { flex: 1, height: 44, backgroundColor: 'rgba(30,21,42,.66)', borderColor: 'rgba(255,236,228,.2)', borderWidth: 1, borderRadius: 14, color: colors.text, paddingHorizontal: 12 },
  addCustom: { minWidth: 62, borderRadius: 14, backgroundColor: colors.cream, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  addCustomText: { color: '#30223B', fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.92, transform: [{ scale: motion.pressScale }] },
});
