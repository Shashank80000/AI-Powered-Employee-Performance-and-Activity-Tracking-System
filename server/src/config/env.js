import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load server/.env when present (Node 20.12+). Real environment variables win.
const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // How long a sign-in lasts (zeit/ms format: '3d', '12h', '30m').
  JWT_EXPIRES_IN: z.string().regex(/^\d+\s*(ms|s|m|h|d|w|y)?$/, 'Use a duration like 3d, 12h or 30m').default('3d'),
  // Sign-ins from the desktop agent, which keeps tracking without the person signing in again every few days.
  // Changing or resetting the password, or deactivating the account, still ends them at once.
  AGENT_JWT_EXPIRES_IN: z.string().regex(/^\d+\s*(ms|s|m|h|d|w|y)?$/, 'Use a duration like 30d or 12h').default('30d'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  // The organisation's time zone: every "day" (dashboards, daily records, screenshots, analyses) runs midnight to
  // midnight here. Set it to where people work, e.g. Asia/Kolkata. Read by utils/dateUtils.js.
  APP_TIMEZONE: z
    .string()
    .default('UTC')
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, 'Use an IANA time zone name such as Asia/Kolkata or UTC'),
  // One-click "Explore as Admin / Manager / Employee" sign-in with the seeded demo accounts.
  // It signs people in without a password, so it is always off when NODE_ENV=production (see below).
  DEMO_MODE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  // AI agent (/api/agent): Claude interprets the backend's verified metrics. Without a key the agent still works,
  // answering from fixed rules. Keep the key on the server only; it is never sent to browsers.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AGENT_MODEL: z.string().min(1).default('claude-opus-5-5'),
  // Re-run a request on Anthropic's recommended model when the safety classifier declines it (Claude API only;
  // set false on Bedrock, Vertex or Foundry).
  AGENT_REFUSAL_FALLBACK: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  // Requests to the agent per person per hour (each may call the model once).
  AGENT_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(30),
  // Shared secret for the analysis agent's internal API. Internal routes are disabled without it.
  SERVICE_API_KEY: z.string().min(32, 'SERVICE_API_KEY must be at least 32 characters').optional(),
  // Desktop agent installers offered on the website's download page (see `npm run agent:publish`).
  DOWNLOADS_DIR: z.string().default(fileURLToPath(new URL('../../storage/downloads', import.meta.url))),
  // "owner/repo": offer the installers attached to that repository's latest GitHub Release instead of DOWNLOADS_DIR
  // (defaults to RENDER_GIT_REPO_SLUG on Render).
  DOWNLOADS_GITHUB_REPO: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'Use owner/repo').optional(),
  // Optional token for the GitHub API (unauthenticated requests are limited to 60 an hour per IP, shared on Render).
  GITHUB_TOKEN: z.string().optional(),
  SCREENSHOT_DIR: z.string().default(fileURLToPath(new URL('../../storage/screenshots', import.meta.url))),
  SCREENSHOT_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
  // Every screenshot (image and record) is deleted this many days after it was taken.
  SCREENSHOT_RETENTION_DAYS: z.coerce.number().int().min(1).max(30).default(3),
  // camera-agent checks the webcam this often; each observation stands for this many minutes.
  CAMERA_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
  // Camera observations (labels only, never images) are deleted after this many days.
  CAMERA_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(30)
});

// On Render, offer the installers released from the repository the service deploys from.
if (process.env.RENDER_GIT_REPO_SLUG) process.env.DOWNLOADS_GITHUB_REPO ??= process.env.RENDER_GIT_REPO_SLUG;

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid server configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

// Demo sign-in skips the password, so it is never available in production, whatever DEMO_MODE says.
if (parsed.data.NODE_ENV === 'production' && parsed.data.DEMO_MODE) {
  console.warn('DEMO_MODE=true is ignored because NODE_ENV=production: demo sign-in would skip passwords.');
  parsed.data.DEMO_MODE = false;
}

export const env = parsed.data;
