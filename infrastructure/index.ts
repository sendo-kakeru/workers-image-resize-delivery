import * as cloudflare from "@pulumi/cloudflare";
import { config } from "dotenv";
import { env } from "@workers-image-resize-delivery/common/env";
import { R2_BUCKET_NAME } from "@workers-image-resize-delivery/common/constants";
config();

new cloudflare.R2Bucket("example_r2_bucket", {
  accountId: env.ACCOUNT_ID,
  name: R2_BUCKET_NAME,
  location: "apac",
  storageClass: "Standard",
});
