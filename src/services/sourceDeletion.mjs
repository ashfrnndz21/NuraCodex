const list = (value) => Array.isArray(value) ? value : [];

function relatedIdentifier(identifier, identifiers) {
  if (typeof identifier !== 'string') return false;
  if (identifiers.has(identifier)) return true;
  for (const target of identifiers) {
    if (identifier.startsWith(`document:${target}:`) || identifier === `source:${target}`
      || identifier === `fact:${target}` || identifier === `claim:${target}`
      || identifier === `assertion:${target}` || identifier === `asset:${target}`) return true;
  }
  return false;
}

function citationReferencesDeletedSource(citation, identifiers) {
  return relatedIdentifier(citation?.id, identifiers)
    || relatedIdentifier(citation?.sourceId, identifiers)
    || relatedIdentifier(citation?.sourceClaimId, identifiers)
    || relatedIdentifier(citation?.assertionId, identifiers);
}

function stripVisitReferences(visit, assetIds, factIds, treatmentIds) {
  const withoutIds = (values, deleted) => list(values).filter((id) => !deleted.has(id));
  const followUpActions = list(visit.followUpActions).map((action) => ({
    ...action,
    sourceAssetIds: withoutIds(action.sourceAssetIds, assetIds),
  }));
  return {
    ...visit,
    briefFactIds: withoutIds(visit.briefFactIds, factIds),
    briefAssetIds: withoutIds(visit.briefAssetIds, assetIds),
    briefTreatmentIds: withoutIds(visit.briefTreatmentIds, treatmentIds),
    outcomeSourceAssetIds: withoutIds(visit.outcomeSourceAssetIds, assetIds),
    followUpActions,
  };
}

/**
 * Remove one source and its locally retained descendants from an app snapshot.
 * The server source is removed separately through the authenticated intake
 * client; this helper keeps browser and device-owned copies aligned with it.
 * @param {Record<string, any>} snapshot
 * @param {{sourceId?: string | null, assetId?: string | null, claimIds?: string[], assertionIds?: string[]}} selection
 */
export function removeSourceLinkedData(snapshot, selection) {
  const sourceId = typeof selection?.sourceId === 'string' ? selection.sourceId : null;
  const selectedAssetId = typeof selection?.assetId === 'string' ? selection.assetId : null;
  if (!sourceId && !selectedAssetId) throw new Error('Choose a saved source before removing its details.');

  const claimIds = new Set(list(selection.claimIds));
  const assertionIds = new Set(list(selection.assertionIds));
  const assets = list(snapshot.assets);
  const facts = list(snapshot.facts);
  const treatments = list(snapshot.treatments);
  const intakeNotes = list(snapshot.intakeNotes);
  const removedAssets = assets.filter((asset) => asset.id === selectedAssetId || (sourceId && asset.serverSourceId === sourceId));
  const assetIds = new Set(removedAssets.map((asset) => asset.id));
  const removedFacts = facts.filter((fact) => (sourceId && fact.sourceId === sourceId)
    || (fact.sourceClaimId && claimIds.has(fact.sourceClaimId))
    || (fact.sourceClaimId && assertionIds.has(fact.sourceClaimId)));
  const factIds = new Set(removedFacts.map((fact) => fact.id));
  const removedTreatments = treatments.filter((item) => sourceId && item.sourceId === sourceId);
  const treatmentIds = new Set(removedTreatments.map((item) => item.id));
  const removedNotes = intakeNotes.filter((item) => sourceId && item.serverSourceId === sourceId);

  const references = new Set([
    ...(sourceId ? [sourceId] : []),
    ...claimIds,
    ...assertionIds,
    ...assetIds,
    ...factIds,
    ...treatmentIds,
  ]);
  const removedMessages = list(snapshot.agentMessages).filter((message) => list(message.citations).some((citation) => citationReferencesDeletedSource(citation, references)));
  const removedRunIds = new Set(removedMessages.map((message) => message.runId).filter(Boolean));
  const removedMessageIds = new Set(list(snapshot.agentMessages)
    .filter((message) => removedRunIds.has(message.runId))
    .map((message) => message.id));

  const updatedVisits = list(snapshot.visits).map((visit) => stripVisitReferences(visit, assetIds, factIds, treatmentIds));
  const updatedVisitEvents = list(snapshot.visitEvents).map((event) => ({
    ...event,
    snapshot: event.snapshot ? stripVisitReferences(event.snapshot, assetIds, factIds, treatmentIds) : event.snapshot,
  }));
  const deletedNodes = new Set([
    ...[...assetIds].map((id) => `asset:${id}`),
    ...[...factIds].map((id) => `fact:${id}`),
    ...[...treatmentIds].map((id) => `treatment:${id}`),
  ]);
  const removedLinks = list(snapshot.links).filter((link) => deletedNodes.has(link.from) || deletedNodes.has(link.to));

  const next = {
    ...snapshot,
    assets: assets.filter((asset) => !assetIds.has(asset.id)),
    facts: facts.filter((fact) => !factIds.has(fact.id)),
    treatments: treatments.filter((item) => !treatmentIds.has(item.id)),
    treatmentEvents: list(snapshot.treatmentEvents).filter((event) => !treatmentIds.has(event.treatmentId)),
    intakeNotes: intakeNotes.filter((item) => !removedNotes.some((removed) => removed.id === item.id)),
    visits: updatedVisits,
    visitEvents: updatedVisitEvents,
    links: list(snapshot.links).filter((link) => !deletedNodes.has(link.from) && !deletedNodes.has(link.to)),
    policyReplacements: list(snapshot.policyReplacements).filter((item) => item.newerSourceId !== sourceId && item.olderSourceId !== sourceId),
    policyClarifications: list(snapshot.policyClarifications).filter((item) => item.sourceId !== sourceId && !claimIds.has(item.sourceClaimId)),
    agentMessages: list(snapshot.agentMessages).filter((message) => !removedMessageIds.has(message.id)),
    registryBriefs: list(snapshot.registryBriefs).filter((brief) => !list(brief.citations).some((citation) => citationReferencesDeletedSource(citation, references))),
  };

  return {
    snapshot: next,
    removed: {
      assets: removedAssets.length,
      facts: removedFacts.length,
      treatments: removedTreatments.length,
      intakeNotes: removedNotes.length,
      treatmentEvents: list(snapshot.treatmentEvents).length - next.treatmentEvents.length,
      messages: list(snapshot.agentMessages).length - next.agentMessages.length,
      registryBriefs: list(snapshot.registryBriefs).length - next.registryBriefs.length,
      policyClarifications: list(snapshot.policyClarifications).length - next.policyClarifications.length,
      policyReplacements: list(snapshot.policyReplacements).length - next.policyReplacements.length,
      links: removedLinks.length,
    },
    ids: {
      assetIds: [...assetIds],
      factIds: [...factIds],
      treatmentIds: [...treatmentIds],
      removedMessageIds: [...removedMessageIds],
      removedBriefIds: list(snapshot.registryBriefs).filter((brief) => !next.registryBriefs.includes(brief)).map((brief) => brief.id),
      removedClarificationIds: list(snapshot.policyClarifications).filter((item) => !next.policyClarifications.includes(item)).map((item) => item.id),
      removedReplacementIds: list(snapshot.policyReplacements).filter((item) => !next.policyReplacements.includes(item)).map((item) => item.id),
      removedLinkIds: removedLinks.map((item) => item.id),
      claimIds: [...claimIds],
      assertionIds: [...assertionIds],
    },
  };
}

export class SourceDeletionIncompleteError extends Error {
  constructor(cause) {
    super('The source was removed from the local preview service, but Nura could not finish clearing its saved app copies. Retry this removal to complete the local cleanup.');
    this.name = 'SourceDeletionIncompleteError';
    this.serviceDeletionCompleted = true;
    this.cause = cause;
  }
}

/**
 * Coordinate local-preview service removal with app-owned file and record stores.
 * The service deletion happens first; its durable identifier receipt makes this
 * safe to retry if local cleanup fails or the response was lost.
 */
export async function removeSourceAcrossLocalStores({
  snapshot,
  selection,
  removeServiceSource,
  removeOriginalFiles = async () => {},
  persistLocalSnapshot = async () => {},
}) {
  const sourceId = typeof selection?.sourceId === 'string' ? selection.sourceId : null;
  let serviceResult = null;
  if (sourceId) {
    if (typeof removeServiceSource !== 'function') throw new TypeError('A source service removal function is required.');
    serviceResult = await removeServiceSource(sourceId);
  }

  const localResult = removeSourceLinkedData(snapshot, {
    ...selection,
    claimIds: serviceResult?.claimIds ?? selection?.claimIds,
    assertionIds: serviceResult?.assertionIds ?? selection?.assertionIds,
  });

  try {
    await removeOriginalFiles(localResult.ids.assetIds);
    await persistLocalSnapshot(localResult.snapshot, localResult.ids);
  } catch (error) {
    if (serviceResult) throw new SourceDeletionIncompleteError(error);
    throw error;
  }

  return {
    snapshot: localResult.snapshot,
    local: localResult,
    service: serviceResult ? {
      status: serviceResult.alreadyRemoved ? 'already_removed' : 'removed',
      removed: {
        sources: serviceResult.source,
        claims: serviceResult.claims,
        assertions: serviceResult.assertions,
        activityEvents: serviceResult.activityEvents,
      },
    } : { status: 'not_needed', removed: null },
    alreadyRemoved: serviceResult?.alreadyRemoved ?? false,
  };
}
