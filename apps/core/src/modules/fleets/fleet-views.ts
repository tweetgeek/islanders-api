import type { FleetCargo } from '../../infra/db/schema/index.js';

export type Mission =
  'COLONIZE' | 'ATTACK' | 'TRANSPORT' | 'EXPEDITION' | 'RETURN';

export interface FleetRecord {
  id: string;
  ownerId: string;
  ownerName: string;
  mission: Mission;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  ships: Record<string, number>;
  cargo: FleetCargo;
  departAt: Date;
  arriveAt: Date;
}

/** Incoming Fleet ze słownika: właściciel, misja, trasa i czasy — nigdy statki ani ładunek. */
export interface IncomingFleetView {
  id: string;
  world: string;
  ownerId: string;
  ownerName: string;
  mission: Mission;
  from: { x: number; y: number };
  to: { x: number; y: number };
  departAt: string;
  arriveAt: string;
}

export interface OwnFleetView extends IncomingFleetView {
  ships: Record<string, number>;
  cargo: FleetCargo;
}

export function incomingFleetView(f: FleetRecord, worldSlug: string): IncomingFleetView {
  return {
    id: f.id,
    world: worldSlug,
    ownerId: f.ownerId,
    ownerName: f.ownerName,
    mission: f.mission,
    from: { x: f.fromX, y: f.fromY },
    to: { x: f.toX, y: f.toY },
    departAt: f.departAt.toISOString(),
    arriveAt: f.arriveAt.toISOString(),
  };
}

export function ownFleetView(f: FleetRecord, worldSlug: string): OwnFleetView {
  return { ...incomingFleetView(f, worldSlug), ships: f.ships, cargo: f.cargo };
}

export function fleetViewFor(f: FleetRecord, worldSlug: string, requesterId: string): OwnFleetView | IncomingFleetView {
  return f.ownerId === requesterId ? ownFleetView(f, worldSlug) : incomingFleetView(f, worldSlug);
}
