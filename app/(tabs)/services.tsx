import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Label, Pill, Surface } from '../../src/components/Surface';
import { useNura, HealthFeedItem } from '../../src/state/NuraContext';
import { getAgentStatus } from '../../src/services/agentClient';
import { FeedActivity, FeedBrief, searchHealthFeed } from '../../src/services/feedClient';
import { groupHealthFeedItems } from '../../src/services/feedDedupe.mjs';
import { brandScenes, colors, motion, shadow } from '../../src/theme';

type SearchStatus = 'checking' | 'ready' | 'unavailable';

function FeedCard({ item, index, reducedMotion, brief, onSave, onDismiss, onAsk, onOpen }: {
  item: HealthFeedItem; index: number; reducedMotion: boolean; brief?: FeedBrief; onSave: () => void; onDismiss: () => void; onAsk: () => void; onOpen: () => void;
}) {
  const [opacity] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  const [rise] = useState(() => new Animated.Value(reducedMotion ? 0 : 8));
  const [detailsOpacity] = useState(() => new Animated.Value(0));
  const [detailsRise] = useState(() => new Animated.Value(8));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsMounted, setDetailsMounted] = useState(false);
  function toggleDetails() {
    const opening = !detailsOpen;
    if (opening) setDetailsMounted(true);
    setDetailsOpen(opening);
    if (reducedMotion) { detailsOpacity.setValue(opening ? 1 : 0); detailsRise.setValue(0); if (!opening) setDetailsMounted(false); return; }
    if (opening) { detailsOpacity.setValue(0); detailsRise.setValue(8); }
    Animated.parallel([
      Animated.timing(detailsOpacity, { toValue: opening ? 1 : 0, duration: opening ? motion.cardEnter : motion.pressOut, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
      Animated.timing(detailsRise, { toValue: opening ? 0 : 8, duration: opening ? motion.cardEnter : motion.pressOut, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished && !opening) setDetailsMounted(false); });
  }
  useEffect(() => {
    if (reducedMotion) { opacity.setValue(1); rise.setValue(0); return; }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, delay: index * motion.stagger.rows, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, delay: index * motion.stagger.rows, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: true }),
    ]).start();
  }, [index, opacity, reducedMotion, rise]);
  return <Animated.View style={{ opacity, transform: [{ translateY: rise }] }}>
    <Surface style={styles.feedCard}>
      {index === 0 && <LinearGradient colors={brandScenes.feed.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.editorialArt}>
        <View pointerEvents="none" style={styles.editorialHalo} />
        <View style={styles.editorialArtCopy}><Text style={styles.editorialEyebrow}>YOUR HEALTH JOURNEY</Text><Text numberOfLines={2} style={styles.editorialTopic}>{item.topic}</Text></View>
        <View style={styles.editorialBadge}><Text style={styles.editorialBadgeText}>PUBLIC HEALTH SOURCE</Text></View>
      </LinearGradient>}
      <View style={styles.articleTop}><View style={styles.sourceMark}><Text style={styles.sourceMarkText}>↗</Text></View><View style={styles.articleHeading}><Text style={styles.publisher}>{item.publisher}</Text><Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} accessibilityLabel={`${detailsOpen ? 'Close' : 'Read details for'} ${item.title}`} onPress={toggleDetails} style={styles.articleTitleButton}><Text style={styles.articleTitle}>{item.title}</Text><Text style={styles.detailToggle}>{detailsOpen ? 'Hide details' : 'Read details ↓'}</Text></Pressable></View><View style={styles.articleType}><Text style={styles.articleTypeText}>SOURCE</Text></View></View>
      <Text style={styles.articleDetail}>{item.detail || 'Open the publisher’s page for the full guidance.'}</Text>
      <View style={styles.articleWhy}><Text style={styles.whySpark}>✦</Text><Text style={styles.whyText}>Shown because you selected {item.topic}.</Text></View>
      {detailsMounted && <Animated.View style={[styles.detailsPanel, { opacity: detailsOpacity, transform: [{ translateY: detailsRise }] }]}><View style={styles.detailsDivider} /><Text style={styles.detailsLabel}>SOURCE DETAILS</Text><Text style={styles.detailsCopy}>{item.detail || 'This source did not provide a preview. Open the publisher page to read the full item.'}</Text><View style={styles.detailsWhy}><Text style={styles.detailsLabel}>WHY THIS IS IN YOUR LIBRARY</Text><Text style={styles.detailsCopy}>You selected {item.topic}. Nura matched this item to that topic; it has not been added to your personal medical record.</Text></View>{brief?.summary ? <View style={styles.detailsBrief}><Text style={styles.detailsLabel}>NU﻿RA’S SEARCH BRIEF</Text><Text style={styles.detailsCopy}>{brief.summary}</Text><Text style={styles.detailsMeta}>Prepared from {brief.sourceIds.length} linked source{brief.sourceIds.length === 1 ? '' : 's'} in this search.</Text></View> : <Text style={styles.detailsMeta}>Nura has not created a topic brief for this item. The preview above is the source information available in the feed.</Text>}<Pressable accessibilityRole="link" onPress={onOpen} style={styles.detailsSourceButton}><Text style={styles.detailsSourceText}>READ THE FULL SOURCE</Text><Text style={styles.detailsSourceArrow}>↗</Text></Pressable></Animated.View>}
      <View style={styles.sourceMeta}><Text style={styles.sourceMetaText}>Publication date not supplied by source</Text><Text style={styles.sourceMetaDot}>·</Text><Text style={styles.sourceMetaText}>Found {new Date(item.retrievedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></View>
      <View style={styles.articleActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={item.saved ? 'Remove from saved reading' : 'Save for later'} accessibilityState={{ selected: item.saved }} onPress={onSave} style={[styles.actionPill, item.saved && styles.actionPillSaved]}><Text style={[styles.actionPillText, item.saved && styles.actionPillSavedText]}>{item.saved ? '✓ Saved' : '＋ Save'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onAsk} style={styles.actionPill}><Text style={styles.actionPillText}>Ask Nura</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.dismissButton}><Text style={styles.dismissText}>Hide</Text></Pressable>
      </View>
      <Pressable accessibilityRole="link" onPress={onOpen} style={styles.openSource}><Text style={styles.openSourceText}>Open original source</Text><Text style={styles.openSourceArrow}>↗</Text></Pressable>
    </Surface>
  </Animated.View>;
}

function ActivityCard({ activity, busy }: { activity: FeedActivity[]; busy: boolean }) {
  if (!activity.length && !busy) return null;
  return <Surface style={styles.activityCard}>
    <View style={styles.activityHeader}><View><Label>NU﻿RA’S ACTIVITY</Label><Text style={styles.activityTitle}>{busy ? 'Finding useful sources' : 'Search complete'}</Text></View>{busy && <ActivityIndicator color={colors.aqua} size="small" />}</View>
    {activity.map((item) => <View key={item.id} style={styles.activityRow}><View style={[styles.activityDot, item.status === 'complete' && styles.activityDotDone]}>{item.status === 'complete' && <Text style={styles.activityCheck}>✓</Text>}</View><View style={styles.activityCopy}><Text style={styles.activityLabel}>{item.label}</Text>{item.detail ? <Text style={styles.activityDetail}>{item.detail}</Text> : null}</View>{item.status === 'started' && busy ? <ActivityIndicator color={colors.violet} size="small" /> : null}</View>)}
  </Surface>;
}

export default function Services() {
  const { topics, feedItems, mergeFeedItems, setFeedSaved, setFeedDismissed } = useNura();
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [consent, setConsent] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<SearchStatus>('checking');
  const [serviceReason, setServiceReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<FeedActivity[]>([]);
  const [briefs, setBriefs] = useState<FeedBrief[]>([]);
  const [error, setError] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const [undoIds, setUndoIds] = useState<string[] | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [topicLimitNote, setTopicLimitNote] = useState('');

  useEffect(() => {
    let active = true;
    getAgentStatus().then((status) => {
      if (!active) return;
      const ready = status.available && status.capabilities?.trustedHealthSearch === true;
      setServiceStatus(ready ? 'ready' : 'unavailable');
      setServiceReason(ready ? '' : status.reason || 'Trusted health search isn’t available right now.');
    });
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  const activeIds = selectedIds ?? topics.map((topic) => topic.id).slice(0, 3);
  const selectedTopics = useMemo(() => topics.filter((topic) => activeIds.includes(topic.id)).slice(0, 3), [topics, activeIds]);
  const groupedItems = useMemo(() => groupHealthFeedItems(feedItems), [feedItems]);
  const visibleItems = useMemo(() => groupedItems.filter((item) => showSaved ? item.saved : !item.dismissed).sort((a, b) => Number(b.saved) - Number(a.saved) || b.retrievedAt.localeCompare(a.retrievedAt)), [groupedItems, showSaved]);
  const savedCount = groupedItems.filter((item) => item.saved).length;

  function toggleTopic(id: string) {
    setTopicLimitNote('');
    setConsent(false);
    if (!activeIds.includes(id) && activeIds.length >= 3) { setTopicLimitNote('Choose up to three areas for one search.'); return; }
    setSelectedIds(activeIds.includes(id) ? activeIds.filter((value) => value !== id) : [...activeIds, id]);
  }
  async function search() {
    if (!consent || selectedTopics.length === 0 || busy || serviceStatus !== 'ready') return;
    setBusy(true); setError(''); setActivity([]); setBriefs([]); setUndoIds(null);
    try {
      const results = await searchHealthFeed(selectedTopics, (next) => setActivity((current) => {
        const existing = current.findIndex((item) => item.id === next.id);
        if (existing < 0) return [...current, next];
        const updated = current.slice(); updated[existing] = next; return updated;
      }));
      mergeFeedItems(results.items);
      setBriefs(results.briefs);
      setShowSaved(false);
      if (!results.items.length) setError('No results came back for these selected areas. Try a different combination. Your saved articles are still available.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nura could not finish this search. Your saved articles are still available.');
    } finally { setBusy(false); setConsent(false); }
  }
  function dismiss(item: HealthFeedItem & { activeIds: string[] }) { item.activeIds.forEach((id) => setFeedDismissed(id, true)); setUndoIds(item.activeIds); }
  function undoDismiss() { undoIds?.forEach((id) => setFeedDismissed(id, false)); setUndoIds(null); }
  async function openSource(url: string) {
    if (!/^https:\/\//i.test(url)) { setError('This source link is not secure and was not opened.'); return; }
    try { await Linking.openURL(url); } catch { setError('The source could not be opened on this device.'); }
  }

  return <View style={styles.page}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.topbar}><View><Label>YOUR HEALTH LIBRARY</Label><Text style={styles.title}>Useful, with a reason.</Text><Text style={styles.subtitle}>Reading from trusted health sources, connected to the areas you chose.</Text></View><View style={styles.orbMark}><Text style={styles.orbGlyph}>✦</Text></View></View>

    <Surface style={styles.consentCard}>
      <View style={styles.consentTop}><View style={styles.consentIcon}><Text style={styles.consentIconText}>⌕</Text></View><View style={{ flex: 1 }}><Text style={styles.consentTitle}>Search the health topics you selected</Text><Text style={styles.consentBody}>Only the areas you select below are sent for this search. Your name, records, and contact details are not included.</Text></View></View>
      <View style={styles.topicLabelRow}><Label>SELECT UP TO THREE</Label><Text style={styles.selectedCount}>{selectedTopics.length} selected</Text></View>
      {topics.length ? <View style={styles.topicList}>{topics.map((topic) => { const selected = activeIds.includes(topic.id); return <Pill key={topic.id} selected={selected} onPress={() => toggleTopic(topic.id)}>{selected ? '✓  ' : '+  '}{topic.label}</Pill>; })}</View> : <View style={styles.noTopics}><Text style={styles.noTopicsText}>Choose health areas in your profile first. Nura won’t guess what matters to you.</Text><Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/profile')}><Text style={styles.inlineLink}>Choose health areas  →</Text></Pressable></View>}
      {topicLimitNote ? <Text style={styles.limitNote}>{topicLimitNote}</Text> : null}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent((value) => !value)} style={styles.consentToggle}><View style={[styles.checkBox, consent && styles.checkBoxOn]}>{consent && <Text style={styles.checkMark}>✓</Text>}</View><Text style={styles.consentToggleText}>I agree to search trusted public health sources for these selected areas now.</Text></Pressable>
      <View style={styles.sourceTrust}><View style={[styles.statusDot, serviceStatus === 'ready' && styles.statusDotOn, serviceStatus === 'unavailable' && styles.statusDotOff]} /><Text style={styles.sourceTrustText}>{serviceStatus === 'checking' ? 'Checking trusted health sources…' : serviceStatus === 'ready' ? 'Sources limited to WHO, CDC, NHS, MedlinePlus and other trusted publishers.' : serviceReason}</Text><Pressable accessibilityRole="button" accessibilityLabel="Check trusted health sources" onPress={() => { setServiceStatus('checking'); getAgentStatus().then((status) => { const ready = status.available && status.capabilities?.trustedHealthSearch === true; setServiceStatus(ready ? 'ready' : 'unavailable'); setServiceReason(ready ? '' : status.reason || 'Trusted health search isn’t available right now.'); }); }} style={styles.sourceRefreshButton}><Text style={styles.refresh}>↻</Text></Pressable></View>
      <Pressable accessibilityRole="button" disabled={!consent || !selectedTopics.length || busy || serviceStatus !== 'ready'} onPress={() => void search()} style={[styles.searchButton, (!consent || !selectedTopics.length || busy || serviceStatus !== 'ready') && styles.searchDisabled]}>{busy ? <><ActivityIndicator color="#FFFFFF" size="small" /><Text style={styles.searchButtonText}>Searching selected areas…</Text></> : <><Text style={styles.searchButtonText}>Find reading for me</Text><Text style={styles.searchArrow}>→</Text></>}</Pressable>
      <Text style={styles.safetyNote}>Education only. Nura does not diagnose, recommend treatment, or infer what is right for you.</Text>
    </Surface>

    <ActivityCard activity={activity} busy={busy} />
    {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>The feed needs another try</Text><Text style={styles.errorBody}>{error}</Text>{serviceStatus === 'ready' && selectedTopics.length > 0 && <Pressable onPress={() => { setConsent(true); }}><Text style={styles.retryHint}>Review the consent above, then search again.</Text></Pressable>}</View> : null}
    {undoIds ? <View style={styles.undoBar}><Text style={styles.undoText}>{undoIds.length > 1 ? 'Related articles removed from your feed.' : 'Removed from your feed.'}</Text><Pressable accessibilityRole="button" onPress={undoDismiss} style={styles.undoActionButton}><Text style={styles.undoAction}>Undo</Text></Pressable></View> : null}

    {briefs.length > 0 && !showSaved ? <View style={styles.briefList}>{briefs.map((brief) => <Surface key={brief.id} style={styles.briefCard}><Label>NU﻿RA’S SEARCH BRIEF</Label><Text style={styles.briefTitle}>{brief.topic}, in a nutshell.</Text><Text style={styles.briefText}>{brief.summary || `Nura found ${brief.sourceIds.length} trusted sources for ${brief.topic}. Open a source below to read its published guidance.`}</Text><Text style={styles.briefSources}>Based on {brief.sourceIds.length} linked source{brief.sourceIds.length === 1 ? '' : 's'} below</Text></Surface>)}</View> : null}
    <View style={styles.feedHeader}><View><Label>YOUR READING</Label><Text style={styles.feedTitle}>{showSaved ? 'Saved for later.' : 'For your health journey.'}</Text></View><View style={styles.segment}><Pressable accessibilityRole="tab" accessibilityState={{ selected: !showSaved }} onPress={() => setShowSaved(false)} style={[styles.segmentItem, !showSaved && styles.segmentActive]}><Text style={[styles.segmentText, !showSaved && styles.segmentTextActive]}>For you</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: showSaved }} onPress={() => setShowSaved(true)} style={[styles.segmentItem, showSaved && styles.segmentActive]}><Text style={[styles.segmentText, showSaved && styles.segmentTextActive]}>Saved {savedCount ? `· ${savedCount}` : ''}</Text></Pressable></View></View>
    {visibleItems.length ? <View style={styles.articleList}>{visibleItems.map((item, index) => <FeedCard key={item.id} item={item} index={index} reducedMotion={reducedMotion} brief={briefs.find((brief) => item.topicLabels.some((topic) => brief.topic.toLowerCase() === topic.toLowerCase()))} onSave={() => item.duplicateIds.forEach((id) => setFeedSaved(id, !item.saved))} onDismiss={() => dismiss(item)} onAsk={() => router.push({ pathname: '/ask', params: { context: `General health education about ${item.topic}` } })} onOpen={() => void openSource(item.url)} />)}</View> : <Surface style={styles.emptyCard}><View style={styles.emptyOrb}><Text style={styles.emptyOrbGlyph}>✦</Text></View><Text style={styles.emptyTitle}>{showSaved ? 'Nothing saved yet.' : 'Your feed starts with your choices.'}</Text><Text style={styles.emptyBody}>{showSaved ? 'Save a source you want to return to. It will appear in your Saved reading.' : 'Choose one or more health areas, review what will be searched, and give consent for each search.'}</Text></Surface>}
    <Text style={styles.footer}>Every item opens its original publisher. Nura keeps education separate from your personal health record.</Text>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, content: { paddingHorizontal: 20, paddingTop: 42, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 }, title: { color: colors.ink, fontSize: 30, lineHeight: 35, fontWeight: '400', letterSpacing: -0.9, marginTop: 7 }, subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6, maxWidth: 290 }, orbMark: { width: 44, height: 44, borderRadius: 24, backgroundColor: '#F0EAF5', borderWidth: 1, borderColor: '#E0D5E9', alignItems: 'center', justifyContent: 'center' }, orbGlyph: { color: colors.violet, fontSize: 20 },
  consentCard: { padding: 15, marginBottom: 13 }, consentTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, consentIcon: { width: 35, height: 35, borderRadius: 13, backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center' }, consentIconText: { fontSize: 23, lineHeight: 25, color: colors.cobalt }, consentTitle: { color: colors.ink, fontSize: 14, fontWeight: '600', lineHeight: 18 }, consentBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, topicLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }, selectedCount: { color: colors.violet, fontSize: 11, fontWeight: '600' }, topicList: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }, noTopics: { backgroundColor: colors.surfaceStrong, borderRadius: 13, padding: 11, marginTop: 9 }, noTopicsText: { color: colors.muted, fontSize: 12, lineHeight: 15 }, inlineLink: { color: colors.cobalt, fontSize: 12, fontWeight: '700', marginTop: 7 }, limitNote: { color: '#9A6B24', fontSize: 11, marginTop: 2 }, consentToggle: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 3 }, checkBox: { width: 19, height: 19, borderRadius: 6, borderWidth: 1.5, borderColor: '#B7AFBF', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, checkBoxOn: { backgroundColor: colors.cobalt, borderColor: colors.cobalt }, checkMark: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' }, consentToggleText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 15, paddingTop: 1 }, sourceTrust: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: colors.surfaceStrong, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 11 }, statusDot: { width: 7, height: 7, borderRadius: 4, marginTop: 3, backgroundColor: '#D2CCD7' }, statusDotOn: { backgroundColor: '#34845B' }, statusDotOff: { backgroundColor: '#BD8842' }, sourceTrustText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 13 }, refresh: { color: colors.violet, fontSize: 17, lineHeight: 20 }, sourceRefreshButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, searchButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.cobalt, borderRadius: 15, marginTop: 11, ...shadow }, searchDisabled: { backgroundColor: '#9AB7E9', opacity: 0.76 }, searchButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' }, searchArrow: { color: '#FFFFFF', fontSize: 19, marginTop: -1 }, safetyNote: { color: colors.quiet, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 8 },
  activityCard: { padding: 14, marginBottom: 13, borderColor: '#D8E5FB' }, activityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }, activityTitle: { color: colors.ink, fontSize: 14, fontWeight: '600', marginTop: 5 }, activityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }, activityDot: { width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, borderColor: '#BFC9D9', alignItems: 'center', justifyContent: 'center' }, activityDotDone: { backgroundColor: '#DDF2E8', borderColor: '#94C9A9' }, activityCheck: { fontSize: 12, color: '#287954', fontWeight: '700' }, activityCopy: { flex: 1 }, activityLabel: { color: colors.text, fontSize: 12, fontWeight: '600' }, activityDetail: { color: colors.quiet, fontSize: 10, marginTop: 2 },
  errorCard: { backgroundColor: '#FFF7EB', borderRadius: 15, borderColor: '#E8D8BC', borderWidth: 1, padding: 13, marginBottom: 12 }, errorTitle: { color: '#76501E', fontSize: 12, fontWeight: '700' }, errorBody: { color: '#795F3E', fontSize: 12, lineHeight: 15, marginTop: 4 }, retryHint: { color: colors.cobalt, fontSize: 11, fontWeight: '700', marginTop: 8 }, undoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 12, backgroundColor: '#F0EAF5', marginBottom: 13 }, undoText: { color: colors.violet, fontSize: 10 }, undoAction: { color: colors.violet, fontSize: 12, fontWeight: '700', paddingHorizontal: 6 }, undoActionButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  editorialArt: { height: 135, borderRadius: 16, overflow: 'hidden', marginBottom: 13, justifyContent: 'space-between', padding: 14 }, editorialHalo: { position: 'absolute', width: 150, height: 150, borderRadius: 80, right: -25, top: -44, backgroundColor: 'rgba(255,255,255,.20)', borderWidth: 1, borderColor: 'rgba(255,255,255,.32)' }, editorialArtCopy: { maxWidth: '78%' }, editorialEyebrow: { color: '#51465D', fontSize: 8, fontWeight: '800', letterSpacing: 1.4 }, editorialTopic: { color: '#332A40', fontSize: 20, lineHeight: 24, fontWeight: '600', letterSpacing: -.4, marginTop: 7 }, editorialBadge: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,.84)' }, editorialBadgeText: { color: colors.cobalt, fontSize: 7, fontWeight: '800', letterSpacing: .8 },
  briefList: { gap: 9, marginBottom: 14 }, briefCard: { padding: 14, backgroundColor: '#F3EEF7', borderColor: '#E4D9EC' }, briefTitle: { color: colors.ink, fontSize: 14, fontWeight: '600', marginTop: 6 }, briefText: { color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 6 }, briefSources: { color: colors.violet, fontSize: 10, fontWeight: '700', marginTop: 9 },
  feedHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 7, marginBottom: 11 }, feedTitle: { color: colors.ink, fontSize: 18, fontWeight: '500', marginTop: 5 }, segment: { flexDirection: 'row', backgroundColor: '#ECE9EF', borderRadius: 13, padding: 3, borderWidth: 1, borderColor: colors.border }, segmentItem: { minHeight: 44, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 12 }, segmentActive: { backgroundColor: '#FFFFFF', ...shadow }, segmentText: { color: colors.muted, fontSize: 11, fontWeight: '500' }, segmentTextActive: { color: colors.ink, fontWeight: '700' }, articleList: { gap: 11 }, feedCard: { padding: 14 }, articleTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, sourceMark: { width: 31, height: 31, borderRadius: 12, backgroundColor: colors.bluePale, borderColor: '#D5E3FA', borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, sourceMarkText: { color: colors.cobalt, fontSize: 17 }, articleHeading: { flex: 1 }, articleTitleButton: { alignSelf: 'stretch', minHeight: 44, justifyContent: 'center' }, detailToggle: { color: colors.cobalt, fontSize: 10, fontWeight: '700', marginTop: 5 }, detailsPanel: { marginTop: 11 }, detailsDivider: { height: 1, backgroundColor: colors.border, marginBottom: 10 }, detailsLabel: { color: colors.violet, fontSize: 10, fontWeight: '800', letterSpacing: 1.05, marginTop: 3 }, detailsCopy: { color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 5 }, detailsWhy: { backgroundColor: '#F5F0F6', borderRadius: 12, padding: 10, marginTop: 10 }, detailsBrief: { backgroundColor: colors.bluePale, borderRadius: 12, padding: 10, marginTop: 10 }, detailsMeta: { color: colors.quiet, fontSize: 10, lineHeight: 13, marginTop: 8 }, detailsSourceButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: colors.cobalt, marginTop: 11, paddingHorizontal: 12 }, detailsSourceText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: .5 }, detailsSourceArrow: { color: '#FFFFFF', fontSize: 14 }, publisher: { color: colors.violet, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: '700' }, articleTitle: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '600', marginTop: 3 }, articleType: { paddingHorizontal: 7, paddingVertical: 4, backgroundColor: colors.bluePale, borderRadius: 8 }, articleTypeText: { color: colors.cobalt, fontSize: 9, letterSpacing: 0.6, fontWeight: '800' }, articleDetail: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10 }, articleWhy: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: '#F5F0F6', borderRadius: 10, marginTop: 9 }, whySpark: { color: '#8A6AA3', fontSize: 11 }, whyText: { flex: 1, color: '#665475', fontSize: 11, lineHeight: 13 }, sourceMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 8 }, sourceMetaText: { color: colors.quiet, fontSize: 8 }, sourceMetaDot: { color: colors.quiet, fontSize: 8 }, articleActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }, actionPill: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#F3F1F5', borderWidth: 1, borderColor: '#E6E1E9' }, actionPillSaved: { backgroundColor: '#E8F4F1', borderColor: '#C6E6D8' }, actionPillText: { color: colors.muted, fontSize: 11, fontWeight: '600' }, actionPillSavedText: { color: '#287954' }, dismissButton: { marginLeft: 'auto', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }, dismissText: { color: colors.quiet, fontSize: 9 }, openSource: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44, marginTop: 5, paddingHorizontal: 2 }, openSourceText: { color: colors.cobalt, fontSize: 11, fontWeight: '700' }, openSourceArrow: { color: colors.cobalt, fontSize: 12 }, emptyCard: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 }, emptyOrb: { width: 40, height: 40, borderRadius: 22, backgroundColor: '#F0EAF5', alignItems: 'center', justifyContent: 'center' }, emptyOrbGlyph: { color: colors.violet, fontSize: 18 }, emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 10 }, emptyBody: { color: colors.muted, fontSize: 12, lineHeight: 15, textAlign: 'center', marginTop: 5 }, footer: { color: colors.quiet, fontSize: 10, lineHeight: 13, textAlign: 'center', marginTop: 17, paddingHorizontal: 8 },
});
