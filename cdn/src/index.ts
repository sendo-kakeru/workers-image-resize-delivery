import { Hono } from "hono";
import { vValidator } from "@hono/valibot-validator";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  IMAGE_DELIVERY_PATH,
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
import type {
  R2Bucket,
  RequestInitCfPropertiesImage,
} from "@cloudflare/workers-types";
import { etag } from "hono/etag";
import { cache } from "hono/cache";

type Bindings = {
  BUCKET: R2Bucket;
};

type Variables = {
  r2Client: S3Client;
};

const app = new Hono<{
  Variables: Variables;
  Bindings: Bindings;
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
    allowMethods: ["GET", "POST"],
  })
);

app.use("*", etag());

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
  vValidator("json", SignedUrlRequestSchema),
  async (c) => {
    const { NEXT_PUBLIC_CDN_URL } = env<Env>(c);
    const { path, extension } = c.req.valid("json");
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
      return c.json({ url: signedUrl, key: `${path}/${key}.${extension}` });
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
);

app.get(
  `${IMAGE_DELIVERY_PATH}/*`,
  cache({
    cacheName: "image-delivery",
  }),
  async (c) => {
    const { NEXT_PUBLIC_CDN_URL, BUCKET_URL } = env<Env>(c);
    const pathPrefix = `/${IMAGE_DELIVERY_PATH}/`;
    const key = c.req.path.substring(pathPrefix.length);

    if (!key || key.includes("..") || key.startsWith("/")) {
      return c.json(
        {
          type: `${NEXT_PUBLIC_CDN_URL}/problem/invalid`,
          title: "Bad Request",
          detail: "Invalid request",
          instance: c.req.path,
        },
        400,
        {
          "Content-Type": "application/problem+json",
          "Content-Language": "en",
        }
      );
    }
    try {
      const url = new URL(c.req.url);
      const width = url.searchParams.get("width");
      const height = url.searchParams.get("height");

      if (
        (width && Number(width) > 3000) ||
        (height && Number(height) > 3000)
      ) {
        return c.json(
          {
            type: `${NEXT_PUBLIC_CDN_URL}/problem/invalid`,
            title: "Bad Request",
            detail: "Image dimensions exceed maximum allowed size (3000px)",
            instance: c.req.path,
          },
          400,
          {
            "Content-Type": "application/problem+json",
            "Content-Language": "en",
          }
        );
      }

      // 本番でカスタムドメインをつけた時のみ、image resizeが適応されるので開発時は効かない
      const response = await fetch(`${BUCKET_URL}/${key}`, {
        cf: {
          image: {
            width: width ?? undefined,
            height: height ?? undefined,
            format: "webp",
            metadata: "none",
          },
        },
      } as RequestInit & {
        cf: {
          image: RequestInitCfPropertiesImage;
        };
      });

      const buffer = await response.arrayBuffer();
      const headers = new Headers(response.headers);
      headers.set("ETag", await generateETag(c.req.url));
      headers.set("Cache-Control", "public, max-age=315360000, immutable");

      return new Response(buffer, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });

      // R2を直接参照して加工するのは現状難しそう https://community.cloudflare.com/t/image-resize-from-r2-bucket-source/481816
      // const url = new URL(c.req.url);
      // const object = await c.env.BUCKET.get(key);
      // if (!object) {
      //   return c.notFound();
      // }
      // const width = url.searchParams.get("width");
      // const height = url.searchParams.get("height");

      // if ((width && Number(width) > 3000) || (height && Number(height) > 3000)) {
      //   return new Response("Invalid value for " + key, { status: 400 });
      // }

      // return fetch(c.req.raw, {
      //   method: "POST",
      //   body: await object.arrayBuffer(),
      //   cf: {
      //     image: {
      //       width: width ? width : undefined,
      //       height: height ? height : undefined,
      //       format: "webp",
      //       metadata: "none",
      //     },
      //   },
      // } as RequestInit & {
      //   cf: {
      //     image: RequestInitCfPropertiesImage;
      //   };
      // });
    } catch (error) {
      console.error("Failed to fetch object:", error);
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
);

export default app;

async function generateETag(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `"${hashHex}"`;
}
