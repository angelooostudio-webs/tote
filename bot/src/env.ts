/** Worker bindings. Everything secret is set with `wrangler secret put`, never committed. */
export interface Env {
  DB: D1Database;
  SITE_ORIGIN: string;

  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  META_APP_SECRET: string;
  WEBHOOK_VERIFY_TOKEN: string;

  ANTHROPIC_API_KEY: string;
  /** optional: defaults to claude-opus-5-5 */
  CLAUDE_MODEL?: string;

  /** Angelo's WhatsApp number, digits only (e.g. 573001234567). Only this number can run admin actions. */
  ADMIN_NUMBER: string;
  /** "1" = the admin number may also order and pay like a customer, even before opening (for testing) */
  ADMIN_TEST_MODE?: string;
  /** key for the Google Sheet CSV feeds (/sheet/*.csv) */
  SHEET_KEY?: string;
  PAYMENT_NEQUI: string;
  PAYMENT_BANCOLOMBIA: string;
  PAYMENT_HOLDER_NAME: string;
}

/** Everything a handler needs: env, the clock, and the outbound messenger. Injected so tests can fake them. */
export interface Ctx {
  env: Env;
  now: () => Date;
  wa: import("./messenger.ts").Messenger;
  ai: import("./assistant.ts").Assistant;
}
