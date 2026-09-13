import {
  fleetViewFor,
  incomingFleetView,
  ownFleetView,
  type FleetRecord,
} from './fleet-views.js';

const fleet: FleetRecord = {
  id: 'f3',
  worldId: 1,
  ownerId: 7,
  ownerName: 'sebastian',
  mission: 'ATTACK',
  fromX: 10,
  fromY: 15,
  toX: 14,
  toY: 9,
  ships: { SLOOP: 10, GALLEON: 2 },
  cargo: { units: { MILITIA: 20 }, resources: { iron: 300 } },
  departAt: new Date('2026-09-08T12:00:00.000Z'),
  arriveAt: new Date('2026-09-08T12:40:00.000Z'),
};

describe('widoki floty', () => {
  it('ownFleetView: kształt z sekcji 4.3 specu klienta', () => {
    expect(ownFleetView(fleet)).toEqual({
      id: 'f3',
      world: '1',
      ownerId: 7,
      ownerName: 'sebastian',
      mission: 'ATTACK',
      from: { x: 10, y: 15 },
      to: { x: 14, y: 9 },
      ships: { SLOOP: 10, GALLEON: 2 },
      cargo: { units: { MILITIA: 20 }, resources: { iron: 300 } },
      departAt: '2026-09-08T12:00:00.000Z',
      arriveAt: '2026-09-08T12:40:00.000Z',
    });
  });

  it('incomingFleetView: bez ships i cargo, z departAt (Incoming Fleet ze słownika)', () => {
    const view = incomingFleetView(fleet);
    expect(view).toEqual({
      id: 'f3',
      world: '1',
      ownerId: 7,
      ownerName: 'sebastian',
      mission: 'ATTACK',
      from: { x: 10, y: 15 },
      to: { x: 14, y: 9 },
      departAt: '2026-09-08T12:00:00.000Z',
      arriveAt: '2026-09-08T12:40:00.000Z',
    });
    expect('ships' in view).toBe(false);
    expect('cargo' in view).toBe(false);
  });

  it('fleetViewFor: właściciel pełny, cel okrojony', () => {
    expect('ships' in fleetViewFor(fleet, 7)).toBe(true);
    expect('ships' in fleetViewFor(fleet, 9)).toBe(false);
  });
});
