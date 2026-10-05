import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { HealthMarkerRangeGuide } from '../services/healthMarkers.mjs';

export function HealthMarkerStatusBadge({ status, color, caution = false }: { status: string; color?: string; caution?: boolean }) {
  return <View accessibilityLabel={status} style={[styles.status, caution && styles.statusCaution]}>
    <Text style={[styles.statusText, color && !caution ? { color } : null, caution && styles.statusCautionText]}>{status}</Text>
  </View>;
}

export function HealthMarkerRangeBand({ guide, value, markerId, markerLabel }: { guide: HealthMarkerRangeGuide; value: string; markerId: string; markerLabel?: string }) {
  return <View style={styles.scale}>
    <View testID={`health-marker-range-${markerId}`} accessibilityLabel={`${markerLabel ? `${markerLabel}: ` : ''}${guide.status.toLocaleLowerCase()} general adult guide, result ${value}`} style={styles.track}>
      {guide.segments.map((segment, index) => <View key={`${markerId}-range-${index}`} style={[styles.segment, { width: `${segment.widthPercent}%` as ViewStyle['width'], backgroundColor: segment.color }]} />)}
      <View pointerEvents="none" style={[styles.thumb, { left: `${Math.max(2, Math.min(98, guide.positionPercent))}%` as ViewStyle['left'] }]} />
    </View>
    <View testID={`health-marker-axis-${markerId}`} style={[styles.axis, { height: guide.ticks.some((tick) => tick.row === 1) ? 34 : 22 }]}>{guide.ticks.map((tick, index) => {
      // Give compact threshold text enough room for its full value and unit
      // suffix (for example, “<90” and “140+”) at phone-size font rendering.
      const width = Math.max(34, tick.label.length * 7 + 8);
      const horizontal = tick.align === 'start' ? { left: 0 }
        : tick.align === 'end' ? { right: 0 }
          : tick.align === 'before' ? { left: `${tick.positionPercent}%` as ViewStyle['left'], marginLeft: -width }
            : tick.align === 'after' ? { left: `${tick.positionPercent}%` as ViewStyle['left'] }
              : { left: `${tick.positionPercent}%` as ViewStyle['left'], marginLeft: -width / 2 };
      return <Text key={`${markerId}-tick-${index}`} testID={`health-marker-tick-${markerId}-${index}`} numberOfLines={1} style={[styles.tick, horizontal, { width, top: (tick.row ?? 0) * 14, textAlign: tick.align === 'start' || tick.align === 'after' ? 'left' : tick.align === 'end' || tick.align === 'before' ? 'right' : 'center' }]}>{tick.label}</Text>;
    })}</View>
    <Text style={styles.caption}>{guide.caption}</Text>
  </View>;
}

const styles = StyleSheet.create({
  status: { maxWidth: '48%', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,241,225,.10)' },
  statusText: { color: '#FFF8F0', fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: .35 },
  statusCaution: { backgroundColor: 'rgba(233,190,112,.16)' },
  statusCautionText: { color: '#F0CF92' },
  scale: { marginTop: 17, marginBottom: 10 },
  track: { height: 9, width: '100%', flexDirection: 'row', overflow: 'visible', borderRadius: 99, position: 'relative' },
  segment: { height: 9 },
  thumb: { position: 'absolute', top: -4, width: 17, height: 17, marginLeft: -8.5, borderRadius: 9, backgroundColor: '#FFF8F0', borderWidth: 3, borderColor: '#57382D' },
  axis: { height: 19, position: 'relative', marginTop: 7 },
  tick: { position: 'absolute', top: 0, color: 'rgba(255,248,240,.78)', fontSize: 10, lineHeight: 13, fontWeight: '600' },
  caption: { color: 'rgba(255,248,240,.62)', fontSize: 11, lineHeight: 15, marginTop: 2 },
});
