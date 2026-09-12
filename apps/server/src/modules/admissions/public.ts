export { AdmissionsService } from './application/admissions.service.js';
export type {
  AdmissionReservationPayerDirectory,
  AdmissionReservationPayments,
} from './domain/model.js';
export { createAdmissionsModule, createAdmissionsService } from './plugin.js';
