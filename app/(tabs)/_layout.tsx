import React from 'react';
import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { colors } from '../../src/theme';
const icons: Record<string, string> = { home: '⌂', health: '◉', care: '✚', services: '▤', profile: '○' };
const labels: Record<string, string> = { home: 'Home', health: 'History', care: 'Care', services: 'Explore', profile: 'Profile' };
export default function TabLayout() {
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false,
    tabBarActiveTintColor: colors.aqua,
    tabBarInactiveTintColor: colors.quiet,
    tabBarStyle: { backgroundColor: '#FBFAFC', borderTopColor: colors.border, height: 68, paddingTop: 7, paddingBottom: 8, elevation: 0 },
    tabBarLabelStyle: { fontSize: 10, marginTop: 1, fontWeight: '500' },
    tabBarIcon: ({ color, focused }) => <View style={{ width: 28, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: focused ? '#EAF1FD' : 'transparent' }}><Text style={{ color, fontSize: 18, lineHeight: 22 }}>{icons[route.name]}</Text></View>,
  })}>
    {Object.keys(labels).map((name) => <Tabs.Screen key={name} name={name} options={{ title: labels[name] }} />)}
    <Tabs.Screen name="connect" options={{ href: null, title: 'People' }} />
  </Tabs>;
}
