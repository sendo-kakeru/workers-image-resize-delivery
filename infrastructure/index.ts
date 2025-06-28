import * as fs from "fs";
import * as cloudflare from "@pulumi/cloudflare";
import { config } from "dotenv";
import { env } from "@workers-image-resize-delivery/common/env";
import {
  R2_BUCKET_NAME,
  R2_BUCKET_REGION,
} from "@workers-image-resize-delivery/common/constants";
import { build } from "esbuild";

config();

const accountId = env.CLOUDFLARE_ACCOUNT_ID;
const zoneId = env.ZONE_ID;

const bucket = new cloudflare.R2Bucket("example_r2_bucket", {
  accountId,
  name: R2_BUCKET_NAME,
  location: R2_BUCKET_REGION,
  storageClass: "Standard",
});

new cloudflare.R2BucketCors(
  "r2_bucket_cors",
  {
    accountId,
    bucketName: R2_BUCKET_NAME,
    rules: [
      {
        allowed: {
          origins: [env.NEXT_PUBLIC_CDN_URL, env.APP_URL],
          methods: ["GET", "PUT"],
          headers: ["*"],
        },
      },
    ],
  },
  { dependsOn: [bucket] }
);

new cloudflare.R2CustomDomain(
  "r2_bucket_domain",
  {
    accountId,
    bucketName: R2_BUCKET_NAME,
    domain: env.ASSETS_DOMAIN,
    enabled: true,
    zoneId,
  },
  { dependsOn: [bucket] }
);

(async () => {
  await build({
    entryPoints: ["../cdn/src/index.ts"],
    platform: "browser",
    bundle: true,
    outfile: "../cdn/dist/worker.js",
    format: "esm",
    minify: true,
  });

  const workers_script = new cloudflare.WorkersScript(
    "workers-script",
    {
      accountId: accountId,
      content: fs.readFileSync("../cdn/dist/worker.js", "utf8"),
      scriptName: "assets-delivery-workers-script",
      mainModule: "worker.js",
      bindings: [
        {
          name: "APP_URL",
          type: "plain_text",
          secretName: "APP_URL",
          text: env.APP_URL,
        },
        {
          name: "NEXT_PUBLIC_CDN_URL",
          type: "plain_text",
          secretName: "NEXT_PUBLIC_CDN_URL",
          text: env.NEXT_PUBLIC_CDN_URL,
        },
        {
          name: "ASSETS_URL",
          type: "plain_text",
          secretName: "ASSETS_URL",
          text: env.ASSETS_URL,
        },
        {
          name: "CLOUDFLARE_R2_ENDPOINT",
          type: "secret_text",
          secretName: "CLOUDFLARE_R2_ENDPOINT",
          text: env.CLOUDFLARE_R2_ENDPOINT,
        },
        {
          name: "CLOUDFLARE_R2_ACCESS_KEY_ID",
          type: "secret_text",
          secretName: "CLOUDFLARE_R2_ACCESS_KEY_ID",
          text: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        },
        {
          name: "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
          type: "secret_text",
          secretName: "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
          text: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        },
      ],
    },
    { dependsOn: [bucket] }
  );

  new cloudflare.WorkersCustomDomain(
    "workers_custom_domain",
    {
      accountId,
      environment: "production",
      hostname: env.CDN_DOMAIN,
      service: workers_script.scriptName,
      zoneId,
    },
    { dependsOn: [workers_script] }
  );
})();
