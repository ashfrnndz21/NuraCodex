import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Orb } from './Orb';
import { Atmosphere } from './ambient/Atmosphere';
import { GlassMaterial } from './GlassMaterial';
import { documentDisplayName } from '../services/documentPresentation.mjs';
import { useNura, type HealthFact, type HealthFeedItem, type HealthTopic, type TreatmentRecord } from '../state/NuraContext';
import { parseHealthDate } from '../utils/healthDate';
import { animatedNativeDriver } from '../services/animatedDriver';
import { registryBriefDisplayText } from '../services/registryBrief.mjs';
import { buildHomeCarePreview, firstUserContextFact } from '../services/homeBrief.mjs';
import { canonicalHealthMarker, getHealthMarkerRangeGuide, healthMarkerUnitNeedsReview, healthMarkerValueNeedsReview, selectHomeMarkerSnapshots } from '../services/healthMarkers.mjs';
import { getYouTubeThumbnailForVideo, getYouTubeVideoId } from '../services/youtubeVideo.mjs';
import { selectRecentHomeVideos } from '../services/homeVideoSelection.mjs';
import { buildHomeVideoRelevance } from '../services/homeVideoRelevance.mjs';
import VideoArtworkFallback from './VideoArtworkFallback';
import { HealthMarkerCardContent, healthMarkerCardStyles } from './HealthMarkerCardContent';
import { brandScenes, motion, shadow } from '../theme';

const ink = '#FFF8F0';
const muted = 'rgba(255,248,240,.72)';
const quiet = 'rgba(255,248,240,.52)';
const HOME_MARKER_PREVIEW_COUNT = 4;

const areaColors = [
  { line: '#A9D4E3', fill: 'rgba(91,158,180,.28)' },
  { line: '#9FD8C7', fill: 'rgba(60,137,119,.28)' },
  { line: '#E8B18E', fill: 'rgba(177,108,77,.28)' },
  { line: '#E9C985', fill: 'rgba(167,123,52,.28)' },
  { line: '#CBB4DF', fill: 'rgba(127,93,150,.28)' },
];

type SeriesPoint = { date: string; value: number; unit: string };

function TapCard({ children, onPress, label, style, reducedMotion, tone = 'dark', material = true }: {
  children: React.ReactNode; onPress: () => void; label: string; style: any; reducedMotion: boolean; tone?: 'light' | 'dark'; material?: boolean;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const flattenedStyle = (StyleSheet.flatten(style) ?? {}) as Record<string, any>;
  const shellStyle: Record<string, any> = {};
  const surfaceStyle: Record<string, any> = { ...flattenedStyle };
  const shellKeys = [
    'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'height', 'alignSelf',
    'margin', 'marginHorizontal', 'marginVertical', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
    'position', 'top', 'right', 'bottom', 'left', 'zIndex',
    'shadowColor', 'shadowOpacity', 'shadowRadius', 'shadowOffset', 'elevation',
  ];
  for (const key of shellKeys) {
    if (key in surfaceStyle) {
      shellStyle[key] = surfaceStyle[key];
      delete surfaceStyle[key];
    }
  }
  const pressIn = () => {
    if (!reducedMotion) Animated.timing(scale, { toValue: motion.pressScale, duration: motion.pressIn, easing: Easing.linear, useNativeDriver: animatedNativeDriver }).start();
  };
  const pressOut = () => {
    if (!reducedMotion) Animated.timing(scale, { toValue: 1, duration: motion.pressOut, easing: Easing.bezier(...motion.easing.bouncy), useNativeDriver: animatedNativeDriver }).start();
  };
  return <Animated.View style={[shellStyle, { transform: [{ scale }] }]}><Pressable accessibilityRole="button" accessibilityLabel={label} onPressIn={pressIn} onPressOut={pressOut} onPress={onPress} style={[styles.pressable, surfaceStyle]}>
    {material ? <GlassMaterial tone={tone} radius={flattenedStyle.borderRadius ?? 20} intensity={tone === 'dark' ? 38 : 58} /> : null}
    {children}
  </Pressable></Animated.View>;
}

function DateLabel({ value }: { value: string }) {
  const date = parseHealthDate(value);
  return <Text style={styles.dateLabel}>{date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : value}</Text>;
}

function shortDate(value: string) {
  const date = parseHealthDate(value);
  return date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : value;
}

function parseMeasurement(value: string): { value: number; unit: string } | null {
  const match = value.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Z%/]+)?$/);
  if (!match) return null;
  const number = Number(match[1].replace(',', '.'));
  return Number.isFinite(number) ? { value: number, unit: (match[2] ?? '').toLocaleLowerCase() } : null;
}

function isSetupMeasurement(fact: HealthFact) {
  return fact.category.trim().toLocaleLowerCase() === 'biometrics' && /^(height|weight)$/i.test(fact.label.trim());
}

function seriesFor(fact: HealthFact, facts: HealthFact[]): SeriesPoint[] {
  const currentMeasurement = parseMeasurement(fact.value);
  if (!currentMeasurement) return [];
  return facts
    .filter((item) => !isSetupMeasurement(item) && item.reviewState !== 'user_retracted' && item.label.trim().toLocaleLowerCase() === fact.label.trim().toLocaleLowerCase())
    .map((item) => ({ date: item.date, measurement: parseMeasurement(item.value) }))
    .filter((item): item is { date: string; measurement: { value: number; unit: string } } => item.measurement !== null && Boolean(parseHealthDate(item.date)))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.date === item.date && candidate.measurement.unit === item.measurement.unit) === index)
    .sort((a, b) => (parseHealthDate(a.date)?.getTime() ?? 0) - (parseHealthDate(b.date)?.getTime() ?? 0))
    .filter((item) => item.measurement.unit === currentMeasurement.unit)
    .map((item) => ({ date: item.date, value: item.measurement.value, unit: item.measurement.unit }));
}

function MiniBars({ points, accent, label }: { points: SeriesPoint[]; accent: string; label: string }) {
  const visible = points.slice(-7);
  const values = visible.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return <View accessibilityLabel={label} style={styles.miniChart}>
    {visible.map((point, index) => {
      const height = max === min ? 13 : 6 + ((point.value - min) / (max - min)) * 18;
      return <View key={`${point.date}-${index}`} style={[styles.miniBar, { height, backgroundColor: accent, opacity: index === visible.length - 1 ? 1 : .52 + index * .06 }]} />;
    })}
  </View>;
}

function SeriesReadout({ fact, points, accent }: { fact: HealthFact; points: SeriesPoint[]; accent: string }) {
  if (points.length < 2) return <View style={styles.baselineReadout}>
    <View style={styles.singlePointTrack}><View style={[styles.baselineDot, { backgroundColor: accent }]} /></View>
    <View style={styles.baselineCopy}><Text style={styles.baselineTitle}>First saved result</Text><Text style={styles.baselineNote}>Add another to compare over time</Text></View>
  </View>;
  const first = points[0];
  const latest = points[points.length - 1];
  const delta = latest.value - first.value;
  const decimals = Math.max((String(fact.value).match(/[.,](\d+)/)?.[1]?.length ?? 0), 0);
  const deltaLabel = `${delta > 0 ? '+' : ''}${delta.toFixed(Math.min(decimals, 2))}${latest.unit ? ` ${latest.unit}` : ''}`;
  const chartLabel = `${points.length} observed values, from ${first.value}${first.unit} to ${latest.value}${latest.unit}`;
  return <View style={styles.seriesReadout}>
    <View style={styles.seriesHeader}><Text style={styles.seriesTitle}>{points.length} dated results</Text></View>
    {points.length === 2 ? <View accessibilityLabel={chartLabel} style={styles.twoPointTrail}><View style={[styles.twoPointDot, { backgroundColor: accent }]} /><View style={styles.twoPointLine} /><View style={[styles.twoPointDot, { backgroundColor: accent }]} /></View> : <MiniBars points={points} accent={accent} label={chartLabel} />}
    <View style={styles.seriesFooter}>
      <View style={styles.seriesEndpoint}><Text style={styles.seriesEdge}>Earlier</Text><Text style={styles.seriesValue}>{first.value} {first.unit} · {shortDate(first.date)}</Text></View>
      <View style={[styles.seriesEndpoint, styles.seriesEndpointRight]}><Text style={styles.seriesEdge}>Latest</Text><Text style={styles.seriesValue}>{latest.value} {latest.unit} · {shortDate(latest.date)}</Text></View>
    </View>
    <Text style={styles.seriesDelta}>{deltaLabel} between results</Text>
  </View>;
}

function SectionHeading({ eyebrow, title, action, actionArrow = '↗', onAction }: { eyebrow: string; title: string; action?: string; actionArrow?: string; onAction?: () => void }) {
  return <View style={styles.sectionHeading}>
    <View><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.sectionTitle}>{title}</Text></View>
    {action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.sectionAction}><Text style={styles.sectionActionText}>{action}</Text><Text style={styles.sectionActionArrow}>{actionArrow}</Text></Pressable> : null}
  </View>;
}

function ExploreArtwork() {
  return <View style={styles.exploreArtworkFallback}><Orb size={31} /><Text style={styles.exploreFallbackGlyph}>FOR YOU</Text></View>;
}

function HomeVideoCard({ item, facts, treatments, onPlay }: {
  item: HealthFeedItem;
  facts: HealthFact[];
  treatments: TreatmentRecord[];
  onPlay: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const thumbnail = getYouTubeThumbnailForVideo(item.url, item.thumbnailUrl);
  const relevance = useMemo(() => buildHomeVideoRelevance(item, facts, treatments), [facts, item, treatments]);
  const relatedLabels = [...relevance.matchedFacts, ...relevance.matchedTreatments];
  const relevanceToggle = expanded
    ? 'Hide relevance details'
    : relevance.matchCount
      ? `Why this may be relevant · ${relevance.matchCount} saved matches`
      : 'Why this may be relevant';

  return <View style={styles.homeVideoCard}>
    <GlassMaterial tone="dark" radius={21} intensity={36} />
    <Pressable accessibilityRole="button" accessibilityLabel={'Play video: ' + item.title} onPress={onPlay} style={styles.homeVideoMedia}>
      {thumbnail && !thumbnailFailed ? <Image key={thumbnail} accessibilityLabel={'YouTube thumbnail for ' + item.title} source={{ uri: thumbnail }} resizeMode="cover" onError={() => setThumbnailFailed(true)} style={styles.homeVideoImage} /> : <VideoArtworkFallback title={item.title} topic={item.topic} />}
      <View pointerEvents="none" style={styles.homeVideoScrim} />
      <View pointerEvents="none" style={styles.homeVideoPlay}><Text style={styles.homeVideoPlayText}>▶</Text></View>
      <Text pointerEvents="none" style={styles.homeVideoBadge}>YOUTUBE</Text>
    </Pressable>
    <View style={styles.homeVideoCopy}>
      <View style={styles.homeVideoTopicRow}><Text numberOfLines={1} style={styles.homeVideoTopic}>{item.topic}</Text><Text style={styles.homeVideoType}>VIDEO</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={'Play video: ' + item.title} onPress={onPlay}>
        <Text numberOfLines={3} style={styles.homeVideoTitle}>{item.title}</Text>
      </Pressable>
      <Text style={styles.homeVideoMeta}>{item.publisher || 'YouTube'} · Latest search {shortDate(item.retrievedAt)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} relevance details for ${item.title}`} accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.homeVideoMapToggle}>
        <Text style={styles.homeVideoMapToggleText}>{relevanceToggle}</Text>
        <Text style={styles.homeVideoMapChevron}>{expanded ? '⌃' : '⌄'}</Text>
      </Pressable>
      {expanded ? <View style={styles.homeVideoMap}>
        <Text style={styles.homeVideoMapLabel}>HEALTH AREA USED FOR SEARCH</Text>
        <Text style={styles.homeVideoMapValue}>{relevance.searchTopic}</Text>
        <Text style={styles.homeVideoMapLabel}>RELATED SAVED CONTEXT</Text>
        <Text style={styles.homeVideoMapValue}>{relatedLabels.length ? relatedLabels.join(' · ') : 'This video matched the selected area. No saved health detail was needed to show it.'}</Text>
        <Text style={styles.homeVideoPrivacy}>The public search used the selected topic only. Profile matches stay on this device.</Text>
        <Pressable accessibilityRole="button" onPress={onPlay} style={styles.homeVideoMapPlay}>
          <Text style={styles.homeVideoMapPlayText}>Play in Nura</Text>
          <Text style={styles.homeVideoMapPlayArrow}>▶</Text>
        </Pressable>
      </View> : null}
    </View>
  </View>;
}

function factForTopic(topic: HealthTopic, facts: HealthFact[]) {
  const escaped = topic.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'i');
  return facts.filter((fact) => !isSetupMeasurement(fact) && !fact.validUntil && (pattern.test(fact.label) || pattern.test(fact.category)));
}

export default function HomeOverview() {
  const { name, birthday, facts, assets, treatments, visits, topics, savedQuestions, agentMessages, askConversations, registryBriefs, setupProgress, storageError, ready, feedItems } = useNura();
  const recentAskConversation = askConversations[0] ?? null;
  const recentAskQuestion = recentAskConversation ? [...agentMessages].reverse().find((message) => message.conversationId === recentAskConversation.id && message.role === 'user')?.text : '';
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showAllMarkers, setShowAllMarkers] = useState(false);
  const videoPlaySequence = useRef(0);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  const activeFacts = useMemo(() => facts.filter((fact) => !isSetupMeasurement(fact) && !fact.validUntil && fact.reviewState !== 'user_retracted')
    .slice().sort((a, b) => (parseHealthDate(b.date)?.getTime() ?? 0) - (parseHealthDate(a.date)?.getTime() ?? 0)), [facts]);
  const markerSnapshots = useMemo(() => selectHomeMarkerSnapshots(activeFacts), [activeFacts]);
  const visibleMarkerSnapshots = showAllMarkers ? markerSnapshots : markerSnapshots.slice(0, HOME_MARKER_PREVIEW_COUNT);
  const latestFact = activeFacts[0];
  const spotlightFact = activeFacts.find((fact) => Boolean(parseMeasurement(fact.value))) ?? latestFact;
  const healthSources = assets.filter((asset) => Boolean(asset.serverSourceId));
  const reviewQueue = assets.filter((asset) => !asset.serverSourceId && (asset.purpose === 'insurance' ? setupProgress.insurance !== 'deferred' : setupProgress.healthRecords !== 'deferred'));
  const deferredReviewSections = [
    ...(setupProgress.healthRecords === 'deferred' ? [{ purpose: 'medical' as const, title: 'Health records', detail: 'Unreviewed suggestions remain with their source files. They are not in your profile.' }] : []),
    ...(setupProgress.insurance === 'deferred' ? [{ purpose: 'insurance' as const, title: 'Insurance', detail: 'Policy terms remain unreviewed and have not been added to your profile.' }] : []),
  ];
  const latestBrief = registryBriefs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const briefTopic = latestBrief ? topics.find((topic) => topic.id === latestBrief.topicId) : undefined;
  const openInsight = () => briefTopic ? router.push({ pathname: '/registry', params: { topicId: briefTopic.id } }) : router.push('/registry');
  const carePreviewItems = useMemo(() => buildHomeCarePreview(visits), [visits]);
  const currentTreatment = treatments.find((item) => item.status === 'current');
  const homeVideos = useMemo(() => selectRecentHomeVideos(feedItems), [feedItems]);
  const contextFact = firstUserContextFact(activeFacts, spotlightFact?.id);
  const careCount = treatments.filter((item) => item.status === 'current').length
    + visits.filter((visit) => visit.status === 'upcoming').length
    + visits.reduce((count, visit) => count + (visit.followUpActions ?? []).filter((action) => action.status === 'open').length, 0);

  const isEmpty = activeFacts.length === 0 && assets.length === 0 && treatments.length === 0 && visits.length === 0;
  const latestSeries = spotlightFact ? seriesFor(spotlightFact, facts) : [];
  const goToFact = (factId: string) => router.push({ pathname: '/(tabs)/health', params: { focusId: factId } });
  const goToTopic = (topic: HealthTopic) => router.push({ pathname: '/(tabs)/health', params: { focusId: topic.id } });
  const playHomeVideo = (item: HealthFeedItem) => {
    const videoId = getYouTubeVideoId(item.url);
    if (!videoId) return;
    videoPlaySequence.current += 1;
    router.push({ pathname: '/(tabs)/services', params: { videoId, playToken: videoPlaySequence.current.toString() + '-' + item.id } });
  };

  return <View style={styles.page}>
    <Atmosphere />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandOrb}><GlassMaterial tone="dark" radius={24} intensity={34} /><Orb size={25} /></View>
          <Text style={styles.wordmark}>Nura</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open your profile" onPress={() => router.push('/(tabs)/profile')} style={styles.profileButton}>
          <GlassMaterial tone="dark" radius={21} intensity={38} /><Text style={styles.profileInitial}>{name.trim().slice(0, 1).toUpperCase() || '○'}</Text>
        </Pressable>
      </View>

      {storageError ? <View style={styles.storageNotice}><Text style={styles.storageTitle}>Some profile changes may not have saved</Text><Text style={styles.storageBody}>Your information may be out of date. Try again before you leave this screen.</Text></View> : null}
      {!ready ? <View style={styles.storageNotice}><Text style={styles.storageBody}>Opening your health profile…</Text></View> : null}

      <View style={styles.greetingRow}>
        <Text style={styles.greetingTime}>{timeGreeting}</Text>
        <Text style={styles.greeting}>Your health,{'\n'}in context</Text>
        <Text style={styles.heroSubtitle}>Clearer insights. A healthier you.</Text>
      </View>

      {reviewQueue.length ? <View style={styles.section}>
        <SectionHeading eyebrow="NEXT FOR YOU" title={reviewQueue.length === 1 ? 'One source is ready.' : `${reviewQueue.length} sources are ready.`} action="View all" onAction={() => router.push('/(tabs)/health')} />
        {reviewQueue.slice(0, 1).map((asset) => { const purpose = asset.purpose ?? 'medical'; return <TapCard key={asset.id} reducedMotion={reducedMotion} onPress={() => router.push({ pathname: '/review', params: { purpose, assetId: asset.id } })} label={`Review ${documentDisplayName(asset, facts)}`} style={styles.reviewCard}>
          <View style={styles.reviewIcon}><Text style={styles.reviewIconText}>▤</Text></View><View style={styles.reviewCopy}><Text style={styles.reviewTitle}>{documentDisplayName(asset, facts)}</Text><Text style={styles.reviewDetail}>{purpose === 'insurance' ? 'Policy' : 'Health report'} · Ready to review</Text></View><View style={styles.reviewAction}><Text style={styles.reviewActionText}>Review</Text><Text style={styles.reviewActionArrow}>→</Text></View>
        </TapCard>; })}
      </View> : null}

      {deferredReviewSections.length ? <View style={styles.section}>
        <SectionHeading eyebrow="LEFT FOR LATER" title="Source reviews to finish" />
        {deferredReviewSections.map((item) => <TapCard key={item.purpose} reducedMotion={reducedMotion} onPress={() => router.push({ pathname: '/review', params: { purpose: item.purpose } })} label={`Review pending ${item.title.toLocaleLowerCase()}`} style={styles.reviewCard}>
          <View style={styles.reviewIcon}><Text style={styles.reviewIconText}>↻</Text></View><View style={styles.reviewCopy}><Text style={styles.reviewTitle}>{item.title}</Text><Text style={styles.reviewDetail}>{item.detail}</Text></View><View style={styles.reviewAction}><Text style={styles.reviewActionText}>Review</Text><Text style={styles.reviewActionArrow}>→</Text></View>
        </TapCard>)}
      </View> : null}

      {latestBrief && briefTopic ? <View style={styles.section}>
        <SectionHeading eyebrow="NURA'S SAVED VIEW" title={briefTopic.label} action="Open" onAction={openInsight} />
        <TapCard reducedMotion={reducedMotion} onPress={openInsight} label={`Open Nura's saved ${briefTopic.label} summary with cited sources`} style={styles.insightCard}>
          <View style={styles.insightTop}><View style={styles.insightOrb}><Orb size={23} /></View><View style={styles.insightMeta}><Text style={styles.insightLabel}>SAVED SUMMARY</Text><Text style={styles.insightSource}>{latestBrief.citations.length} cited {latestBrief.citations.length === 1 ? 'source' : 'sources'}{latestBrief.unknowns.length ? ` · ${latestBrief.unknowns.length} open question${latestBrief.unknowns.length === 1 ? '' : 's'}` : ''}</Text></View><Text style={styles.insightArrow}>↗</Text></View>
          <Text numberOfLines={3} style={styles.insightText}>{registryBriefDisplayText(latestBrief.answer).replace(/\n+/g, ' ')}</Text>
          <Text style={styles.insightFoot}>Saved {new Date(latestBrief.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · check source status in Registry</Text>
        </TapCard>
      </View> : null}

      {markerSnapshots.length > 0 ? <View style={styles.spotlightSection}>
        <SectionHeading eyebrow="" title="Latest markers" action={markerSnapshots.length > HOME_MARKER_PREVIEW_COUNT ? (showAllMarkers ? `Show latest ${HOME_MARKER_PREVIEW_COUNT}` : `See all ${markerSnapshots.length}`) : 'All results'} actionArrow={markerSnapshots.length > HOME_MARKER_PREVIEW_COUNT ? (showAllMarkers ? '↑' : '↓') : '↗'} onAction={() => markerSnapshots.length > HOME_MARKER_PREVIEW_COUNT ? setShowAllMarkers((value) => !value) : router.push('/(tabs)/health')} />
        <View style={styles.markerGrid}>
          {visibleMarkerSnapshots.map((fact) => {
            const displayMeasurement = fact.value.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*(.*)$/);
            const markerIdentity = canonicalHealthMarker(fact.label);
            const unspecifiedCholesterol = markerIdentity === 'cholesterol-unspecified';
            const markerLabel = unspecifiedCholesterol ? 'Cholesterol' : fact.label;
            const reportRange = unspecifiedCholesterol ? undefined : fact.note?.match(/(?:reference|typical) range\s*:?\s*([^·]+)/i)?.[1]?.trim();
            const rangeGuide = getHealthMarkerRangeGuide({ label: fact.label, value: fact.value, birthday, eventDate: fact.date });
            const unitNeedsReview = healthMarkerUnitNeedsReview(fact.label, displayMeasurement?.[2] ?? '');
            const valueNeedsReview = healthMarkerValueNeedsReview(fact.label, fact.value);
            const rangeNote = unspecifiedCholesterol
              ? (displayMeasurement?.[2]?.trim() ? 'Type not specified · check the range on your report' : 'Type and unit not recorded · check the original report')
              : unitNeedsReview
                ? `Check the original report for the ${fact.label} unit before comparing this result.`
                : valueNeedsReview
                  ? 'This value looks unusual for its unit · check the original report before interpreting it.'
                : !displayMeasurement?.[2]?.trim() && displayMeasurement
                  ? 'Unit not recorded · check the original report'
                  : reportRange ? 'Report range · ' + reportRange : 'No common guide available for this marker.';
            return <TapCard key={fact.id} reducedMotion={reducedMotion} onPress={() => goToFact(fact.id)} label={'Open ' + markerLabel + ', ' + fact.value + ', dated ' + fact.date + ', from ' + fact.source + (rangeGuide?.status ? ', ' + rangeGuide.status.toLocaleLowerCase() : unitNeedsReview ? ', check unit' : valueNeedsReview ? ', check value' : '')} material={false} style={[healthMarkerCardStyles.card, { width: '100%' }]}>
              <HealthMarkerCardContent label={markerLabel} value={fact.value} date={<DateLabel value={fact.date} />} source={fact.source} markerId={fact.id} guide={rangeGuide} unitNeedsReview={unitNeedsReview} valueNeedsReview={valueNeedsReview} rangeNotice={rangeNote} reportRange={reportRange} />
            </TapCard>;
          })}
        </View>
      </View> : latestFact ? <View style={styles.spotlightSection}>
        <SectionHeading eyebrow="LATEST IN YOUR PROFILE" title={parseMeasurement(spotlightFact?.value ?? latestFact.value) ? 'Your latest reading' : 'Your latest update'} action="All details" onAction={() => router.push('/(tabs)/health')} />
        <TapCard reducedMotion={reducedMotion} onPress={() => goToFact(spotlightFact?.id ?? latestFact.id)} label={`Open ${spotlightFact?.label ?? latestFact.label}, ${spotlightFact?.value ?? latestFact.value}, from ${spotlightFact?.source ?? latestFact.source}`} style={styles.signalCard}>
          <View style={styles.signalCardTop}><View style={styles.signalAccent}><View style={styles.signalAccentCore} /></View><Text style={styles.signalSourceLabel}>{spotlightFact?.category?.trim().toLocaleLowerCase() === 'measurement' ? 'SAVED RESULT' : (spotlightFact?.category || 'SAVED HEALTH DETAIL').toLocaleUpperCase()}</Text><Text style={styles.signalCardArrow}>↗</Text></View>
          <Text style={styles.signalName} numberOfLines={2}>{spotlightFact?.label ?? latestFact.label}</Text>
          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={.78} style={[styles.signalValue, !parseMeasurement(spotlightFact?.value ?? latestFact.value) && styles.signalNarrative]}>{spotlightFact?.value ?? latestFact.value}</Text>
          <View style={styles.signalMeta}><DateLabel value={spotlightFact?.date ?? latestFact.date} /><Text style={styles.signalSource} numberOfLines={1}>{spotlightFact?.source ?? latestFact.source}</Text></View>
          {latestSeries.length ? <SeriesReadout fact={spotlightFact ?? latestFact} points={latestSeries} accent="#9FD8C7" /> : null}
        </TapCard>
      </View> : isEmpty ? <TapCard reducedMotion={reducedMotion} onPress={() => router.push('/intake')} label="Add your first health record or detail" style={styles.startCard}>
        <View style={styles.startGlyph}><Text style={styles.startGlyphText}>＋</Text></View><View style={styles.startCopy}><Text style={styles.startTitle}>Start with one detail</Text><Text style={styles.startDescription}>Add a reading or a report to build your profile.</Text></View><Text style={styles.metricArrow}>↗</Text>
      </TapCard> : null}

      <View style={styles.quickActions}>
        <TapCard reducedMotion={reducedMotion} onPress={() => router.push({ pathname: '/ask', params: { profileContext: 'full', context: 'your complete saved health history' } })} label="Ask Nura about your saved health history" style={styles.quickPrimary} tone="light">
          <View style={styles.quickAskIcon}><Text style={styles.quickAskGlyph}>✦</Text></View><View style={styles.quickCopy}><Text style={styles.quickTitle}>Ask Nura</Text><Text style={styles.quickSub}>Ask about records or a source</Text></View><Text style={styles.quickArrow}>↗</Text>
        </TapCard>
        <TapCard reducedMotion={reducedMotion} onPress={() => router.push('/intake')} label="Add a health record" style={styles.quickSecondary}>
          <View style={[styles.quickIcon, styles.quickAddIcon]}><Text style={styles.quickPlus}>＋</Text></View><View style={styles.quickCopy}><Text style={[styles.quickTitle, styles.quickTitleLight]}>Add a record</Text><Text style={[styles.quickSub, styles.quickSubLight]}>Report, result or note</Text></View><Text style={[styles.quickArrow, styles.quickArrowLight]}>↗</Text>
        </TapCard>
      </View>

      {homeVideos.length ? <View style={styles.homeVideoSection}>
        <SectionHeading eyebrow="FROM YOUR LATEST SEARCH" title="Worth a closer look." action="Explore all" onAction={() => router.push('/(tabs)/services')} />
        <View style={styles.homeVideoList}>{homeVideos.map((item) => <HomeVideoCard key={`${item.id}:${item.url}:${item.thumbnailUrl ?? ''}`} item={item} facts={facts} treatments={treatments} onPlay={() => playHomeVideo(item)} />)}</View>
      </View> : <TapCard reducedMotion={reducedMotion} onPress={() => router.push('/(tabs)/services')} label="Explore trusted articles and videos" style={styles.exploreEntry}>
        <View style={styles.exploreArt}><ExploreArtwork /></View>
        <View style={styles.exploreEntryCopy}><Text style={styles.exploreEyebrow}>YOUR HEALTH LIBRARY</Text><Text style={styles.exploreEntryTitle}>Explore</Text><Text numberOfLines={2} style={styles.exploreEntryDetail}>Articles and videos for your health areas</Text></View>
        <View style={styles.askEntryArrow}><Text style={styles.askEntryArrowText}>›</Text></View>
      </TapCard>}

      {activeFacts.length || healthSources.length || careCount ? <View style={styles.profileStats} accessibilityLabel={`${activeFacts.length} saved health details, ${healthSources.length} linked sources, ${careCount} care items`}>
        <GlassMaterial tone="dark" radius={17} intensity={32} />
        <Text style={styles.profileStatsLabel}>YOUR HEALTH AT A GLANCE</Text>
        <View style={styles.profileStatsRow}>
          <View style={styles.profileStat}><Text style={[styles.profileStatValue, { color: '#B5DDED' }]}>{String(activeFacts.length).padStart(2, '0')}</Text><Text style={styles.profileStatLabel}>DETAILS</Text></View>
          <View style={styles.profileStatDivider} />
          <View style={styles.profileStat}><Text style={[styles.profileStatValue, { color: '#A6E1CC' }]}>{String(healthSources.length).padStart(2, '0')}</Text><Text style={styles.profileStatLabel}>SOURCES</Text></View>
          <View style={styles.profileStatDivider} />
          <View style={styles.profileStat}><Text style={[styles.profileStatValue, { color: '#E8B18E' }]}>{String(careCount).padStart(2, '0')}</Text><Text style={styles.profileStatLabel}>CARE</Text></View>
        </View>
      </View> : null}

      {carePreviewItems.length ? <View style={styles.section}>
        <SectionHeading eyebrow="NEXT IN YOUR CARE" title={carePreviewItems.length === 1 ? 'Coming up' : 'Coming up next'} action="Care plan" onAction={() => router.push('/visits')} />
        <View style={styles.careCard}>
          <GlassMaterial tone="dark" radius={19} intensity={36} />
          {carePreviewItems.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open ${item.kind.toLocaleLowerCase()} ${item.title}, ${item.detail}`} onPress={() => router.push({ pathname: '/visits', params: { visitId: item.visitId } })} style={[styles.careRow, index > 0 && styles.careRowNext]}>
            <View style={[styles.careDate, item.kind === 'FOLLOW-UP' && styles.careDateFollowUp]}><Text style={styles.careDateMain}>{shortDate(item.date)}</Text><Text style={styles.careDateKind}>{item.kind}</Text></View>
            <View style={styles.careCopy}><Text numberOfLines={1} style={styles.careTitle}>{item.title}</Text><Text numberOfLines={2} style={styles.careDetail}>{item.detail}</Text></View>
            <Text style={styles.careArrow}>›</Text>
          </Pressable>)}
        </View>
      </View> : currentTreatment ? <View style={styles.section}>
        <SectionHeading eyebrow="YOUR CURRENT CARE" title="Treatment you saved" action="Open" onAction={() => router.push({ pathname: '/treatment', params: { treatmentId: currentTreatment.id } })} />
        <TapCard reducedMotion={reducedMotion} onPress={() => router.push({ pathname: '/treatment', params: { treatmentId: currentTreatment.id } })} label={`Open your current treatment, ${currentTreatment.name}`} style={styles.contextCard}>
          <View style={styles.contextGlyph}><Text style={styles.contextGlyphText}>＋</Text></View><View style={styles.contextCopy}><Text numberOfLines={1} style={styles.contextTitle}>{currentTreatment.name}</Text><Text numberOfLines={2} style={styles.contextDetail}>{[currentTreatment.dose, currentTreatment.schedule].filter(Boolean).join(' · ') || 'Details not provided'}</Text><Text numberOfLines={1} style={styles.contextMeta}>{currentTreatment.source || 'Saved in your treatment history'}</Text></View><Text style={styles.careArrow}>›</Text>
        </TapCard>
      </View> : null}

      {contextFact ? <View style={styles.section}>
        <SectionHeading eyebrow="YOUR CONTEXT" title="In your own words" />
        <TapCard reducedMotion={reducedMotion} onPress={() => goToFact(contextFact.id)} label={`Open your note, ${contextFact.label}, ${contextFact.value}`} style={styles.contextCard}>
          <View style={[styles.contextGlyph, styles.contextGlyphMint]}><Text style={[styles.contextGlyphText, styles.contextGlyphTextMint]}>✳</Text></View><View style={styles.contextCopy}><Text numberOfLines={1} style={styles.contextTitle}>{contextFact.label}</Text><Text numberOfLines={2} style={styles.contextDetail}>{contextFact.value}</Text><Text numberOfLines={1} style={styles.contextMeta}>Written by you · <DateLabel value={contextFact.date} /></Text></View><Text style={styles.careArrow}>›</Text>
        </TapCard>
      </View> : null}

      {topics.length ? <View style={styles.section}>
        <SectionHeading eyebrow="AREAS YOU FOLLOW" title="Your health areas" action="Edit" onAction={() => router.push('/setup')} />
        <View style={styles.topicGrid}>{topics.slice(0, 6).map((topic, index) => {
          const tint = areaColors[index % areaColors.length];
          const count = factForTopic(topic, facts).length;
          return <TapCard key={topic.id} reducedMotion={reducedMotion} onPress={() => goToTopic(topic)} label={`Open ${topic.label}, ${count} saved details`} style={[styles.topicCard, { borderColor: tint.line + '55' }]}>
            <View style={styles.topicTop}><View style={[styles.topicOrb, { backgroundColor: tint.fill, borderColor: tint.line + '70' }]}><View style={[styles.topicOrbCore, { backgroundColor: tint.line }]} /></View>{count > 0 ? <Text style={[styles.topicCount, { color: tint.line }]}>{String(count).padStart(2, '0')}</Text> : null}</View>
            <Text numberOfLines={1} style={styles.topicName}>{topic.label}</Text><Text style={styles.topicHint}>{count === 0 ? 'Add your first detail' : count === 1 ? '1 saved detail' : `${count} saved details`}</Text>
          </TapCard>;
        })}</View>
      </View> : null}

      <TapCard reducedMotion={reducedMotion} onPress={() => router.push('/(tabs)/health')} label="Open your full health timeline" style={styles.timelineFeature}>
        <View style={styles.timelineFeatureGlyph}><Text style={styles.timelineFeatureGlyphText}>◷</Text></View><View style={styles.timelineFeatureCopy}><Text style={styles.timelineFeatureTitle}>Full health timeline</Text><Text style={styles.timelineFeatureDetail}>Reports, notes and care in date order</Text></View><View style={styles.timelineFeatureAction}><Text style={styles.timelineFeatureActionText}>Open</Text><Text style={styles.timelineFeatureArrow}>↗</Text></View>
      </TapCard>

      {recentAskConversation || savedQuestions.length > 0 ? <TapCard reducedMotion={reducedMotion} onPress={() => recentAskConversation ? router.push({ pathname: '/ask', params: { conversationId: recentAskConversation.id } }) : router.push({ pathname: '/ask', params: { profileContext: 'full', context: 'your complete saved health history' } })} label="Continue your recent Ask Nura conversation" style={styles.questionCard}>
        <Text style={styles.eyebrow}>ASK NURA · RECENT CHAT</Text><Text numberOfLines={2} style={styles.questionText}>{recentAskConversation?.title ?? savedQuestions[0]}</Text><Text numberOfLines={1} style={styles.questionAction}>{recentAskQuestion || 'Continue conversation'}&nbsp; ↗</Text>
      </TapCard> : null}

    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: brandScenes.atmosphere.base },
  content: { paddingHorizontal: 18, paddingTop: 45, paddingBottom: 112, maxWidth: 560, width: '100%', alignSelf: 'center' },
  pressable: { minWidth: 0, overflow: 'hidden', borderRadius: 20, justifyContent: 'center' },
  topbar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandOrb: { position: 'relative', width: 43, height: 43, borderRadius: 23, backgroundColor: 'rgba(116,84,135,.22)', borderWidth: 1.5, borderColor: 'rgba(255,248,240,.85)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: '#E8B18E', shadowOpacity: .42, shadowRadius: 15, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  wordmark: { color: ink, fontFamily: 'serif', fontSize: 25, lineHeight: 29, fontWeight: '500', letterSpacing: -.5 },
  tagline: { color: muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.3, marginTop: 2 },
  profileButton: { position: 'relative', width: 41, height: 41, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,239,224,.45)', backgroundColor: 'rgba(255,246,236,.08)', ...shadow },
  profileInitial: { color: ink, fontSize: 15, fontWeight: '700' },
  storageNotice: { padding: 12, borderRadius: 14, backgroundColor: 'rgba(243,181,98,.14)', borderWidth: 1, borderColor: 'rgba(243,181,98,.36)', marginBottom: 12 },
  storageTitle: { color: '#FFE2B5', fontWeight: '700', fontSize: 12 },
  storageBody: { color: muted, fontSize: 11, lineHeight: 16 },
  greetingRow: { alignItems: 'flex-start', gap: 2, marginBottom: 24, paddingHorizontal: 2 },
  askEntry: { minHeight: 100, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(242,189,157,.44)', backgroundColor: 'rgba(74,37,47,.46)', marginTop: 2, marginBottom: 15 },
  askEntryOrb: { width: 56, height: 56, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,246,236,.09)', borderWidth: 1, borderColor: 'rgba(255,239,224,.32)' },
  askEntryCopy: { flex: 1, minWidth: 0 },
  askEntryEyebrow: { color: '#B5DDED', fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 1.15, marginBottom: 4 },
  askEntryTitle: { color: ink, fontSize: 17, lineHeight: 21, fontWeight: '600' },
  askEntryDetail: { color: muted, fontSize: 11, lineHeight: 15, marginTop: 4 },
  askEntryArrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(242,189,157,.12)' },
  askEntryArrowText: { color: '#F2BD9D', fontSize: 22, lineHeight: 24, fontWeight: '400' },
  greetingTime: { color: muted, fontSize: 13, lineHeight: 18 },
  greeting: { color: ink, fontFamily: 'serif', fontSize: 35, lineHeight: 39, fontWeight: '500', letterSpacing: -1.1, marginTop: 1 },
  heroSubtitle: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  exploreEntry: { minHeight: 108, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(242,189,157,.34)', backgroundColor: 'rgba(255,246,236,.075)', marginBottom: 16 },
  exploreArt: { position: 'relative', width: 120, height: 68, flexShrink: 0, borderRadius: 13, overflow: 'hidden', backgroundColor: '#513831', borderWidth: 1, borderColor: 'rgba(255,239,224,.30)', alignItems: 'center', justifyContent: 'center' },
  exploreImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  exploreArtworkFallback: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(127,93,150,.24)' },
  exploreFallbackGlyph: { color: '#FFF8F0', fontSize: 8, fontWeight: '800', letterSpacing: .75, marginTop: 2 },
  exploreEntryCopy: { flex: 1, minWidth: 0 },
  exploreEyebrow: { color: '#E8B18E', fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 3 },
  exploreEntryTitle: { color: ink, fontSize: 17, lineHeight: 21, fontWeight: '600' },
  exploreEntryDetail: { color: muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  homeVideoSection: { marginBottom: 22 },
  homeVideoList: { gap: 13 },
  homeVideoCard: { position: 'relative', overflow: 'hidden', borderRadius: 21, borderWidth: 1, borderColor: 'rgba(242,189,157,.34)', backgroundColor: 'rgba(255,246,236,.075)' },
  homeVideoMedia: { position: 'relative', width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', backgroundColor: '#35241F', alignItems: 'center', justifyContent: 'center' },
  homeVideoImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  homeVideoFallback: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#513831' },
  homeVideoFallbackText: { color: ink, fontSize: 8, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  homeVideoScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,13,12,.13)' },
  homeVideoPlay: { width: 48, height: 48, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(255,248,240,.82)', backgroundColor: 'rgba(31,23,20,.72)', alignItems: 'center', justifyContent: 'center' },
  homeVideoPlayText: { color: ink, fontSize: 15, marginLeft: 2 },
  homeVideoBadge: { position: 'absolute', right: 10, bottom: 9, overflow: 'hidden', color: ink, backgroundColor: 'rgba(26,19,18,.78)', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, fontSize: 8, fontWeight: '800', letterSpacing: .85 },
  homeVideoCopy: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 9 },
  homeVideoTopicRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  homeVideoTopic: { flex: 1, color: '#A6E1CC', fontSize: 9, fontWeight: '800', letterSpacing: .75, textTransform: 'uppercase' },
  homeVideoType: { color: '#E8B18E', fontSize: 8, fontWeight: '800', letterSpacing: .8 },
  homeVideoTitle: { color: ink, fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -.3, marginTop: 6 },
  homeVideoMeta: { color: quiet, fontSize: 10, lineHeight: 14, marginTop: 5 },
  homeVideoMapToggle: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, borderTopWidth: 1, borderTopColor: 'rgba(255,239,224,.14)' },
  homeVideoMapToggleText: { flex: 1, color: '#B5DDED', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  homeVideoMapChevron: { color: '#B5DDED', fontSize: 16, paddingHorizontal: 5 },
  homeVideoMap: { padding: 11, marginBottom: 5, borderRadius: 13, backgroundColor: 'rgba(255,241,225,.075)', borderWidth: 1, borderColor: 'rgba(255,226,205,.16)' },
  homeVideoMapLabel: { color: '#E8B18E', fontSize: 8, fontWeight: '800', letterSpacing: .85, marginTop: 2 },
  homeVideoMapValue: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: 8 },
  homeVideoPrivacy: { color: quiet, fontSize: 9, lineHeight: 13, marginTop: 1 },
  homeVideoMapPlay: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8, borderRadius: 12, backgroundColor: 'rgba(169,212,227,.14)' },
  homeVideoMapPlayText: { color: '#B5DDED', fontSize: 10, fontWeight: '800' },
  homeVideoMapPlayArrow: { color: '#B5DDED', fontSize: 12 },
  eyebrow: { color: '#E8B18E', fontSize: 10, fontWeight: '800', letterSpacing: 1.25 },
  profileStats: { position: 'relative', minHeight: 78, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 10, borderRadius: 18, backgroundColor: 'rgba(255,246,236,.055)', marginBottom: 22, overflow: 'hidden' },
  profileStatsLabel: { color: quiet, fontSize: 8, lineHeight: 11, fontWeight: '800', letterSpacing: 1 },
  profileStatsRow: { flex: 1, flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  profileStat: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 5 },
  profileStatValue: { fontSize: 18, fontWeight: '800' },
  profileStatLabel: { color: 'rgba(255,248,240,.75)', fontSize: 10, fontWeight: '800', letterSpacing: .75 },
  profileStatDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,239,224,.25)' },
  spotlightSection: { marginBottom: 21 },
  section: { marginBottom: 22 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10, paddingHorizontal: 1 },
  sectionTitle: { color: ink, fontSize: 19, lineHeight: 25, fontWeight: '600', letterSpacing: -.35, marginTop: 0 },
  markerGrid: { flexDirection: 'column', rowGap: 10 },
  markerCard: { minHeight: 154, justifyContent: 'flex-start', paddingHorizontal: 16, paddingVertical: 15, borderRadius: 21, borderWidth: 1, backgroundColor: 'rgba(67,42,35,.48)' },
  markerCardGuided: { minHeight: 232 },
  markerContent: { width: '100%' },
  markerCardTop: { flexDirection: 'row', alignItems: 'center', gap: 7, width: '100%' },
  markerDot: { width: 8, height: 8, borderRadius: 5, flexShrink: 0 },
  markerLabel: { flex: 1, color: ink, fontSize: 15, fontWeight: '700' },
  markerOpen: { color: '#B5DDED', fontSize: 12, fontWeight: '700' },
  markerValueRow: { width: '100%', minHeight: 48, flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 5 },
  markerValue: { flexShrink: 1, color: ink, fontSize: 38, lineHeight: 46, fontWeight: '600', letterSpacing: -.9 },
  markerUnit: { flexShrink: 1, color: muted, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  markerNarrative: { fontSize: 20, lineHeight: 25 },
  markerMeta: { width: '100%', color: quiet, fontSize: 13, lineHeight: 18, marginTop: 0 },
  markerRangeMissing: { color: '#D0C2B7', fontSize: 12, lineHeight: 17, marginTop: 4 },
  markerFooter: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 11 },
  markerSource: { flex: 1, color: quiet, fontSize: 11, lineHeight: 15 },
  markerReportRange: { maxWidth: '58%', color: '#E8B18E', fontSize: 9, lineHeight: 13, fontWeight: '700' },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 3 },
  sectionActionText: { color: '#A9D4E3', fontSize: 11, fontWeight: '700' },
  sectionActionArrow: { color: '#A9D4E3', fontSize: 13 },
  signalCard: { padding: 17, borderRadius: 19, backgroundColor: 'rgba(255,246,236,.075)', ...shadow },
  signalCardTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  signalAccent: { width: 19, height: 19, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(159,216,199,.55)', backgroundColor: 'rgba(159,216,199,.14)' },
  signalAccentCore: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#9FD8C7' },
  signalSourceLabel: { color: '#B6E7D7', fontSize: 10, flex: 1, fontWeight: '800', letterSpacing: .8 },
  signalCardArrow: { color: '#B5DDED', fontSize: 15 },
  signalName: { color: ink, fontSize: 16, lineHeight: 21, fontWeight: '700', marginTop: 10 },
  signalValue: { color: ink, fontSize: 32, lineHeight: 38, fontWeight: '600', letterSpacing: -.8, marginTop: 2 },
  signalNarrative: { maxWidth: 300, fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: 0 },
  signalMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  signalSource: { flex: 1, minWidth: 0, color: muted, fontSize: 11 },
  metricArrow: { color: '#B5DDED', fontSize: 15 },
  dateLabel: { color: quiet, fontSize: 11, fontWeight: '700', flexShrink: 0 },
  miniChart: { height: 44, flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginTop: 8, marginBottom: 4 },
  miniBar: { width: 8, borderRadius: 4 },
  twoPointTrail: { height: 44, flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4, paddingHorizontal: 5 },
  twoPointDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: 'rgba(255,248,240,.8)' },
  twoPointLine: { flex: 1, height: 2, marginHorizontal: 5, borderRadius: 2, backgroundColor: 'rgba(159,216,199,.45)' },
  baselineReadout: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 13, paddingTop: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,239,224,.12)' },
  singlePointTrack: { width: 37, height: 20, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,239,224,.3)' },
  baselineDot: { width: 9, height: 9, borderRadius: 5, shadowColor: '#FFFFFF', shadowOpacity: .45, shadowRadius: 5 },
  baselineCopy: { flex: 1, minWidth: 0 },
  baselineTitle: { color: muted, fontSize: 9, fontWeight: '800' },
  baselineNote: { color: quiet, fontSize: 9, marginTop: 3 },
  seriesReadout: { minWidth: 0, marginTop: 12, paddingTop: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,239,224,.12)' },
  seriesHeader: { flexDirection: 'row', alignItems: 'center' },
  seriesTitle: { color: muted, fontSize: 11, fontWeight: '800' },
  seriesFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginTop: 7 },
  seriesEndpoint: { flex: 1, minWidth: 0 },
  seriesEndpointRight: { alignItems: 'flex-end' },
  seriesEdge: { color: muted, fontSize: 11, fontWeight: '700' },
  seriesValue: { color: ink, fontSize: 11, lineHeight: 15, fontWeight: '600', marginTop: 3 },
  seriesDelta: { color: muted, alignSelf: 'center', fontSize: 11, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  startCard: { minHeight: 85, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,239,224,.27)', backgroundColor: 'rgba(255,246,236,.07)', marginBottom: 21 },
  startGlyph: { width: 42, height: 42, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(169,212,227,.16)', borderWidth: 1, borderColor: 'rgba(169,212,227,.43)' },
  startGlyphText: { color: '#B5DDED', fontSize: 22, lineHeight: 25 },
  startCopy: { flex: 1, minWidth: 0 },
  startTitle: { color: ink, fontSize: 12, fontWeight: '700' },
  startDescription: { color: muted, fontSize: 9, lineHeight: 13, marginTop: 4 },
  reviewCard: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(169,212,227,.35)', backgroundColor: 'rgba(169,212,227,.065)' },
  reviewIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(169,212,227,.52)', backgroundColor: 'rgba(169,212,227,.13)' },
  reviewIconText: { color: '#B5DDED', fontSize: 15 },
  reviewCopy: { flex: 1, minWidth: 0 },
  reviewTitle: { color: ink, fontSize: 11, fontWeight: '700' },
  reviewDetail: { color: muted, fontSize: 8, marginTop: 4 },
  reviewAction: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(169,212,227,.12)' },
  reviewActionText: { color: '#B5DDED', fontSize: 8, fontWeight: '800' },
  reviewActionArrow: { color: '#B5DDED', fontSize: 11 },
  careCard: { position: 'relative', overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 19, backgroundColor: 'rgba(255,246,236,.05)' },
  careRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  careRowNext: { borderTopWidth: 1, borderTopColor: 'rgba(255,239,224,.13)' },
  careDate: { width: 58, minHeight: 43, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderRadius: 13, backgroundColor: 'rgba(169,212,227,.13)', borderWidth: 1, borderColor: 'rgba(169,212,227,.28)' },
  careDateFollowUp: { backgroundColor: 'rgba(232,177,142,.12)', borderColor: 'rgba(232,177,142,.3)' },
  careDateMain: { color: '#C9EAF4', fontSize: 11, fontWeight: '800' },
  careDateKind: { color: '#B5DDED', fontSize: 9, fontWeight: '800', letterSpacing: .35, marginTop: 3 },
  careCopy: { flex: 1, minWidth: 0 },
  careTitle: { color: ink, fontSize: 13, fontWeight: '700' },
  careDetail: { color: muted, fontSize: 11, lineHeight: 15, marginTop: 4 },
  careArrow: { color: '#B5DDED', fontSize: 18, paddingHorizontal: 2 },
  contextCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(203,180,223,.28)', backgroundColor: 'rgba(127,93,150,.08)' },
  contextGlyph: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(169,212,227,.14)', borderWidth: 1, borderColor: 'rgba(169,212,227,.3)' },
  contextGlyphMint: { backgroundColor: 'rgba(159,216,199,.12)', borderColor: 'rgba(159,216,199,.3)' },
  contextGlyphText: { color: '#B5DDED', fontSize: 18, fontWeight: '700' },
  contextGlyphTextMint: { color: '#A6E1CC' },
  contextCopy: { flex: 1, minWidth: 0 },
  contextTitle: { color: ink, fontSize: 13, fontWeight: '700' },
  contextDetail: { color: muted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  contextMeta: { color: quiet, fontSize: 10, marginTop: 4 },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  topicCard: { width: '48.5%', minHeight: 91, borderRadius: 17, padding: 10, borderWidth: 1, backgroundColor: 'rgba(255,246,236,.05)' },
  topicTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topicOrb: { width: 26, height: 26, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  topicOrbCore: { width: 8, height: 8, borderRadius: 5, opacity: .95 },
  topicCount: { fontSize: 10, fontWeight: '800' },
  topicName: { color: ink, fontSize: 11, fontWeight: '700', marginTop: 7 },
  topicHint: { color: muted, fontSize: 9, lineHeight: 13, marginTop: 4 },
  timelineFeature: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,239,224,.26)', backgroundColor: 'rgba(255,246,236,.055)', marginBottom: 16 },
  timelineFeatureGlyph: { width: 38, height: 38, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(203,180,223,.38)', backgroundColor: 'rgba(203,180,223,.14)' },
  timelineFeatureGlyphText: { color: '#D7BBE8', fontSize: 20, lineHeight: 23 },
  timelineFeatureCopy: { flex: 1, minWidth: 0 },
  timelineFeatureTitle: { color: ink, fontSize: 12, fontWeight: '700' },
  timelineFeatureDetail: { color: muted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  timelineFeatureAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timelineFeatureActionText: { color: '#B5DDED', fontSize: 9, fontWeight: '800' },
  timelineFeatureArrow: { color: '#B5DDED', fontSize: 12 },
  questionCard: { padding: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(203,180,223,.25)', backgroundColor: 'rgba(127,93,150,.08)', marginBottom: 16 },
  questionText: { color: ink, fontSize: 12, lineHeight: 17, fontWeight: '600', marginTop: 6 },
  questionAction: { color: '#B5DDED', fontSize: 9, fontWeight: '700', marginTop: 8 },
  insightCard: { padding: 13, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(203,180,223,.33)', backgroundColor: 'rgba(127,93,150,.075)' },
  insightTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  insightOrb: { width: 33, height: 33, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,239,224,.3)', backgroundColor: 'rgba(255,246,236,.07)' },
  insightMeta: { flex: 1, minWidth: 0 },
  insightLabel: { color: '#D7BBE8', fontSize: 8, fontWeight: '800', letterSpacing: .9 },
  insightSource: { color: muted, fontSize: 9, marginTop: 3 },
  insightArrow: { color: '#B5DDED', fontSize: 15 },
  insightText: { color: ink, fontSize: 12, lineHeight: 17, marginTop: 9 },
  insightFoot: { color: quiet, fontSize: 8, lineHeight: 12, marginTop: 8 },
  quickActions: { flexDirection: 'row', gap: 9, marginTop: 0, marginBottom: 21 },
  quickPrimary: { minHeight: 82, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 17, backgroundColor: '#F3DFD0', borderWidth: 1, borderColor: 'rgba(255,248,240,.78)', ...shadow },
  quickSecondary: { minHeight: 82, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,232,212,.38)', backgroundColor: 'rgba(67,42,35,.48)' },
  quickIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(45,101,129,.12)' },
  quickAskIcon: { width: 34, height: 34, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(67,128,146,.42)', backgroundColor: 'rgba(67,128,146,.10)' },
  quickAskGlyph: { color: '#397E98', fontSize: 18, lineHeight: 21 },
  quickAddIcon: { backgroundColor: 'rgba(169,212,227,.11)', borderWidth: 1, borderColor: 'rgba(169,212,227,.48)' },
  quickPlus: { color: '#397E98', fontSize: 20, lineHeight: 23 },
  askOrb: { width: 30, height: 30, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(203,180,223,.12)' },
  quickCopy: { flex: 1, minWidth: 0 },
  quickTitle: { color: '#382823', fontSize: 10, fontWeight: '800' },
  quickSub: { color: '#76635D', fontSize: 7, lineHeight: 10, marginTop: 3 },
  quickArrow: { color: '#3C302B', fontSize: 14 },
  quickTitleLight: { color: ink },
  quickSubLight: { color: muted },
  quickArrowLight: { color: '#B5DDED' },
});
