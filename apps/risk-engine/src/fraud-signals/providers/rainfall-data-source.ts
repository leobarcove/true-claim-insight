import { Injectable, Logger } from '@nestjs/common';

/**
 * Result of a rainfall query: total millimetres recorded in a 24-hour
 * window centred on a date, plus contextual metadata that helps the
 * provider craft human-readable signal messages.
 */
export interface RainfallReading {
  /** Rainfall in millimetres over the 24-hour window. */
  rainfallMm: number;
  /** Name of the nearest weather station (or postcode area). */
  stationName: string;
  /** ISO date for which the reading applies. */
  date: string;
  /**
   * Optional named event reference (e.g. "Banjir Klang Valley Dis 2021").
   * When set, the provider links the claim to a recognised catastrophe.
   */
  namedEventRef?: string;
  /** Whether MetMalaysia issued an Amaran Hujan (rainfall warning) that day. */
  warningIssued?: boolean;
  /** Confidence in the reading, 0..1. Real stations score higher than interpolated areas. */
  confidence: number;
}

/**
 * Abstraction over the rainfall data source so we can swap a stubbed
 * implementation for a real MetMalaysia API client without touching the
 * provider. Plug in MetMalaysiaApiDataSource later by binding it to this
 * token in the module — same interface, real data.
 */
export interface RainfallDataSource {
  /**
   * Look up rainfall for a postcode on a given date. May return null if
   * the postcode is unknown or the date is outside the data window.
   */
  getRainfall(postcode: string, isoDate: string): Promise<RainfallReading | null>;
}

export const RAINFALL_DATA_SOURCE = Symbol('RAINFALL_DATA_SOURCE');

/**
 * Stubbed rainfall data — deterministic from (postcode + date) so the
 * same inputs always return the same result. Biased toward realistic
 * Malaysian patterns:
 *  - Klang Valley (postcodes 40xxx, 41xxx, 47xxx, 50xxx-59xxx) during
 *    monsoon (Dec-Feb): high rainfall, with named events for Dec 2021
 *    and Dec 2024 floods.
 *  - East Coast (Kelantan 15xxx-18xxx, Terengganu 20xxx-24xxx, Pahang
 *    25xxx-28xxx) during NE monsoon (Nov-Mar): heavy.
 *  - Postcode 40400 (Shah Alam, where the seeded demo claim lives):
 *    guaranteed heavy reading so the demo always demonstrates a positive
 *    parametric trigger.
 *  - Other postcodes: light to moderate based on a deterministic hash.
 *
 * Replace with MetMalaysiaApiDataSource (calling api.met.gov.my) when
 * the API key is procured.
 */
@Injectable()
export class StubRainfallDataSource implements RainfallDataSource {
  private readonly logger = new Logger(StubRainfallDataSource.name);

  async getRainfall(
    postcode: string,
    isoDate: string
  ): Promise<RainfallReading | null> {
    if (!postcode || !/^\d{5}$/.test(postcode)) {
      this.logger.debug(
        `getRainfall: invalid postcode "${postcode}" — returning null`
      );
      return null;
    }

    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return null;

    const reading = this.simulate(postcode, date);
    this.logger.debug(
      `getRainfall: ${postcode} on ${isoDate} → ${reading.rainfallMm}mm at ${reading.stationName}`
    );
    return reading;
  }

  /**
   * Compute a deterministic but realistic-looking reading. The shape:
   *   base (region + season) + jitter (postcode hash)
   * Deterministic = always same output for same input, so demos and
   * tests are stable.
   */
  private simulate(postcode: string, date: Date): RainfallReading {
    const stationName = this.stationFor(postcode);
    const region = this.regionFor(postcode);
    const month = date.getMonth(); // 0=Jan
    const monsoon = isMonsoon(month, region);

    // Base rainfall by region + season (mm/24h).
    let base = 5;
    if (region === 'klang_valley') base = monsoon ? 80 : 25;
    if (region === 'east_coast') base = monsoon ? 120 : 35;
    if (region === 'other_peninsular') base = monsoon ? 40 : 18;
    if (region === 'east_malaysia') base = 30; // less seasonal in Borneo
    if (region === 'unknown') base = 10;

    // Deterministic jitter from postcode+date — keeps stability across
    // re-evaluations but produces variation across claims.
    const jitter = hashRange(`${postcode}-${date.toISOString().slice(0, 10)}`, -15, 60);
    let rainfallMm = Math.max(0, Math.round(base + jitter));

    // The demo claim's postcode always returns a strong reading so the
    // parametric trigger fires for screenshots and screen-recordings.
    if (postcode === '40400') {
      rainfallMm = Math.max(rainfallMm, 138);
    }

    const namedEventRef = this.matchNamedEvent(date, region);
    const warningIssued = rainfallMm > 60;
    // Confidence reflects "real station vs interpolation": Klang Valley
    // and KL have dense networks; rural areas are sparser.
    const confidence =
      region === 'klang_valley' || region === 'east_coast' ? 0.92 : 0.7;

    return {
      rainfallMm,
      stationName,
      date: date.toISOString().slice(0, 10),
      namedEventRef,
      warningIssued,
      confidence,
    };
  }

  private regionFor(postcode: string):
    | 'klang_valley'
    | 'east_coast'
    | 'other_peninsular'
    | 'east_malaysia'
    | 'unknown' {
    const prefix = postcode.slice(0, 2);
    const klangValley = new Set([
      '40',
      '41',
      '42',
      '43',
      '46',
      '47',
      '48',
      '50',
      '51',
      '52',
      '53',
      '54',
      '55',
      '56',
      '57',
      '58',
      '59',
      '60',
      '62',
      '63',
      '64',
      '68',
    ]);
    if (klangValley.has(prefix)) return 'klang_valley';
    if (['15', '16', '17', '18', '20', '21', '22', '23', '24', '25', '26', '27', '28'].includes(prefix))
      return 'east_coast';
    if (['09', '10', '11', '12', '13', '14', '30', '31', '32', '33', '34', '35', '36', '70', '71', '72', '73', '75', '76', '77', '78', '79', '80', '81', '82', '83', '84', '85', '86'].includes(prefix))
      return 'other_peninsular';
    if (['87', '88', '89', '90', '91', '92', '93', '94', '95', '96', '97', '98'].includes(prefix))
      return 'east_malaysia';
    return 'unknown';
  }

  private stationFor(postcode: string): string {
    const prefix = postcode.slice(0, 2);
    const map: Record<string, string> = {
      '40': 'Shah Alam',
      '41': 'Klang',
      '47': 'Petaling Jaya',
      '50': 'KL Central',
      '53': 'Setapak',
      '57': 'Bukit Jalil',
      '15': 'Kota Bharu',
      '21': 'Kuala Terengganu',
      '25': 'Kuantan',
      '88': 'Kota Kinabalu',
      '93': 'Kuching',
    };
    return map[prefix] ?? `Postcode area ${prefix}xxx`;
  }

  /**
   * Link claims to recognised flood events that actually happened so
   * demos look authentic. Conservative — we only attach a named event
   * when both the date window and region match.
   */
  private matchNamedEvent(date: Date, region: string): string | undefined {
    const y = date.getFullYear();
    const m = date.getMonth();
    if (region === 'klang_valley' && y === 2021 && m === 11)
      return 'Banjir Besar Lembah Klang Disember 2021';
    if (region === 'klang_valley' && y === 2024 && (m === 11 || m === 0))
      return 'Banjir Lembah Klang 2024';
    if (region === 'east_coast' && (m === 10 || m === 11 || m === 0))
      return `NE Monsoon ${y}/${(y + 1).toString().slice(2)}`;
    return undefined;
  }
}

function isMonsoon(monthIndex: number, region: string): boolean {
  if (region === 'klang_valley' || region === 'other_peninsular') {
    return monthIndex === 10 || monthIndex === 11 || monthIndex === 0 || monthIndex === 1;
  }
  if (region === 'east_coast') {
    return monthIndex >= 10 || monthIndex <= 2; // Nov - Mar
  }
  return false;
}

/**
 * Deterministic hash → integer in [min, max]. djb2 variant with bit
 * mixing; not cryptographic, but stable across Node versions.
 */
function hashRange(input: string, min: number, max: number): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  const range = max - min;
  return min + (h % (range + 1));
}
