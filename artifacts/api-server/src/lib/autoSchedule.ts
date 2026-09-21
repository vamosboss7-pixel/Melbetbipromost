import { InputFile, InlineKeyboard } from "grammy";
import { db } from "./db";
import { scheduledBroadcastsTable, playersTable, appSettingsTable } from "@workspace/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { bot, getMiniAppUrl } from "./bot";
import { logger } from "./logger";
import fs from "node:fs";
import path from "node:path";

function getPlayNowKeyboard(): InlineKeyboard | null {
  const appUrl = getMiniAppUrl();
  if (!appUrl) return null;
  return new InlineKeyboard().add({ text: "🎮 ጨዋታ ጀምር", web_app: { url: appUrl } });
}

async function fireBroadcast(id: number, message: string, imageData: string | null) {
  const players = await db.select({ telegramId: playersTable.telegramId }).from(playersTable);
  let sent = 0, failed = 0;
  const kb = getPlayNowKeyboard();
  const replyMarkup = kb ? kb : undefined;
  for (const p of players) {
    try {
      if (imageData) {
        await bot.api.sendPhoto(
          p.telegramId,
          new InputFile(Buffer.from(imageData, "base64"), "broadcast.jpg"),
          { ...(message ? { caption: message, parse_mode: "HTML" as const } : {}), reply_markup: replyMarkup },
        );
      } else {
        await bot.api.sendMessage(p.telegramId, message, { parse_mode: "HTML", reply_markup: replyMarkup });
      }
      sent++;
    } catch {
      failed++;
    }
  }
  logger.info({ id, sent, failed }, "Scheduled broadcast sent");
}

// ── Daily Play Bonus broadcast ────────────────────────────────────────────────
// Sends the 10-ETB claim message+image to all players once per UTC day.
// The image lives under <workspace_root>/attached_assets.
const DAILY_BONUS_IMAGE_PATH = path.join(
  process.cwd(),
  "attached_assets",
  "ebfc61bf-3d39-4c28-969a-fd1937e43d54_1785949889728.png",
);

const DAILY_BONUS_MESSAGE =
  `🔥🎉 <b>ዛሬ  የ1 ጨዋታ ቦነስ ለእርሶ !</b> 🎉🔥\n\n` +
  `🎁 <b>አንድ ጨዋታ 10 ብር ቦነስ</b> ይውሰዱና እድልዎን ይሞክሩ!\n\n` +
  `🏆 <b>KEFTA BINGO</b> በአጭር ጊዜ ውስጥ የብዙዎችን ቀልብ እየገዛ  ያለ ተወዳጅ የቢንጎ መድረክ ሆኗል። አሁኑኑ ይቀላቀሉ!\n\n` +
  `✨ <b>የዛሬ ቦነሶች</b>\n` +
  `🎁 ለአዲስ ተጫዋቾች – <b>30 ብር በቀጥታ ቦነስ</b>\n` +
  `💸 ጓደኛ ሲጋብዙ – <b>ተጨማሪ ቦነስ </b>\n` +
  `👥 በየቀኑ አዳዲስ ተጫዋቾች እየተቀላቀሉ ነው\n\n` +
  `መልካም እድል 😎\n\n` +
  `🏅 ብዙዎች በየቀኑ እያሸነፉ ነው — <b>ቀጣዩ አሸናፊ እርስዎ ሊሆኑ ይችላሉ!</b>\n\n` +
  `🚀 <b>ዛሬውኑ ቦነስዎን ይውሰዱ፣ ይጫወቱ፣ ትልቅ ሽልማት ያሸንፉ!</b> 🎊`;

async function fireDailyPlayBonus(today: string) {
  const players = await db
    .select({ telegramId: playersTable.telegramId })
    .from(playersTable);

  const imageBuffer = fs.existsSync(DAILY_BONUS_IMAGE_PATH)
    ? fs.readFileSync(DAILY_BONUS_IMAGE_PATH)
    : null;

  let sent = 0, failed = 0;

  for (const p of players) {
    try {
      const kb = new InlineKeyboard().add({
        text: "🎁 ቦነስ ይውሰዱ",
        callback_data: `claim_dpb_${p.telegramId}`,
      });
      if (imageBuffer) {
        await bot.api.sendPhoto(
          p.telegramId,
          new InputFile(imageBuffer, "bonus.png"),
          { caption: DAILY_BONUS_MESSAGE, parse_mode: "HTML", reply_markup: kb },
        );
      } else {
        await bot.api.sendMessage(p.telegramId, DAILY_BONUS_MESSAGE, {
          parse_mode: "HTML",
          reply_markup: kb,
        });
      }
      sent++;
    } catch {
      failed++;
    }
  }

  // Persist sent date so the cron doesn't re-fire today
  await db
    .insert(appSettingsTable)
    .values({ key: "daily_play_bonus_last_sent", value: today })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value: today, updatedAt: new Date() },
    });

  logger.info({ today, sent, failed }, "Daily play bonus broadcast sent");
}

export function startDailyPlayBonusCron() {
  // Check every 5 minutes; fire once per UTC day as soon as the date advances.
  setInterval(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await db
        .select({ value: appSettingsTable.value })
        .from(appSettingsTable)
        .where(eq(appSettingsTable.key, "daily_play_bonus_last_sent"))
        .limit(1);

      const lastSent = rows[0]?.value ?? null;
      if (lastSent === today) return; // already sent today

      await fireDailyPlayBonus(today);
    } catch (err) {
      logger.error({ err }, "DailyPlayBonus cron error");
    }
  }, 5 * 60_000);
}

export function startAutoScheduleCron() {
  setInterval(async () => {
    try {
      const now = new Date();
      const pending = await db
        .select()
        .from(scheduledBroadcastsTable)
        .where(and(
          eq(scheduledBroadcastsTable.isSent, false),
          lte(scheduledBroadcastsTable.scheduledAt, now),
        ));

      for (const bc of pending) {
        try {
          await fireBroadcast(bc.id, bc.message, bc.imageUrl ?? null);
          if (bc.isDaily) {
            const nextAt = new Date(bc.scheduledAt);
            nextAt.setDate(nextAt.getDate() + 1);
            await db.update(scheduledBroadcastsTable)
              .set({ isSent: false, scheduledAt: nextAt, sentAt: now })
              .where(eq(scheduledBroadcastsTable.id, bc.id));
          } else {
            await db.update(scheduledBroadcastsTable)
              .set({ isSent: true, sentAt: now })
              .where(eq(scheduledBroadcastsTable.id, bc.id));
          }
        } catch (err) {
          logger.error({ err, id: bc.id }, "Failed to fire scheduled broadcast");
        }
      }
    } catch (err) {
      logger.error({ err }, "AutoSchedule cron error");
    }
  }, 30_000);
}
