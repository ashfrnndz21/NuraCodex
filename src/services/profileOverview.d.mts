export type ProfileOverviewFact = {
  id: string;
  label: string;
  value: string;
  date: string;
  category: string;
  source: string;
  sourceId?: string;
  validUntil?: string | null;
  validFrom?: string;
  createdAt?: string;
};

export type ProfileOverviewTreatment = {
  id: string;
  name: string;
  dose: string;
  schedule: string;
  status: string;
  startedOn: string;
  source: string;
  sourceId?: string;
  createdAt?: string;
};

export type ProfileOverviewAsset = {
  id: string;
  name: string;
  kind?: 'image' | 'pdf' | 'video' | 'file';
  mimeType?: string;
  purpose?: string;
  addedAt?: string;
  serverSourceId?: string;
};

export type ProfileOverviewVisit = {
  id: string;
  purpose?: string;
  appointmentAt?: string;
  clinician?: string;
  location?: string;
  status?: string;
  briefAssetIds?: string[];
  outcomeSourceAssetIds?: string[];
  briefFactIds?: string[];
  briefTreatmentIds?: string[];
  followUpActions?: { sourceAssetIds?: string[] }[];
};

export type ProfileEvidenceDetail = {
  id: string;
  kind: 'fact' | 'treatment';
  label: string;
  value: string;
  category: string;
  /** Timeline/event date; for extracted items this may be the report date. */
  date: string;
  /** When the profile detail was first recorded locally. */
  recordedAt: string | null;
};

export type ProfileEvidenceCounts = {
  facts: number;
  treatments: number;
  visits: number;
  total: number;
};

export type ProfileEvidenceRow = {
  id: string;
  kind: 'source' | 'detail' | 'treatment' | 'visit';
  title: string;
  state: string;
  summary: string;
  details: ProfileEvidenceDetail[];
  sourceId?: string | null;
  assetIds?: string[];
  sourceType?: 'pdf' | 'image' | 'video' | 'file';
  /** First local attachment date for the canonical source group. */
  addedAt?: string | null;
  counts?: ProfileEvidenceCounts;
  /** Canonical source group IDs associated with this unique visit row. */
  sourceGroupIds?: string[];
  date?: string | null;
};

export function buildProfileEvidenceRows(input?: {
  facts?: ProfileOverviewFact[];
  assets?: ProfileOverviewAsset[];
  treatments?: ProfileOverviewTreatment[];
  visits?: ProfileOverviewVisit[];
}): ProfileEvidenceRow[];
