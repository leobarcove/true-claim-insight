import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly supabaseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly bucketName: string;
  private readonly localStorageEnabled: boolean;
  private readonly localStorageRoot: string;
  private readonly localPublicBase: string;

  constructor(private readonly configService: ConfigService) {
    // These should be in your .env
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL') || '';
    this.serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || '';
    this.bucketName = this.configService.get<string>('SUPABASE_BUCKET_NAME') || 'claims';
    // Filesystem fallback (matches the case-service + risk-analyzer
    // pattern). Activates when Supabase isn't configured — Trinity
    // reports get written under apps/risk-engine/storage/ and served
    // via /storage/* through @fastify/static (registered in main.ts).
    this.localStorageEnabled = !this.supabaseUrl || !this.serviceRoleKey;
    this.localStorageRoot = join(process.cwd(), 'storage');
    this.localPublicBase =
      this.configService.get<string>('RISK_ENGINE_PUBLIC_URL') || 'http://localhost:3004';

    if (this.localStorageEnabled) {
      this.logger.log(
        `Supabase not configured; Trinity reports will land in ${this.localStorageRoot}`
      );
    }
  }

  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    path: string = 'intelligence-reports'
  ): Promise<string> {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${path}/${timestamp}_${sanitizedFilename}`;

    if (this.localStorageEnabled) {
      const dest = join(this.localStorageRoot, this.bucketName, storagePath);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, fileBuffer);
      this.logger.log(`(local) Trinity report saved to ${dest}`);
      return storagePath;
    }

    const baseUrl = this.supabaseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/storage/v1/object/${this.bucketName}/${storagePath}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.serviceRoleKey}`,
          'x-upsert': 'true',
          'Content-Type': mimeType,
        },
        body: fileBuffer,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Upload failed: ${errorText}`);
        throw new Error(`Failed to upload file: ${response.statusText}`);
      }

      this.logger.log(`File uploaded successfully: ${storagePath}`);
      return storagePath;
    } catch (error: any) {
      this.logger.error(`Error uploading file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate a signed URL for a private file
   * @param storagePath Path to the file in the bucket
   * @param expiresIn Expiration time in seconds (default 1 hour)
   */
  async getSignedUrl(storagePath: string, expiresIn: number = 3600): Promise<string> {
    if (this.localStorageEnabled) {
      const base = this.localPublicBase.replace(/\/$/, '');
      return `${base}/storage/${this.bucketName}/${storagePath}`;
    }

    const baseUrl = this.supabaseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/storage/v1/object/sign/${this.bucketName}/${storagePath}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate signed URL: ${response.statusText}`);
      }

      const data = (await response.json()) as { signedURL?: string; signedUrl?: string };
      let signedUrl = data.signedURL || data.signedUrl;

      if (!signedUrl) {
        throw new Error('Signed URL not found in response');
      }

      // If it's a relative path, prepend the base URL
      if (signedUrl.startsWith('/')) {
        signedUrl = `${baseUrl}/storage/v1${signedUrl}`;
      }

      return signedUrl;
    } catch (error: any) {
      this.logger.error(`Error generating signed URL: ${error.message}`);
      throw error;
    }
  }
}
