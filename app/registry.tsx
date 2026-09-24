import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MedicalRegistry } from '../src/components/MedicalRegistry';
import { useNura } from '../src/state/NuraContext';

export default function Registry() {
  const params = useLocalSearchParams<{ topicId?: string }>();
  const { ready, topics, facts, assets, treatments, visits, links, registryBriefs, addLink } = useNura();
  return <MedicalRegistry ready={ready} topics={topics} facts={facts} assets={assets} treatments={treatments} visits={visits} links={links} registryBriefs={registryBriefs} initialTopicId={typeof params.topicId === 'string' ? params.topicId : undefined} addLink={addLink} />;
}
