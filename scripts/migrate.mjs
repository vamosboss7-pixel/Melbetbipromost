/**
 * Safe additive migration — adds missing columns and tables without
 * dropping or altering existing data. Run once against the Neon DB.
 */
import pg from "pg";

const connectionString =
  process.env["NEON_DATABASE_URL"] ??
  process.env["DATABASE_URL"] ??
  process.env["DATABASE_PRIVATE_URL"] ??
  process.env["DATABASE_PUBLIC_URL"] ??
  process.env["POSTGRES_URL"];

if (!connectionString) {
  console.error("❌  No database URL found in environment");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log("✅  Connected to database");

async function run(sql, label) {
  try {
    await client.query(sql);
    console.log(`  ✓ ${label}`);
  } catch (e) {
    console.error(`  ✗ ${label}: ${e.message}`);
  }
}

// ─── players: add missing columns (safe — won't touch existing data) ──────────
const playerCols = [
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS deposit_balance  NUMERIC(12,2) NOT NULL DEFAULT 0.00`,  "players.deposit_balance"],
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS main_balance     NUMERIC(12,2) NOT NULL DEFAULT 0.00`,  "players.main_balance"],
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS bonus_balance    NUMERIC(12,2) NOT NULL DEFAULT 0.00`,  "players.bonus_balance"],
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS wagering_required  NUMERIC(12,2) NOT NULL DEFAULT 0.00`, "players.wagering_required"],
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS wagering_completed NUMERIC(12,2) NOT NULL DEFAULT 0.00`, "players.wagering_completed"],
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS has_active_wagering BOOLEAN NOT NULL DEFAULT false`,     "players.has_active_wagering"],
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS is_active        BOOLEAN NOT NULL DEFAULT true`,         "players.is_active"],
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS invited_by       BIGINT`,                                "players.invited_by"],
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS total_invite_bonus NUMERIC(12,2) NOT NULL DEFAULT 0.00`,"players.total_invite_bonus"],
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS agent_balance    NUMERIC(12,2) NOT NULL DEFAULT 0.00`,  "players.agent_balance"],
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS has_claimed_channel_bonus BOOLEAN NOT NULL DEFAULT false`,"players.has_claimed_channel_bonus"],
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS preferred_balance TEXT NOT NULL DEFAULT 'main_first'`,  "players.preferred_balance"],
  [`ALTER TABLE players ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMP NOT NULL DEFAULT now()`,      "players.updated_at"],
];
console.log("\n── players columns ──");
for (const [sql, label] of playerCols) await run(sql, label);

// Migrate old balance → main_balance and play_balance → deposit_balance
// Only copy when the new column is still 0 (i.e. hasn't been filled yet).
console.log("\n── migrate old balance data ──");
await run(
  `UPDATE players SET main_balance = balance WHERE main_balance = 0 AND balance IS NOT NULL AND balance <> 0`,
  "copy balance → main_balance"
);
await run(
  `UPDATE players SET deposit_balance = play_balance WHERE deposit_balance = 0 AND play_balance IS NOT NULL AND play_balance <> 0`,
  "copy play_balance → deposit_balance"
);

// ─── transactions ──────────────────────────────────────────────────────────────
console.log("\n── transactions columns ──");
await run(
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS note TEXT`,
  "transactions.note"
);

// ─── game_rounds ───────────────────────────────────────────────────────────────
console.log("\n── game_rounds columns ──");
await run(
  `ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS room_id TEXT NOT NULL DEFAULT 'room1'`,
  "game_rounds.room_id"
);
await run(
  `ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS card_ids TEXT NOT NULL DEFAULT '[]'`,
  "game_rounds.card_ids"
);
await run(
  `ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS stake NUMERIC(12,2) NOT NULL DEFAULT 0`,
  "game_rounds.stake"
);
await run(
  `ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS prize NUMERIC(12,2) NOT NULL DEFAULT 0`,
  "game_rounds.prize"
);
await run(
  `ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS winners_count INTEGER NOT NULL DEFAULT 0`,
  "game_rounds.winners_count"
);

// ─── pending_deposits ──────────────────────────────────────────────────────────
console.log("\n── pending_deposits columns ──");
await run(
  `ALTER TABLE pending_deposits ADD COLUMN IF NOT EXISTS confirmation_text TEXT`,
  "pending_deposits.confirmation_text"
);
await run(
  `ALTER TABLE pending_deposits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now()`,
  "pending_deposits.updated_at"
);

// ─── pending_withdrawals ───────────────────────────────────────────────────────
console.log("\n── pending_withdrawals columns ──");
await run(
  `ALTER TABLE pending_withdrawals ADD COLUMN IF NOT EXISTS account_name TEXT NOT NULL DEFAULT ''`,
  "pending_withdrawals.account_name"
);
await run(
  `ALTER TABLE pending_withdrawals ADD COLUMN IF NOT EXISTS note TEXT`,
  "pending_withdrawals.note"
);
await run(
  `ALTER TABLE pending_withdrawals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now()`,
  "pending_withdrawals.updated_at"
);

// ─── device_fingerprints ───────────────────────────────────────────────────────
console.log("\n── device_fingerprints table ──");
await run(`
  CREATE TABLE IF NOT EXISTS device_fingerprints (
    fingerprint TEXT PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
  )`, "device_fingerprints"
);

// ─── daily_checkins ────────────────────────────────────────────────────────────
console.log("\n── daily_checkins table ──");
await run(`
  CREATE TABLE IF NOT EXISTS daily_checkins (
    id               SERIAL PRIMARY KEY,
    telegram_id      BIGINT NOT NULL UNIQUE,
    current_streak   INTEGER NOT NULL DEFAULT 0,
    last_checkin_date DATE,
    created_at       TIMESTAMP NOT NULL DEFAULT now(),
    updated_at       TIMESTAMP NOT NULL DEFAULT now()
  )`, "daily_checkins"
);

// ─── player_achievements ───────────────────────────────────────────────────────
console.log("\n── player_achievements table ──");
await run(`
  CREATE TABLE IF NOT EXISTS player_achievements (
    id             SERIAL PRIMARY KEY,
    telegram_id    BIGINT NOT NULL,
    achievement_id TEXT NOT NULL,
    claimed_at     TIMESTAMP NOT NULL DEFAULT now()
  )`, "player_achievements"
);
await run(`
  CREATE UNIQUE INDEX IF NOT EXISTS player_achievements_telegram_achievement_uidx
    ON player_achievements (telegram_id, achievement_id)
`, "player_achievements unique index"
);

// ─── app_settings ──────────────────────────────────────────────────────────────
console.log("\n── app_settings table ──");
await run(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
  )`, "app_settings"
);

// ─── auto_deposits ─────────────────────────────────────────────────────────────
console.log("\n── auto_deposits tables ──");
await run(`
  CREATE TABLE IF NOT EXISTS auto_deposits (
    id               SERIAL PRIMARY KEY,
    transaction_code TEXT NOT NULL UNIQUE,
    amount           NUMERIC(15,2),
    amount_requested NUMERIC(15,2),
    telegram_id      BIGINT,
    first_name       TEXT,
    sms_raw          TEXT,
    sms_received_at  TIMESTAMP,
    bot_received_at  TIMESTAMP,
    status           TEXT NOT NULL DEFAULT 'pending',
    credited_at      TIMESTAMP,
    created_at       TIMESTAMP NOT NULL DEFAULT now()
  )`, "auto_deposits"
);
await run(`
  CREATE TABLE IF NOT EXISTS deposit_code_attempts (
    id               SERIAL PRIMARY KEY,
    telegram_id      BIGINT NOT NULL,
    transaction_code TEXT NOT NULL,
    is_valid         BOOLEAN NOT NULL DEFAULT false,
    attempt_count    INTEGER NOT NULL DEFAULT 1,
    created_at       TIMESTAMP NOT NULL DEFAULT now()
  )`, "deposit_code_attempts"
);

// ─── lucky_box ─────────────────────────────────────────────────────────────────
console.log("\n── lucky_box tables ──");
await run(`
  CREATE TABLE IF NOT EXISTS lucky_box_sessions (
    id               SERIAL PRIMARY KEY,
    title            TEXT NOT NULL,
    description      TEXT,
    image_base64     TEXT,
    total_boxes      INTEGER NOT NULL,
    amount_per_box   NUMERIC(12,2) NOT NULL,
    claimed_count    INTEGER NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'active',
    channel_message_id BIGINT,
    created_by       BIGINT,
    created_at       TIMESTAMP NOT NULL DEFAULT now()
  )`, "lucky_box_sessions"
);
await run(`
  CREATE TABLE IF NOT EXISTS lucky_box_claims (
    id          SERIAL PRIMARY KEY,
    session_id  INTEGER NOT NULL,
    box_number  INTEGER NOT NULL,
    telegram_id BIGINT NOT NULL,
    first_name  TEXT NOT NULL,
    username    TEXT,
    amount      NUMERIC(12,2) NOT NULL,
    claimed_at  TIMESTAMP NOT NULL DEFAULT now()
  )`, "lucky_box_claims"
);

// ─── promo_codes ───────────────────────────────────────────────────────────────
console.log("\n── promo_codes tables ──");
await run(`
  CREATE TABLE IF NOT EXISTS promo_codes (
    id           SERIAL PRIMARY KEY,
    code         TEXT NOT NULL UNIQUE,
    bonus_amount NUMERIC(12,2) NOT NULL,
    max_uses     INTEGER NOT NULL DEFAULT 1,
    used_count   INTEGER NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    game_type    TEXT NOT NULL DEFAULT 'both',
    created_by   BIGINT,
    created_at   TIMESTAMP NOT NULL DEFAULT now(),
    expires_at   TIMESTAMP
  )`, "promo_codes"
);
await run(`
  CREATE TABLE IF NOT EXISTS promo_code_usages (
    id            SERIAL PRIMARY KEY,
    promo_code_id INTEGER NOT NULL,
    telegram_id   BIGINT NOT NULL,
    used_at       TIMESTAMP NOT NULL DEFAULT now()
  )`, "promo_code_usages"
);

// ─── promoter_applications ─────────────────────────────────────────────────────
console.log("\n── promoter_applications table ──");
await run(`
  CREATE TABLE IF NOT EXISTS promoter_applications (
    id                    SERIAL PRIMARY KEY,
    telegram_id           BIGINT NOT NULL,
    first_name            TEXT NOT NULL,
    full_name             TEXT NOT NULL,
    gender                TEXT NOT NULL,
    telegram_username     TEXT NOT NULL,
    social_media_platforms TEXT NOT NULL,
    follower_count        TEXT NOT NULL,
    message               TEXT,
    status                TEXT NOT NULL DEFAULT 'pending',
    reviewed_at           TIMESTAMP,
    created_at            TIMESTAMP NOT NULL DEFAULT now(),
    updated_at            TIMESTAMP NOT NULL DEFAULT now()
  )`, "promoter_applications"
);

// ─── scheduled_broadcasts ──────────────────────────────────────────────────────
console.log("\n── scheduled_broadcasts table ──");
await run(`
  CREATE TABLE IF NOT EXISTS scheduled_broadcasts (
    id           SERIAL PRIMARY KEY,
    message      TEXT NOT NULL,
    image_url    TEXT,
    scheduled_at TIMESTAMP NOT NULL,
    is_daily     BOOLEAN NOT NULL DEFAULT false,
    is_sent      BOOLEAN NOT NULL DEFAULT false,
    sent_at      TIMESTAMP,
    created_at   TIMESTAMP NOT NULL DEFAULT now()
  )`, "scheduled_broadcasts"
);

await client.end();
console.log("\n✅  Migration complete");
