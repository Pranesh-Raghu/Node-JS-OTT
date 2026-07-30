// override: true - this machine's shell profile exports a DATABASE_URL for
// an unrelated project, which would otherwise silently take precedence over
// this project's own .env (dotenv, by default, never overwrites a variable
// that's already set in process.env).
require('dotenv').config({ override: true });
const { z } = require('zod');

const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(1000),
    // Single connection string (matches the Expense_tracker project's
    // pattern) rather than discrete DB_HOST/USER/PASS/NAME - this is what
    // free external Postgres hosts (Neon, Supabase) hand you, and it's one
    // fewer thing to get wrong assembling by hand.
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    console.error('Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
}

module.exports = Object.freeze(parsed.data);
