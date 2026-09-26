import React, { useEffect, useMemo, useState } from 'react';
import { animatedNativeDriver } from '../src/services/animatedDriver';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { usePreviewIdentity } from '../src/state/PreviewIdentityContext';
import { previewIdentityInstructions } from '../src/services/previewIdentity.mjs';
import { brandScenes, colors, motion } from '../src/theme';
import type { PreviewIdentityChallenge, PreviewIdentityChannel } from '../src/services/previewIdentity.mjs';

export default function SignInScreen() {
  const { ready, session, requestCode, verifyCode } = usePreviewIdentity();
  const [channel, setChannel] = useState<PreviewIdentityChannel>('email');
  const [destination, setDestination] = useState(previewIdentityInstructions.email);
  const [challenge, setChallenge] = useState<PreviewIdentityChallenge | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stepOpacity] = useState(() => new Animated.Value(1));
  const isCodeStep = challenge !== null;
  const header = useMemo(() => isCodeStep ? 'Enter your access code.' : 'Your health, understood.', [isCodeStep]);

  useEffect(() => {
    if (ready && session) router.replace('/');
  }, [ready, session]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    stepOpacity.setValue(0.85);
    Animated.timing(stepOpacity, { toValue: 1, duration: motion.statusIn, useNativeDriver: animatedNativeDriver }).start();
  }, [isCodeStep, stepOpacity]);

  function changeChannel(next: PreviewIdentityChannel) {
    if (next === channel) return;
    setChannel(next);
    setDestination(next === 'email' ? previewIdentityInstructions.email : previewIdentityInstructions.phone);
    setChallenge(null);
    setCode('');
    setError('');
  }

  function sendPreviewCode() {
    setError('');
    try {
      setChallenge(requestCode(channel, destination));
      setCode('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Check the sample details shown and try again.');
    }
  }

  async function continueToApp() {
    if (!challenge) return;
    setBusy(true);
    setError('');
    try {
      await verifyCode(challenge.challengeId, code);
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The preview could not be opened. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.page}>
      <LinearGradient pointerEvents="none" colors={brandScenes.atmosphere.colors} locations={brandScenes.atmosphere.locations} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient pointerEvents="none" colors={[brandScenes.atmosphere.peachGlow, 'rgba(237,180,145,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.warmGlow} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><LinearGradient colors={['#A9DDF4', '#F5D5D1', '#A987D9']} style={styles.brandOrb} /></View>
            <View><Text style={styles.brand}>nura</Text><Text style={styles.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View>
            <Text style={styles.private}>PRIVATE BY DESIGN</Text>
          </View>

          <Animated.View style={[styles.main, { opacity: stepOpacity }]}>
            <Text style={styles.eyebrow}>{isCodeStep ? 'DEMO ACCESS' : 'WELCOME TO NURA'}</Text>
            <Text style={styles.title}>{header}</Text>
            <Text style={styles.intro}>{isCodeStep ? 'Your access code is ready. Enter it below to open the demo.' : 'Sign in to begin a personal health record that stays connected to the sources you choose.'}</Text>

            {!isCodeStep ? (
              <>
                <View style={styles.channelPicker} accessibilityRole="tablist">
                  {(['email', 'phone'] as const).map((item) => (
                    <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: channel === item }} onPress={() => changeChannel(item)} style={[styles.channel, channel === item && styles.channelSelected]}>
                      <Text style={[styles.channelText, channel === item && styles.channelTextSelected]}>{item === 'email' ? 'Email' : 'Mobile'}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>{channel === 'email' ? 'EMAIL ADDRESS' : 'MOBILE NUMBER'}</Text>
                <TextInput
                  accessibilityLabel={channel === 'email' ? 'Sample preview email address' : 'Sample preview mobile number'}
                  value={destination}
                  onChangeText={(value) => { setDestination(value); setError(''); }}
                  placeholder={channel === 'email' ? 'preview@nura.test' : '+1 555 555 0100'}
                  placeholderTextColor="#9B8FA1"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
                  textContentType={channel === 'email' ? 'emailAddress' : 'telephoneNumber'}
                  returnKeyType="done"
                />
                <View style={styles.notice}>
                  <Text style={styles.noticeMark}>i</Text>
                  <Text style={styles.noticeText}>Demo access uses the details shown here. No email or text message will be sent.</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={sendPreviewCode} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                  <Text style={styles.primaryText}>CONTINUE</Text><Text style={styles.arrow}>→</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.previewCodeCard}>
                  <Text style={styles.previewCodeLabel}>DEMO ACCESS CODE · EXPIRES IN 10 MINUTES</Text>
                  <Text style={styles.previewCode}>{challenge?.code}</Text>
                  <Text style={styles.previewCodeHelp}>For this demo, enter the code shown here.</Text>
                </View>
                <Text style={styles.fieldLabel}>SIX-DIGIT CODE</Text>
                <TextInput accessibilityLabel="Six-digit preview code" value={code} onChangeText={(value) => { setCode(value.replace(/\D/g, '').slice(0, 6)); setError(''); }} placeholder="Enter code" placeholderTextColor="#9B8FA1" style={styles.input} keyboardType="number-pad" maxLength={6} returnKeyType="done" />
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={continueToApp} style={({ pressed }) => [styles.primaryButton, pressed && !busy && styles.pressed, busy && styles.disabled]}>
                  {busy ? <ActivityIndicator color={colors.plum} /> : <Text style={styles.primaryText}>CONTINUE</Text>}{!busy ? <Text style={styles.arrow}>→</Text> : null}
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { setChallenge(null); setCode(''); setError(''); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>Change email or mobile</Text></Pressable>
              </>
            )}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </Animated.View>
          <Text style={styles.footer}>A private health record, built around your choices.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: brandScenes.atmosphere.base },
  flex: { flex: 1 },
  warmGlow: { position: 'absolute', top: -120, right: -130, width: 360, height: 440, borderRadius: 220, opacity: 0.85 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 42, paddingBottom: 28, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 42 },
  brandMark: { width: 42, height: 42, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  brandOrb: { width: 28, height: 28, borderRadius: 18 },
  brand: { color: '#FFF9F4', fontSize: 23, fontWeight: '700', letterSpacing: 1.4 },
  tagline: { color: 'rgba(255,249,244,0.72)', fontSize: 8, letterSpacing: 2.1, marginTop: 2 },
  private: { color: 'rgba(255,249,244,0.7)', fontSize: 7, letterSpacing: 0.9, marginLeft: 'auto', flexShrink: 0 },
  main: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  eyebrow: { color: '#E5CFE2', fontSize: 11, fontWeight: '700', letterSpacing: 2.4, marginBottom: 12 },
  title: { color: '#FFF9F4', fontSize: 34, lineHeight: 40, fontWeight: '500', letterSpacing: -1.1 },
  intro: { color: 'rgba(255,249,244,0.83)', fontSize: 16, lineHeight: 24, marginTop: 12, marginBottom: 28 },
  channelPicker: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 18, padding: 4, marginBottom: 24 },
  channel: { flex: 1, minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 14 },
  channelSelected: { backgroundColor: '#FBF6F0' },
  channelText: { color: '#F1E8F0', fontSize: 15, fontWeight: '600' },
  channelTextSelected: { color: colors.plum },
  fieldLabel: { color: '#E6D8E7', fontSize: 10, letterSpacing: 1.8, fontWeight: '700', marginBottom: 8 },
  input: { backgroundColor: '#FFFBF7', color: colors.text, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', minHeight: 54, paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 20 },
  noticeMark: { color: colors.plum, fontSize: 13, fontWeight: '700', textAlign: 'center', width: 22, height: 22, lineHeight: 22, borderRadius: 12, backgroundColor: '#E7D8EE', overflow: 'hidden' },
  noticeText: { flex: 1, color: '#F5EDF5', fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 58, borderRadius: 18, backgroundColor: '#FBF6F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 4 },
  primaryText: { color: colors.plum, fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  arrow: { position: 'absolute', right: 20, color: colors.plum, fontSize: 22 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  disabled: { opacity: 0.7 },
  previewCodeCard: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 20, padding: 18, alignItems: 'center', marginBottom: 20 },
  previewCodeLabel: { color: '#E6D8E7', fontSize: 9, fontWeight: '700', letterSpacing: 1.6, textAlign: 'center' },
  previewCode: { color: '#FFF9F4', fontSize: 36, fontWeight: '700', letterSpacing: 8, marginVertical: 8 },
  previewCodeHelp: { color: '#F0E5EF', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  secondaryButton: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 14, marginTop: 4 },
  secondaryText: { color: '#F1E7F1', fontSize: 14, fontWeight: '600' },
  error: { color: '#FFF2EB', fontSize: 13, lineHeight: 18, marginTop: 14, paddingHorizontal: 2 },
  footer: { color: 'rgba(255,249,244,0.6)', fontSize: 11, textAlign: 'center', marginTop: 32 },
});
