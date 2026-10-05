import React, { useEffect, useState } from 'react';
import { animatedNativeDriver } from '../../services/animatedDriver';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { brandScenes } from '../../theme';
import { shouldUseMotion } from '../../services/motionPolicy.mjs';

export function Atmosphere() {
  const [drift] = useState(() => new Animated.Value(0));
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const animateDrift = shouldUseMotion(reducedMotion);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (active) setReducedMotion(enabled); })
      .catch(() => { if (active) setReducedMotion(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!animateDrift) {
      drift.stopAnimation();
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 18000, easing: Easing.inOut(Easing.ease), useNativeDriver: animatedNativeDriver, isInteraction: false }),
      Animated.timing(drift, { toValue: 0, duration: 18000, easing: Easing.inOut(Easing.ease), useNativeDriver: animatedNativeDriver, isInteraction: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [animateDrift, drift]);
  const x = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });
  const y = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <LinearGradient colors={brandScenes.atmosphere.colors} locations={brandScenes.atmosphere.locations} start={{ x: 1, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
    <Animated.View testID="nura-atmosphere-peach-light" style={[styles.peachLight, { transform: [{ translateX: x }, { translateY: y }] }]} />
    <Animated.View testID="nura-atmosphere-lilac-light" style={[styles.lilacLight, { transform: [{ translateX: y }, { translateY: x }] }]} />
    <EtchedContours />
  </View>;
}

export function EtchedContours() {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <View style={styles.topOrbit} />
    <View style={styles.lowerOrbit} />
    {Array.from({ length: 9 }, (_, index) => <View key={index} style={[styles.etchLine, { left: -164 + index * 52 }]} />)}
  </View>;
}

const styles = StyleSheet.create({
  peachLight: { position: 'absolute', width: 390, height: 430, borderRadius: 999, right: -205, top: -170, backgroundColor: 'rgba(232,164,126,.23)', filter: 'blur(74px)' } as any,
  lilacLight: { position: 'absolute', width: 360, height: 300, borderRadius: 999, left: -185, bottom: 65, backgroundColor: 'rgba(176,158,184,.10)', filter: 'blur(74px)' } as any,
  topOrbit: { position: 'absolute', width: 540, height: 540, borderRadius: 270, top: -215, right: -360, borderWidth: 1, borderColor: 'rgba(248,199,165,.22)' },
  lowerOrbit: { position: 'absolute', width: 470, height: 470, borderRadius: 235, bottom: -300, left: -315, borderWidth: 1, borderColor: 'rgba(226,184,168,.18)' },
  etchLine: { position: 'absolute', width: 1, height: '145%', top: -90, backgroundColor: 'rgba(255,220,190,.12)', transform: [{ rotate: '42deg' }] },
});
