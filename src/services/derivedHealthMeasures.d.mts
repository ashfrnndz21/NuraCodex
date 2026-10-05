export type DerivedBmi = {
  measurementDate: string;
  bmi: number;
  bmiRaw: number;
  weightKg: number;
  heightM: number;
  weightFactId: string;
  heightFactId: string;
};
export type DerivedMeasurementAge = { ageAtMeasurement: number; measurementDate: string };
export declare function deriveBmiFromFacts(facts?: readonly Record<string, unknown>[]): DerivedBmi | null;
export declare function ageAtDateOfBirth(birthday: string, measurementDate: string): number | null;
export declare function deriveAgeForMeasurements(birthday: string, facts?: readonly Record<string, unknown>[]): DerivedMeasurementAge | null;
