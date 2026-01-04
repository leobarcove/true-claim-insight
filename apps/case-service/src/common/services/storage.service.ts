import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly supabaseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    this.supabaseUrl = this.configService.get<string>('supabase.url') || '';
    this.serviceRoleKey = this.configService.get<string>('supabase.serviceRoleKey') || '';
    this.bucketName = this.configService.get<string>('supabase.bucketName') || '';
  }

  /**
   * Upload a file to Supabase Storage
   * @param fileBuffer The file buffer
   * @param filename Desired filename
   * @param mimeType Mime type of the file
   * @param path Optional sub-path within the bucket
   */
  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    path: string = 'documents'
  ): Promise<string> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      this.logger.error('Supabase configuration missing');
      throw new Error('Storage service not configured');
    }

    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${path}/${timestamp}_${sanitizedFilename}`;

    const baseUrl = this.supabaseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/storage/v1/object/${this.bucketName}/${storagePath}`;

    this.logger.log(`Uploading file to Supabase: ${url}`);

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
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new Error('Storage service not configured');
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
