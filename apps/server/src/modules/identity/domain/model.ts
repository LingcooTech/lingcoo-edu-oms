export type IdentityUserStatus = 'active' | 'disabled';
export type IdentityActionPurpose = 'email_verification' | 'password_reset';

export interface PublicIdentityUser {
  id: string;
  email: string;
  displayName: string | null;
  status: IdentityUserStatus;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface ResolvedIdentitySession {
  sessionId: string;
  csrfDigest: string;
  expiresAt: Date;
  user: PublicIdentityUser;
}

export interface PublicIdentitySession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  current: boolean;
}

export interface IdentityUserPage {
  items: PublicIdentityUser[];
  page: number;
  pageSize: number;
  total: number;
}
