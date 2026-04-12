/**
 * @back-to-the-future/storage — Cloudflare R2 file storage layer.
 *
 * Provides tenant-scoped file operations, presigned URL generation,
 * and Hono middleware for multipart uploads.
 */

export {
  getS3Client,
  getBucketName,
  scopedKey,
  uploadFile,
  downloadFile,
  deleteFile,
  fileExists,
  getFileMetadata,
  type UploadResult,
  type DownloadResult,
  type FileMetadata,
} from "./client";

export {
  generateUploadUrl,
  generateDownloadUrl,
  type PresignedUrl,
} from "./presigned";

export {
  uploadMiddleware,
  validateFileSize,
  validateContentType,
  getMaxUploadSizeBytes,
  DEFAULT_ALLOWED_TYPES,
  type UploadMiddlewareOptions,
  type UploadedFile,
} from "./middleware";
