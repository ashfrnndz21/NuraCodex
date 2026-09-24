import React, { useMemo } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Orb } from '../src/components/Orb';
import { Label, Surface } from '../src/components/Surface';
import { HealthFact, useNura } from '../src/state/NuraContext';
import { radius } from '../src/theme';

type Policy = { sourceId: string; sourceName: string; terms: HealthFact[] };

export default function InsuranceRegistry() {
  const { facts, assets } = useNura();
  const policies = useMemo(() => {
    const grouped = new Map<string, Policy>();
    for (const fact of facts.filter((item) => !item.validUntil)) {
      if (fact.category !== 'Insurance coverage' || !fact.sourceId) continue;
      const existing = grouped.get(fact.sourceId) ?? { sourceId: fact.sourceId, sourceName: fact.source, terms: [] };
      existing.terms.push(fact);
      grouped.set(fact.sourceId, existing);
    }
    return [...grouped.values()].sort((a, b) => (b.terms[0]?.validFrom ?? '').localeCompare(a.terms[0]?.validFrom ?? ''));
  }, [facts]);
  const waiting = assets.filter((asset) => asset.purpose === 'insurance' && !asset.serverSourceId);
  const termCount = policies.reduce((total, policy) => total + policy.terms.length, 0);

  return <View style={styles.page}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}><Text style={styles.back}>‹  Back</Text></Pressable>
    <View style={styles.brandRow}><Orb size={38} /><View style={{ flex: 1 }}><Text style={styles.brand}>nura</Text><Text style={styles.tagline}>YOUR HEALTH, UNDERSTOOD</Text></View><Text style={styles.privacy}>PRIVATE BY DESIGN</Text></View>
    <Label>YOUR COVERAGE · SOURCE-LINKED</Label>
    <View style={styles.titleRow}><View style={{ flex: 1 }}><Text style={styles.title}>Insurance</Text><Text style={styles.subtitle}>Policy terms, kept with the pages they came from.</Text></View><View style={styles.countBadge}><Text style={styles.countNumber}>{String(policies.length).padStart(2, '0')}</Text><Text style={styles.countLabel}>POLICIES</Text></View></View>

    <Surface style={styles.summary}>
      <Text style={styles.summaryTitle}>A clear record of what the document says.</Text>
      <Text style={styles.summaryBody}>Nura can organize benefits, limits, deductibles, copays and exclusions you confirm from a policy. A missing clause stays “not found” or “unclear”—it is not treated as proof of a coverage gap.</Text>
      <View style={styles.summaryFoot}><Text style={styles.summaryStat}>{String(termCount).padStart(2, '0')} confirmed terms</Text><Text style={styles.summaryDot}>·</Text><Text style={styles.summaryStat}>Every term links to its source</Text></View>
    </Surface>

    {waiting.length > 0 && <Surface style={styles.waitingCard}><Label>READY FOR SOURCE REVIEW · {waiting.length}</Label>{waiting.map((asset) => <View key={asset.id} style={styles.waitingRow}><View style={styles.fileIcon}><Text style={styles.fileIconText}>PDF</Text></View><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.policyName}>{asset.name}</Text><Text style={styles.muted}>Saved on this device · not yet analyzed</Text></View><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/review', params: { purpose: 'insurance' } })}><Text style={styles.link}>Review →</Text></Pressable></View>)}</Surface>}

    <View style={styles.sectionHead}><View><Label>YOUR POLICIES</Label><Text style={styles.sectionTitle}>{policies.length ? 'Confirmed from your documents' : 'No policy added yet'}</Text></View><Text style={styles.sectionCount}>{String(policies.length).padStart(2, '0')}</Text></View>
    {policies.length ? policies.map((policy) => <Surface key={policy.sourceId} style={styles.policyCard}>
      <View style={styles.policyHead}><View style={styles.policyMark}><Text style={styles.policyMarkText}>▤</Text></View><View style={{ flex: 1 }}><Text style={styles.policyEyebrow}>POLICY SOURCE</Text><Text style={styles.policyName}>{policy.sourceName}</Text></View><Text style={styles.sourceLinked}>LINKED</Text></View>
      <View style={styles.sourceBand}><Text style={styles.sourceBandIcon}>⌑</Text><Text style={styles.sourceBandText}>Source file · {policy.terms.length} confirmed term{policy.terms.length === 1 ? '' : 's'}</Text></View>
      {assets.find((asset) => asset.serverSourceId === policy.sourceId) && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/review', params: { purpose: 'insurance', assetId: assets.find((asset) => asset.serverSourceId === policy.sourceId)?.id } })} style={styles.sourceAction}><Text style={styles.sourceActionText}>OPEN ORIGINAL SOURCE AND REVIEW  ↗</Text></Pressable>}
      {policy.terms.map((term) => <View key={term.id} style={styles.term}>
        <View style={styles.termTop}><Text style={styles.termLabel}>{term.label}</Text><Text style={styles.termType}>POLICY TERM</Text></View>
        <Text style={styles.termValue}>{term.value}</Text>
        {term.note ? <Text style={styles.quote}>“{term.note}”</Text> : <Text style={styles.quoteMissing}>Original source is attached. Open it to verify the exact wording.</Text>}
        <Text style={styles.termMeta}>{term.source}{term.validFrom ? ` · ${new Date(term.validFrom).toLocaleDateString()}` : ''}</Text>
      </View>)}
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/ask', params: { context: 'your insurance policy and health profile', question: 'Based on the confirmed policy terms and the health details I choose to share, what is explicitly covered, what is explicitly limited or excluded, and what remains unclear?' } })} style={styles.askAction}>
        <View style={styles.askOrb}><Orb size={22} /></View><View style={{ flex: 1 }}><Text style={styles.askTitle}>Ask Nura about this policy</Text><Text style={styles.askSubtitle}>Compare source terms with selected profile details</Text></View><Text style={styles.askArrow}>→</Text>
      </Pressable>
    </Surface>) : <Surface style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Text style={styles.emptyGlyph}>▤</Text></View>
      <Text style={styles.emptyTitle}>Your policy record starts with a document.</Text>
      <Text style={styles.emptyBody}>Add a benefits summary or policy schedule. Nura will show the extracted wording beside its page quote so you can accept, edit or dismiss each term.</Text>
      <View style={styles.emptySteps}><Text style={styles.step}>01  Add a policy PDF or photo</Text><Text style={styles.step}>02  Review quoted terms</Text><Text style={styles.step}>03  Ask what the evidence supports</Text></View>
    </Surface>}

    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/intake', params: { purpose: 'insurance' } })} style={styles.primary}><View style={{ flex: 1 }}><Text style={styles.primaryTitle}>ADD A POLICY DOCUMENT</Text><Text style={styles.primarySub}>PDF or clear page photo</Text></View><Text style={styles.primaryArrow}>↗</Text></Pressable>
    <Text style={styles.disclaimer}>Policy summaries are for organizing your records, not a coverage determination. Confirm important questions with your insurer.</Text>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F6F8' }, content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, maxWidth: 560, width: '100%', alignSelf: 'center' },
  back: { color: '#77727E', fontSize: 14, marginBottom: 15 }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 27 }, brand: { color: '#30263B', fontSize: 18, fontWeight: '700', letterSpacing: -0.5 }, tagline: { color: '#898392', fontSize: 7, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 }, privacy: { color: '#898392', fontSize: 7, letterSpacing: 1.2, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7, marginBottom: 17, gap: 12 }, title: { color: '#282530', fontSize: 31, fontWeight: '300', letterSpacing: -0.8 }, subtitle: { color: '#77727E', fontSize: 12, lineHeight: 18, marginTop: 3 }, countBadge: { width: 58, height: 54, borderRadius: 15, backgroundColor: '#EAF1FD', alignItems: 'center', justifyContent: 'center' }, countNumber: { color: '#1767D8', fontSize: 20, fontWeight: '600' }, countLabel: { color: '#6F7F9A', fontSize: 6, letterSpacing: 1, marginTop: 1 },
  summary: { backgroundColor: '#392A4B', borderColor: '#5A496A', marginBottom: 24 }, summaryTitle: { color: '#FBF6F0', fontSize: 16, fontWeight: '600' }, summaryBody: { color: 'rgba(251,246,240,.82)', fontSize: 11, lineHeight: 17, marginTop: 8 }, summaryFoot: { flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.18)', marginTop: 12, paddingTop: 10 }, summaryStat: { color: '#E0D3EA', fontSize: 9, fontWeight: '600' }, summaryDot: { color: '#EAB58E', fontSize: 13 },
  waitingCard: { marginBottom: 18, padding: 14 }, waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 11 }, fileIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: '#EAF1FD', alignItems: 'center', justifyContent: 'center' }, fileIconText: { color: '#1767D8', fontSize: 8, fontWeight: '700' }, policyName: { color: '#302D36', fontSize: 13, fontWeight: '600' }, muted: { color: '#898392', fontSize: 9, marginTop: 3 }, link: { color: '#1767D8', fontSize: 10, fontWeight: '700' },
  sourceAction: { alignSelf: 'flex-start', marginTop: 7, paddingVertical: 4 }, sourceActionText: { color: '#1767D8', fontSize: 7, fontWeight: '700', letterSpacing: .7 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }, sectionTitle: { color: '#302D36', fontSize: 17, fontWeight: '500', marginTop: 4 }, sectionCount: { color: '#918A99', fontSize: 11 }, policyCard: { marginBottom: 13, padding: 14 }, policyHead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, policyMark: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EAF1FD', alignItems: 'center', justifyContent: 'center' }, policyMarkText: { color: '#1767D8', fontSize: 17 }, policyEyebrow: { color: '#92899A', fontSize: 7, fontWeight: '700', letterSpacing: 1.1 }, sourceLinked: { color: '#2D795B', backgroundColor: '#E2F2E9', fontSize: 7, fontWeight: '700', letterSpacing: 0.7, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 }, sourceBand: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, backgroundColor: '#EEF4FD', padding: 9, marginTop: 12 }, sourceBandIcon: { color: '#1767D8', fontSize: 12 }, sourceBandText: { color: '#4A668D', fontSize: 9, fontWeight: '500' }, term: { borderTopWidth: 1, borderTopColor: '#EBE8EF', paddingTop: 12, marginTop: 12 }, termTop: { flexDirection: 'row', alignItems: 'center', gap: 7 }, termLabel: { color: '#302D36', fontSize: 13, fontWeight: '600', flex: 1 }, termType: { color: '#1767D8', backgroundColor: '#EAF1FD', fontSize: 6, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 }, termValue: { color: '#4C4854', fontSize: 11, lineHeight: 16, marginTop: 5 }, quote: { color: '#716A79', fontSize: 10, lineHeight: 15, fontStyle: 'italic', backgroundColor: '#F5F2F6', padding: 9, borderRadius: 9, marginTop: 8 }, quoteMissing: { color: '#8C6C32', fontSize: 9, lineHeight: 14, marginTop: 8 }, termMeta: { color: '#918A99', fontSize: 8, marginTop: 6 },
  askAction: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#F5F0F8', borderWidth: 1, borderColor: '#E5DCEB', borderRadius: 13, padding: 10, marginTop: 14 }, askOrb: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#F4E6E6', alignItems: 'center', justifyContent: 'center' }, askTitle: { color: '#483250', fontSize: 11, fontWeight: '600' }, askSubtitle: { color: '#827A89', fontSize: 8, marginTop: 2 }, askArrow: { color: '#483250', fontSize: 17 },
  emptyCard: { alignItems: 'flex-start', padding: 17, marginBottom: 14 }, emptyIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: '#EAF1FD', alignItems: 'center', justifyContent: 'center', marginBottom: 11 }, emptyGlyph: { color: '#1767D8', fontSize: 22 }, emptyTitle: { color: '#302D36', fontSize: 16, fontWeight: '600' }, emptyBody: { color: '#77727E', fontSize: 11, lineHeight: 17, marginTop: 7 }, emptySteps: { width: '100%', borderTopWidth: 1, borderTopColor: '#ECE8EF', marginTop: 13, paddingTop: 9, gap: 8 }, step: { color: '#655D6B', fontSize: 9, fontWeight: '500' }, primary: { minHeight: 58, borderRadius: radius.md, backgroundColor: '#1767D8', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }, primaryTitle: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, primarySub: { color: 'rgba(255,255,255,.78)', fontSize: 9, marginTop: 3 }, primaryArrow: { color: '#FFF', fontSize: 22 }, disclaimer: { color: '#898392', fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 11 },
});
