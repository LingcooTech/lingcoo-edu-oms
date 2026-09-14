export interface LessonPackageVersionSnapshot {
  id: string;
  packageId: string;
  institutionId: string;
  version: number;
  name: string;
  description: string | null;
  saleScope?: 'public' | 'internal';
  originType?: 'group_formation' | null;
  originId?: string | null;
  baseUnits: number;
  bonusUnits: number;
  priceAmount: number;
  currency: 'CNY';
  onlineSaleEnabled: boolean;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
  status: 'active' | 'inactive';
  createdAt: Date;
}
