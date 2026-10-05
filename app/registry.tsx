import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MedicalRegistry } from '../src/components/MedicalRegistry';
import { useNura } from '../src/state/NuraContext';

export default function Registry() {
  const params = useLocalSearchParams<{ topicId?: string; marker?: string; firstRun?: string }>();
  const { ready, topics, facts, assets, treatments, visits, links, registryBriefs, addLink, saveApprovedMemoryFact, correctFact } = useNura();
  return <MedicalRegistry ready={ready} topics={topics} facts={facts} assets={assets} treatments={treatments} visits={visits} links={links} registryBriefs={registryBriefs} initialTopicId={typeof params.topicId === 'string' ? params.topicId : undefined} initialMarkerLabel={typeof params.marker === 'string' ? params.marker : undefined} firstRun={params.firstRun === 'true'} addLink={addLink} saveApprovedMemoryFact={saveApprovedMemoryFact} correctFact={correctFact} />;
}
