import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { HealthHistory } from '../../src/components/HealthHistory';
import { useNura } from '../../src/state/NuraContext';

export default function Health() {
  const params = useLocalSearchParams<{ focusId?: string }>();
  const { ready, storageError, name, facts, assets, treatments, visits, topics, links, addLink, removeLink, correctFact } = useNura();
  return <HealthHistory name={name} ready={ready} storageError={storageError} facts={facts} assets={assets} treatments={treatments} visits={visits} topics={topics} links={links} addLink={addLink} removeLink={removeLink} correctFact={correctFact} initialFocusId={typeof params.focusId === 'string' ? params.focusId : undefined} />;
}
