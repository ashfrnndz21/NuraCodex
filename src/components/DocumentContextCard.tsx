import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DocumentContext, DocumentContextEntry } from '../services/intakeClient';
import { GlassMaterial } from './GlassMaterial';

const dateLabels: Record<string, string> = {
  report_date: 'Report date', collected_at: 'Collected', issued_at: 'Issued', effective_period: 'Effective period', policy_effective_date: 'Policy effective date', renewal_date: 'Renewal date', expiry_date: 'Expiry date',
};
const entityLabels: Record<string, string> = {
  laboratory: 'Laboratory', provider: 'Provider', insurer: 'Insurer', plan_name: 'Plan name', policy_type: 'Policy type', document_version: 'Document version', jurisdiction: 'Jurisdiction',
};
const noteLabels: Record<string, string> = {
  fasting_guidance: 'Fasting guidance', clinical_significance: 'Clinical note',
  clinical_decision_limits: 'Decision limits', remarks: 'Report note',
};

function ContextRows({ rows, labels }: { rows: DocumentContextEntry[]; labels: Record<string, string> }) {
  return <>{rows.map((row, index) => <View key={`${row.kind}-${index}`} style={styles.row}>
    <Text style={styles.rowLabel}>{labels[row.kind]}</Text>
    <Text style={styles.rowValue}>{row.value}</Text>
    {row.quote ? <Text style={styles.quote}>“{row.quote}”</Text> : null}
    {row.page ? <Text style={styles.page}>Page {row.page}</Text> : null}
  </View>)}</>;
}

/** Source-level context stays available, but never crowds the claim review by default. */
export function DocumentContextCard({ context, compact = false }: { context: DocumentContext | null | undefined; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => {
    if (!context) return { dates: [], entities: [], notes: [] };
    return {
      dates: context.dates.filter((row) => Boolean(dateLabels[row.kind])),
      entities: context.entities.filter((row) => Boolean(entityLabels[row.kind])),
      notes: context.notes.filter((row) => Boolean(noteLabels[row.kind])),
    };
  }, [context]);
  const detailCount = rows.dates.length + rows.entities.length + rows.notes.length;
  const contextHeading = /policy|insurance/i.test(context?.documentType ?? '') ? 'ABOUT THIS POLICY' : 'ABOUT THIS REPORT';
  if (!context || (!context.documentType && detailCount === 0)) return null;

  return <View style={[styles.card, compact && styles.compact]}>
    <GlassMaterial tone="dark" intensity={24} radius={compact ? 15 : 18} />
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${expanded ? 'Hide' : 'Show'} report details${detailCount ? `, ${detailCount} items` : ''}`}
      onPress={() => setExpanded((value) => !value)}
      style={styles.disclosure}
    >
      <View style={styles.disclosureCopy}>
        <Text style={styles.heading}>{contextHeading}</Text>
        {context.documentType ? <Text numberOfLines={expanded ? 2 : 1} style={styles.documentType}>{context.documentType}</Text> : null}
      </View>
      <Text style={styles.disclosureAction}>{expanded ? 'HIDE −' : 'DETAILS +'}</Text>
    </Pressable>
    {expanded ? <View style={styles.details}>
      <ContextRows rows={rows.dates} labels={dateLabels} />
      <ContextRows rows={rows.entities} labels={entityLabels} />
      <ContextRows rows={rows.notes} labels={noteLabels} />
      {detailCount === 0 ? <Text style={styles.empty}>No additional report details.</Text> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { position: 'relative', overflow: 'hidden', marginTop: 12, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,235,218,.28)', backgroundColor: 'rgba(255,236,220,.075)' },
  compact: { marginTop: 10, padding: 10, borderRadius: 15 },
  disclosure: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  disclosureCopy: { flex: 1 },
  heading: { color: '#F1C2A7', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  documentType: { color: '#FFF7EF', fontSize: 11, fontWeight: '600', marginTop: 4 },
  disclosureAction: { color: '#AFCDFB', fontSize: 8, fontWeight: '800', letterSpacing: .55 },
  details: { marginTop: 3 },
  row: { marginTop: 8, paddingTop: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,238,224,.16)' },
  rowLabel: { color: 'rgba(255,244,234,.66)', fontSize: 9, fontWeight: '600' },
  rowValue: { color: '#FFF7EF', fontSize: 11, lineHeight: 16, marginTop: 2 },
  quote: { color: 'rgba(255,244,234,.76)', fontSize: 9, lineHeight: 13, marginTop: 3 },
  page: { color: '#AFCDFB', fontSize: 8, fontWeight: '700', marginTop: 3 },
  empty: { color: 'rgba(255,244,234,.7)', fontSize: 9, lineHeight: 13, marginTop: 7 },
});
