/**
 * Presigned URL generation for Cloudflare R2.
 *
 * Generates time-limited PUT (upload) and GET (download) URLs that
 * clients can use directly without routing traffic through the API server.
 * All keys are tenant-scoped automatically.
 */

import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client, getBucketName, scopedKey } from "./client";

const DEFAULT_EXPIRES_IN = 900; // 15 minutes

export interface PresignedUrl {
  url: string;
  key: string;
  expiresIn: number;
}

/**
 * Generate a presigned PUT URL for uploading a file.
 *
 * @param tenantId - tenant scope prefix
 * @param key - object key (within tenant scope)
 * @param contentType - MIME type of the upload
 * @param expiresIn - seconds until URL expires (default 900 = 15 min)
 */
export async function generateUploadUrl(
  tenantId: string,
  key: string,
  contentType: string,
  expiresIn: number = DEFAULT_EXPIRES_IN,
): Promise<PresignedUrl | null> {
  const client = getS3Client();
  if (!client) return null;

  const fullKey = scopedKey(tenantId, key);
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: fullKey,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, { expiresIn });

  return { url, key: fullKey, expiresIn };
}

/**
 * Generate a presigned GET URL for downloading a file.
 *
 * @param tenantId - tenant scope prefix
 * @param key - object key (within tenant scope)
 * @param expiresIn - seconds until URL expires (default 900 = 15 min)
 */
export async function generateDownloadUrl(
  tenantId: string,
  key: string,
  expiresIn: number = DEFAULT_EXPIRES_IN,
): Promise<PresignedUrl | null> {
  const client = getS3Client();
  if (!client) return null;

  const fullKey = scopedKey(tenantId, key);
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: fullKey,
  });

  const url = await getSignedUrl(client, command, { expiresIn });

  return { url, key: fullKey, expiresIn };
}
