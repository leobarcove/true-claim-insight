/**
 * Category configuration registry — central typed map per ClaimCategory.
 *
 * This mirrors the backend's FraudSignalProvider plugin pattern: adding a
 * new claim category = adding an entry here. Every category-aware
 * component reads from this registry instead of branching on category
 * with switch statements.
 *
 * When `claim.category` lands a new value, fill in the registry entry and
 * every category-aware UI surface automatically renders correctly.
 */
import {
  Car,
  Flame,
  Home,
  Shield,
  Stethoscope,
  Waves,
  Zap,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ClaimCategory } from '@tci/shared-types';

// Runtime constants matching the ClaimCategory enum. Defined here as
// string literals so we don't pay the CommonJS interop cost of importing
// the enum value from the shared-types dist (which is CJS, not ESM).
const CATEGORY = {
  MOTOR: 'MOTOR' as ClaimCategory,
  FLOOD: 'FLOOD' as ClaimCategory,
  FIRE: 'FIRE' as ClaimCategory,
  LIGHTNING: 'LIGHTNING' as ClaimCategory,
  BURGLARY: 'BURGLARY' as ClaimCategory,
  PERSONAL_ACCIDENT: 'PERSONAL_ACCIDENT' as ClaimCategory,
  HOH: 'HOH' as ClaimCategory,
  OTHER: 'OTHER' as ClaimCategory,
};

export interface CategoryConfig {
  /** ClaimCategory enum value */
  key: ClaimCategory;
  /** Human-readable label shown in UI */
  label: string;
  /** One-line description for selectors */
  description: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Tailwind text color class for icon */
  iconColor: string;
  /** Tailwind background tint for badges/cards */
  accentBg: string;
  /** Tailwind text color for badges */
  accentText: string;
  /** Whether this category is enabled in the current MVP */
  enabled: boolean;
}

export const categoryConfig = {
  [CATEGORY.MOTOR]: {
    key: CATEGORY.MOTOR,
    label: 'Motor',
    description: 'Vehicle damage, accidents, theft',
    icon: Car,
    iconColor: 'text-blue-600',
    accentBg: 'bg-blue-50 dark:bg-blue-950/30',
    accentText: 'text-blue-700 dark:text-blue-300',
    enabled: true,
  },
  [CATEGORY.FLOOD]: {
    key: CATEGORY.FLOOD,
    label: 'Flood',
    description: 'Property and contents flood damage',
    icon: Waves,
    iconColor: 'text-cyan-600',
    accentBg: 'bg-cyan-50 dark:bg-cyan-950/30',
    accentText: 'text-cyan-700 dark:text-cyan-300',
    enabled: true,
  },
  [CATEGORY.FIRE]: {
    key: CATEGORY.FIRE,
    label: 'Fire',
    description: 'Fire damage to property and contents',
    icon: Flame,
    iconColor: 'text-orange-600',
    accentBg: 'bg-orange-50 dark:bg-orange-950/30',
    accentText: 'text-orange-700 dark:text-orange-300',
    enabled: false,
  },
  [CATEGORY.LIGHTNING]: {
    key: CATEGORY.LIGHTNING,
    label: 'Lightning',
    description: 'Electrical surge damage from lightning strike',
    icon: Zap,
    iconColor: 'text-yellow-600',
    accentBg: 'bg-yellow-50 dark:bg-yellow-950/30',
    accentText: 'text-yellow-700 dark:text-yellow-300',
    enabled: false,
  },
  [CATEGORY.BURGLARY]: {
    key: CATEGORY.BURGLARY,
    label: 'Burglary',
    description: 'Theft or break-in claims',
    icon: Shield,
    iconColor: 'text-purple-600',
    accentBg: 'bg-purple-50 dark:bg-purple-950/30',
    accentText: 'text-purple-700 dark:text-purple-300',
    enabled: false,
  },
  [CATEGORY.PERSONAL_ACCIDENT]: {
    key: CATEGORY.PERSONAL_ACCIDENT,
    label: 'Personal Accident',
    description: 'Injury, medical, disability',
    icon: Stethoscope,
    iconColor: 'text-red-600',
    accentBg: 'bg-red-50 dark:bg-red-950/30',
    accentText: 'text-red-700 dark:text-red-300',
    enabled: false,
  },
  [CATEGORY.HOH]: {
    key: CATEGORY.HOH,
    label: 'Houseowner / Householder',
    description: 'Multi-peril home insurance (fire + flood + burglary)',
    icon: Home,
    iconColor: 'text-emerald-600',
    accentBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    accentText: 'text-emerald-700 dark:text-emerald-300',
    enabled: false,
  },
  [CATEGORY.OTHER]: {
    key: CATEGORY.OTHER,
    label: 'Other',
    description: 'Other general insurance claims',
    icon: HelpCircle,
    iconColor: 'text-gray-600',
    accentBg: 'bg-gray-50 dark:bg-gray-950/30',
    accentText: 'text-gray-700 dark:text-gray-300',
    enabled: false,
  },
} as Record<ClaimCategory, CategoryConfig>;

export function getCategoryConfig(category: ClaimCategory | string | null | undefined): CategoryConfig {
  if (!category) return categoryConfig[CATEGORY.OTHER];
  return categoryConfig[category as ClaimCategory] ?? categoryConfig[CATEGORY.OTHER];
}

export function enabledCategories(): CategoryConfig[] {
  return Object.values(categoryConfig).filter(c => c.enabled);
}
