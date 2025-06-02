export const R2_BUCKET_NAME = "my-bucket";

export const R2_BUCKET_REGION = "apac";

export const IMAGE_EXTENSION_TO_CONTENT_TYPE_MAP = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
} as const;

export type ImageExtension = keyof typeof IMAGE_EXTENSION_TO_CONTENT_TYPE_MAP;
export type ImageContentType =
  (typeof IMAGE_EXTENSION_TO_CONTENT_TYPE_MAP)[ImageExtension];

export const IMAGE_EXTENSIONS = Object.keys(
  IMAGE_EXTENSION_TO_CONTENT_TYPE_MAP
) as ImageExtension[];

export const MAXIMUM_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
