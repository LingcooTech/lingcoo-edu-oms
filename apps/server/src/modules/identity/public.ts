export type { IdentityActionDelivery } from './application/action-delivery.port.js';
export { IdentityService } from './application/identity.service.js';
export { createIdentityService } from './plugin.js';
export type {
  PublicIdentitySession,
  PublicIdentityUser,
  IdentityUserPage,
  ResolvedIdentitySession,
} from './domain/model.js';
// Access Control owns the cross-module foreign key and imports this table only through the public boundary.
export { identityUsers } from './infrastructure/persistence/identity.schema.js';
