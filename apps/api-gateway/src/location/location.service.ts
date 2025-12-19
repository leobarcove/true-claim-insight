import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly nominatimUrl = 'https://nominatim.openstreetmap.org/search';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {}

  async searchAddress(query: string, limit: number = 5) {
    if (!query || query.length < 3) {
      return [];
    }

    try {
      this.logger.debug(`Searching address for: ${query}`);

      const { data } = await firstValueFrom(
        this.httpService.get(this.nominatimUrl, {
          params: {
            q: query,
            format: 'json',
            countrycodes: 'my',
            limit: limit,
            addressdetails: 1,
          },
          headers: {
            'User-Agent': 'TrueClaimInsight/1.0',
          },
        })
      );

      return data.map((item: any) => ({
        displayName: item.display_name,
        lat: item.lat,
        lon: item.lon,
        type: item.type,
      }));
    } catch (error: any) {
      this.logger.error(`Failed to fetch address from Nominatim: ${error.message}`, error.stack);
      // Return empty array instead of throwing to prevent breaking the UI
      return [];
    }
  }
}
