import { ApiError } from '@lingcoo-tech/http';
import type {
  BrandingConfiguration,
  PublicBranding,
  UpdateBrandingRequest,
} from '@lingcoo-edu-oms/contracts';

import type { AppEnvironment } from '../../../config/environment.js';
import type { DatabaseHandle } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type {
  AssetLibraryService,
  AssetReferenceService,
  ReadableAsset,
} from '../../storage/public.js';
import { APPLICATION_BRANDING_REFERENCE, DEFAULT_BRANDING } from '../domain/model.js';
import { BrandingRepository } from '../infrastructure/persistence/branding.repository.js';

type ActorContext = AuditContext & { actorId: string };
type BrandingAssetKind = keyof typeof APPLICATION_BRANDING_REFERENCE.fields;

export class BrandingService {
  constructor(
    private readonly environment: AppEnvironment,
    private readonly database: DatabaseHandle,
    private readonly repository: BrandingRepository,
    private readonly references: AssetReferenceService,
    private readonly library: AssetLibraryService,
    private readonly audit: AuditWriter,
  ) {}

  async getPublic(): Promise<PublicBranding> {
    const view = await this.view();
    return {
      appName: view.appName,
      primaryColor: view.primaryColor,
      loginTitle: view.loginTitle,
      loginSubtitle: view.loginSubtitle,
      logoUrl: view.logoUrl,
      faviconUrl: view.faviconUrl,
      revision: view.revision,
    };
  }

  getAdmin(): Promise<BrandingConfiguration> {
    return this.view();
  }

  async update(
    input: UpdateBrandingRequest,
    context: ActorContext,
  ): Promise<BrandingConfiguration> {
    try {
      await this.database.transaction(async (transaction) => {
        const current = await this.repository.lock(transaction);
        const currentRevision = current?.revision ?? 0;
        if (currentRevision !== input.expectedRevision) this.versionConflict();

        const beforeLogo = await this.references.get(
          APPLICATION_BRANDING_REFERENCE.ownerType,
          APPLICATION_BRANDING_REFERENCE.ownerId,
          APPLICATION_BRANDING_REFERENCE.fields.logo,
          transaction,
        );
        const beforeFavicon = await this.references.get(
          APPLICATION_BRANDING_REFERENCE.ownerType,
          APPLICATION_BRANDING_REFERENCE.ownerId,
          APPLICATION_BRANDING_REFERENCE.fields.favicon,
          transaction,
        );

        await this.references.set(
          {
            ownerType: APPLICATION_BRANDING_REFERENCE.ownerType,
            ownerId: APPLICATION_BRANDING_REFERENCE.ownerId,
            field: APPLICATION_BRANDING_REFERENCE.fields.logo,
            assetId: input.logoAssetId,
            createdBy: context.actorId,
          },
          transaction,
          { mediaKind: 'image' },
        );
        await this.references.set(
          {
            ownerType: APPLICATION_BRANDING_REFERENCE.ownerType,
            ownerId: APPLICATION_BRANDING_REFERENCE.ownerId,
            field: APPLICATION_BRANDING_REFERENCE.fields.favicon,
            assetId: input.faviconAssetId,
            createdBy: context.actorId,
          },
          transaction,
          { mediaKind: 'image' },
        );

        const now = new Date();
        const saved = current
          ? await this.repository.update(
              current.revision,
              {
                appName: input.appName,
                primaryColor: input.primaryColor,
                loginTitle: input.loginTitle,
                loginSubtitle: input.loginSubtitle,
                updatedBy: context.actorId,
                updatedAt: now,
              },
              transaction,
            )
          : await this.repository.insert(
              {
                appName: input.appName,
                primaryColor: input.primaryColor,
                loginTitle: input.loginTitle,
                loginSubtitle: input.loginSubtitle,
                updatedBy: context.actorId,
                createdAt: now,
                updatedAt: now,
              },
              transaction,
            );
        if (!saved) this.versionConflict();

        const defaults = this.defaults();
        await this.audit.record(
          {
            ...context,
            category: 'system',
            action: 'branding.updated',
            resourceType: 'application.branding',
            resourceId: 'default',
            changes: [
              {
                field: 'appName',
                before: current?.appName ?? defaults.appName,
                after: input.appName,
              },
              {
                field: 'primaryColor',
                before: current?.primaryColor ?? defaults.primaryColor,
                after: input.primaryColor,
              },
              {
                field: 'loginTitle',
                before: current?.loginTitle ?? defaults.loginTitle,
                after: input.loginTitle,
              },
              {
                field: 'loginSubtitle',
                before: current?.loginSubtitle ?? defaults.loginSubtitle,
                after: input.loginSubtitle,
              },
              { field: 'logoAssetId', before: beforeLogo, after: input.logoAssetId },
              { field: 'faviconAssetId', before: beforeFavicon, after: input.faviconAssetId },
            ],
          },
          transaction,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) this.versionConflict();
      throw error;
    }
    return this.getAdmin();
  }

  async assetContent(kind: BrandingAssetKind): Promise<ReadableAsset> {
    const configuration = await this.configuration();
    const assetId = kind === 'logo' ? configuration?.logoAssetId : configuration?.faviconAssetId;
    if (!assetId) throw new ApiError(404, 'BRANDING_ASSET_NOT_FOUND', '品牌素材不存在');
    const content = await this.library.content(assetId, false);
    if (!content.contentType.startsWith('image/')) {
      throw new ApiError(409, 'BRANDING_ASSET_INVALID', '品牌素材必须是安全图片');
    }
    return content;
  }

  private async view(): Promise<BrandingConfiguration> {
    const configuration = await this.configuration();
    const defaults = this.defaults();
    const [logo, favicon] = await Promise.all([
      this.assetView(configuration?.logoAssetId ?? null, 'logo'),
      this.assetView(configuration?.faviconAssetId ?? null, 'favicon'),
    ]);
    return {
      appName: configuration?.branding.appName ?? defaults.appName,
      primaryColor: configuration?.branding.primaryColor ?? defaults.primaryColor,
      loginTitle: configuration?.branding.loginTitle ?? defaults.loginTitle,
      loginSubtitle: configuration?.branding.loginSubtitle ?? defaults.loginSubtitle,
      logoAssetId: configuration?.logoAssetId ?? null,
      faviconAssetId: configuration?.faviconAssetId ?? null,
      logoUrl: logo,
      faviconUrl: favicon,
      revision: configuration?.branding.revision ?? 0,
      updatedAt: configuration?.branding.updatedAt.toISOString() ?? null,
    };
  }

  private configuration() {
    return this.database.transaction(async (transaction) => {
      const branding = await this.repository.readLocked(transaction);
      if (!branding) return null;
      const references = await this.references.getMany(
        APPLICATION_BRANDING_REFERENCE.ownerType,
        APPLICATION_BRANDING_REFERENCE.ownerId,
        [APPLICATION_BRANDING_REFERENCE.fields.logo, APPLICATION_BRANDING_REFERENCE.fields.favicon],
        transaction,
      );
      return {
        branding,
        logoAssetId: references[APPLICATION_BRANDING_REFERENCE.fields.logo] ?? null,
        faviconAssetId: references[APPLICATION_BRANDING_REFERENCE.fields.favicon] ?? null,
      };
    });
  }

  private async assetView(assetId: string | null, kind: BrandingAssetKind): Promise<string | null> {
    if (!assetId) return null;
    const asset = await this.library.get(assetId);
    if (asset.status !== 'active' || asset.mediaKind !== 'image' || !asset.checksumSha256)
      return null;
    return `/api/branding/assets/${kind}?v=${asset.checksumSha256.slice(0, 16)}`;
  }

  private defaults() {
    return { ...DEFAULT_BRANDING, appName: this.environment.APP_NAME };
  }

  private versionConflict(): never {
    throw new ApiError(
      409,
      'BRANDING_VERSION_CONFLICT',
      '品牌设置已被其他管理员修改，请刷新后重试',
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== 'object' || current === null) return false;
    if ('code' in current && (current as { code?: unknown }).code === '23505') return true;
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}
