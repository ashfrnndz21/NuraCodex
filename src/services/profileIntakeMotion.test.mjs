import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [profile, intake, review, webOrb, nativeOrb] = await Promise.all([
  readFile(new URL('../../app/index.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../app/intake.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../app/review.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/ambient/IntelligenceOrbCanvas.web.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/ambient/IntelligenceOrbCanvas.native.tsx', import.meta.url), 'utf8'),
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
  assert.doesNotMatch(intake, /setTimeout\(|requestAnimationFrame\(|ActivityIndicator/);
  assert.match(intake, /await Asset\.loadAsync/);
  assert.match(intake, /await saveIntakeNote/);
  assert.match(webOrb, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(webOrb, /if \(reduced\) return/);
  assert.match(nativeOrb, /useReducedMotion\(\)/);
  assert.match(nativeOrb, /else if \(reducedMotion\)/);
});

test('review replaces animated progress with a static label but preserves a live busy state', () => {
  assert.match(review, /const reducedMotion = !shouldUseMotion\(motionPreference\)/);
  assert.match(review, /AccessibilityInfo\.addEventListener\('reduceMotionChanged', \(value\) => \{ preferenceChanged = true; setMotionPreference\(value\); \}\)/);
  assert.match(review, /active && !preferenceChanged/);
  assert.match(review, /activityMotion\.showSpinner && <ActivityIndicator/);
  assert.match(review, /activityMotion\.showStaticStatus && <Text style=\{styles\.activityStaticStatus\}>IN PROGRESS<\/Text>/);
  assert.match(review, /accessibilityState=\{\{ busy: activityMotion\.busy \}\}/);
  assert.match(review, /return \(\) => animation\.stop\(\);/);
  assert.match(review, /!reducedMotion \? <ActivityIndicator[\s\S]*?: <Text style=\{styles\.activityStaticStatus\}>IN PROGRESS/);
});
