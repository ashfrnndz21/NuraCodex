import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { getVideoArtworkTheme } from '../services/videoArtwork.mjs';

/** Topic-specific Nura artwork shown when a real YouTube thumbnail is unavailable. */
export default function VideoArtworkFallback({ title, topic }: { title: string; topic: string }) {
  const theme = getVideoArtworkTheme(topic);
  const gradientColors = theme.colors as [string, string, string];
  return <View pointerEvents="none" style={styles.frame}>
    <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <View style={[styles.haloLarge, { borderColor: `${theme.accent}35`, backgroundColor: `${theme.accent}12` }]} />
    <View style={styles.haloSmall} />
    <View style={styles.copy}>
      <View style={styles.brandLine}><View style={[styles.brandDot, { backgroundColor: theme.accent }]} /><Text numberOfLines={1} style={styles.brand}>NURA · HEALTH VIDEO</Text></View>
      <Text numberOfLines={1} style={[styles.topic, { color: theme.accent }]}>{topic || 'HEALTH EDUCATION'}</Text>
      <Text numberOfLines={3} style={styles.title}>{title || 'Health education video'}</Text>
      <Text style={styles.unavailable}>THUMBNAIL UNAVAILABLE</Text>
    </View>
    <View style={[styles.orb, { borderColor: `${theme.accent}99`, backgroundColor: `${theme.accent}18` }]}>
      <View style={[styles.orbRing, { borderColor: `${theme.accent}55` }]} />
      <Text style={[styles.orbGlyph, { color: theme.accent }]}>{theme.symbol}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  frame: { ...StyleSheet.absoluteFill, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 17, paddingVertical: 12, backgroundColor: '#513831' },
  haloLarge: { position: 'absolute', width: 206, height: 206, borderRadius: 110, right: -55, top: -100, borderWidth: 1 },
  haloSmall: { position: 'absolute', width: 120, height: 120, borderRadius: 70, right: 15, bottom: -79, borderWidth: 1, borderColor: 'rgba(255,232,212,.13)' },
  copy: { maxWidth: '38%', gap: 4 },
  brandLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  brandDot: { width: 5, height: 5, borderRadius: 3 },
  brand: { color: 'rgba(255,248,240,.75)', fontSize: 7, lineHeight: 9, fontWeight: '800', letterSpacing: .8 },
  topic: { fontSize: 9, lineHeight: 11, fontWeight: '800', letterSpacing: .8, textTransform: 'uppercase' },
  title: { color: '#FFF8F0', fontSize: 15, lineHeight: 17, fontWeight: '800', letterSpacing: -.15 },
  unavailable: { color: 'rgba(255,240,228,.72)', fontSize: 6, lineHeight: 8, fontWeight: '800', letterSpacing: .55, marginTop: 2 },
  orb: { position: 'absolute', right: 18, top: '50%', width: 57, height: 57, marginTop: -28, borderRadius: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  orbRing: { position: 'absolute', width: 39, height: 39, borderRadius: 20, borderWidth: 1 },
  orbGlyph: { fontSize: 23, fontWeight: '700' },
});
