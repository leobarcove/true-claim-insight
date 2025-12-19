import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date || typeof date === 'object' && !(date instanceof Date)) {
    return 'N/A';
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return 'N/A';
  }
  return new Intl.DateTimeFormat('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date || typeof date === 'object' && !(date instanceof Date)) {
    return 'N/A';
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return 'N/A';
  }
  return new Intl.DateTimeFormat('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
  }).format(amount);
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return `${str.slice(0, length)}...`;
}

export function getDaysSince(date: string | Date | null | undefined): number {
  if (!date) return 0;
  const start = new Date(date).getTime();
  if (isNaN(start)) return 0;
  
  const now = new Date().getTime();
  const diff = now - start;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}
