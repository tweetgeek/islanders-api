export const RESOURCES = ['wood', 'stone', 'food', 'iron', 'sulfur'] as const;
export type Resource = (typeof RESOURCES)[number];
export type Resources = Record<Resource, number>;

export function emptyResources(): Resources {
  return { wood: 0, stone: 0, food: 0, iron: 0, sulfur: 0 };
}
