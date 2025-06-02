import * as v from "valibot";
import { IMAGE_EXTENSIONS } from "./constants";

export const SignedUrlRequestSchema = v.object({
  path: v.pipe(
    v.string(),
    v.transform((input) => input.replace(/^\/+|\/+$/g, "")),
    v.regex(/^[a-zA-Z0-9\-_\/]+$/, "Path contains invalid characters"),
    v.custom(
      (input) => (typeof input === "string" ? !input.includes("..") : false),
      "Path traversal patterns are not allowed"
    )
  ),
  extension: v.pipe(
    v.string(),
    v.transform((input) => input.toLowerCase()),
    v.union(IMAGE_EXTENSIONS.map((extension) => v.literal(extension)))
  ),
});

export const SignedUrlResponseSchema = v.object({
  url: v.pipe(v.string(), v.url()),
  key: v.string(),
});
