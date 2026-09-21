import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { bot } from "./lib/bot";
import { setupGameSocket } from "./lib/gameSocket";
import { appSettings } from "./lib/settings";
import { startAutoReportCron } from "./lib/autoReport";
import { startAutoScheduleCron, startDailyPlayBonusCron } from "./lib/autoSchedule";
import { db } from "./lib/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
setupGameSocket(httpServer);

async function ensureTablesExist() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL UNIQUE,
        first_name TEXT NOT NULL,
        last_name TEXT,
        username TEXT,
        photo_url TEXT,
        role TEXT NOT NULL DEFAULT 'player',
        balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        play_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        agent_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_invite_bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
        invited_by BIGINT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL,
        type TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pending_deposits (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL,
        first_name TEXT,
        amount NUMERIC(12,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        confirmation_text TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pending_withdrawals (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL,
        first_name TEXT,
        amount NUMERIC(12,2) NOT NULL,
        phone TEXT NOT NULL,
        account_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS game_rounds (
        id SERIAL PRIMARY KEY,
        round_id TEXT NOT NULL,
        telegram_id BIGINT NOT NULL,
        card_ids TEXT NOT NULL,
        stake NUMERIC(12,2) NOT NULL,
        result TEXT NOT NULL,
        prize NUMERIC(12,2) NOT NULL DEFAULT 0,
        winners_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        bonus_amount NUMERIC(12,2) NOT NULL,
        max_uses INTEGER NOT NULL DEFAULT 1,
        used_count INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        game_type TEXT NOT NULL DEFAULT 'bingo',
        created_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP
      )
    `);
    await db.execute(sql`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'bingo'`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS promo_code_usages (
        id SERIAL PRIMARY KEY,
        promo_code_id INTEGER NOT NULL,
        telegram_id BIGINT NOT NULL,
        used_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS deposit_code_attempts (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL,
        code TEXT NOT NULL,
        is_valid BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS device_fingerprints (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL,
        fingerprint TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS promoter_applications (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL,
        first_name TEXT NOT NULL,
        full_name TEXT NOT NULL,
        gender TEXT NOT NULL,
        telegram_username TEXT NOT NULL,
        social_media_platforms TEXT NOT NULL,
        follower_count TEXT NOT NULL,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scheduled_broadcasts (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        image_url TEXT,
        scheduled_at TIMESTAMP NOT NULL,
        is_daily BOOLEAN NOT NULL DEFAULT FALSE,
        is_sent BOOLEAN NOT NULL DEFAULT FALSE,
        sent_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auto_deposits (
        id SERIAL PRIMARY KEY,
        transaction_code TEXT NOT NULL UNIQUE,
        amount NUMERIC(15,2),
        amount_requested NUMERIC(15,2),
        telegram_id BIGINT,
        first_name TEXT,
        sms_raw TEXT,
        sms_received_at TIMESTAMP,
        bot_received_at TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'pending',
        credited_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE deposit_code_attempts ADD COLUMN IF NOT EXISTS transaction_code TEXT`);
    await db.execute(sql`ALTER TABLE deposit_code_attempts ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS play_balance NUMERIC(12,2) NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS agent_balance NUMERIC(12,2) NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS has_claimed_channel_bonus BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS total_invite_bonus NUMERIC(12,2) NOT NULL DEFAULT 0`);
    // Columns added in later schema revisions — idempotent via IF NOT EXISTS
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS main_balance NUMERIC(12,2) NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS bonus_balance NUMERIC(12,2) NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS has_active_wagering BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS wagering_required NUMERIC(12,2) NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS wagering_completed NUMERIC(12,2) NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS preferred_balance TEXT NOT NULL DEFAULT 'main_first'`);
    await db.execute(sql`ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS room_id TEXT NOT NULL DEFAULT 'room1'`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS lucky_box_sessions (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        image_base64 TEXT,
        total_boxes INTEGER NOT NULL,
        amount_per_box NUMERIC(12,2) NOT NULL,
        claimed_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        channel_message_id BIGINT,
        created_by BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS lucky_box_claims (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL,
        box_number INTEGER NOT NULL,
        telegram_id BIGINT NOT NULL,
        first_name TEXT NOT NULL,
        username TEXT,
        amount NUMERIC(12,2) NOT NULL,
        claimed_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    // Sync sequences to avoid duplicate primary key errors after DB restores/migrations.
    // Each SERIAL sequence is advanced to MAX(id) so the next insert never collides.
    const serialTables = [
      "transactions",
      "pending_deposits",
      "pending_withdrawals",
      "game_rounds",
      "promo_codes",
      "promo_code_usages",
      "app_settings",
      "deposit_code_attempts",
      "device_fingerprints",
      "promoter_applications",
      "scheduled_broadcasts",
      "auto_deposits",
      "lucky_box_sessions",
      "lucky_box_claims",
    ];
    for (const table of serialTables) {
      try {
        await db.execute(
          sql.raw(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM "${table}"`)
        );
      } catch {
        // Table may not have been created yet — harmless, skip
      }
    }

    logger.info("DB tables ensured");
  } catch (err) {
    logger.warn({ err }, "DB table ensure step failed — tables may already exist");
  }
}

// ── Start listening IMMEDIATELY so Railway's healthcheck passes ──────────────
// DB init, settings, crons, and bot setup all run in the background after
// the server is already accepting connections.
httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ── Background init (DB / settings / crons / bot) ─────────────────────────
  (async () => {
    try {
      await appSettings.init();
      logger.info("App settings loaded");
    } catch (settingsErr) {
      logger.error({ err: settingsErr }, "Failed to initialize app settings — continuing");
    }

    try {
      await ensureTablesExist();
    } catch (tableErr) {
      logger.error({ err: tableErr }, "ensureTablesExist failed — continuing");
    }

    startAutoReportCron();
    startAutoScheduleCron();
    startDailyPlayBonusCron();

    const replitDomains = process.env["REPLIT_DOMAINS"];
    const webhookDomain = process.env["WEBHOOK_DOMAIN"];
    const railwayDomain = process.env["RAILWAY_PUBLIC_DOMAIN"];
    const renderDomain = process.env["RENDER_EXTERNAL_HOSTNAME"];

    const domain = webhookDomain
      ?? railwayDomain
      ?? renderDomain
      ?? (replitDomains ? replitDomains.split(",")[0]!.trim() : null);

    const botReady = !!process.env["TELEGRAM_BOT_TOKEN"];
    if (botReady) {
      // Register persistent command menu (visible at all times in chat)
      bot.api.setMyCommands([
        { command: "start",    description: "🎱 ጨዋታ ጀምር / ዋና ሜኑ" },
        { command: "balance",  description: "💳 ባላንስ ማየት" },
        { command: "deposit",  description: "💰 ገንዘብ ማስገባት (Deposit)" },
        { command: "withdraw", description: "💸 ገንዘብ ማውጣት (Withdraw)" },
        { command: "invite",   description: "🔗 የጥሪ ሊንክ ማግኘት" },
      ]).then(() => {
        logger.info("Telegram command menu registered");
      }).catch((cmdErr) => {
        logger.error({ err: cmdErr }, "Failed to register Telegram command menu");
      });
    }

    // Decide between webhook (deployed) and polling (dev) mode.
    // riker.replit.dev / replit.dev domains are dev-only proxies that Telegram
    // cannot reach, so we fall back to long-polling in that case.
    const isDevDomain = !domain ||
      domain.includes("riker.replit.dev") ||
      domain.includes(".replit.dev");

    if (!botReady) {
      logger.warn("TELEGRAM_BOT_TOKEN not set — bot disabled");
    } else if (isDevDomain) {
      // ── Polling mode (development) ──────────────────────────────────────────
      logger.info({ domain: domain ?? "none" }, "Dev domain detected — using polling mode");
      // Clear any stale webhook first so polling gets all updates
      bot.api.deleteWebhook({ drop_pending_updates: false }).then(() => {
        bot.start({
          onStart: (info) => logger.info({ username: info.username }, "Bot polling started"),
        }).catch((pollErr) => {
          logger.error({ err: pollErr }, "Bot polling error");
        });
      }).catch((delErr) => {
        logger.error({ err: delErr }, "Failed to delete webhook before polling");
      });
    } else {
      // ── Webhook mode (deployed / custom domain) ──────────────────────────────
      const webhookUrl = `https://${domain}/api/telegram/webhook`;
      bot.api.setWebhook(webhookUrl, { drop_pending_updates: false }).then(() => {
        logger.info({ webhookUrl }, "Telegram webhook registered");
      }).catch((webhookErr) => {
        logger.error({ err: webhookErr }, "Failed to register Telegram webhook");
      });
    }
  })().catch((fatalErr) => {
    logger.error({ err: fatalErr }, "Unhandled error in background init");
  });
});
