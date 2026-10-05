import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [profile, intake, review, webOrb, nativeOrb, atmosphere] = await Promise.all([
  readFile(new URL('../../app/index.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../app/intake.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../app/review.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/ambient/IntelligenceOrbCanvas.web.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/ambient/IntelligenceOrbCanvas.native.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/ambient/Atmosphere.tsx', import.meta.url), 'utf8'),
]);

test('profile setup waits for the OS motion preference and cancels an active transition when it changes', () => {
  assert.match(profile, /const reducedMotion = !shouldUseMotion\(motionPreference\)/);
  assert.match(profile, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(profile, /AccessibilityInfo\.addEventListener\('reduceMotionChanged', \(value\) => \{ preferenceChanged = true; setMotionPreference\(value\); \}\)/);
  assert.match(profile, /active && !preferenceChanged/);
  assert.match(profile, /if \(!reducedMotion \|\| !transitionAnimation\.current\) return;\s*const nextStep = pendingStep\.current;[\s\S]*?animation\.stop\(\);[\s\S]*?setMoving\(false\);/);
  assert.match(profile, /if \(!reducedMotion\) LayoutAnimation\.configureNext/);
  assert.match(profile, /animationType=\{reducedMotion \? 'none' : 'slide'\}/);
  assert.match(profile, /pressed && \(reducedMotion \? styles\.buttonPressedReduced : styles\.buttonPressed\)/);
  assert.match(profile, /accessibilityState=\{\{ disabled: savingProfile, busy: savingProfile \}\}/);
  assert.match(profile, /reducedMotion \? <Text style=\{styles\.savingStatus\}>IN PROGRESS<\/Text> : <ActivityIndicator/);
});

test('intake has no timer-driven fake progress and its orb honors reduced motion on both platforms', () => {
  assert.doesNotMatch(intake, /setTimeout\(|setInterval\(|requestAnimationFrame\(/);
  assert.match(intake, /addingSampleSet \? <ActivityIndicator/);
  assert.match(intake, /await Asset\.loadAsync/);
  assert.match(intake, /await saveIntakeNote/);
  assert.match(webOrb, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(webOrb, /if \(reduced\) return/);
  assert.match(nativeOrb, /useReducedMotion\(\)/);
  assert.match(nativeOrb, /else if \(reducedMotion\)/);
});

test('review shows event-linked activity and an animated orb unless reduced motion is enabled', () => {
  assert.match(review, /const reducedMotion = !shouldUseMotion\(motionPreference\)/);
  assert.match(review, /AccessibilityInfo\.addEventListener\('reduceMotionChanged', \(value\) => \{ preferenceChanged = true; setMotionPreference\(value\); \}\)/);
  assert.match(review, /active && !preferenceChanged/);
  assert.match(review, /activityMotion\.showSpinner && <ActivityIndicator/);
  assert.match(review, /activityMotion\.showStaticStatus && <Text style=\{styles\.activityStaticStatus\}>IN PROGRESS<\/Text>/);
  assert.match(review, /accessibilityState=\{\{ busy: activityMotion\.busy \}\}/);
  assert.match(review, /Animated\.loop\(Animated\.timing\(rotation, \{ toValue: 1, duration: 2600/);
  assert.match(review, /Animated\.loop\(Animated\.sequence\(\[/);
  assert.match(review, /if \(reducedMotion\) \{ rotation\.setValue\(0\); counterRotation\.setValue\(0\); pulse\.setValue\(0\); return; \}/);
  assert.match(review, /Orb size=\{39\} state=\{reducedMotion \? 'idle' : 'thinking'\}/);
  assert.match(review, /\{extracting && <Surface tone="dark" style=\{styles\.activity\}>/);
  assert.match(review, /processingSettled \? 'Preparing your review'/);
});


test('shared atmosphere waits for and follows the system reduced-motion preference', () => {
  assert.match(atmosphere, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(atmosphere, /AccessibilityInfo\.addEventListener\('reduceMotionChanged', setReducedMotion\)/);
  assert.match(atmosphere, /const animateDrift = shouldUseMotion\(reducedMotion\)/);
  assert.match(atmosphere, /if \(!animateDrift\) \{\s*drift\.stopAnimation\(\);\s*drift\.setValue\(0\)/);
});
