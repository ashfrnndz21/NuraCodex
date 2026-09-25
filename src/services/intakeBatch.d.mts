export type IntakeBatchStatus<Value> =
  | { assetId: string; status: 'reading' }
  | { assetId: string; status: 'complete'; value: Value }
  | { assetId: string; status: 'failed'; error: unknown }
  | { assetId: string; status: 'cancelled' };

export type IntakeBatchResult<Value> = Exclude<IntakeBatchStatus<Value>, { status: 'reading' }>;

export declare function processIntakeBatch<Asset extends { id: string }, Value>(
  assets: Asset[],
  processOne: (asset: Asset) => Promise<Value>,
  options?: {
    signal?: AbortSignal;
    onStatus?: (event: IntakeBatchStatus<Value>) => void;
  },
): Promise<IntakeBatchResult<Value>[]>;
