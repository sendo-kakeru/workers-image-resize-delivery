import { Hono } from "hono";
import { vValidator } from "@hono/valibot-validator";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  IMAGE_DELIVERY_PATH,
  IMAGE_EXTENSION_TO_CONTENT_TYPE_MAP,
  IMAGE_UPLOAD_PATH,
  R2_BUCKET_NAME,
  R2_BUCKET_REGION,
} from "@workers-image-resize-delivery/common/constants";
import { SignedUrlRequestSchema } from "@workers-image-resize-delivery/common/schema";
import { createMiddleware } from "hono/factory";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { cors } from "hono/cors";
import type { RequestInitCfPropertiesImage } from "@cloudflare/workers-types";

const envVars = {
  NEXT_PUBLIC_CDN_URL: "",
  ASSETS_URL: "",
  APP_URL: "",
  CLOUDFLARE_R2_ENDPOINT: "",
  CLOUDFLARE_R2_ACCESS_KEY_ID: "",
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: "",
};

type Variables = {
  r2Client: S3Client;
};

const app = new Hono<{
  Variables: Variables;
  Bindings: typeof envVars;
}>();

let r2Client: S3Client | null = null;

app.use(
  "*",
  cors({
    origin: (_origin, c) => c.env.APP_URL,
    allowHeaders: ["Accept, Content-Type, Content-Length, Authorization"],
    allowMethods: ["GET", "POST"],
  })
);

app.use(
  createMiddleware(async (c, next) => {
    if (!envVars.CLOUDFLARE_R2_ENDPOINT) {
      Object.assign(envVars, c.env);
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
  `/${IMAGE_UPLOAD_PATH}`,
  vValidator("json", SignedUrlRequestSchema),
  async (c) => {
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
          type: `${c.env.NEXT_PUBLIC_CDN_URL}/problem/internal-error`,
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

app.get(`/${IMAGE_DELIVERY_PATH}/*`, async (c) => {
  const pathPrefix = `/${IMAGE_DELIVERY_PATH}/`;
  const key = c.req.path.substring(pathPrefix.length);

  if (!key || key.includes("..") || key.startsWith("/")) {
    return c.json(
      {
        type: `${c.env.NEXT_PUBLIC_CDN_URL}/problem/invalid`,
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

    if ((width && Number(width) > 3000) || (height && Number(height) > 3000)) {
      return c.json(
        {
          type: `${c.env.NEXT_PUBLIC_CDN_URL}/problem/invalid`,
          title: "Bad Request",
          detail: "Image dimensions must not exceed 3000px",
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
    return fetch(
      new Request(`${c.env.ASSETS_URL}/${key}`, { headers: c.req.raw.headers }),
      {
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
      }
    );

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
        type: `${c.env.NEXT_PUBLIC_CDN_URL}/problem/internal-error`,
        title: "Internal Server Error",
        detail: "Failed to fetch image",
        instance: c.req.path,
      },
      500,
      {
        "Content-Type": "application/problem+json",
        "Content-Language": "en",
      }
    );
  }
});

export default app;
