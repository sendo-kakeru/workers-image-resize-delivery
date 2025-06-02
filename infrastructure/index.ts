import * as cloudflare from "@pulumi/cloudflare";
import { config } from "dotenv";
import { env } from "@workers-image-resize-delivery/common/env";
import {
  R2_BUCKET_NAME,
  R2_BUCKET_REGION,
} from "@workers-image-resize-delivery/common/constants";
config();

new cloudflare.R2Bucket("example_r2_bucket", {
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  name: R2_BUCKET_NAME,
  location: R2_BUCKET_REGION,
  storageClass: "Standard",
});

new cloudflare.R2BucketCors("r2_bucket_cors", {
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  bucketName: R2_BUCKET_NAME,
  rules: [
    {
      allowed: {
        origins: [env.APP_URL],
        methods: ["GET", "POST"],
        headers: ["*"],
      },
    },
  ],
});
