import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

class GCSClient {
  private storage: Storage;
  private bucketName: string;

  constructor() {
    // Load config
    const configPath = path.join(process.cwd(), 'config', 'config.yaml');
    let config: any = {};
    
    try {
      if (fs.existsSync(configPath)) {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        config = yaml.load(fileContents) || {};
      }
    } catch (error) {
      console.warn('Failed to load config file, using environment variables:', error);
    }
    
    // Get bucket name from config or environment variable
    this.bucketName = 
      config?.admin?.gcs?.bucket ||
      process.env.GCS_BUCKET ||
      '';
    
    if (!this.bucketName) {
      throw new Error('GCS_BUCKET environment variable or config file is required');
    }

    // Get project ID from config or environment variable
    const projectId = 
      config?.admin?.gcs?.project_id ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      '';

    this.storage = new Storage({
      projectId: projectId,
    });
  }

  async uploadImage(
    fileBuffer: Buffer,
    filename: string,
    bookSafeTitle: string,
    contentType?: string
  ): Promise<{ gcsKey: string; url: string }> {
    const bucket = this.storage.bucket(this.bucketName);
    const gcsKey = `books/${bookSafeTitle}/images/${filename}`;
    const gcsFile = bucket.file(gcsKey);

    // Determine content type from filename if not provided
    let mimeType = contentType || 'image/png';
    if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
      mimeType = 'image/jpeg';
    } else if (filename.endsWith('.png')) {
      mimeType = 'image/png';
    } else if (filename.endsWith('.gif')) {
      mimeType = 'image/gif';
    } else if (filename.endsWith('.webp')) {
      mimeType = 'image/webp';
    }

    await gcsFile.save(fileBuffer, {
      metadata: {
        contentType: mimeType,
      },
    });

    // Make file publicly readable (optional, or use signed URLs)
    await gcsFile.makePublic();

    const url = `https://storage.googleapis.com/${this.bucketName}/${gcsKey}`;
    return { gcsKey, url };
  }

  async deleteImage(gcsKey: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    await bucket.file(gcsKey).delete();
  }

  getPublicUrl(gcsKey: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${gcsKey}`;
  }
}

// Singleton instance
let gcsClient: GCSClient | null = null;

export function getGCSClient(): GCSClient {
  if (!gcsClient) {
    gcsClient = new GCSClient();
  }
  return gcsClient;
}

