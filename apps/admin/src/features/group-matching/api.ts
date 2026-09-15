import { createGroupMatchingApi } from '@lingcoo-edu-oms/api-client';
import type {
  AddGroupMatchingEnrollmentRequest,
  CancelGroupMatchingCampaignRequest,
  ConfirmGroupMatchingFormationRequest,
  CreateGroupMatchingCampaignRequest,
  GroupMatchingCampaign,
  GroupMatchingCampaignDetail,
  GroupMatchingCampaignListQuery,
  GroupMatchingEnrollment,
  GroupMatchingFormation,
  GroupMatchingPriceTier,
  RecordGroupMatchingDepositRequest,
  RecordGroupMatchingDepositRefundRequest,
  WithdrawGroupMatchingEnrollmentRequest,
} from '@lingcoo-edu-oms/contracts';

import { appApiClient } from '../identity/api';

export const groupMatchingApi = createGroupMatchingApi(appApiClient);

export type {
  AddGroupMatchingEnrollmentRequest,
  CancelGroupMatchingCampaignRequest,
  ConfirmGroupMatchingFormationRequest,
  CreateGroupMatchingCampaignRequest,
  GroupMatchingCampaign,
  GroupMatchingCampaignDetail,
  GroupMatchingCampaignListQuery,
  GroupMatchingEnrollment,
  GroupMatchingFormation,
  GroupMatchingPriceTier,
  RecordGroupMatchingDepositRequest,
  RecordGroupMatchingDepositRefundRequest,
  WithdrawGroupMatchingEnrollmentRequest,
};
