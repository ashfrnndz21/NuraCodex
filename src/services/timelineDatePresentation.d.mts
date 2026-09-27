export type TimelineDateEntry = {
  kind: string;
  source: string;
  sourceClaimId?: string;
  note?: string;
  date: string;
};

export type TimelineDatePresentation = {
  isEntryDate: boolean;
  cardDate: string;
  accessibilityLabel: string;
};

export declare function timelineDatePresentation(entry: TimelineDateEntry): TimelineDatePresentation;
