import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { HEALTH_HISTORY_FILTERS, HealthHistory, type HealthHistoryFilter } from '../../src/components/HealthHistory';
import { useNura } from '../../src/state/NuraContext';

export default function Health() {
  const params = useLocalSearchParams<{ focusId?: string; filter?: string }>();
  const requestedFilter = typeof params.filter === 'string' && HEALTH_HISTORY_FILTERS.includes(params.filter as HealthHistoryFilter) ? params.filter as HealthHistoryFilter : undefined;
  const { ready, storageError, name, facts, assets, treatments, visits, topics, links, addLink, removeLink, correctFact, reconcileSourceFactDate, attachSourceToAsset } = useNura();
  return <HealthHistory name={name} ready={ready} storageError={storageError} facts={facts} assets={assets} treatments={treatments} visits={visits} topics={topics} links={links} addLink={addLink} removeLink={removeLink} correctFact={correctFact} reconcileSourceFactDate={reconcileSourceFactDate} attachSourceToAsset={attachSourceToAsset} initialFocusId={typeof params.focusId === 'string' ? params.focusId : undefined} initialFilter={requestedFilter} />;
}
