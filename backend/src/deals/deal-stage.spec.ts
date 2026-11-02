import { DealStage } from '@prisma/client';
import { canChangeStage } from './deal-stage';

// The expected result of every transition, written out by hand and not derived from the rule.
// The type makes the file stop compiling when a stage is added to the enum, so the new stage
// has to be given its transitions here.
const expected: Record<DealStage, Record<DealStage, boolean>> = {
  NEW: { NEW: true, QUALIFICATION: true, NEGOTIATION: true, WON: true, LOST: true },
  QUALIFICATION: { NEW: true, QUALIFICATION: true, NEGOTIATION: true, WON: true, LOST: true },
  NEGOTIATION: { NEW: true, QUALIFICATION: true, NEGOTIATION: true, WON: true, LOST: true },
  WON: { NEW: false, QUALIFICATION: false, NEGOTIATION: false, WON: true, LOST: false },
  LOST: { NEW: false, QUALIFICATION: false, NEGOTIATION: false, WON: false, LOST: true },
};

const stages = Object.values(DealStage);

const pairs = stages.flatMap((from) =>
  stages.map((to): [DealStage, DealStage, string, boolean] => [
    from,
    to,
    expected[from][to] ? 'allowed' : 'forbidden',
    expected[from][to],
  ]),
);

describe('canChangeStage', () => {
  it('covers the 5 stages and all 25 transitions', () => {
    expect(stages).toEqual(['NEW', 'QUALIFICATION', 'NEGOTIATION', 'WON', 'LOST']);
    expect(pairs).toHaveLength(25);
  });

  it.each(pairs)('%s -> %s is %s', (from, to, _label, isAllowed) => {
    expect(canChangeStage(from, to)).toBe(isAllowed);
  });

  it('allows 17 of the 25 transitions and forbids 8', () => {
    const allowed = pairs.filter(([from, to]) => canChangeStage(from, to));

    expect(allowed).toHaveLength(17);
    expect(pairs).toHaveLength(allowed.length + 8);
  });

  it.each(stages)('lets a deal stay in %s', (stage) => {
    expect(canChangeStage(stage, stage)).toBe(true);
  });

  it.each([DealStage.WON, DealStage.LOST])('lets a %s deal reach only itself', (finalStage) => {
    expect(stages.filter((to) => canChangeStage(finalStage, to))).toEqual([finalStage]);
  });

  it.each([DealStage.NEW, DealStage.QUALIFICATION, DealStage.NEGOTIATION])(
    'lets a %s deal move to every stage',
    (openStage) => {
      expect(stages.filter((to) => canChangeStage(openStage, to))).toEqual(stages);
    },
  );

  it('gives the same answer every time', () => {
    expect(canChangeStage(DealStage.WON, DealStage.NEW)).toBe(false);
    expect(canChangeStage(DealStage.WON, DealStage.NEW)).toBe(false);
    expect(canChangeStage(DealStage.NEW, DealStage.WON)).toBe(true);
    expect(canChangeStage(DealStage.NEW, DealStage.WON)).toBe(true);
  });
});
