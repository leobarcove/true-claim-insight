import { Logger } from '@nestjs/common';

export abstract class BaseNormalizer<T> {
  protected readonly logger = new Logger(this.constructor.name);

  abstract normalize(raw: any): T;

  protected toFloat(val: any): number {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    const parsed = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }

  protected toInt(val: any): number {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return Math.floor(val);
    const parsed = parseInt(String(val).replace(/[^0-9]/g, ''), 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  protected toString(val: any): string | null {
    if (val === null || val === undefined) return null;
    return String(val).trim();
  }

  protected toBool(val: any): boolean {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const v = val.toLowerCase();
      return v === 'true' || v === 'yes' || v === '1' || v === 'y';
    }
    return !!val;
  }
}
