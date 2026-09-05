import type { IdentityActionPurpose } from '../domain/model.js';
import type { DatabaseTransaction } from '../../../database/database.js';

export interface IdentityActionDelivery {
  deliver(input: {
    userId: string;
    email: string;
    purpose: IdentityActionPurpose;
    token: string;
    tokenDigest: string;
    expiresAt: Date;
    transaction: DatabaseTransaction;
  }): Promise<void>;
}

export class DisabledIdentityActionDelivery implements IdentityActionDelivery {
  async deliver(): Promise<void> {
    // The Mail module replaces this adapter through the composition root.
  }
}
