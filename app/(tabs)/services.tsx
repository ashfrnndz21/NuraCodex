import React, { useEffect, useMemo, useRef, useState } from 'react';
import { animatedNativeDriver } from '../../src/services/animatedDriver';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Label, Surface } from '../../src/components/Surface';
import { Atmosphere } from '../../src/components/ambient/Atmosphere';
import { useNura, HealthFact, HealthFeedItem } from '../../src/state/NuraContext';
import { getAgentStatus } from '../../src/services/agentClient';
import { FeedActivity, FeedBrief, FeedPersonalizationInput, PersonalizedFeedNote, personalizeHealthFeed, searchHealthFeed } from '../../src/services/feedClient';
import { groupHealthFeedCategories, groupHealthFeedItems } from '../../src/services/feedDedupe.mjs';
import { formatFeedRetrievalDate } from '../../src/services/feedDateLabels.mjs';
import { feedSourceLinkVisibility } from '../../src/services/feedSourceActions.mjs';
import { compactFeedBrief, feedCardCopy, isFeedItemFromLocalDay, summarizeFeedActivity } from '../../src/services/feedPresentation.mjs';
import { feedSearchSetupReason } from '../../src/services/feedSearchStatus.mjs';
import { personalizeFeedItem, selectFeedPersonalContext } from '../../src/services/feedPersonalization.mjs';
import { rankHealthFeedItemsByLocalContext } from '../../src/services/feedRelevance.mjs';
import { selectRecentFeedQuestionContext } from '../../src/services/feedQuestionContext.mjs';
import { getYouTubeThumbnailForVideo, getYouTubeVideoId } from '../../src/services/youtubeVideo.mjs';
import VideoArtworkFallback from '../../src/components/VideoArtworkFallback';
import InlineYouTubePlayer from '../../src/components/InlineYouTubePlayer';
import InlineSourceReader from '../../src/components/InlineSourceReader';
import { brandScenes, motion, shadow } from '../../src/theme';

const feedColors = { bg: brandScenes.atmosphere.base, ink: '#FFF5EB', text: '#F3E8DE', muted: '#D0C2B7', quiet: '#AD9C92', violet: '#E8B18E', cobalt: '#A9D4E3', aqua: '#9FD8C7', bluePale: 'rgba(169,212,227,.14)', surfaceStrong: 'rgba(255,241,225,.10)', border: 'rgba(255,226,205,.24)' };
const editorialType = {
  pageTitle: { fontSize: 33, lineHeight: 38, fontWeight: '700' as const, letterSpacing: -1.1 },
  pageSubtitle: { fontSize: 14, lineHeight: 20 },
  topicTitle: { fontSize: 22, lineHeight: 27, fontWeight: '700' as const, letterSpacing: -.4 },
  briefTitle: { fontSize: 19, lineHeight: 24, fontWeight: '700' as const, letterSpacing: -.35 },
  itemHeadline: { color: feedColors.ink, fontSize: 22, lineHeight: 27, fontWeight: '800' as const, letterSpacing: -.5, marginTop: 7 },
  itemSummary: { color: feedColors.text, fontSize: 14, lineHeight: 20 },
};

type SearchStatus = 'checking' | 'ready' | 'unavailable';
type FeedView = 'forYou' | 'saved' | 'hidden';

function FeedCard({ item, index, reducedMotion, brief, facts, treatments, personalizedNote, showHidden, onSave, onDismiss, onRestore, onAsk, onOpen }: {
  item: HealthFeedItem; index: number; reducedMotion: boolean; brief?: FeedBrief; facts: HealthFact[]; treatments: ReturnType<typeof useNura>['treatments']; personalizedNote?: PersonalizedFeedNote; showHidden: boolean; onSave: () => void; onDismiss: () => void; onRestore: () => void; onAsk: () => void; onOpen: (headline: string) => void;
}) {
  const [opacity] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  const [rise] = useState(() => new Animated.Value(reducedMotion ? 0 : 8));
  const [detailsOpacity] = useState(() => new Animated.Value(0));
  const [detailsRise] = useState(() => new Animated.Value(8));
  const [videoThumbnailFailed, setVideoThumbnailFailed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsMounted, setDetailsMounted] = useState(false);
  const [takeawayExpanded, setTakeawayExpanded] = useState(false);
  const videoId = getYouTubeVideoId(item.url);
  const thumbnailUrl = getYouTubeThumbnailForVideo(item.url, item.thumbnailUrl);
  const readingFrame = personalizeFeedItem(item, facts, treatments);
  const cardCopy = feedCardCopy(item, brief, personalizedNote);
  const displayHeadline = cardCopy.headline;
  const readingTakeaway = cardCopy.takeaway;
  const savedContextCue = personalizedNote ? '' : readingFrame.relatedFactLabels.length
    ? `On this device, this source matches your saved ${readingFrame.relatedFactLabels.join(' and ')} details.`
    : readingFrame.relatedTreatmentName
      ? `On this device, this source matches your saved ${readingFrame.relatedTreatmentName} treatment record.`
      : '';
  const sourceLinks = feedSourceLinkVisibility(detailsMounted);
  function toggleDetails() {
    const opening = !detailsOpen;
    if (opening) setDetailsMounted(true);
    setDetailsOpen(opening);
    if (reducedMotion) { detailsOpacity.setValue(opening ? 1 : 0); detailsRise.setValue(0); if (!opening) setDetailsMounted(false); return; }
    if (opening) { detailsOpacity.setValue(0); detailsRise.setValue(8); }
    Animated.parallel([
      Animated.timing(detailsOpacity, { toValue: opening ? 1 : 0, duration: opening ? motion.cardEnter : motion.pressOut, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(detailsRise, { toValue: opening ? 0 : 8, duration: opening ? motion.cardEnter : motion.pressOut, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
    ]).start(({ finished }) => { if (finished && !opening) setDetailsMounted(false); });
  }
  useEffect(() => {
    if (reducedMotion) { opacity.setValue(1); rise.setValue(0); return; }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, delay: index * motion.stagger.rows, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(rise, { toValue: 0, delay: index * motion.stagger.rows, duration: motion.cardEnter, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
    ]).start();
  }, [index, opacity, reducedMotion, rise]);
  return <Animated.View style={{ opacity, transform: [{ translateY: rise }] }}>
    <Surface tone="dark" style={styles.feedCard}>
      {index === 0 && !videoId && <LinearGradient colors={['#35241F', '#614338', '#816151']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.editorialArt}>
        <View pointerEvents="none" style={styles.editorialHalo} />
        <View style={styles.editorialArtCopy}><Text style={styles.editorialEyebrow}>YOUR HEALTH JOURNEY</Text><Text numberOfLines={2} style={styles.editorialTopic}>{item.topic}</Text></View>
        <View style={styles.editorialBadge}><Text style={styles.editorialBadgeText}>PUBLIC HEALTH SOURCE</Text></View>
      </LinearGradient>}
      {videoId ? <Pressable accessibilityRole="button" accessibilityLabel={`Play YouTube video in Nura: ${displayHeadline}`} onPress={() => onOpen(displayHeadline)} style={styles.videoThumbnail}>
        {!videoThumbnailFailed && thumbnailUrl ? <Image key={`${item.id}:${thumbnailUrl}`} accessibilityLabel={`YouTube thumbnail for ${item.title}`} onError={() => setVideoThumbnailFailed(true)} resizeMode="cover" source={{ uri: thumbnailUrl }} style={styles.videoThumbnailImage} /> : <VideoArtworkFallback title={item.title} topic={item.topic} />}
        <View pointerEvents="none" style={styles.videoThumbnailScrim}><View style={styles.videoPlay}><Text style={styles.videoPlayText}>▶</Text></View><Text style={styles.videoThumbnailLabel}>YOUTUBE VIDEO</Text></View>
      </Pressable> : null}
      <View style={styles.articleTop}><View style={styles.sourceMark}><Text style={styles.sourceMarkText}>{videoId ? '▶' : '↗'}</Text></View><View style={styles.articleHeading}><Text style={styles.publisher}>{videoId ? 'YouTube' : item.publisher}</Text><Text style={styles.personalizedLabel}>{cardCopy.headlineLabel}</Text><Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} accessibilityLabel={`${detailsOpen ? 'Close' : 'Read'} source details for: ${displayHeadline}`} onPress={toggleDetails} style={styles.articleTitleButton}><Text style={[styles.publishedHeadline, editorialType.itemHeadline]}>{displayHeadline}</Text><Text style={styles.detailToggle}>{detailsOpen ? 'Hide source details ↑' : 'Read source details ↓'}</Text></Pressable></View><View style={styles.articleType}><Text style={styles.articleTypeText}>{videoId ? 'VIDEO' : 'ARTICLE'}</Text></View></View>
      {readingTakeaway ? <><Text style={styles.articleGainLabel}>{cardCopy.takeawayLabel}</Text><Text numberOfLines={takeawayExpanded ? undefined : 5} style={[styles.articleDetail, editorialType.itemSummary]}>{readingTakeaway}</Text>{readingTakeaway.length > 260 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: takeawayExpanded }} accessibilityLabel={`${takeawayExpanded ? 'Show less' : 'Read full'} source summary for ${displayHeadline}`} onPress={() => setTakeawayExpanded((value) => !value)} style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', paddingHorizontal: 2 }}><Text style={styles.detailToggle}>{takeawayExpanded ? 'Show less ↑' : 'Read full summary ↓'}</Text></Pressable> : null}</> : null}
      {savedContextCue ? <View style={styles.articleWhy}><Text style={styles.whySpark}>✦</Text><Text style={styles.whyText}>{savedContextCue}</Text></View> : null}
      {sourceLinks.inDetails && <Animated.View style={[styles.detailsPanel, { opacity: detailsOpacity, transform: [{ translateY: detailsRise }] }]}><View style={styles.detailsDivider} /><Text style={styles.detailsLabel}>{videoId ? 'PUBLISHED VIDEO TITLE' : 'PUBLISHED HEADLINE'}</Text><Text style={styles.detailsCopy}>{item.title}</Text><Text style={styles.detailsLabel}>{videoId ? 'VIDEO DESCRIPTION' : 'SOURCE SUMMARY'}</Text><Text style={styles.detailsCopy}>{item.detail || 'Open the publisher’s page for the complete material.'}</Text><View style={styles.detailsWhy}><Text style={styles.detailsLabel}>WHY THIS IS IN YOUR LIBRARY</Text><Text style={styles.detailsCopy}>You selected {item.topic}. Nura matched this item to that topic; it has not been added to your personal medical record.</Text></View>{brief?.summary ? <View style={styles.detailsBrief}><Text style={styles.detailsLabel}>NU﻿RA’S SEARCH BRIEF</Text><Text style={styles.detailsCopy}>{compactFeedBrief(brief.summary, brief.topic)}</Text><Text style={styles.detailsMeta}>{brief.sourceIds.length} linked sources · general education, not a personal assessment.</Text></View> : <Text style={styles.detailsMeta}>Nura has not created a topic brief for this item. The preview above is the source information available in the feed.</Text>}<Pressable accessibilityRole="button" onPress={() => onOpen(displayHeadline)} style={styles.detailsSourceButton}><Text style={styles.detailsSourceText}>{videoId ? 'PLAY VIDEO IN NURA' : 'READ SOURCE IN NURA'}</Text><Text style={styles.detailsSourceArrow}>{videoId ? '▶' : '↗'}</Text></Pressable></Animated.View>}
      <View style={styles.sourceMeta}><Text style={styles.sourceMetaText}>{videoId ? 'Video on YouTube' : 'Publication date not supplied by source'}</Text><Text style={styles.sourceMetaDot}>·</Text><Text style={styles.sourceMetaText}>{formatFeedRetrievalDate(item.retrievedAt)}</Text></View>
      <View style={styles.articleActions}>
        {showHidden ? <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Restore ${displayHeadline} to For you`} onPress={onRestore} style={[styles.actionPill, styles.restorePill]}><Text style={styles.restoreText}>↶ Restore to For you</Text></Pressable>
          {item.saved && <Text style={styles.savedState}>Saved for later</Text>}
        </> : <>
          <Pressable accessibilityRole="button" accessibilityLabel={item.saved ? `Remove ${displayHeadline} from saved reading` : `Save ${displayHeadline} for later`} accessibilityState={{ selected: item.saved }} onPress={onSave} style={[styles.actionPill, item.saved && styles.actionPillSaved]}><Text style={[styles.actionPillText, item.saved && styles.actionPillSavedText]}>{item.saved ? '✓ Saved' : '＋ Save'}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onAsk} style={styles.actionPill}><Text style={styles.actionPillText}>Ask Nura</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Hide ${displayHeadline} from For you`} onPress={onDismiss} style={styles.dismissButton}><Text style={styles.dismissText}>Hide</Text></Pressable>
        </>}
      </View>
      {sourceLinks.compact && <Pressable accessibilityRole="button" onPress={() => onOpen(displayHeadline)} style={styles.openSource}><Text style={styles.openSourceText}>{videoId ? 'Play video in Nura' : 'Read source in Nura'}</Text><Text style={styles.openSourceArrow}>{videoId ? '▶' : '↗'}</Text></Pressable>}
    </Surface>
  </Animated.View>;
}

function FeedActivityRow({ item, busy, reducedMotion }: { item: ReturnType<typeof summarizeFeedActivity>[number]; busy: boolean; reducedMotion: boolean }) {
  const [opacity] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  const [rise] = useState(() => new Animated.Value(reducedMotion ? 0 : 5));
  const [checkScale] = useState(() => new Animated.Value(item.status === 'started' ? 0.82 : 1));
  useEffect(() => {
    if (reducedMotion) { opacity.setValue(1); rise.setValue(0); checkScale.setValue(item.status === 'started' ? 0.82 : 1); return; }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: motion.statusIn, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.timing(rise, { toValue: 0, duration: motion.statusIn, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }),
      Animated.spring(checkScale, { toValue: item.status === 'started' ? 0.82 : 1, speed: 24, bounciness: 3, useNativeDriver: animatedNativeDriver }),
    ]).start();
  }, [checkScale, item.status, opacity, reducedMotion, rise]);
  return <Animated.View style={[styles.activityRow, { opacity, transform: [{ translateY: rise }] }]}>
    <Animated.View style={[styles.activityDot, item.status === 'complete' && styles.activityDotDone, item.status === 'failed' && styles.activityDotFailed, { transform: [{ scale: checkScale }] }]}>{item.status === 'complete' ? <Text style={styles.activityCheck}>✓</Text> : item.status === 'failed' ? <Text style={styles.activityFailureMark}>!</Text> : null}</Animated.View>
    <View style={styles.activityCopy}><Text style={styles.activityLabel}>{item.topic}</Text><Text style={[styles.activityDetail, item.status === 'failed' && styles.activityDetailFailed]}>{item.detail}</Text></View>
    {item.status === 'started' && busy ? <ActivityIndicator color={feedColors.violet} size="small" /> : null}
  </Animated.View>;
}

function ActivityCard({ activity, busy, reducedMotion }: { activity: FeedActivity[]; busy: boolean; reducedMotion: boolean }) {
  if (!activity.length && !busy) return null;
  const rows = summarizeFeedActivity(activity);
  const failedCount = rows.filter((item) => item.status === 'failed').length;
  const successfulCount = rows.filter((item) => item.status === 'complete').length;
  const title = busy ? 'Finding useful sources' : failedCount && successfulCount ? 'Some topics need another try' : failedCount ? 'Search needs another try' : 'Search complete';
  return <Surface tone="dark" style={styles.activityCard}>
    <View style={styles.activityHeader}><View><Label style={styles.label}>NU﻿RA’S ACTIVITY</Label><Text style={styles.activityTitle}>{title}</Text></View>{busy && <ActivityIndicator color={feedColors.aqua} size="small" />}</View>
    {rows.map((item) => <FeedActivityRow key={item.id} item={item} busy={busy} reducedMotion={reducedMotion} />)}
  </Surface>;
}

function SearchBriefCard({ brief, reducedMotion }: { brief: FeedBrief; reducedMotion: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [opacity] = useState(() => new Animated.Value(1));
  const preview = compactFeedBrief(brief.summary, brief.topic);
  const hasMore = Boolean(brief.summary && preview && preview !== brief.summary);
  function toggle() {
    setExpanded((value) => !value);
    if (reducedMotion) return;
    opacity.setValue(0.82);
    Animated.timing(opacity, { toValue: 1, duration: motion.statusIn, easing: Easing.bezier(...motion.easing.gentle), useNativeDriver: animatedNativeDriver }).start();
  }
  const sourceLabel = `Based on ${brief.sourceIds.length} linked source${brief.sourceIds.length === 1 ? '' : 's'}`;
  return <Animated.View style={{ opacity }}><Surface tone="dark" style={styles.briefCard}>
    <View style={styles.briefHeader}><View><Label style={styles.label}>NU﻿RA’S SEARCH BRIEF</Label><Text style={[styles.briefTitle, editorialType.briefTitle]}>{brief.topic}, in a nutshell.</Text></View><View style={styles.briefSpark}><Text style={styles.briefSparkText}>✦</Text></View></View>
    <Text style={styles.briefSectionLabel}>{expanded ? 'FULL OVERVIEW' : 'AT A GLANCE'}</Text>
    <Text style={styles.briefText}>{expanded ? (brief.summary || `Nura found ${brief.sourceIds.length} trusted sources for ${brief.topic}. Open a source below to read its published guidance.`) : (preview || `Nura found ${brief.sourceIds.length} trusted sources for ${brief.topic}. Open a source below to read its published guidance.`)}</Text>
    {hasMore && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={toggle} style={styles.briefToggle}><Text style={styles.briefToggleText}>{expanded ? 'Show less ↑' : 'Read the full overview ↓'}</Text></Pressable>}
    <Text style={styles.briefSources}>{sourceLabel} · general education, not an assessment of your health</Text>
  </Surface></Animated.View>;
}

function FeaturedVideoCard({ item, headline, takeaway, onPlay, onAsk }: { item: HealthFeedItem; headline: string; takeaway: string; onPlay: () => void; onAsk: () => void }) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const thumbnailUrl = getYouTubeThumbnailForVideo(item.url, item.thumbnailUrl);
  return <View style={styles.featureSection}>
    <View style={styles.featureHeading}><View><Label style={styles.label}>LATEST PUBLICATIONS</Label><Text style={styles.featureTitle}>Worth a closer look.</Text></View><Text style={styles.featureCount}>VIDEO · {item.topic}</Text></View>
    <View style={styles.featureCard}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Play featured video in Nura: ${headline}`} onPress={onPlay} style={[styles.featureMedia, { height: undefined, aspectRatio: 16 / 9 }]}>
        {thumbnailUrl && !thumbnailFailed ? <Image key={`${item.id}:${thumbnailUrl}`} accessibilityLabel={`YouTube thumbnail for ${item.title}`} source={{ uri: thumbnailUrl }} resizeMode="cover" onError={() => setThumbnailFailed(true)} style={styles.featureImage} /> : <VideoArtworkFallback title={item.title} topic={item.topic} />}
        <View pointerEvents="none" style={[styles.featureShade, { backgroundColor: 'rgba(22,15,13,.14)' }]} />
        <View pointerEvents="none" style={[styles.featurePlay, { position: 'absolute', left: '50%', top: '50%', marginLeft: -21, marginTop: -21 }]}><Text style={styles.featurePlayText}>▶</Text></View>
        <Text pointerEvents="none" style={styles.featureThumbnailLabel}>YOUTUBE VIDEO</Text>
      </Pressable>
      <View style={styles.featureCopy}><Text style={styles.featureEyebrow}>A VIDEO FOR YOUR HEALTH JOURNEY</Text><Text style={[styles.featureHeadline, { color: feedColors.ink, fontSize: 22, lineHeight: 26, maxWidth: '100%', marginTop: 0 }]}>{headline}</Text>{takeaway ? <Text style={styles.featureTakeaway}>{takeaway}</Text> : null}<View style={styles.featureActions}><Pressable accessibilityRole="button" accessibilityLabel={`Play featured video in Nura: ${headline}`} onPress={onPlay} style={styles.featurePlayAction}><Text style={styles.featurePlayActionText}>▶  Watch video</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Ask Nura about this video: ${headline}`} onPress={onAsk} style={styles.featureAskAction}><Text style={styles.featureAskActionText}>✦  Ask Nura</Text></Pressable></View></View>
    </View>
  </View>;
}

export default function Services() {
  const params = useLocalSearchParams<{ videoId?: string; playToken?: string }>();
  const { name, email, phone, topics, facts, treatments, links, registryBriefs, askConversations, agentMessages, feedItems, mergeFeedItems, setFeedSaved, setFeedDismissed } = useNura();
  const handledHomeVideoRequest = useRef('');
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [consent, setConsent] = useState(false);
  const [personalizationConsent, setPersonalizationConsent] = useState(false);
  const [useRecentAskContext, setUseRecentAskContext] = useState(false);
  const [searchSettingsExpanded, setSearchSettingsExpanded] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<SearchStatus>('checking');
  const [serviceReason, setServiceReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<FeedActivity[]>([]);
  const [briefs, setBriefs] = useState<FeedBrief[]>([]);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(() => new Set());
  const [activeVideo, setActiveVideo] = useState<{ id: string; title: string; sourceTitle: string } | null>(null);
  const [activeSource, setActiveSource] = useState<{ url: string; title: string } | null>(null);
  const [error, setError] = useState('');
  const [personalizationError, setPersonalizationError] = useState('');
  const [personalizedNotes, setPersonalizedNotes] = useState<Record<string, PersonalizedFeedNote>>({});
  const [feedView, setFeedView] = useState<FeedView>('forYou');
  const [undoIds, setUndoIds] = useState<string[] | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [topicLimitNote, setTopicLimitNote] = useState('');
  const [editionSearch, setEditionSearch] = useState('');

  useEffect(() => {
    let active = true;
    getAgentStatus().then((status) => {
      if (!active) return;
      const ready = status.capabilities?.trustedHealthSearch === true;
      setServiceStatus(ready ? 'ready' : 'unavailable');
      setServiceReason(ready ? '' : feedSearchSetupReason(status));
    }).catch(() => {
      if (!active) return;
      setServiceStatus('unavailable');
      setServiceReason('Nura could not check video search. Make sure the local preview server is running, then try again.');
    });
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    const videoId = typeof params.videoId === 'string' ? params.videoId : '';
    const playToken = typeof params.playToken === 'string' ? params.playToken : '';
    const requestKey = videoId + ':' + playToken;
    if (!videoId || !playToken || handledHomeVideoRequest.current === requestKey) return;
    const item = feedItems.find((candidate) => !candidate.dismissed && getYouTubeVideoId(candidate.url) === videoId);
    if (!item) return;
    handledHomeVideoRequest.current = requestKey;
    requestAnimationFrame(() => setActiveVideo({ id: videoId, title: item.title, sourceTitle: item.title }));
  }, [feedItems, params.playToken, params.videoId]);

  const activeIds = selectedIds ?? topics.map((topic) => topic.id).slice(0, 3);
  const selectedTopics = useMemo(() => topics.filter((topic) => activeIds.includes(topic.id)).slice(0, 3), [topics, activeIds]);
  const recentAskContext = useMemo(() => selectRecentFeedQuestionContext(askConversations, agentMessages, [name, email, phone]), [agentMessages, askConversations, email, name, phone]);
  const groupedItems = useMemo(() => groupHealthFeedItems(feedItems), [feedItems]);
  const visibleItems = useMemo(() => groupedItems.filter((item) => feedView === 'saved' ? item.saved : feedView === 'hidden' ? item.dismissed : !item.dismissed && isFeedItemFromLocalDay(item.retrievedAt)).sort((a, b) => Number(b.saved) - Number(a.saved) || b.retrievedAt.localeCompare(a.retrievedAt)), [groupedItems, feedView]);
  const relevanceRankedItems = useMemo(() => feedView === 'forYou'
    ? rankHealthFeedItemsByLocalContext(visibleItems, { topics: selectedTopics, facts, treatments, links, registryBriefs, recentQuestionCues: useRecentAskContext ? recentAskContext.questions : [] }, [name, email, phone])
    : visibleItems,
  [email, facts, feedView, links, name, phone, recentAskContext.questions, registryBriefs, selectedTopics, treatments, useRecentAskContext, visibleItems]);
  const searchedItems = useMemo(() => {
    const query = editionSearch.trim().toLowerCase();
    if (!query) return relevanceRankedItems;
    return relevanceRankedItems.filter((item) => [item.title, item.publisher, item.topic, item.detail].some((value) => value.toLowerCase().includes(query)));
  }, [editionSearch, relevanceRankedItems]);
  const feedCategories = useMemo(() => groupHealthFeedCategories(searchedItems, feedView === 'forYou' ? selectedTopics : []), [feedView, searchedItems, selectedTopics]);
  const hasTodayResults = visibleItems.length > 0;
  const featuredVideo = feedView === 'forYou' ? feedCategories.flatMap((category) => category.items.map((item) => ({ categoryId: category.id, item }))).find(({ item }) => Boolean(getYouTubeVideoId(item.url))) : undefined;
  const featuredVideoCopy = featuredVideo ? feedCardCopy(featuredVideo.item, briefs.find((brief) => brief.topic.toLowerCase() === featuredVideo.item.topic.toLowerCase()), personalizedNotes[featuredVideo.item.id]) : null;
  const savedCount = groupedItems.filter((item) => item.saved).length;
  const hiddenCount = groupedItems.filter((item) => item.dismissed).length;

  function toggleTopic(id: string) {
    setTopicLimitNote('');
    setConsent(false);
    setPersonalizationConsent(false);
    setSearchSettingsExpanded(true);
    if (!activeIds.includes(id) && activeIds.length >= 3) { setTopicLimitNote('Choose up to three areas for one search.'); return; }
    setSelectedIds(activeIds.includes(id) ? activeIds.filter((value) => value !== id) : [...activeIds, id]);
  }
  async function search() {
    if (!consent || selectedTopics.length === 0 || busy || serviceStatus !== 'ready') return;
    const personalizeNotes = personalizationConsent;
    setBusy(true); setError(''); setActivity([]); setBriefs([]); setUndoIds(null);
    setPersonalizationError(''); setPersonalizedNotes({});
    const updateActivity = (next: FeedActivity) => setActivity((current) => {
      const existing = current.findIndex((item) => item.id === next.id);
      if (existing < 0) return [...current, next];
      const updated = current.slice(); updated[existing] = next; return updated;
    });
    try {
      const results = await searchHealthFeed(selectedTopics, updateActivity, consent, feedItems.map((item) => item.url));
      if (personalizeNotes && results.items.length) {
        updateActivity({ id: 'personalized-feed-notes', label: 'Writing your reading notes', status: 'started', detail: 'Using only the source details and matched health context you approved.' });
        const noteInputs: FeedPersonalizationInput[] = results.items.map((item) => ({
          topic: item.topic,
          title: item.title,
          summary: item.detail,
          mediaType: getYouTubeVideoId(item.url) ? 'video' : 'article',
          ...selectFeedPersonalContext(item, facts, treatments, [name, email, phone]),
        }));
        try {
          const notes = await personalizeHealthFeed(noteInputs, true);
          setPersonalizedNotes(Object.fromEntries(notes.map((note) => [results.items[note.index]?.id, note]).filter(([id]) => typeof id === 'string')));
          updateActivity({ id: 'personalized-feed-notes', label: 'Writing your reading notes', status: 'complete', detail: `Personalized ${notes.length} source notes.` });
        } catch (caught) {
          setPersonalizationError(caught instanceof Error ? caught.message : 'The feed loaded, but Nura could not prepare personalized notes.');
          updateActivity({ id: 'personalized-feed-notes', label: 'Writing your reading notes', status: 'failed', detail: 'The articles and videos are available; personalized notes could not be completed.' });
        }
      }
      mergeFeedItems(results.items);
      setSearchSettingsExpanded(results.items.length === 0);
      setBriefs(results.briefs);
      const nextCategories = groupHealthFeedCategories(results.items, selectedTopics);
      setExpandedCategoryIds(nextCategories.length ? new Set([nextCategories[0].id]) : new Set());
      setFeedView('forYou');
      if (!results.items.length) setError('No new sources were found for these areas. Nura leaves sources already in your library out of a fresh search. Try a different combination or search again later.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nura could not finish this search. Your saved articles are still available.');
    } finally { setBusy(false); setConsent(false); setPersonalizationConsent(false); }
  }
  function dismiss(item: HealthFeedItem & { activeIds: string[] }) { item.activeIds.forEach((id) => setFeedDismissed(id, true)); setUndoIds(item.activeIds); }
  function undoDismiss() { undoIds?.forEach((id) => setFeedDismissed(id, false)); setUndoIds(null); }
  function toggleCategory(id: string) { setExpandedCategoryIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleAllCategories() { setExpandedCategoryIds((current) => current.size === feedCategories.length ? new Set() : new Set(feedCategories.map((category) => category.id))); }
  function openFeedItem(item: HealthFeedItem, headline = item.title) { const videoId = getYouTubeVideoId(item.url); if (videoId) setActiveVideo({ id: videoId, title: headline, sourceTitle: item.title }); else openSource(item.url, item.title); }
  function askAboutItem(item: HealthFeedItem) {
    const mediaType = getYouTubeVideoId(item.url) ? 'video' : 'article';
    router.push({ pathname: '/ask', params: {
      context: `${mediaType === 'video' ? 'Video' : 'Article'} about ${item.topic}`,
      readingSourceId: item.id,
      question: mediaType === 'video' ? 'What should I learn from this video?' : 'What should I take away from this article?',
    } });
  }
  function openSource(url: string, title: string) {
    if (!/^https:\/\//i.test(url)) { setError('This source link is not secure and was not opened.'); return; }
    setActiveSource({ url, title });
  }

  return <View style={styles.page}><Atmosphere /><ScrollView contentContainerStyle={[styles.content, { paddingBottom: 116 }]} showsVerticalScrollIndicator={false}>
    <View style={styles.topbar}><View><Label style={styles.label}>YOUR HEALTH LIBRARY</Label><Text style={[styles.title, editorialType.pageTitle]}>A little more clarity, today.</Text><Text style={[styles.subtitle, editorialType.pageSubtitle]}>Trusted articles and videos for your health areas, checked against relevant details saved on this device.</Text></View><View style={styles.orbMark}><Text style={styles.orbGlyph}>✦</Text></View></View>

    <View style={styles.discoveryTools}>
      <View style={styles.localSearchBox}><Text style={styles.localSearchGlyph}>⌕</Text><TextInput value={editionSearch} onChangeText={setEditionSearch} placeholder="Filter this edition" placeholderTextColor={feedColors.quiet} accessibilityLabel="Filter articles and videos already in this edition" returnKeyType="search" style={styles.localSearchInput} /><Pressable accessibilityRole="button" accessibilityLabel={editionSearch ? 'Clear edition filter' : 'Clear edition filter'} onPress={() => setEditionSearch('')} style={styles.localSearchAction}><Text style={styles.localSearchActionText}>{editionSearch ? '×' : '⌕'}</Text></Pressable></View>
      <Text style={styles.localSearchHint}>This only filters sources already loaded. Choose topics below to search trusted sources for new reading.</Text>
      <View style={styles.discoveryTopicHeader}><Text style={styles.discoveryTopicTitle}>Your health areas</Text><Text style={styles.selectedCount}>{selectedTopics.length}/3</Text></View>
      <Text style={{ color: feedColors.quiet, fontSize: 10, lineHeight: 14, marginTop: 2 }}>Choose up to three areas for a fresh article and video edition.</Text>
      {topics.length ? <View style={styles.topicList}>{topics.map((topic) => { const selected = activeIds.includes(topic.id); return <Pressable key={topic.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => toggleTopic(topic.id)} style={[styles.topicPill, selected && styles.topicPillSelected]}><Text style={[styles.topicPillText, selected && styles.topicPillTextSelected]}>{selected ? '✓  ' : '+  '}{topic.label}</Text></Pressable>; })}</View> : <View style={styles.noTopics}><Text style={styles.noTopicsText}>Choose health areas in your profile first. Nura won’t guess what matters to you.</Text><Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/profile')}><Text style={styles.inlineLink}>Choose health areas  →</Text></Pressable></View>}
      {topicLimitNote ? <Text style={styles.limitNote}>{topicLimitNote}</Text> : null}
      {hasTodayResults && !searchSettingsExpanded ? <Pressable accessibilityRole="button" accessibilityLabel="Search for new articles and videos using health topics" onPress={() => setSearchSettingsExpanded(true)} style={styles.compactSearchSettings}><View style={styles.compactSearchCopy}><Text style={styles.compactSearchTitle}>WANT A FRESH PULL?</Text><Text style={styles.compactSearchDetail}>Search selected topics for new articles and videos. Your saved details stay private unless you separately opt in to personal notes.</Text></View><Text style={styles.compactSearchAction}>Search  →</Text></Pressable> : null}
    </View>

    {!hasTodayResults || searchSettingsExpanded ? <Surface tone="dark" style={styles.consentCard}>
      {hasTodayResults && <Pressable accessibilityRole="button" accessibilityLabel="Close search settings" onPress={() => setSearchSettingsExpanded(false)} style={styles.consentClose}><Text style={styles.consentCloseText}>Back to today’s edition  ↑</Text></Pressable>}
      <View style={styles.consentTop}><View style={styles.consentIcon}><Text style={styles.consentIconText}>⌕</Text></View><View style={{ flex: 1 }}><Text style={styles.consentTitle}>{hasTodayResults ? 'Find more trusted learning' : 'Build your first edition'}</Text><Text style={styles.consentBody}>Nura searches trusted articles and YouTube videos using only the generalized topics selected above. Relevant confirmed details can shape your reading notes if you separately opt in below; your other profile information stays on this device.</Text></View></View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent((value) => !value)} style={styles.consentToggle}><View style={[styles.checkBox, consent && styles.checkBoxOn]}>{consent && <Text style={styles.checkMark}>✓</Text>}</View><Text style={styles.consentToggleText}>Allow this search to send only these selected, generalized health topics to trusted article and Google/YouTube search.</Text></Pressable>
      {recentAskContext.questions.length > 0 && <><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: useRecentAskContext }} onPress={() => setUseRecentAskContext((value) => !value)} style={styles.consentToggle}><View style={[styles.checkBox, useRecentAskContext && styles.checkBoxOn]}>{useRecentAskContext && <Text style={styles.checkMark}>✓</Text>}</View><Text style={styles.consentToggleText}>Optional: use up to three recent questions from “{recentAskContext.title || 'Ask Nura'}” to rank related sources on this device. Your questions and saved records are not sent to search providers or Nura’s AI.</Text></Pressable>{useRecentAskContext && <Text accessibilityLiveRegion="polite" style={[styles.consentBody, { marginTop: -4, marginBottom: 8 }]}>Local cues: {recentAskContext.questions.join(' · ')}</Text>}</>}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: personalizationConsent }} onPress={() => setPersonalizationConsent((value) => !value)} style={styles.consentToggle}><View style={[styles.checkBox, personalizationConsent && styles.checkBoxOn]}>{personalizationConsent && <Text style={styles.checkMark}>✓</Text>}</View><Text style={styles.consentToggleText}>Optional: send each source’s title and summary plus only the relevant confirmed details (up to two) and current treatment (up to one) to Nura’s AI provider for personal reading notes. Your name and contact details are excluded; notes do not change your record.</Text></Pressable>
      <View style={styles.sourceTrust}><View style={[styles.statusDot, serviceStatus === 'ready' && styles.statusDotOn, serviceStatus === 'unavailable' && styles.statusDotOff]} /><Text style={styles.sourceTrustText}>{serviceStatus === 'checking' ? 'Checking trusted health sources…' : serviceStatus === 'ready' ? 'YouTube search is configured. Nura checks provider access when you start a consented search; videos play here in Nura.' : serviceReason}</Text><Pressable accessibilityRole="button" accessibilityLabel="Check trusted health sources" onPress={() => { setServiceStatus('checking'); getAgentStatus().then((status) => { const ready = status.capabilities?.trustedHealthSearch === true; setServiceStatus(ready ? 'ready' : 'unavailable'); setServiceReason(ready ? '' : feedSearchSetupReason(status)); }).catch(() => { setServiceStatus('unavailable'); setServiceReason('Nura could not check video search. Make sure the local preview server is running, then try again.'); }); }} style={styles.sourceRefreshButton}><Text style={styles.refresh}>↻</Text></Pressable></View>
      <Pressable accessibilityRole="button" disabled={!consent || !selectedTopics.length || busy || serviceStatus !== 'ready'} onPress={() => void search()} style={[styles.searchButton, (!consent || !selectedTopics.length || busy || serviceStatus !== 'ready') && styles.searchDisabled]}>{busy ? <><ActivityIndicator color="#FFF8EF" size="small" /><Text style={styles.searchButtonText}>Searching selected areas…</Text></> : <><Text style={styles.searchButtonText}>{hasTodayResults ? 'Search these areas again' : 'Build my first edition'}</Text><Text style={styles.searchArrow}>→</Text></>}</Pressable>
      <Text style={styles.safetyNote}>Education only. Nura does not diagnose, recommend treatment, or infer what is right for you.</Text>
    </Surface> : null}

    <ActivityCard activity={activity} busy={busy} reducedMotion={reducedMotion} />
    {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>The feed needs another try</Text><Text style={styles.errorBody}>{error}</Text>{serviceStatus === 'ready' && selectedTopics.length > 0 && <Text style={styles.retryHint}>To try again, review your selected areas and confirm consent for a new search.</Text>}</View> : null}
    {personalizationError ? <View style={styles.errorCard}><Text style={styles.errorTitle}>Your articles and videos are ready</Text><Text style={styles.errorBody}>{personalizationError}</Text></View> : null}
    {undoIds ? <View style={styles.undoBar}><Text style={styles.undoText}>{undoIds.length > 1 ? 'Related articles removed from your feed.' : 'Removed from your feed.'}</Text><Pressable accessibilityRole="button" onPress={undoDismiss} style={styles.undoActionButton}><Text style={styles.undoAction}>Undo</Text></Pressable></View> : null}

    {featuredVideo && featuredVideoCopy ? <FeaturedVideoCard key={`${featuredVideo.item.id}:${featuredVideo.item.url}:${featuredVideo.item.thumbnailUrl ?? ''}`} item={featuredVideo.item} headline={featuredVideoCopy.headline} takeaway={featuredVideoCopy.takeaway} onPlay={() => openFeedItem(featuredVideo.item, featuredVideoCopy.headline)} onAsk={() => askAboutItem(featuredVideo.item)} /> : null}
    {feedView === 'forYou' && useRecentAskContext && recentAskContext.questions.length > 0 && visibleItems.length > 0 ? <Surface tone="dark" style={{ padding: 12, marginBottom: 12, borderColor: 'rgba(169,212,227,.32)' }}><Text style={{ color: feedColors.cobalt, fontSize: 9, fontWeight: '800', letterSpacing: .8 }}>SORTED WITH YOUR RECENT ASK CONTEXT · ON THIS DEVICE</Text><Text style={{ color: feedColors.muted, fontSize: 11, lineHeight: 15, marginTop: 5 }}>Fresh results are searched using your selected health areas, then ranked here against: {recentAskContext.questions.join(' · ')}</Text></Surface> : null}
    <View style={styles.feedHeader}><View><Label style={styles.label}>{feedView === 'forYou' ? 'TODAY’S EDITION' : 'YOUR READING'}</Label><Text style={[styles.feedTitle, editorialType.topicTitle]}>{feedView === 'saved' ? 'Saved for later.' : feedView === 'hidden' ? 'Hidden from your feed.' : 'For your health journey.'}</Text></View><View style={styles.segment}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: feedView === 'forYou' }} onPress={() => setFeedView('forYou')} style={[styles.segmentItem, feedView === 'forYou' && styles.segmentActive]}><Text style={[styles.segmentText, feedView === 'forYou' && styles.segmentTextActive]}>For you</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: feedView === 'saved' }} onPress={() => setFeedView('saved')} style={[styles.segmentItem, feedView === 'saved' && styles.segmentActive]}><Text style={[styles.segmentText, feedView === 'saved' && styles.segmentTextActive]}>Saved{savedCount ? ` · ${savedCount}` : ''}</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: feedView === 'hidden' }} onPress={() => setFeedView('hidden')} style={[styles.segmentItem, feedView === 'hidden' && styles.segmentActive]}><Text style={[styles.segmentText, feedView === 'hidden' && styles.segmentTextActive]}>Hidden{hiddenCount ? ` · ${hiddenCount}` : ''}</Text></Pressable>
    </View></View>
    {feedCategories.length ? <View style={styles.categoryList}>
      <View style={styles.categoryListHeader}><Label style={styles.label}>BROWSE BY TOPIC</Label><Pressable accessibilityRole="button" accessibilityLabel={expandedCategoryIds.size === feedCategories.length ? 'Collapse all reading topics' : 'Expand all reading topics'} onPress={toggleAllCategories} style={styles.expandAllButton}><Text style={styles.expandAllText}>{expandedCategoryIds.size === feedCategories.length ? 'Collapse all' : 'Expand all'}</Text></Pressable></View>
      {feedCategories.map((category, categoryIndex) => {
        const expanded = expandedCategoryIds.has(category.id);
        const articleLimit = feedView === 'forYou' ? 3 : Number.POSITIVE_INFINITY;
        const videoLimit = feedView === 'forYou' ? 3 : Number.POSITIVE_INFINITY;
        const articleItems = category.items.filter((item) => !getYouTubeVideoId(item.url)).slice(0, articleLimit);
        const allVideoItems = category.items.filter((item) => Boolean(getYouTubeVideoId(item.url))).slice(0, videoLimit);
        const featuredInCategory = featuredVideo?.categoryId === category.id;
        const videoItems = allVideoItems.filter((item) => !featuredInCategory || item.id !== featuredVideo?.item.id);
        const videoCount = allVideoItems.length;
        const articleCount = articleItems.length;
        const categoryBrief = feedView === 'forYou' ? briefs.find((brief) => brief.topic.toLowerCase() === category.label.toLowerCase()) : undefined;
        return <Surface key={category.id} tone="dark" style={styles.categoryCard}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => toggleCategory(category.id)} style={styles.categoryTile}>
            <View style={styles.categoryMark}><Text style={styles.categoryMarkText}>{category.label.slice(0, 1).toUpperCase()}</Text></View>
            <View style={styles.categoryCopy}><Text style={styles.categoryEyebrow}>{articleCount} ARTICLE{articleCount === 1 ? '' : 'S'} · {videoCount} VIDEO{videoCount === 1 ? '' : 'S'}</Text><Text style={styles.categoryTitle}>{category.label}</Text><Text style={styles.categoryMeta}>{categoryBrief ? compactFeedBrief(categoryBrief.summary, categoryBrief.topic) : 'A daily selection matched to this area.'}</Text></View>
            <Text style={styles.categoryChevron}>{expanded ? '⌃' : '⌄'}</Text>
          </Pressable>
          {expanded ? <View style={styles.categoryContent}>
            {categoryBrief ? <SearchBriefCard brief={categoryBrief} reducedMotion={reducedMotion} /> : null}
            {articleItems.length > 0 && <View style={styles.mediaSection}><Text style={styles.mediaSectionTitle}>ARTICLES · {articleItems.length}</Text>{articleItems.map((item, itemIndex) => <FeedCard key={item.id} item={item} index={categoryIndex + itemIndex} reducedMotion={reducedMotion} facts={facts} treatments={treatments} personalizedNote={personalizedNotes[item.id]} brief={briefs.find((brief) => item.topicLabels.some((topic) => brief.topic.toLowerCase() === topic.toLowerCase()))} showHidden={feedView === 'hidden'} onSave={() => item.duplicateIds.forEach((id) => setFeedSaved(id, !item.saved))} onDismiss={() => dismiss(item)} onRestore={() => item.duplicateIds.forEach((id) => setFeedDismissed(id, false))} onAsk={() => askAboutItem(item)} onOpen={() => openFeedItem(item)} />)}</View>}
            {videoItems.length > 0 && <View style={styles.mediaSection}><Text style={styles.mediaSectionTitle}>{featuredInCategory ? `VIDEOS · ${videoItems.length} MORE · FEATURED VIDEO ABOVE` : `VIDEOS · ${videoItems.length}`}</Text>{videoItems.map((item, itemIndex) => <FeedCard key={`${item.id}:${item.url}:${item.thumbnailUrl ?? ''}`} item={item} index={categoryIndex + articleItems.length + itemIndex} reducedMotion={reducedMotion} facts={facts} treatments={treatments} personalizedNote={personalizedNotes[item.id]} brief={briefs.find((brief) => item.topicLabels.some((topic) => brief.topic.toLowerCase() === topic.toLowerCase()))} showHidden={feedView === 'hidden'} onSave={() => item.duplicateIds.forEach((id) => setFeedSaved(id, !item.saved))} onDismiss={() => dismiss(item)} onRestore={() => item.duplicateIds.forEach((id) => setFeedDismissed(id, false))} onAsk={() => askAboutItem(item)} onOpen={(headline) => openFeedItem(item, headline)} />)}</View>}
            {featuredInCategory && videoItems.length === 0 && <Text style={styles.featuredInCategoryNote}>The featured video for this topic appears above.</Text>}
          </View> : null}
        </Surface>;
      })}
    </View> : <Surface tone="dark" style={styles.emptyCard}><View style={styles.emptyOrb}><Text style={styles.emptyOrbGlyph}>✦</Text></View><Text style={styles.emptyTitle}>{editionSearch.trim() ? 'No matches in this edition.' : feedView === 'saved' ? 'Nothing saved yet.' : feedView === 'hidden' ? 'No hidden reading.' : selectedTopics.length ? 'Your video and article picks are waiting.' : 'Your feed starts with your choices.'}</Text><Text style={styles.emptyBody}>{editionSearch.trim() ? 'Try another title, publisher, topic, or word from a source already loaded on this device.' : feedView === 'saved' ? 'Save a source you want to return to. It will appear in your Saved reading.' : feedView === 'hidden' ? 'Articles and videos you hide stay here. You can restore a source to your For you feed.' : selectedTopics.length ? 'Confirm the search above to build today’s reading. Earlier results remain available in Saved or Hidden.' : 'Choose one or more health areas, review what will be searched, and give consent for each search.'}</Text></Surface>}
    <Text style={styles.footer}>Videos play here in Nura. Articles stay linked to their publisher. Education stays separate from your personal health record.</Text>
  </ScrollView><InlineYouTubePlayer visible={Boolean(activeVideo)} videoId={activeVideo?.id ?? null} title={activeVideo?.title ?? 'Health video'} sourceTitle={activeVideo?.sourceTitle} onClose={() => setActiveVideo(null)} /><InlineSourceReader visible={Boolean(activeSource)} url={activeSource?.url ?? null} title={activeSource?.title ?? 'Health source'} onClose={() => setActiveSource(null)} /></View>;
}

const styles = StyleSheet.create({
  discoveryTools: { marginBottom: 14 }, localSearchBox: { minHeight: 48, borderWidth: 1, borderColor: 'rgba(255,226,205,.30)', borderRadius: 24, backgroundColor: 'rgba(255,241,225,.07)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9 }, localSearchGlyph: { color: feedColors.muted, fontSize: 19, lineHeight: 23 }, localSearchInput: { flex: 1, minWidth: 0, minHeight: 44, color: feedColors.ink, fontSize: 13, lineHeight: 18, position: 'relative', zIndex: 2 }, localSearchAction: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' }, localSearchActionText: { color: feedColors.cobalt, fontSize: 21 }, localSearchHint: { color: feedColors.quiet, fontSize: 9, lineHeight: 13, marginTop: 5, marginLeft: 12 }, discoveryTopicHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 3 }, discoveryTopicTitle: { color: feedColors.ink, fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -.35 },
  featureSection: { gap: 9, marginBottom: 16 }, featureHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }, featureTitle: { color: feedColors.ink, fontSize: 18, lineHeight: 22, fontWeight: '700', marginTop: 4 }, featureCount: { color: feedColors.aqua, fontSize: 8, fontWeight: '800', letterSpacing: .75, maxWidth: 135, textAlign: 'right' }, featureCard: { position: 'relative', width: '100%', borderRadius: 21, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,226,205,.34)', backgroundColor: '#35241F' }, featureImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' }, featureShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22,15,13,.42)' }, featureOverlay: { minHeight: 222, justifyContent: 'flex-end', alignItems: 'flex-start', padding: 16, gap: 6 }, featureEyebrow: { color: '#FFF4EA', fontSize: 8, fontWeight: '800', letterSpacing: 1.2 }, featurePlay: { width: 42, height: 42, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,248,240,.82)', backgroundColor: 'rgba(31,23,20,.70)', alignItems: 'center', justifyContent: 'center', marginVertical: 3 }, featurePlayText: { color: '#FFF8F0', fontSize: 14, marginLeft: 2 }, featureHeadline: { color: '#FFF8F0', fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -.5, maxWidth: '95%' }, featureTakeaway: { color: '#F5E9DF', fontSize: 12, lineHeight: 16, marginTop: 1 }, featureActions: { flexDirection: 'row', gap: 8, marginTop: 5 }, featurePlayAction: { flex: 1, minHeight: 40, paddingHorizontal: 11, justifyContent: 'center', alignItems: 'center', borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,226,205,.30)', backgroundColor: 'rgba(255,241,225,.08)' }, featurePlayActionText: { color: feedColors.ink, fontSize: 11, fontWeight: '700' }, featureAskAction: { flex: 1, minHeight: 40, paddingHorizontal: 11, justifyContent: 'center', alignItems: 'center', borderRadius: 13, borderWidth: 1, borderColor: 'rgba(169,212,227,.50)', backgroundColor: 'rgba(169,212,227,.17)' }, featureAskActionText: { color: feedColors.cobalt, fontSize: 11, fontWeight: '700' }, featuredInCategoryNote: { color: feedColors.quiet, fontSize: 10, lineHeight: 14, marginHorizontal: 2 },
  videoThumbnail: { aspectRatio: 16 / 9, width: '100%', borderRadius: 14, marginBottom: 12, overflow: 'hidden', backgroundColor: 'rgba(15,12,11,.72)', borderWidth: 1, borderColor: 'rgba(255,226,205,.28)' },
  videoThumbnailImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  videoThumbnailFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  videoThumbnailFallbackText: { color: feedColors.muted, fontSize: 11, fontWeight: '600' },
  videoThumbnailScrim: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,12,11,.12)' },
  videoPlay: { width: 46, height: 46, borderRadius: 24, backgroundColor: 'rgba(26,19,18,.84)', borderWidth: 1, borderColor: 'rgba(255,246,235,.8)', alignItems: 'center', justifyContent: 'center' },
  videoPlayText: { color: '#FFF8EF', fontSize: 16, marginLeft: 3 },
  videoThumbnailLabel: { position: 'absolute', right: 9, bottom: 8, color: '#FFF8EF', backgroundColor: 'rgba(26,19,18,.78)', borderRadius: 7, paddingVertical: 4, paddingHorizontal: 7, fontSize: 8, fontWeight: '800', letterSpacing: .8 },
  categoryList: { gap: 10, marginBottom: 14 },
  categoryListHeader: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  expandAllButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  expandAllText: { color: feedColors.cobalt, fontSize: 10, fontWeight: '700' },
  categoryCard: { padding: 0, overflow: 'hidden', borderRadius: 17, borderColor: 'rgba(255,226,205,.30)' },
  categoryTile: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 12 },
  categoryMark: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(169,212,227,.15)', borderWidth: 1, borderColor: 'rgba(169,212,227,.25)' },
  categoryMarkText: { color: feedColors.cobalt, fontSize: 15, fontWeight: '700' },
  categoryCopy: { flex: 1, gap: 3 },
  categoryEyebrow: { color: feedColors.violet, fontSize: 8, letterSpacing: .85, fontWeight: '800' },
  categoryTitle: { color: feedColors.ink, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  categoryMeta: { color: feedColors.quiet, fontSize: 10, lineHeight: 14 },
  categoryChevron: { color: feedColors.cobalt, fontSize: 22, lineHeight: 26, paddingHorizontal: 4 },
  categoryContent: { gap: 10, paddingHorizontal: 11, paddingBottom: 11, paddingTop: 2, borderTopWidth: 1, borderTopColor: feedColors.border },
  page: { flex: 1, backgroundColor: feedColors.bg }, content: { paddingHorizontal: 20, paddingTop: 42, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center' },
  label: { color: '#C9B9AD' }, topicPill: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: feedColors.border, backgroundColor: 'rgba(255,241,225,.07)', marginRight: 8, marginBottom: 9 }, topicPillSelected: { backgroundColor: 'rgba(169,212,227,.20)', borderColor: 'rgba(169,212,227,.58)' }, topicPillText: { color: feedColors.muted, fontSize: 13, fontWeight: '600' }, topicPillTextSelected: { color: feedColors.ink }, topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }, title: { color: feedColors.ink, fontSize: 31, lineHeight: 36, fontWeight: '800', letterSpacing: -1.05, marginTop: 7, maxWidth: 325 }, subtitle: { color: feedColors.muted, fontSize: 12, lineHeight: 18, marginTop: 6, maxWidth: 300 }, orbMark: { width: 44, height: 44, borderRadius: 24, backgroundColor: 'rgba(255,241,225,.08)', borderWidth: 1, borderColor: 'rgba(255,226,205,.24)', alignItems: 'center', justifyContent: 'center' }, orbGlyph: { color: feedColors.violet, fontSize: 20 },
  compactSearchSettings: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 9, marginBottom: 13, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,226,205,.26)', backgroundColor: 'rgba(255,241,225,.08)' }, compactSearchCopy: { flex: 1 }, compactSearchTitle: { color: feedColors.violet, fontSize: 8, fontWeight: '800', letterSpacing: 1 }, compactSearchDetail: { color: feedColors.muted, fontSize: 10, lineHeight: 14, marginTop: 4 }, compactSearchAction: { color: feedColors.cobalt, fontSize: 10, fontWeight: '700' }, consentClose: { alignSelf: 'flex-end', minHeight: 38, justifyContent: 'center', paddingHorizontal: 4 }, consentCloseText: { color: feedColors.cobalt, fontSize: 10, fontWeight: '700' }, consentCard: { padding: 15, marginBottom: 13 }, consentTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, consentIcon: { width: 35, height: 35, borderRadius: 13, backgroundColor: feedColors.bluePale, alignItems: 'center', justifyContent: 'center' }, consentIconText: { fontSize: 23, lineHeight: 25, color: feedColors.cobalt }, consentTitle: { color: feedColors.ink, fontSize: 14, fontWeight: '600', lineHeight: 18 }, consentBody: { color: feedColors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, topicLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }, selectedCount: { color: feedColors.violet, fontSize: 11, fontWeight: '600' }, topicList: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }, noTopics: { backgroundColor: feedColors.surfaceStrong, borderRadius: 13, padding: 11, marginTop: 9 }, noTopicsText: { color: feedColors.muted, fontSize: 12, lineHeight: 15 }, inlineLink: { color: feedColors.cobalt, fontSize: 12, fontWeight: '700', marginTop: 7 }, limitNote: { color: '#FFD097', fontSize: 11, marginTop: 2 }, consentToggle: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 11, borderTopWidth: 1, borderTopColor: feedColors.border, marginTop: 3 }, checkBox: { width: 19, height: 19, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,226,205,.38)', backgroundColor: 'rgba(255,241,225,.06)', alignItems: 'center', justifyContent: 'center' }, checkBoxOn: { backgroundColor: feedColors.cobalt, borderColor: feedColors.cobalt }, checkMark: { color: '#FFF8EF', fontSize: 12, fontWeight: '800' }, consentToggleText: { flex: 1, color: feedColors.text, fontSize: 12, lineHeight: 15, paddingTop: 1 }, sourceTrust: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: feedColors.surfaceStrong, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 11 }, statusDot: { width: 7, height: 7, borderRadius: 4, marginTop: 3, backgroundColor: 'rgba(255,226,205,.34)' }, statusDotOn: { backgroundColor: '#9FD8C7' }, statusDotOff: { backgroundColor: '#E8B18E' }, sourceTrustText: { flex: 1, color: feedColors.muted, fontSize: 11, lineHeight: 13 }, refresh: { color: feedColors.violet, fontSize: 17, lineHeight: 20 }, sourceRefreshButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, searchButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#376F7B', borderRadius: 15, marginTop: 11, ...shadow }, searchDisabled: { backgroundColor: 'rgba(55,111,123,.46)', opacity: 0.76 }, searchButtonText: { color: '#FFF8EF', fontSize: 11, fontWeight: '700' }, searchArrow: { color: '#FFF8EF', fontSize: 19, marginTop: -1 }, safetyNote: { color: feedColors.quiet, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 8 },
  activityCard: { padding: 14, marginBottom: 13, borderColor: 'rgba(169,212,227,.20)' }, activityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }, activityTitle: { color: feedColors.ink, fontSize: 14, fontWeight: '600', marginTop: 5 }, activityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }, activityDot: { width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, borderColor: 'rgba(255,226,205,.34)', alignItems: 'center', justifyContent: 'center' }, activityDotDone: { backgroundColor: 'rgba(159,216,199,.17)', borderColor: '#9FD8C7' }, activityDotFailed: { backgroundColor: 'rgba(232,177,142,.13)', borderColor: feedColors.violet }, activityCheck: { fontSize: 12, color: '#A6D9B9', fontWeight: '700' }, activityFailureMark: { fontSize: 12, color: feedColors.violet, fontWeight: '800' }, activityCopy: { flex: 1 }, activityLabel: { color: feedColors.text, fontSize: 12, fontWeight: '600' }, activityDetail: { color: feedColors.quiet, fontSize: 10, marginTop: 2 }, activityDetailFailed: { color: feedColors.violet },
  errorCard: { backgroundColor: 'rgba(255,208,151,.10)', borderRadius: 15, borderColor: 'rgba(255,208,151,.30)', borderWidth: 1, padding: 13, marginBottom: 12 }, errorTitle: { color: '#FFD097', fontSize: 12, fontWeight: '700' }, errorBody: { color: '#E3C5A7', fontSize: 12, lineHeight: 15, marginTop: 4 }, retryHint: { color: feedColors.cobalt, fontSize: 11, fontWeight: '700', marginTop: 8 }, undoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,241,225,.08)', marginBottom: 13 }, undoText: { color: feedColors.violet, fontSize: 10 }, undoAction: { color: feedColors.violet, fontSize: 12, fontWeight: '700', paddingHorizontal: 6 }, undoActionButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  editorialArt: { height: 135, borderRadius: 16, overflow: 'hidden', marginBottom: 13, justifyContent: 'space-between', padding: 14 }, editorialHalo: { position: 'absolute', width: 150, height: 150, borderRadius: 80, right: -25, top: -44, backgroundColor: 'rgba(255,255,255,.20)', borderWidth: 1, borderColor: 'rgba(255,255,255,.32)' }, editorialArtCopy: { maxWidth: '78%' }, editorialEyebrow: { color: '#FFF4EA', fontSize: 8, fontWeight: '800', letterSpacing: 1.4 }, editorialTopic: { color: '#FFF4EA', fontSize: 20, lineHeight: 24, fontWeight: '600', letterSpacing: -.4, marginTop: 7 }, editorialBadge: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: 'rgba(35,25,23,.68)' }, editorialBadgeText: { color: feedColors.cobalt, fontSize: 7, fontWeight: '800', letterSpacing: .8 },
  featureMedia: { position: 'relative', height: 150, overflow: 'hidden', backgroundColor: '#35241F' }, featureThumbnailLabel: { position: 'absolute', right: 9, bottom: 8, color: '#FFF4EA', backgroundColor: 'rgba(26,19,18,.78)', borderRadius: 7, paddingVertical: 4, paddingHorizontal: 7, fontSize: 8, fontWeight: '800', letterSpacing: .8 }, featureCopy: { paddingHorizontal: 15, paddingTop: 12, paddingBottom: 14, gap: 5 },
  briefList: { gap: 9, marginBottom: 14 }, briefCard: { padding: 14, backgroundColor: 'rgba(255,241,225,.08)', borderColor: 'rgba(255,226,205,.24)' }, briefHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, briefSpark: { width: 30, height: 30, borderRadius: 11, backgroundColor: feedColors.bluePale, alignItems: 'center', justifyContent: 'center' }, briefSparkText: { color: feedColors.cobalt, fontSize: 17 }, briefTitle: { color: feedColors.ink, fontSize: 14, fontWeight: '600', marginTop: 6 }, briefSectionLabel: { color: feedColors.violet, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 12 }, briefText: { color: feedColors.muted, fontSize: 12, lineHeight: 16, marginTop: 5 }, briefToggle: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: 2 }, briefToggleText: { color: feedColors.cobalt, fontSize: 11, fontWeight: '700' }, briefSources: { color: feedColors.violet, fontSize: 9, lineHeight: 13, fontWeight: '600', marginTop: 5 },
  feedHeader: { gap: 9, marginTop: 7, marginBottom: 11 }, feedTitle: { color: feedColors.ink, fontSize: 18, fontWeight: '500', marginTop: 5 }, segment: { width: '100%', flexDirection: 'row', backgroundColor: 'rgba(255,241,225,.07)', borderRadius: 13, padding: 3, borderWidth: 1, borderColor: feedColors.border }, segmentItem: { flex: 1, minHeight: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 }, segmentActive: { backgroundColor: 'rgba(169,212,227,.18)', ...shadow }, segmentText: { color: feedColors.muted, fontSize: 10, fontWeight: '500' }, segmentTextActive: { color: feedColors.ink, fontWeight: '700' }, articleList: { gap: 11 }, feedCard: { padding: 14 }, articleTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, sourceMark: { width: 31, height: 31, borderRadius: 12, backgroundColor: feedColors.bluePale, borderColor: 'rgba(169,212,227,.28)', borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, sourceMarkText: { color: feedColors.cobalt, fontSize: 17 }, articleHeading: { flex: 1 }, personalizedLabel: { color: feedColors.aqua, fontSize: 8, letterSpacing: .95, fontWeight: '800', marginTop: 8 }, articleTitleButton: { alignSelf: 'stretch', minHeight: 44, justifyContent: 'center' }, publishedHeadlineLabel: { color: feedColors.quiet, fontSize: 7, letterSpacing: .85, fontWeight: '800', marginTop: 8 }, publishedHeadline: { color: feedColors.muted, fontSize: 11, lineHeight: 15, marginTop: 3 }, detailToggle: { color: feedColors.cobalt, fontSize: 10, fontWeight: '700', marginTop: 5 }, articleGainLabel: { color: feedColors.violet, fontSize: 8, letterSpacing: .95, fontWeight: '800', marginTop: 8 }, mediaSection: { gap: 8, marginTop: 5 }, mediaSectionTitle: { color: feedColors.violet, fontSize: 9, letterSpacing: 1, fontWeight: '800', paddingHorizontal: 2, paddingTop: 2 }, detailsPanel: { marginTop: 11 }, detailsDivider: { height: 1, backgroundColor: feedColors.border, marginBottom: 10 }, detailsLabel: { color: feedColors.violet, fontSize: 10, fontWeight: '800', letterSpacing: 1.05, marginTop: 3 }, detailsCopy: { color: feedColors.text, fontSize: 12, lineHeight: 18, marginTop: 5 }, detailsWhy: { backgroundColor: 'rgba(255,241,225,.09)', borderRadius: 12, padding: 10, marginTop: 10 }, detailsBrief: { backgroundColor: feedColors.bluePale, borderRadius: 12, padding: 10, marginTop: 10 }, detailsMeta: { color: feedColors.quiet, fontSize: 10, lineHeight: 13, marginTop: 8 }, detailsSourceButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: '#376F7B', marginTop: 11, paddingHorizontal: 12 }, detailsSourceText: { color: '#FFF8EF', fontSize: 11, fontWeight: '800', letterSpacing: .5 }, detailsSourceArrow: { color: '#FFF8EF', fontSize: 14 }, publisher: { color: feedColors.violet, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: '700' }, articleTitle: { color: feedColors.ink, fontSize: 14, lineHeight: 19, fontWeight: '600', marginTop: 3 }, articleType: { paddingHorizontal: 7, paddingVertical: 4, backgroundColor: feedColors.bluePale, borderRadius: 8 }, articleTypeText: { color: feedColors.cobalt, fontSize: 9, letterSpacing: 0.6, fontWeight: '800' }, articleDetail: { color: feedColors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }, articleWhy: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: 'rgba(255,241,225,.09)', borderRadius: 10, marginTop: 9 }, whySpark: { color: '#E8B18E', fontSize: 11 }, whyText: { flex: 1, color: '#D7BDE4', fontSize: 11, lineHeight: 13 }, sourceMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 8 }, sourceMetaText: { color: feedColors.quiet, fontSize: 8 }, sourceMetaDot: { color: feedColors.quiet, fontSize: 8 }, articleActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }, actionPill: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 15, backgroundColor: 'rgba(255,241,225,.07)', borderWidth: 1, borderColor: 'rgba(255,226,205,.24)' }, actionPillSaved: { backgroundColor: 'rgba(159,216,199,.18)', borderColor: 'rgba(159,216,199,.42)' }, actionPillText: { color: feedColors.muted, fontSize: 11, fontWeight: '600' }, actionPillSavedText: { color: '#A6D9B9' }, restorePill: { backgroundColor: 'rgba(169,212,227,.14)', borderColor: 'rgba(169,212,227,.36)' }, restoreText: { color: feedColors.cobalt, fontSize: 11, fontWeight: '700' }, savedState: { color: '#A6D9B9', fontSize: 10, fontWeight: '600' }, dismissButton: { marginLeft: 'auto', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }, dismissText: { color: feedColors.quiet, fontSize: 9 }, openSource: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44, marginTop: 5, paddingHorizontal: 2 }, openSourceText: { color: feedColors.cobalt, fontSize: 11, fontWeight: '700' }, openSourceArrow: { color: feedColors.cobalt, fontSize: 12 }, emptyCard: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 }, emptyOrb: { width: 40, height: 40, borderRadius: 22, backgroundColor: 'rgba(255,241,225,.08)', alignItems: 'center', justifyContent: 'center' }, emptyOrbGlyph: { color: feedColors.violet, fontSize: 18 }, emptyTitle: { color: feedColors.ink, fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 10 }, emptyBody: { color: feedColors.muted, fontSize: 12, lineHeight: 15, textAlign: 'center', marginTop: 5 }, footer: { color: feedColors.quiet, fontSize: 10, lineHeight: 13, textAlign: 'center', marginTop: 17, paddingHorizontal: 8 },
});
