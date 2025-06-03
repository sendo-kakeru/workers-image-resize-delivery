import * as v from "valibot";

const EnvSchema = v.object({
  NEXT_PUBLIC_CDN_URL: v.pipe(v.string(), v.url()),
  APP_URL: v.pipe(v.string(), v.url()),
  // CLOUDFLARE_APEX_DOMAIN: v.string(),
  CLOUDFLARE_ACCOUNT_ID: v.string(),
  // ZONE_ID: v.string(),
  CLOUDFLARE_API_TOKEN: v.string(),
  CLOUDFLARE_R2_ENDPOINT: v.pipe(v.string(), v.url()),
  CLOUDFLARE_R2_ACCESS_KEY_ID: v.string(),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: v.string(),
});

export type Env = v.InferOutput<typeof EnvSchema>;

let env: Env;
try {
  env = v.parse(EnvSchema, process.env);
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

export { env };
