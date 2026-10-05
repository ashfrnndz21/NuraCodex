import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const stages = ['YOU', 'AREAS', 'RECORDS', 'MEDICINES', 'INSURANCE', 'REVIEW'];

/** Persistent, low-height progress cue for the six-stage first-run setup. */
export function ProfileSetupProgress({ step }: { step: number }) {
  const current = Math.min(6, Math.max(1, step));
  return <View accessibilityRole="progressbar" accessibilityLabel={`Profile setup, step ${current} of 6: ${stages[current - 1].toLowerCase()}`} accessibilityValue={{ min: 1, max: 6, now: current, text: `${current} of 6` }} style={styles.wrap}>
    <View style={styles.top}><Text style={styles.label}>PROFILE SETUP</Text><Text style={styles.count}>{String(current).padStart(2, '0')} / 06</Text></View>
    <View style={styles.rail}>{stages.map((stage, index) => <View key={stage} style={[styles.segment, index < current - 1 && styles.done, index === current - 1 && styles.active]} />)}</View>
    <View style={styles.names}>{stages.map((stage, index) => <Text key={stage} numberOfLines={1} style={[styles.name, index === current - 1 && styles.nameActive]}>{stage}</Text>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12, paddingHorizontal: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: 'rgba(255,249,244,.66)', fontSize: 9, fontWeight: '800', letterSpacing: 1.25 },
  count: { color: '#F5D9C7', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  rail: { flexDirection: 'row', gap: 4, marginTop: 6 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,248,240,.19)' },
  done: { backgroundColor: 'rgba(234,164,124,.86)' },
  active: { backgroundColor: '#FFF1E4' },
  names: { flexDirection: 'row', justifyContent: 'space-between', gap: 2, marginTop: 5 },
  name: { color: 'rgba(255,249,244,.48)', fontSize: 7, fontWeight: '800', letterSpacing: .5, flexShrink: 1 },
  nameActive: { color: '#F5D9C7' },
});
