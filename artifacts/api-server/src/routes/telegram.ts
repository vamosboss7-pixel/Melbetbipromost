import { Router, type IRouter, type Request, type Response } from "express";
import { webhookCallback } from "grammy";
import { bot, checkChannelMembership, grantAgentJoinBonus, grantSignupBonuses, USE_POLLING, pendingReferrals } from "../lib/bot";
import { db } from "../lib/db";
import { playersTable, transactionsTable, appSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { verifyTelegramInitData, extractTelegramUser } from "../lib/telegramAuth";
import { appSettings } from "../lib/settings";

const router: IRouter = Router();

// Only mount the webhook endpoint in webhook mode (deployed).
// In polling mode (dev) grammy polls Telegram directly — mounting
// webhookCallback here would lock the bot into webhook mode and
// prevent bot.start() from working.
if (!USE_POLLING) {
  router.post("/telegram/webhook", webhookCallback(bot, "express"));
}

router.post("/auth/telegram", async (req: Request, res: Response) => {
  const { initData, startParam: clientStartParam } = req.body as { initData?: string; startParam?: string };

  if (!initData) {
    res.status(400).json({ error: "initData is required" });
    return;
  }

  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (!botToken) {
    res.status(500).json({ error: "Server misconfiguration" });
    return;
  }

  const verified = verifyTelegramInitData(initData, botToken);
  if (!verified) {
    res.status(401).json({ error: "Invalid Telegram data" });
    return;
  }

  let tgUser: { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string };
  try {
    tgUser = JSON.parse(verified["user"] ?? "{}");
  } catch {
    res.status(400).json({ error: "Invalid user data" });
    return;
  }

  if (!tgUser.id || !tgUser.first_name) {
    res.status(400).json({ error: "Missing user fields" });
    return;
  }

  // Parse referrer from start_param.
  // Telegram injects start_param into initData only for direct mini-app links (t.me/bot/app?startapp=…).
  // For web_app inline-button opens the param lives in the URL query string, so the client
  // reads it from window.location.search and sends it as clientStartParam.
  const startParam = verified["start_param"] || (typeof clientStartParam === "string" ? clientStartParam.trim() : "") || "";

  let referrerTelegramId: number | null = null;
  if (startParam.startsWith("ref_")) {
    const parsed = Number(startParam.slice(4));
    if (!isNaN(parsed) && parsed > 0 && parsed !== tgUser.id) {
      referrerTelegramId = parsed;
    }
  }

  // Check for agent invite link (e.g. "agentlink_TOKEN")
  let agentLinkToken: string | null = null;
  if (startParam.startsWith("agentlink_")) {
    agentLinkToken = startParam.slice("agentlink_".length);
  }

  logger.info({ telegramId: tgUser.id, startParam, fromInitData: !!verified["start_param"], fromClient: !!clientStartParam }, "Auth start_param resolved");

  try {
    const existing = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.telegramId, tgUser.id))
      .limit(1);

    const isNewPlayer = existing.length === 0;

    // ── Channel membership gate (new players only) ───────────────────────────
    if (isNewPlayer) {
      const membership = await checkChannelMembership(tgUser.id);
      if (!membership.ok) {
        res.status(403).json({ error: "channel_required", channels: membership.missing });
        return;
      }
    }

    let player;

    if (!isNewPlayer) {
      const currentRole = existing[0]!.role ?? "player";

      // Check if a valid agent invite token was used — upgrade existing player to agent
      let upgradeToAgent = false;
      if (agentLinkToken && currentRole !== "agent") {
        const tokenRows = await db
          .select()
          .from(appSettingsTable)
          .where(eq(appSettingsTable.key, "agentInviteToken"))
          .limit(1);
        if (tokenRows.length > 0 && tokenRows[0]!.value === agentLinkToken) {
          upgradeToAgent = true;
        }
      }

      const updatePayload: Record<string, unknown> = {
        firstName: tgUser.first_name,
        lastName: tgUser.last_name ?? null,
        username: tgUser.username ?? null,
        photoUrl: tgUser.photo_url ?? null,
        updatedAt: new Date(),
        ...(upgradeToAgent ? { role: "agent" } : {}),
      };

      const updated = await db
        .update(playersTable)
        .set(updatePayload)
        .where(eq(playersTable.telegramId, tgUser.id))
        .returning();
      player = updated[0];

      // Notify the player they are now an agent
      if (upgradeToAgent) {
        logger.info({ telegramId: tgUser.id }, "Existing player upgraded to agent via invite link");
        try {
          await bot.api.sendMessage(tgUser.id,
            `🎉 <b>Agent ሆነዋል!</b>\n\nAgent ስለሆኑ፦\n` +
            `• ጓደኞቻቸው ሲቀላቀሉ <b>5 ብር</b> ወደ Agent Wallet\n` +
            `• ጓደኞቻቸው ዲፖዚት ባደረጉ ቁጥር <b>5%</b> commission\n\n` +
            `💼 Agent balance ለማየት: /agentbalance`,
            { parse_mode: "HTML" }
          );
        } catch { /* non-fatal */ }
      }

    } else {
      // Resolve referrer: server-side pending store takes priority over URL param
      // (URL params may be stripped by some Telegram clients)
      const pendingReferrerId = pendingReferrals.get(tgUser.id) ?? null;
      const candidateReferrerId = pendingReferrerId ?? referrerTelegramId;

      // Validate referrer exists in DB
      let validReferrer: number | null = null;
      if (candidateReferrerId) {
        const refRows = await db
          .select({ telegramId: playersTable.telegramId })
          .from(playersTable)
          .where(eq(playersTable.telegramId, candidateReferrerId))
          .limit(1);
        if (refRows.length > 0) validReferrer = candidateReferrerId;
      }

      // Clean up pending referral regardless of outcome
      if (pendingReferrerId) pendingReferrals.delete(tgUser.id);

      // Check if agent link token is valid
      let isAgentRegistration = false;
      if (agentLinkToken) {
        const tokenRows = await db
          .select()
          .from(appSettingsTable)
          .where(eq(appSettingsTable.key, "agentInviteToken"))
          .limit(1);
        if (tokenRows.length > 0 && tokenRows[0]!.value === agentLinkToken) {
          isAgentRegistration = true;
        }
      }

      const inserted = await db
        .insert(playersTable)
        .values({
          id: tgUser.id,
          telegramId: tgUser.id,
          firstName: tgUser.first_name,
          lastName: tgUser.last_name ?? null,
          username: tgUser.username ?? null,
          photoUrl: tgUser.photo_url ?? null,
          invitedBy: validReferrer ?? undefined,
          role: isAgentRegistration ? "agent" : "player",
        })
        .returning();
      player = inserted[0]!;
      logger.info({ telegramId: tgUser.id, invitedBy: validReferrer }, "New player registered");

      // Registration and inviter bonuses are awarded once for each new player.
      await grantSignupBonuses(tgUser.id, validReferrer, tgUser.first_name);

      // Preserve the separate agent-wallet join bonus for agent referrers.
      if (validReferrer) {
        void grantAgentJoinBonus(validReferrer, tgUser.first_name);
      }
      // Refresh player data with updated balance
      const refreshed = await db.select().from(playersTable).where(eq(playersTable.telegramId, tgUser.id)).limit(1);
      player = refreshed[0] ?? player;
      logger.info({ telegramId: tgUser.id, signupBonus: 30, inviteBonus: validReferrer ? 10 : 0 }, "Signup bonuses granted");
    }

    res.json({
      player: {
        id: player!.id,
        telegramId: player!.telegramId,
        firstName: player!.firstName,
        lastName: player!.lastName,
        username: player!.username,
        photoUrl: player!.photoUrl,
        depositBalance: player!.depositBalance,
        mainBalance: player!.mainBalance,
        bonusBalance: player!.bonusBalance,
        invitedBy: player!.invitedBy ?? null,
        role: player!.role,
        preferredBalance: player!.preferredBalance ?? "main_first",
      },
    });
  } catch (err) {
    logger.error({ err }, "Auth error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
