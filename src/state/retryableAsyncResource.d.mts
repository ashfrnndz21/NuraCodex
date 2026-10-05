export type RetryableAsyncResource<T> = {
  get(): Promise<T>;
  reset(): void;
};

export declare function createRetryableAsyncResource<T>(
  factory: () => Promise<T> | T,
): RetryableAsyncResource<T>;
