import { DealStage } from '@prisma/client';

// WON and LOST are final: a deal can leave neither. From any other stage it may move to any
// stage. Staying in the same stage is always allowed.
export function canChangeStage(from: DealStage, to: DealStage): boolean {
  return from === to || (from !== DealStage.WON && from !== DealStage.LOST);
}
