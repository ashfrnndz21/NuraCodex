import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
const icons: Record<string, string> = { home: '⌂', services: '⌕', health: '▤', care: '✚', profile: '○' };
const labels: Record<string, string> = { home: 'Home', services: 'Explore', health: 'Library', care: 'Care', profile: 'You' };
export default function TabLayout() {
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false,
    tabBarActiveTintColor: '#FFD09E',
    tabBarInactiveTintColor: 'rgba(255,249,244,.74)',
    tabBarBackground: () => <View pointerEvents="none" style={styles.tabMaterial}><BlurView tint="dark" intensity={46} style={styles.tabBlur} /><View style={styles.tabSheen} /></View>,
    tabBarStyle: { position: 'absolute', backgroundColor: 'transparent', borderTopColor: 'rgba(255,255,255,.68)', height: 68, paddingTop: 7, paddingBottom: 8, elevation: 0 },
    tabBarLabelStyle: { fontSize: 10, marginTop: 1, fontWeight: '500' },
    tabBarIcon: ({ color, focused }) => <View style={{ width: 28, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: focused ? 'rgba(255,255,255,.14)' : 'transparent' }}><Text style={{ color, fontSize: 18, lineHeight: 22 }}>{icons[route.name]}</Text></View>,
  })}>
    {Object.keys(labels).map((name) => <Tabs.Screen key={name} name={name} options={{ title: labels[name] }} />)}
    <Tabs.Screen name="connect" options={{ href: null, title: 'People' }} />
  </Tabs>;
}

const styles = StyleSheet.create({
  tabMaterial: { ...StyleSheet.absoluteFill, overflow: 'hidden', backgroundColor: 'rgba(37,29,28,.80)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.52)' },
  tabBlur: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  tabSheen: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,225,201,.09)' },
});
