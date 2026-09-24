type ProfileContext<TFact = unknown, TTopic = unknown, TLink = unknown, TTreatment = unknown, TVisit = unknown> = {
  facts: TFact[];
  topics: TTopic[];
  links: TLink[];
  treatments: TTreatment[];
  visits: TVisit[];
};

export function scopeProfileContext<TFact extends { id: string }, TTopic extends { id: string }, TLink extends { from: string; to: string }, TTreatment extends { id: string }, TVisit extends { id: string }>(
  profile: ProfileContext<TFact, TTopic, TLink, TTreatment, TVisit>,
  recordId: string | null,
): ProfileContext<TFact, TTopic, TLink, TTreatment, TVisit>;
