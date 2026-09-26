export type ProfileMapSlot = { left: number; top: number };

export type ProfileMapLayout = {
  expanded: boolean;
  graphHeight: number;
  centerX: number;
  centerY: number;
  nodeWidth: number;
  nodeDiameter: number;
  slots: ProfileMapSlot[];
};

export function createProfileMapLayout(count: number, width: number): ProfileMapLayout;
