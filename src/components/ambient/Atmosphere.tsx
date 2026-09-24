import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function Atmosphere() {
  const [drift] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 16000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 16000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [drift]);
  const x = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
  const y = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 26] });
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <LinearGradient colors={['#A27B8E', '#755B7B', '#4B3C69', '#372B52', '#1F1731']} locations={[0, 0.14, 0.34, 0.58, 1]} start={{ x: 1, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
    <Animated.View style={[styles.peachLight, { transform: [{ translateX: x }, { translateY: y }] }]} />
    <Animated.View style={[styles.lilacLight, { transform: [{ translateX: y }, { translateY: x }] }]} />
  </View>;
}
const styles = StyleSheet.create({
  peachLight: { position: 'absolute', width: 330, height: 330, borderRadius: 999, right: -180, top: -150, backgroundColor: 'rgba(231,180,143,0.22)', filter: 'blur(72px)' } as any,
  lilacLight: { position: 'absolute', width: 360, height: 260, borderRadius: 999, left: -180, top: 270, backgroundColor: 'rgba(179,145,208,0.18)', filter: 'blur(76px)' } as any,
});
