import * as v from "valibot";

const ServerEnvSchema = v.object({
  APEX_DOMAIN: v.string(),
  ACCOUNT_ID: v.string(),
  ZONE_ID: v.string(),
  CLOUDFLARE_API_TOKEN: v.string(),
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

export { env };
