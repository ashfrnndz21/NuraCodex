import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { BlurMask, Canvas, Circle, Group, SweepGradient, vec } from '@shopify/react-native-skia';
import type { AIState } from '../../state/AIStateContext';
import { motion } from '../../theme';

const stops = ['#FBE3CF', '#C9A9E8', '#6F4FC4', '#F0B48F', '#9FD0FF', '#FBE3CF'];
const quietStops = ['#D6CCD9', '#B9ACBF', '#8A7C96', '#C7B8B4', '#A7A8B4', '#D6CCD9'];
const periods: Record<AIState, number> = { ...motion.orb, error: motion.orb.idle };

export function IntelligenceOrbCanvas({ size, state }: { size: number; state: AIState }) {
  const reducedMotion = useReducedMotion();
  const radius = size / 2;
  const canvasSize = radius * 2.85;
  const center = canvasSize / 2;
  const rotation = useSharedValue(0);
  const breath = useSharedValue(1);
  const glowRadius = useSharedValue(radius * 1.35);
  const glowOpacity = useSharedValue(0.16);
  const ringRadius = useSharedValue(radius);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
    rotation.value = 0;
    breath.value = 1;
    glowRadius.value = radius * 1.35;
    glowOpacity.value = state === 'error' ? 0.12 : state === 'listening' ? 0.28 : state === 'responding' ? 0.23 : 0.16;
    ringRadius.value = radius;
    ringOpacity.value = 0;

    if (state === 'error') {
      ringRadius.value = radius;
      ringOpacity.value = 0.4;
    } else if (reducedMotion) {
      if (state === 'listening') { ringRadius.value = radius * 1.12; ringOpacity.value = 0.3; }
      if (state === 'thinking') { ringRadius.value = radius * 1.05; ringOpacity.value = 0.35; }
      if (state === 'responding') { ringRadius.value = radius * 1.02; ringOpacity.value = 0.3; }
      return;
    }

    const period = periods[state];
    rotation.value = withRepeat(withTiming(360, { duration: period, easing: Easing.linear }), -1, false);
    breath.value = state === 'idle'
      ? withRepeat(withTiming(1.04, { duration: motion.breathe, easing: Easing.inOut(Easing.ease) }), -1, true)
      : 1;

    if (state === 'listening') {
      ringRadius.value = radius * 0.92;
      ringOpacity.value = 0.75;
      ringRadius.value = withRepeat(withSequence(
        withTiming(radius * 1.3, { duration: period * 0.7, easing: Easing.bezier(...motion.easing.gentle) }),
        withTiming(radius * 1.3, { duration: period * 0.3, easing: Easing.linear }),
      ), -1, false);
      ringOpacity.value = withRepeat(withSequence(
        withTiming(0, { duration: period * 0.7, easing: Easing.bezier(...motion.easing.gentle) }),
        withTiming(0, { duration: period * 0.3, easing: Easing.linear }),
      ), -1, false);
    } else if (state === 'thinking') {
      ringRadius.value = radius * 0.94;
      ringOpacity.value = 0.22;
      ringRadius.value = withRepeat(withSequence(
        withTiming(radius * 1.16, { duration: period / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(radius * 0.94, { duration: period / 2, easing: Easing.inOut(Easing.ease) }),
      ), -1, false);
      ringOpacity.value = withRepeat(withSequence(
        withTiming(0.6, { duration: period / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.22, { duration: period / 2, easing: Easing.inOut(Easing.ease) }),
      ), -1, false);
    } else if (state === 'responding') {
      ringRadius.value = radius * 0.94;
      ringOpacity.value = 0.6;
      ringRadius.value = withRepeat(withSequence(
        withTiming(radius * 1.24, { duration: period * 0.55, easing: Easing.bezier(...motion.easing.gentle) }),
        withTiming(radius * 1.24, { duration: period * 0.45, easing: Easing.linear }),
      ), -1, false);
      ringOpacity.value = withRepeat(withSequence(
        withTiming(0, { duration: period * 0.55, easing: Easing.bezier(...motion.easing.gentle) }),
        withTiming(0, { duration: period * 0.45, easing: Easing.linear }),
      ), -1, false);
    }
  }, [breath, glowOpacity, glowRadius, radius, reducedMotion, ringOpacity, ringRadius, rotation, state]);

  const sphereStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));
  const palette = state === 'error' ? quietStops : stops;
  const blur = radius * 0.5;
  return <Animated.View accessible={false} style={[styles.canvas, { width: canvasSize, height: canvasSize }, sphereStyle]}>
    <Canvas style={{ width: canvasSize, height: canvasSize }}>
      <Group opacity={glowOpacity}>
        <Circle cx={center} cy={center} r={glowRadius} color={state === 'error' ? '#BEB5C5' : '#C9A9E8'}>
          <BlurMask blur={blur} style="normal" />
        </Circle>
      </Group>
      <Group opacity={ringOpacity}>
        <Circle cx={center} cy={center} r={ringRadius} color={state === 'error' ? '#C8BED0' : '#C9A9E8'} style="stroke" strokeWidth={1} />
      </Group>
      <Circle cx={center} cy={center} r={radius}>
        <SweepGradient c={vec(center, center)} start={rotation} colors={palette} />
      </Circle>
      <Circle cx={center} cy={center} r={radius - 0.6} color="rgba(255,255,255,0.32)" style="stroke" strokeWidth={0.8} />
      <Circle cx={center - radius * 0.27} cy={center - radius * 0.38} r={radius * 0.17} color="rgba(255,255,255,0.5)">
        <BlurMask blur={radius * 0.11} style="normal" />
      </Circle>
    </Canvas>
  </Animated.View>;
}
const styles = StyleSheet.create({ canvas: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' } });
