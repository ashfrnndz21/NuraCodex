import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HealthMarkerRangeGuide } from '../services/healthMarkers.mjs';
import { canonicalHealthMarker } from '../services/healthMarkers.mjs';
import { HealthMarkerRangeBand, HealthMarkerStatusBadge } from './HealthMarkerRangePresentation';

export const healthMarkerCardStyles = StyleSheet.create({
  card: {
    minHeight: 222,
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,226,205,.32)',
    backgroundColor: 'rgba(67,42,35,.48)',
  },
});

type Props = {
  label: string;
  value: string;
  date: React.ReactNode;
  source: string;
  markerId: string;
  guide: HealthMarkerRangeGuide | null;
  unitNeedsReview?: boolean;
  valueNeedsReview?: boolean;
  rangeNotice: string;
  reportRange?: string;
};

function markerDotColor(label: string) {
  const marker = canonicalHealthMarker(label);
  if (['total-cholesterol', 'ldl', 'hdl', 'non-hdl', 'triglycerides', 'apob'].includes(marker ?? '')) return '#9FD8C7';
  if (['hba1c', 'fasting-glucose', 'glucose'].includes(marker ?? '')) return '#A9D4E3';
  return '#E8B18E';
}

export function HealthMarkerCardContent({ label, value, date, source, markerId, guide, unitNeedsReview = false, valueNeedsReview = false, rangeNotice, reportRange }: Props) {
  const measure = value.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*(.*)$/);
  const status = guide?.status ?? (unitNeedsReview ? 'CHECK UNIT' : valueNeedsReview ? 'CHECK VALUE' : null);
  return <View style={styles.content}>
    <View style={styles.header}>
      <View style={[styles.dot, { backgroundColor: markerDotColor(label) }]} />
      <Text numberOfLines={1} style={styles.label}>{label}</Text>
      {status ? <HealthMarkerStatusBadge status={status} color={guide?.statusColor} caution={!guide} /> : null}
      <Text accessibilityLabel="Open marker" style={styles.arrow}>↗</Text>
    </View>
    {measure ? <View style={styles.valueRow}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.78} style={styles.value}>{measure[1]}</Text>{measure[2] ? <Text numberOfLines={1} style={styles.unit}>{measure[2]}</Text> : null}</View> : <Text numberOfLines={2} style={[styles.value, styles.narrative]}>{value}</Text>}
    <Text style={styles.date}>{date}</Text>
    <View style={styles.rangeSlot}>
      {guide ? <HealthMarkerRangeBand guide={guide} value={value} markerId={markerId} markerLabel={label} /> : <Text numberOfLines={2} style={[styles.rangeNotice, (unitNeedsReview || valueNeedsReview) && styles.rangeNoticeCaution]}>{rangeNotice}</Text>}
      {guide && reportRange ? <Text numberOfLines={1} style={styles.reportRange}>Report range · {reportRange}</Text> : null}
    </View>
    <Text numberOfLines={1} style={styles.source}>{source || 'Entered by you'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  content: { width: '100%', flex: 1 },
  header: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 7, width: '100%' },
  dot: { width: 8, height: 8, borderRadius: 5, flexShrink: 0 },
  label: { flex: 1, minWidth: 0, color: '#FFF8F0', fontSize: 15, fontWeight: '700' },
  arrow: { color: '#B5DDED', fontSize: 12, lineHeight: 16, fontWeight: '700', marginLeft: 1 },
  valueRow: { width: '100%', minHeight: 48, flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 5 },
  value: { flexShrink: 1, color: '#FFF8F0', fontSize: 38, lineHeight: 46, fontWeight: '600', letterSpacing: -.9 },
  unit: { flexShrink: 1, color: 'rgba(255,248,240,.72)', fontSize: 14, lineHeight: 19, fontWeight: '600' },
  narrative: { fontSize: 20, lineHeight: 25 },
  date: { width: '100%', color: 'rgba(255,248,240,.52)', fontSize: 13, lineHeight: 18 },
  rangeSlot: { width: '100%' },
  rangeNotice: { color: 'rgba(255,248,240,.58)', fontSize: 11, lineHeight: 15, marginTop: 13, marginBottom: 9 },
  rangeNoticeCaution: { color: '#F1D9B8' },
  reportRange: { color: 'rgba(255,248,240,.62)', fontSize: 10, lineHeight: 14, marginTop: -5 },
  source: { width: '100%', color: 'rgba(255,248,240,.52)', fontSize: 12, lineHeight: 17, marginTop: 4 },
});
