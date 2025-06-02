import { Context, Hono } from "hono";
import { vValidator } from "@hono/valibot-validator";
import v from "valibot";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  imageExtensions,
  ImageExtensionToContentTypeMap,
  R2_BUCKET_NAME,
  R2_BUCKET_REGION,
} from "@workers-image-resize-delivery/common/constants";
import { Env } from "@workers-image-resize-delivery/common/env";
import { createMiddleware } from "hono/factory";
import { env } from "hono/adapter";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type Variables = {
  r2Client: S3Client;
};

const app = new Hono<{
  Variables: Variables;
}>();

let r2Client: S3Client | null = null;

app.use(
  createMiddleware(async (c, next) => {
    if (!r2Client) {
      const {
        CLOUDFLARE_R2_ENDPOINT,
        CLOUDFLARE_R2_ACCESS_KEY_ID,
        CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      } = env<Env>(c);
      r2Client = new S3Client({
        region: R2_BUCKET_REGION,
        endpoint: CLOUDFLARE_R2_ENDPOINT,
        credentials: {
          accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID,
          secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        },
      });
    }
    c.set("r2Client", r2Client);
    await next();
  })
);

app.post(
  "/signed-url",
  vValidator(
    "json",
    v.object({
      path: v.pipe(
        v.string(),
        v.transform((input) => input.replace(/\/+$/, "")),
        v.regex(/^[a-zA-Z0-9\-_\/]+$/, "Path contains invalid characters"),
        v.custom(
          (input) =>
            typeof input === "string" ? !input.includes("..") : false,
          "Path traversal patterns are not allowed"
        )
      ),
      extension: v.pipe(
        v.string(),
        v.transform((input) => input.toLowerCase()),
        v.union(imageExtensions.map((extension) => v.literal(extension)))
      ),
    }),
    async (
      { success, output, issues },
      c: Context<{ Variables: Variables }>
    ) => {
      if (!success) {
        return c.json(
          {
            type: `${env<Env>(c).CDN_URL}/problem/invalid`,
            title: "Bad Request",
            detail: "Invalid request",
            instance: c.req.path,
            invalidParams: issues,
          },
          400,
          {
            "Content-Type": "application/problem+json",
            "Content-Language": "en",
          }
        );
      }
      const { path, extension } = output;
      const key = crypto.randomUUID();
      const signedUrl = await getSignedUrl(
        c.var.r2Client,
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: `${path}/${key}.${extension}`,
          ContentType: ImageExtensionToContentTypeMap[extension],
        }),
        {
          expiresIn: 3600,
        }
      );
      return c.json({ url: signedUrl, key });
    }
  )
);

export default app;
