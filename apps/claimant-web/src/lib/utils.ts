import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format Malaysian phone number
 * Converts various formats to +60 format
 */
export function formatMalaysianPhone(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Handle different formats
  if (digits.startsWith('60')) {
    return `+${digits}`;
  } else if (digits.startsWith('0')) {
    return `+60${digits.slice(1)}`;
  } else if (digits.length >= 9 && digits.length <= 10) {
    return `+60${digits}`;
  }

  return phone;
}

/**
 * Validate Malaysian phone number
 */
export function isValidMalaysianPhone(phone: string): boolean {
  const cleanPhone = phone.replace(/\D/g, '');

  // Malaysian mobile numbers: 60 + 1X + 7-8 digits (total 11-12 digits)
  // Or: 0 + 1X + 7-8 digits (total 10-11 digits)
  const mobilePattern = /^(60|0)?1[0-9]{8,9}$/;

  return mobilePattern.test(cleanPhone);
}

/**
 * Convert string to Title Case nicely handling underscores
 * e.g. "THIRD_PARTY_BODILY_INJURY" -> "Third Party Bodily Injury"
 */
export function convertToTitleCase(input: string): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .split(/[_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: string | Date): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
