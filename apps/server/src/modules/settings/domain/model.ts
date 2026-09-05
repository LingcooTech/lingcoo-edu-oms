import type {
  SettingConnectionTestResult,
  SettingControl,
  SettingKind,
  SettingOption,
  SettingSource,
} from '@lingcoo-edu-oms/contracts';
import type { ZodType } from 'zod';

export interface SettingDefinition<T = unknown> {
  key: string;
  group: string;
  groupLabel: string;
  groupOrder?: number;
  label: string;
  description: string;
  kind: SettingKind;
  schema: ZodType<T>;
  environment?: string;
  defaultValue?: T;
  control: SettingControl;
  options?: SettingOption[];
}

export interface ResolvedSetting<T = unknown> {
  definition: SettingDefinition<T>;
  value?: T;
  source: SettingSource;
  version: number | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface SettingsConnectionTester {
  key: string;
  group: string;
  label: string;
  description: string;
  requiredSettings: string[];
  timeoutMs?: number;
  test(
    values: ReadonlyMap<string, unknown>,
    signal: AbortSignal,
  ): Promise<Omit<SettingConnectionTestResult, 'testedAt'>>;
}

export interface SettingsReader {
  // Server-only capability. Provider adapters may resolve Secret plaintext at execution time;
  // inject this port explicitly and never pass its values to HTTP responses or logs.
  getValue<T = unknown>(key: string): Promise<T | undefined>;
  publicValues(): Promise<Record<string, unknown>>;
}
