import { Context, Hono } from "hono";
import { vValidator } from "@hono/valibot-validator";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  IMAGE_EXTENSION_TO_CONTENT_TYPE_MAP,
  R2_BUCKET_NAME,
  R2_BUCKET_REGION,
} from "@workers-image-resize-delivery/common/constants";
import { SignedUrlRequestSchema } from "@workers-image-resize-delivery/common/schema";
import { Env } from "@workers-image-resize-delivery/common/env";
import { createMiddleware } from "hono/factory";
import { env } from "hono/adapter";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { cors } from "hono/cors";

type Variables = {
  r2Client: S3Client;
};

const app = new Hono<{
  Variables: Variables;
}>();

let r2Client: S3Client | null = null;
const envVars = {
  CLOUDFLARE_R2_ENDPOINT: "",
  CLOUDFLARE_R2_ACCESS_KEY_ID: "",
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: "",
};

app.use(
  "*",
  cors({
    origin: (_origin, c) => {
      const { APP_URL } = env<Env>(c);
      return APP_URL;
    },
    allowHeaders: ["*"],
    allowMethods: ["POST", "GET"],
  })
);

app.use(
  createMiddleware(async (c, next) => {
    if (!envVars.CLOUDFLARE_R2_ENDPOINT) {
      const envData = env<Env>(c);
      Object.assign(envVars, envData);
    }
    if (!r2Client) {
      r2Client = new S3Client({
        region: R2_BUCKET_REGION,
        endpoint: envVars.CLOUDFLARE_R2_ENDPOINT,
        credentials: {
          accessKeyId: envVars.CLOUDFLARE_R2_ACCESS_KEY_ID,
          secretAccessKey: envVars.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
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
    SignedUrlRequestSchema,
    async (
      { success, output, issues },
      c: Context<{ Variables: Variables }>
    ) => {
      const { NEXT_PUBLIC_CDN_URL } = env<Env>(c);
      if (!success) {
        return c.json(
          {
            type: `${NEXT_PUBLIC_CDN_URL}/problem/invalid`,
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
      try {
        const signedUrl = await getSignedUrl(
          c.var.r2Client,
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: `${path}/${key}.${extension}`,
            ContentType: IMAGE_EXTENSION_TO_CONTENT_TYPE_MAP[extension],
          }),
          {
            expiresIn: 3600,
          }
        );
        return c.json({ url: signedUrl, key });
      } catch (error) {
        console.error("Failed to generate signed URL:", error);
        return c.json(
          {
            type: `${NEXT_PUBLIC_CDN_URL}/problem/internal-error`,
            title: "Internal Server Error",
            detail: "Failed to generate signed URL",
            instance: c.req.path,
          },
          500,
          {
            "Content-Type": "application/problem+json",
            "Content-Language": "en",
          }
        );
      }
    }
  )
);

export default app;
