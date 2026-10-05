import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

/** Shared frosted material for cards and controls across the Nura experience. */
export function GlassMaterial({
  tone = 'dark',
  intensity,
  radius = 20,
}: {
  tone?: 'light' | 'dark';
  intensity?: number;
  radius?: number;
}) {
  const blurIntensity = intensity ?? (tone === 'light' ? 68 : 52);
  const clippedFill = [StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' as const }];
  const dark = tone === 'dark';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius }] }>
      <BlurView
        tint={dark ? 'dark' : 'default'}
        intensity={Platform.OS === 'web' ? Math.max(blurIntensity, dark ? 82 : 86) : blurIntensity}
        style={clippedFill}
      />
      <LinearGradient
        colors={dark
          ? ['rgba(255,219,186,.17)', 'rgba(196,132,102,.12)', 'rgba(35,25,23,.18)']
          : ['rgba(255,251,244,.25)', 'rgba(239,224,225,.12)', 'rgba(213,184,199,.14)']}
        locations={[0, 0.48, 1]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={clippedFill}
      />
      <LinearGradient
        colors={dark
          ? ['rgba(255,249,239,.36)', 'rgba(255,226,203,.13)', 'rgba(255,255,255,0)']
          : ['rgba(255,255,255,.38)', 'rgba(255,255,255,.12)', 'rgba(255,255,255,0)']}
        locations={[0, 0.24, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.specularBand, { borderRadius: radius }]}
      />
      <LinearGradient
        colors={dark
          ? ['rgba(255,228,205,.47)', 'rgba(158,201,194,.17)', 'rgba(144,211,220,.20)', 'rgba(255,228,205,.05)']
          : ['rgba(255,255,255,.72)', 'rgba(220,198,228,.30)', 'rgba(160,207,221,.22)', 'rgba(255,255,255,.16)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.edgeSheen}
      />
      <LinearGradient
        colors={dark
          ? ['rgba(255,226,202,0)', 'rgba(255,226,202,.20)', 'rgba(255,226,202,0)']
          : ['rgba(255,255,255,0)', 'rgba(255,255,255,.34)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.lowerEdge, { borderRadius: radius }]}
      />
      <View style={[styles.innerRim, dark && styles.innerRimDark, { borderRadius: radius }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  innerRim: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.24)',
    borderTopColor: 'rgba(255,255,255,.46)',
  },
  innerRimDark: {
    borderColor: 'rgba(255,226,205,.27)',
    borderTopColor: 'rgba(255,244,231,.68)',
  },
  specularBand: { position: 'absolute', top: 0, left: 0, right: 0, height: '54%' },
  edgeSheen: { position: 'absolute', top: 0, left: 1, right: 1, height: 1.5 },
  lowerEdge: { position: 'absolute', bottom: 0, left: 1, right: 1, height: 1.25 },
});
