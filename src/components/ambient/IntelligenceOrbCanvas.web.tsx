import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import type { AIState } from '../../state/AIStateContext';
import { motion as designMotion } from '../../theme';

const periods: Record<AIState, number> = { ...designMotion.orb, error: designMotion.orb.idle };
const gradient = 'conic-gradient(from 0deg, #fbe3cf, #c9a9e8, #6f4fc4, #f0b48f, #9fd0ff, #fbe3cf)';
const mutedGradient = 'conic-gradient(from 0deg, #d6ccd9, #b9acbf, #8a7c96, #c7b8b4, #a7a8b4, #d6ccd9)';

export function IntelligenceOrbCanvas({ size, state }: { size: number; state: AIState }) {
  const [rotationProgress] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  const [breath] = useState(() => new Animated.Value(0));
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduced(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    let spin: Animated.CompositeAnimation | undefined;
    let breathing: Animated.CompositeAnimation | undefined;
    let statePulse: Animated.CompositeAnimation | undefined;
    const stop = () => { spin?.stop(); breathing?.stop(); statePulse?.stop(); };
    const start = () => {
      stop();
      rotationProgress.setValue(0);
      pulse.setValue(0);
      breath.setValue(0);
      if (reduced) return;

      const period = periods[state];
      spin = Animated.loop(Animated.timing(rotationProgress, { toValue: 1, duration: period, easing: Easing.linear, useNativeDriver: true }));
      if (state === 'idle') {
        breathing = Animated.loop(Animated.sequence([
          Animated.timing(breath, { toValue: 1, duration: designMotion.breathe / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(breath, { toValue: 0, duration: designMotion.breathe / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]));
      } else if (state !== 'error') {
        statePulse = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: period, easing: Easing.linear, useNativeDriver: true }));
      }
      spin.start();
      breathing?.start();
      statePulse?.start();
    };
    start();
    return stop;
  }, [breath, pulse, reduced, rotationProgress, state]);

  const rotation = rotationProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const breathScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const haloInput = state === 'listening' ? [0, 0.7, 1] : state === 'responding' ? [0, 0.55, 1] : [0, 0.5, 1];
  const haloScaleOutput = state === 'listening' ? [0.92, 1.3, 1.3] : state === 'responding' ? [0.94, 1.24, 1.24] : [0.94, 1.16, 0.94];
  const haloOpacityOutput = state === 'listening' ? [0.75, 0, 0] : state === 'responding' ? [0.6, 0, 0] : [0.22, 0.6, 0.22];
  const haloScale = pulse.interpolate({ inputRange: haloInput, outputRange: haloScaleOutput });
  const haloOpacity = pulse.interpolate({ inputRange: haloInput, outputRange: haloOpacityOutput });
  const staticScale = state === 'listening' ? 1.08 : state === 'thinking' ? 1.03 : state === 'responding' ? 1.02 : 1;
  const staticOpacity = state === 'error' ? 0.4 : state === 'idle' ? 0 : state === 'listening' ? 0.3 : 0.3;
  const diameter = size;
  const blur = size >= 100 ? 15 : size >= 60 ? 9 : 5;
  const sweepStyle = { position: 'absolute', inset: '-35%', borderRadius: '50%', backgroundImage: state === 'error' ? mutedGradient : gradient, filter: 'blur(' + blur + 'px)', transform: [{ rotate: reduced ? '0deg' : rotation }] } as any;
  const shellStyle = { position: 'relative', width: diameter, height: diameter, borderRadius: '50%', overflow: 'hidden', boxShadow: state === 'error' ? '0 0 9px rgba(170,158,186,.3), inset 0 0 8px rgba(255,255,255,.28)' : state === 'listening' ? '0 0 22px rgba(201,169,232,.8), inset 0 0 8px rgba(255,255,255,.6)' : state === 'responding' ? '0 0 20px rgba(201,169,232,.75), inset 0 0 8px rgba(255,255,255,.6)' : '0 0 14px rgba(201,169,232,.55), inset 0 0 8px rgba(255,255,255,.5)' } as any;
  return <View accessible={false} style={{ width: size * 1.7, height: size * 1.7, alignItems: 'center', justifyContent: 'center' }}>
    <View style={[styles.glow, { width: size * 1.35, height: size * 1.35, opacity: state === 'error' ? 0.12 : state === 'listening' ? 0.28 : state === 'responding' ? 0.23 : 0.16 } as any]} />
    <View style={[styles.halo, { opacity: reduced ? staticOpacity : state === 'idle' ? 0 : state === 'error' ? 0.4 : haloOpacity, transform: [{ scale: reduced ? staticScale : haloScale }] } as any]} />
    <Animated.View style={[shellStyle, { transform: [{ scale: state === 'idle' && !reduced ? breathScale : 1 }] } as any]}>
      <Animated.View style={sweepStyle} />
      <View pointerEvents="none" style={styles.specular} />
      <View pointerEvents="none" style={styles.innerEdge} />
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  glow: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(201,169,232,0.16)', filter: 'blur(32px)' } as any,
  specular: { position: 'absolute', left: '18%', top: '10%', width: '45%', height: '32%', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.55)', filter: 'blur(3px)' } as any,
  innerEdge: { position: 'absolute', inset: 0, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', boxShadow: 'inset 0 0 8px rgba(255,255,255,0.5)' } as any,
  halo: { position: 'absolute', inset: '-18%', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(201,169,232,.7)' } as any,
});
