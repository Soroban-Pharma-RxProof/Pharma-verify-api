import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/index.js';

export class StorageService {
  private static s3Client: S3Client | null = null;

  private static getClient(): S3Client | null {
    if (config.S3_ACCESS_KEY && config.S3_SECRET_KEY && config.S3_ENDPOINT) {
      if (!this.s3Client) {
        this.s3Client = new S3Client({
          region: config.S3_REGION,
          endpoint: config.S3_ENDPOINT,
          credentials: {
            accessKeyId: config.S3_ACCESS_KEY,
            secretAccessKey: config.S3_SECRET_KEY,
          },
          forcePathStyle: config.S3_FORCE_PATH_STYLE,
        });
      }
      return this.s3Client;
    }
    return null;
  }

  /**
   * Upload a licensing document buffer to S3 or local directory
   */
  public static async uploadDocument(
    filename: string,
    fileBuffer: Buffer,
    contentType = 'application/pdf',
  ): Promise<string> {
    const key = `licenses/${Date.now()}-${filename}`;
    const client = this.getClient();

    if (client) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.S3_BUCKET,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
        }),
      );
      return `${config.S3_ENDPOINT}/${config.S3_BUCKET}/${key}`;
    }

    // Local filesystem storage fallback
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const localFilePath = path.join(uploadsDir, filename);
    fs.writeFileSync(localFilePath, fileBuffer);
    return `/uploads/${filename}`;
  }

  /**
   * Generate retrieval URL of uploaded document
   */
  public static async getDownloadUrl(docUrl: string): Promise<string> {
    return docUrl;
  }
}
