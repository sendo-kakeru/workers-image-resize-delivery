import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";
import { config } from "dotenv";
import * as v from "valibot";
config();

const ServerEnvSchema = v.object({
  APEX_DOMAIN: v.string(),
  ACCOUNT_ID: v.string(),
  ZONE_ID: v.string(),
});

let env: v.InferOutput<typeof ServerEnvSchema>;
try {
  env = v.parse(ServerEnvSchema, process.env);
} catch (error) {
  if (error instanceof v.ValiError) {
    const invalidPaths = error.issues
      .map((issue) => "\t" + [issue.path?.[0].key, issue.message].join(": "))
      .join("\n");
    throw new Error(
      `Invalid environment variable values detected. Please check the following variables:
${invalidPaths}`
    );
  }
  throw error;
}

const exampleR2Bucket = new cloudflare.R2Bucket("example_r2_bucket", {
  accountId: env.ACCOUNT_ID,
  name: "example-bucket",
  location: "apac",
  storageClass: "Standard",
});
