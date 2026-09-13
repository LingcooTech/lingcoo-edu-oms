import {
  addGroupMatchingEnrollmentRequestSchema,
  cancelGroupMatchingCampaignRequestSchema,
  confirmGroupMatchingFormationRequestSchema,
  createGroupMatchingCampaignRequestSchema,
  groupMatchingCampaignDetailSchema,
  groupMatchingCampaignListQuerySchema,
  groupMatchingCampaignPageSchema,
  groupMatchingCampaignSchema,
  groupMatchingEnrollmentSchema,
  groupMatchingFormationSchema,
  idSchema,
  publishGroupMatchingCampaignRequestSchema,
  recordGroupMatchingDepositRequestSchema,
  updateGroupMatchingCampaignRequestSchema,
  type AddGroupMatchingEnrollmentRequest,
  type CancelGroupMatchingCampaignRequest,
  type ConfirmGroupMatchingFormationRequest,
  type CreateGroupMatchingCampaignRequest,
  type GroupMatchingCampaignListQuery,
  type PublishGroupMatchingCampaignRequest,
  type RecordGroupMatchingDepositRequest,
  type UpdateGroupMatchingCampaignRequest,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function pathId(value: string): string {
  return encodeURIComponent(idSchema.parse(value));
}

function queryString(input: GroupMatchingCampaignListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function collectionPath(institutionId: string): string {
  return `/api/institutions/${pathId(institutionId)}/group-matching/campaigns`;
}

function campaignPath(institutionId: string, campaignId: string): string {
  return `${collectionPath(institutionId)}/${pathId(campaignId)}`;
}

function enrollmentPath(institutionId: string, campaignId: string, enrollmentId: string): string {
  return `${campaignPath(institutionId, campaignId)}/enrollments/${pathId(enrollmentId)}`;
}

export function createGroupMatchingApi(client: ApiClient) {
  return {
    list(institutionId: string, input: Partial<GroupMatchingCampaignListQuery> = {}) {
      const query = groupMatchingCampaignListQuerySchema.parse(input);
      return client.request({
        path: `${collectionPath(institutionId)}${queryString(query)}`,
        schema: groupMatchingCampaignPageSchema,
      });
    },
    get(institutionId: string, campaignId: string) {
      return client.request({
        path: campaignPath(institutionId, campaignId),
        schema: groupMatchingCampaignDetailSchema,
      });
    },
    create(institutionId: string, input: CreateGroupMatchingCampaignRequest) {
      return client.request({
        method: 'POST',
        path: collectionPath(institutionId),
        body: createGroupMatchingCampaignRequestSchema.parse(input),
        schema: groupMatchingCampaignSchema,
      });
    },
    update(institutionId: string, campaignId: string, input: UpdateGroupMatchingCampaignRequest) {
      return client.request({
        method: 'PATCH',
        path: campaignPath(institutionId, campaignId),
        body: updateGroupMatchingCampaignRequestSchema.parse(input),
        schema: groupMatchingCampaignSchema,
      });
    },
    publish(institutionId: string, campaignId: string, input: PublishGroupMatchingCampaignRequest) {
      return client.request({
        method: 'POST',
        path: `${campaignPath(institutionId, campaignId)}/actions/publish`,
        body: publishGroupMatchingCampaignRequestSchema.parse(input),
        schema: groupMatchingCampaignSchema,
      });
    },
    addEnrollment(
      institutionId: string,
      campaignId: string,
      input: AddGroupMatchingEnrollmentRequest,
    ) {
      return client.request({
        method: 'POST',
        path: `${campaignPath(institutionId, campaignId)}/enrollments`,
        body: addGroupMatchingEnrollmentRequestSchema.parse(input),
        schema: groupMatchingEnrollmentSchema,
      });
    },
    recordDeposit(
      institutionId: string,
      campaignId: string,
      enrollmentId: string,
      input: RecordGroupMatchingDepositRequest,
    ) {
      return client.request({
        method: 'POST',
        path: `${enrollmentPath(institutionId, campaignId, enrollmentId)}/deposit`,
        body: recordGroupMatchingDepositRequestSchema.parse(input),
        schema: groupMatchingEnrollmentSchema,
      });
    },
    confirmFormation(
      institutionId: string,
      campaignId: string,
      input: ConfirmGroupMatchingFormationRequest,
    ) {
      return client.request({
        method: 'POST',
        path: `${campaignPath(institutionId, campaignId)}/formation`,
        body: confirmGroupMatchingFormationRequestSchema.parse(input),
        schema: groupMatchingFormationSchema,
      });
    },
    cancel(institutionId: string, campaignId: string, input: CancelGroupMatchingCampaignRequest) {
      return client.request({
        method: 'POST',
        path: `${campaignPath(institutionId, campaignId)}/actions/cancel`,
        body: cancelGroupMatchingCampaignRequestSchema.parse(input),
        schema: groupMatchingCampaignSchema,
      });
    },
  };
}

export type GroupMatchingApi = ReturnType<typeof createGroupMatchingApi>;
