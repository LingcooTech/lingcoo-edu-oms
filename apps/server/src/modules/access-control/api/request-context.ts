import type {
  EducationDataScope,
  PermissionKey,
  TeacherCapabilities,
} from '@lingcoo-edu-oms/contracts';

export type AccessPolicy =
  | { public: true }
  | {
      permissions: readonly PermissionKey[];
      allowUnscopedEducation?: boolean;
      education?: {
        institutionParam: string;
        permission: string;
        capability?: keyof TeacherCapabilities;
      };
    };

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: AccessPolicy;
  }

  interface FastifyRequest {
    accessPermissions: readonly PermissionKey[] | null;
    educationScope: EducationDataScope | null;
  }
}
