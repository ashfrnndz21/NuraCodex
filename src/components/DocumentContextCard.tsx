import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DocumentContext, DocumentContextEntry } from '../services/intakeClient';
import { colors } from '../theme';

const dateLabels: Record<string, string> = {
  report_date: 'Report date', collected_at: 'Collected', received_at: 'Received',
  approved_at: 'Approved', issued_at: 'Issued', effective_period: 'Effective period',
};
const entityLabels: Record<string, string> = {
  laboratory: 'Laboratory', provider: 'Provider', insurer: 'Insurer',
  analyzer: 'Analyzer', technology: 'Technology',
};
const noteLabels: Record<string, string> = {
  fasting_guidance: 'Fasting guidance', clinical_significance: 'Clinical notes',
  clinical_decision_limits: 'Decision limits', remarks: 'Report remarks',
  sample_notice: 'Sample report notice', other: 'Source note',
};

function ContextRows({ rows, labels }: { rows: DocumentContextEntry[]; labels: Record<string, string> }) {
  return <>{rows.map((row, index) => <View key={`${row.kind}-${index}`} style={styles.row}>
    <Text style={styles.rowLabel}>{labels[row.kind] ?? 'Document detail'}</Text>
    <Text style={styles.rowValue}>{row.value}</Text>
    {row.page ? <Text style={styles.page}>PAGE {row.page}</Text> : null}
    {row.quote && row.quote.trim() !== row.value.trim() ? <Text style={styles.quote}>“{row.quote}”</Text> : null}
  </View>)}</>;
}

export function DocumentContextCard({ context, compact = false }: { context: DocumentContext | null | undefined; compact?: boolean }) {
  if (!context || (!context.documentType && !context.dates.length && !context.entities.length && !context.notes.length)) return null;
  return <View style={[styles.card, compact && styles.compact]}>
    <Text style={styles.heading}>REPORT DETAILS</Text>
    <Text style={styles.caption}>Kept with the source. General report notes are not personal health facts.</Text>
    {context.documentType ? <Text style={styles.documentType}>{context.documentType}</Text> : null}
    <ContextRows rows={context.dates} labels={dateLabels} />
    <ContextRows rows={context.entities} labels={entityLabels} />
    {context.notes.length ? <>
      <Text style={styles.notesHeading}>NOTES FROM THE REPORT</Text>
      <ContextRows rows={context.notes} labels={noteLabels} />
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 14, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceStrong },
  compact: { marginTop: 10, padding: 12, borderRadius: 15 },
  heading: { color: colors.violet, fontSize: 9, fontWeight: '700', letterSpacing: 1.1 },
  caption: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  documentType: { color: colors.ink, fontSize: 13, fontWeight: '600', marginTop: 10 },
  notesHeading: { color: colors.violet, fontSize: 8, fontWeight: '700', letterSpacing: .8, marginTop: 12, marginBottom: 3 },
  row: { marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border },
  rowLabel: { color: colors.muted, fontSize: 9, fontWeight: '600' },
  rowValue: { color: colors.text, fontSize: 11, lineHeight: 16, marginTop: 3 },
  page: { color: colors.cobalt, fontSize: 8, fontWeight: '700', letterSpacing: .5, marginTop: 4 },
  quote: { color: colors.muted, fontSize: 9, lineHeight: 14, fontStyle: 'italic', marginTop: 4 },
});
