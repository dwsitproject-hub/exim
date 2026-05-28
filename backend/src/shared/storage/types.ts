/**
 * Storage abstraction types. Implementations: local, NFS, S3, etc.
 */

export interface StorageUploadOptions {
  documentId: string;
  versionId: string;
  fileName: string;
  mimeType?: string;
  /**
   * When set, storage key is `{directoryPrefix}/{leaf}` where leaf is `{stem}_{versionId}{ext}`
   * when `fileName` has an extension (keeps `.pdf` etc. as the real extension).
   * When omitted, `{documentId}/{leaf}`.
   */
  directoryPrefix?: string;
}

export interface StorageUploadResult {
  storageKey: string;
}

export interface StorageDownloadResult {
  stream: NodeJS.ReadableStream;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface IStorageService {
  upload(content: Buffer, options: StorageUploadOptions): Promise<StorageUploadResult>;
  /**
   * Stream from a temp file path into storage, then delete the temp file.
   * Prefer this for large uploads to avoid holding the full file in memory.
   */
  uploadFromPath(sourcePath: string, options: StorageUploadOptions): Promise<StorageUploadResult>;
  download(storageKey: string): Promise<StorageDownloadResult | null>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}
