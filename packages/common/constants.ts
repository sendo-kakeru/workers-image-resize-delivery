export const R2_BUCKET_NAME = "my-bucket";

export const R2_BUCKET_REGION = "apac";

export const ImageExtensionToContentTypeMap = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
} as const;

export type ImageExtension = keyof typeof ImageExtensionToContentTypeMap;
export type ImageContentType =
  (typeof ImageExtensionToContentTypeMap)[ImageExtension];

export const imageExtensions = Object.keys(
  ImageExtensionToContentTypeMap
) as ImageExtension[];
