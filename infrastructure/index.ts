import * as cloudflare from "@pulumi/cloudflare";
import { config } from "dotenv";
import { env } from "@workers-image-resize-delivery/common/env";
import {
  R2_BUCKET_NAME,
  R2_BUCKET_REGION,
} from "@workers-image-resize-delivery/common/constants";
// import { local } from "@pulumi/command";

config();

const accountId = env.CLOUDFLARE_ACCOUNT_ID;

new cloudflare.R2Bucket("example_r2_bucket", {
  accountId,
  name: R2_BUCKET_NAME,
  location: R2_BUCKET_REGION,
  storageClass: "Standard",
});

new cloudflare.R2BucketCors("r2_bucket_cors", {
  accountId,
  bucketName: R2_BUCKET_NAME,
  rules: [
    {
      allowed: {
        origins: [env.APP_URL],
        methods: ["PUT"],
        headers: ["*"],
      },
    },
  ],
});

// workersをデプロイする場合は下記
// new local.Command("run-deploy", {
//   create: "cd ../cdn && pnpm run deploy"
// });
