export { LessonProductsService } from './application/lesson-products.service.js';
export type {
  EnsureInternalLessonPackageForFormationInput,
  LessonPackageDirectory,
  LessonPackageIssuer,
} from './application/lesson-products.service.js';
export type { LessonPackageVersionSnapshot } from './domain/model.js';
export { createLessonProductsModule, createLessonProductsService } from './plugin.js';
