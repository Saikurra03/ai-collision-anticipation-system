import type { RiskLevel } from '../types';

export const RISK_COLORS: Record<string, string> = {
  SAFE: '#16A34A',
  LOW: '#16A34A',
  MEDIUM: '#F59E0B',
  HIGH: '#F97316',
  CRITICAL: '#DC2626',
};

export function riskColor(level: RiskLevel | undefined): string {
  if (!level) return '#94A3B8';
  return RISK_COLORS[level as string] ?? '#94A3B8';
}

export function riskBadgeClasses(level: RiskLevel | undefined): string {
  switch ((level ?? '').toString()) {
    case 'CRITICAL':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'HIGH':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'MEDIUM':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'LOW':
    case 'SAFE':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function isDisplayable(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function fmtSeconds(value: number | null | undefined, digits = 2): string {
  if (!isDisplayable(value)) return 'N/A';
  return `${value.toFixed(digits)} sec`;
}

export function fmtInt(value: number | null | undefined): string {
  if (!isDisplayable(value)) return 'N/A';
  return value.toLocaleString();
}

export function fmtFloat(value: number | null | undefined, digits = 1): string {
  if (!isDisplayable(value)) return 'N/A';
  return value.toFixed(digits);
}
