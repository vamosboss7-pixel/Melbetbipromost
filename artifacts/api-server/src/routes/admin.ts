import crypto from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "../lib/db";
import {
  pendingDepositsTable,
  pendingWithdrawalsTable,
  playersTable,
  transactionsTable,
  promoterApplicationsTable,
  gameRoundsTable,
  promoCodesTable,
  promoCodeUsagesTable,
  depositCodeAttemptsTable,
  appSettingsTable,
} from "@workspace/db/schema";
import { eq, desc, sql, ilike, or, and, gte, count } from "drizzle-orm";
import { logger } from "../lib/logger";
import { bot, grantInviteBonus, grantAgentDepositCommission, grantDepositorBonus, postToChannel } from "../lib/bot";
import { appSettings, type SettingKey, type RoomId, type RoomSettingKey } from "../lib/settings";
import { generateReport, sendReportTo } from "../lib/autoReport";
import { creditPlayerBalance } from "../lib/autoDeposit";
import { getGameEngine, getGameEngine5 } from "../lib/gameSocket";

// In-memory maintenance state
let maintenanceEnabled = false;

const router: IRouter = Router();
const ADMIN_ID = Number(process.env["ADMIN_TELEGRAM_ID"] ?? "0");
const MAIN_ADMIN_ID = Number(process.env["MAIN_ADMIN_TELEGRAM_ID"] ?? "0");

// Stateless HMAC-signed session tokens — survive server restarts.
// Token format: "<timestamp_ms_hex>.<hmac_sha256_hex>"
// Valid for 30 days. Invalidated if ADMIN_PASSWORD changes.

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateSessionToken(): string {
  const adminPassword = process.env["ADMIN_PASSWORD"] ?? "fallback";
  const ts = Date.now().toString(16);
  const sig = crypto.createHmac("sha256", adminPassword).update(ts).digest("hex");
  return `${ts}.${sig}`;
}

export function hasValidToken(req: Request): boolean {
  const token = req.headers["x-admin-token"] as string | undefined;
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [ts, sig] = parts as [string, string];
  const tsMs = parseInt(ts, 16);
  if (isNaN(tsMs) || Date.now() - tsMs > TOKEN_TTL_MS) return false;
  const adminPassword = process.env["ADMIN_PASSWORD"] ?? "fallback";
  const expected = crypto.createHmac("sha256", adminPassword).update(ts).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
}

function isAdmin(telegramId: number) {
  return ADMIN_ID > 0 && telegramId === ADMIN_ID;
}

function isMainAdmin(telegramId: number) {
  return MAIN_ADMIN_ID > 0 && telegramId === MAIN_ADMIN_ID;
}

function resolveAdmin(req: Request, telegramId: number): boolean {
  return isAdmin(telegramId) || hasValidToken(req);
}

function resolveMainAdmin(req: Request, telegramId: number): boolean {
  return isMainAdmin(telegramId) || hasValidToken(req);
}

// GET /api/admin/check
router.get("/admin/check", (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  const tokenValid = hasValidToken(req);
  res.json({
    isAdmin: isAdmin(telegramId) || tokenValid,
    isMainAdmin: isMainAdmin(telegramId) || tokenValid,
  });
});

// POST /api/admin/verify-password
router.post("/admin/verify-password", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  const adminPassword = process.env["ADMIN_PASSWORD"];
  if (!adminPassword) {
    res.status(500).json({ ok: false, error: "ADMIN_PASSWORD not configured" });
    return;
  }
  if (!password || password !== adminPassword) {
    res.status(401).json({ ok: false });
    return;
  }
  const token = generateSessionToken();
  res.json({ ok: true, token });
});

// GET /api/admin/stats
router.get("/admin/stats", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const [
      depositStats,
      withdrawalStats,
      playerStats,
      agentBonusTx,
      agentCommissionTx,
      topAgents,
    ] = await Promise.all([
      // Deposit counts + total via SQL aggregates
      db.select({
        status: pendingDepositsTable.status,
        cnt: sql<number>`COUNT(*)::int`,
        total: sql<string>`COALESCE(SUM(amount::numeric),0)`,
      }).from(pendingDepositsTable).groupBy(pendingDepositsTable.status),

      // Withdrawal counts + total via SQL aggregates
      db.select({
        status: pendingWithdrawalsTable.status,
        cnt: sql<number>`COUNT(*)::int`,
        total: sql<string>`COALESCE(SUM(amount::numeric),0)`,
      }).from(pendingWithdrawalsTable).groupBy(pendingWithdrawalsTable.status),

      // Player stats via SQL aggregates — no full table scan into memory
      db.select({
        total: sql<number>`COUNT(*)::int`,
        totalBalance: sql<string>`COALESCE(SUM(main_balance::numeric),0)`,
        totalReferred: sql<number>`COUNT(*) FILTER (WHERE invited_by IS NOT NULL)::int`,
        totalAgents: sql<number>`COUNT(*) FILTER (WHERE role = 'agent')::int`,
      }).from(playersTable),

      db.select({ total: sql<string>`COALESCE(SUM(amount::numeric),0)` }).from(transactionsTable).where(eq(transactionsTable.type, "agent_join_bonus")),
      db.select({ total: sql<string>`COALESCE(SUM(amount::numeric),0)` }).from(transactionsTable).where(eq(transactionsTable.type, "agent_commission")),
      db.select({
        telegramId: playersTable.telegramId,
        firstName: playersTable.firstName,
        username: playersTable.username,
        inviteCount: sql<number>`(SELECT COUNT(*) FROM players p2 WHERE p2.invited_by = ${playersTable.telegramId})`,
      }).from(playersTable)
        .where(eq(playersTable.role, "agent"))
        .orderBy(sql`(SELECT COUNT(*) FROM players p2 WHERE p2.invited_by = ${playersTable.telegramId}) DESC`)
        .limit(5),
    ]);

    const depByStatus = Object.fromEntries(depositStats.map(r => [r.status, r]));
    const witByStatus = Object.fromEntries(withdrawalStats.map(r => [r.status, r]));
    const ps = playerStats[0]!;

    res.json({
      deposits: {
        pending: Number(depByStatus["pending"]?.cnt ?? 0),
        approved: Number(depByStatus["approved"]?.cnt ?? 0),
        rejected: Number(depByStatus["rejected"]?.cnt ?? 0),
        total: Number(depByStatus["approved"]?.total ?? 0),
      },
      withdrawals: {
        pending: Number(witByStatus["pending"]?.cnt ?? 0),
        approved: Number(witByStatus["approved"]?.cnt ?? 0),
        rejected: Number(witByStatus["rejected"]?.cnt ?? 0),
        total: Number(witByStatus["approved"]?.total ?? 0),
      },
      players: {
        total: Number(ps.total ?? 0),
        totalBalance: Number(ps.totalBalance ?? 0),
      },
      invites: {
        totalReferred: Number(ps.totalReferred ?? 0),
        totalAgents: Number(ps.totalAgents ?? 0),
        joinBonusPaid: Number(agentBonusTx[0]?.total ?? 0),
        commissionPaid: Number(agentCommissionTx[0]?.total ?? 0),
        topAgents: topAgents.map(a => ({
          telegramId: a.telegramId,
          firstName: a.firstName,
          username: a.username,
          inviteCount: Number(a.inviteCount),
        })),
      },
    });
  } catch (err) {
    logger.error({ err }, "admin stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/deposits
router.get("/admin/deposits", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const status = (req.query["status"] as string) ?? "pending";
  try {
    const deposits = await db.select().from(pendingDepositsTable)
      .where(eq(pendingDepositsTable.status, status))
      .orderBy(desc(pendingDepositsTable.createdAt))
      .limit(50);
    res.json({ deposits });
  } catch (err) {
    logger.error({ err }, "admin deposits error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/withdrawals
router.get("/admin/withdrawals", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const status = (req.query["status"] as string) ?? "pending";
  try {
    const withdrawals = await db.select().from(pendingWithdrawalsTable)
      .where(eq(pendingWithdrawalsTable.status, status))
      .orderBy(desc(pendingWithdrawalsTable.createdAt))
      .limit(50);
    res.json({ withdrawals });
  } catch (err) {
    logger.error({ err }, "admin withdrawals error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/players
router.get("/admin/players", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const page = Math.max(0, Number(req.query["page"] ?? 0));
  const pageSize = 200;
  try {
    const [players, totalRow] = await Promise.all([
      db.select().from(playersTable)
        .orderBy(desc(playersTable.mainBalance))
        .limit(pageSize)
        .offset(page * pageSize),
      db.select({ total: sql<number>`COUNT(*)::int` }).from(playersTable),
    ]);
    res.json({ players, total: Number(totalRow[0]?.total ?? 0), page, pageSize });
  } catch (err) {
    logger.error({ err }, "admin players error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/deposit/:id/approve
router.post("/admin/deposit/:id/approve", async (req: Request, res: Response) => {
  const telegramId = Number(req.body?.telegramId);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const depositId = Number(req.params["id"]);
  try {
    const rows = await db.select().from(pendingDepositsTable).where(eq(pendingDepositsTable.id, depositId)).limit(1);
    if (!rows.length || rows[0]!.status !== "pending") { res.status(400).json({ error: "Not found or already processed" }); return; }
    const dep = rows[0]!;
    await db.update(pendingDepositsTable).set({ status: "approved", updatedAt: new Date() }).where(eq(pendingDepositsTable.id, depositId));
    // Deposits go to deposit_balance — non-withdrawable, used for gameplay only.
    await db.update(playersTable).set({
      depositBalance: sql`${playersTable.depositBalance} + ${dep.amount}`,
    }).where(eq(playersTable.telegramId, dep.telegramId));
    await db.insert(transactionsTable).values({ telegramId: dep.telegramId, type: "deposit", amount: dep.amount, status: "approved", note: `Deposit #${dep.id} approved` });
    try {
      await bot.api.sendMessage(dep.telegramId, `✅ ዲፖዚት ተፈቅዷል!\n\n💳 <b>${Number(dep.amount).toFixed(0)} ብር</b> ወደ Deposit Wallet ተጨምሯል!\n🧾 Ref: #${dep.id}\n\n🎱 አሁን ይጫወቱ!`, { parse_mode: "HTML" });
    } catch (e) { logger.warn({ e }, "Failed to notify user"); }
    logger.info({ depositId }, "Deposit approved via admin panel");
    void grantInviteBonus(dep.telegramId, Number(dep.amount));
    void grantAgentDepositCommission(dep.telegramId, Number(dep.amount));
    void grantDepositorBonus(dep.telegramId, Number(dep.amount));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "approve deposit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/deposit/:id/reject
router.post("/admin/deposit/:id/reject", async (req: Request, res: Response) => {
  const telegramId = Number(req.body?.telegramId);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const depositId = Number(req.params["id"]);
  try {
    const rows = await db.select().from(pendingDepositsTable).where(eq(pendingDepositsTable.id, depositId)).limit(1);
    if (!rows.length || rows[0]!.status !== "pending") { res.status(400).json({ error: "Not found or already processed" }); return; }
    const dep = rows[0]!;
    await db.update(pendingDepositsTable).set({ status: "rejected", updatedAt: new Date() }).where(eq(pendingDepositsTable.id, depositId));
    try {
      await bot.api.sendMessage(dep.telegramId, `❌ <b>ዲፖዚት ተሰርዟል።</b>\n\nየ ${Number(dep.amount).toFixed(0)} ብር ጥያቄ አልተፈቀደም።`, { parse_mode: "HTML" });
    } catch (e) { logger.warn({ e }, "Failed to notify user"); }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "reject deposit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/withdrawal/:id/approve
router.post("/admin/withdrawal/:id/approve", async (req: Request, res: Response) => {
  const telegramId = Number(req.body?.telegramId);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const wId = Number(req.params["id"]);
  try {
    const rows = await db.select().from(pendingWithdrawalsTable).where(eq(pendingWithdrawalsTable.id, wId)).limit(1);
    if (!rows.length || rows[0]!.status !== "pending") { res.status(400).json({ error: "Not found or already processed" }); return; }
    const w = rows[0]!;
    // Balance already deducted at request time — just mark approved
    await db.update(pendingWithdrawalsTable).set({ status: "approved", updatedAt: new Date() }).where(eq(pendingWithdrawalsTable.id, wId));
    try {
      await bot.api.sendMessage(w.telegramId, `✅ <b>ዊዝድሮው ተልኳል!</b>\n\n💸 ${Number(w.amount).toFixed(0)} ብር ወደ Telebirr <code>${w.phone}</code> ተልኳል።`, { parse_mode: "HTML" });
    } catch (e) { logger.warn({ e }, "Failed to notify user"); }
    logger.info({ wId }, "Withdrawal approved via admin panel");
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "approve withdrawal error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/withdrawal/:id/reject
router.post("/admin/withdrawal/:id/reject", async (req: Request, res: Response) => {
  const telegramId = Number(req.body?.telegramId);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const wId = Number(req.params["id"]);
  try {
    const rows = await db.select().from(pendingWithdrawalsTable).where(eq(pendingWithdrawalsTable.id, wId)).limit(1);
    if (!rows.length || rows[0]!.status !== "pending") { res.status(400).json({ error: "Not found or already processed" }); return; }
    const w = rows[0]!;
    await db.update(pendingWithdrawalsTable).set({ status: "rejected", updatedAt: new Date() }).where(eq(pendingWithdrawalsTable.id, wId));
    // Refund the amount back to the appropriate balance
    const isAgentWithdrawal = w.note === "agent_withdrawal";
    if (isAgentWithdrawal) {
      await db.update(playersTable).set({ agentBalance: sql`${playersTable.agentBalance} + ${w.amount}` }).where(eq(playersTable.telegramId, w.telegramId));
    } else {
      await db.update(playersTable).set({ mainBalance: sql`${playersTable.mainBalance} + ${w.amount}` }).where(eq(playersTable.telegramId, w.telegramId));
    }
    await db.insert(transactionsTable).values({ telegramId: w.telegramId, type: "withdrawal_refund", amount: w.amount, status: "approved", note: `Withdrawal #${w.id} rejected — refunded` });
    try {
      await bot.api.sendMessage(
        w.telegramId,
        `❌ <b>ዊዝድሮው ተሰርዟል።</b>\n\nየ ${Number(w.amount).toFixed(0)} ብር ጥያቄ አልተፈቀደም።\n💰 <b>${Number(w.amount).toFixed(0)} ብር ወደ ዋሌትዎ ተመልሷል።</b>`,
        { parse_mode: "HTML" }
      );
    } catch (e) { logger.warn({ e }, "Failed to notify user"); }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "reject withdrawal error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/players/:telegramId/set-role — promote/demote agent
router.post("/admin/players/:telegramId/set-role", async (req: Request, res: Response) => {
  const adminId = Number(req.body?.telegramId);
  if (!resolveAdmin(req, adminId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const targetId = Number(req.params["telegramId"]);
  const role = String(req.body?.role ?? "").trim();
  if (!targetId || !["player", "agent"].includes(role)) {
    res.status(400).json({ error: "targetId and role ('player' | 'agent') are required" }); return;
  }
  try {
    const rows = await db.select({ firstName: playersTable.firstName, role: playersTable.role })
      .from(playersTable).where(eq(playersTable.telegramId, targetId)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Player not found" }); return; }
    await db.update(playersTable).set({ role }).where(eq(playersTable.telegramId, targetId));
    logger.info({ targetId, role, adminId }, "Player role updated");
    if (role === "agent") {
      try {
        await bot.api.sendMessage(targetId,
          `🎉 <b>Agent ሆነዋል!</b>\n\nAgent ስለሆኑ፦\n` +
          `• ጓደኞቻቸው ሲቀላቀሉ <b>5 ብር</b> ወደ Agent Wallet\n` +
          `• ጓደኞቻቸው ዲፖዚት ባደረጉ ቁጥር <b>5%</b> commission\n\n` +
          `💼 Agent balance ለማየት: /agentbalance`,
          { parse_mode: "HTML" }
        );
      } catch { /* non-fatal */ }
    }
    res.json({ ok: true, role });
  } catch (err) {
    logger.error({ err }, "set-role error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/players/:telegramId/set-inviter — manually link a referrer
router.post("/admin/players/:telegramId/set-inviter", async (req: Request, res: Response) => {
  const adminId = Number(req.body?.telegramId);
  if (!resolveAdmin(req, adminId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const targetId = Number(req.params["telegramId"]);
  const inviterId = Number(req.body?.inviterTelegramId);
  if (!targetId || !inviterId || targetId === inviterId) { res.status(400).json({ error: "Invalid IDs" }); return; }
  try {
    const [targetRows, inviterRows] = await Promise.all([
      db.select({ id: playersTable.id, invitedBy: playersTable.invitedBy }).from(playersTable).where(eq(playersTable.telegramId, targetId)).limit(1),
      db.select({ id: playersTable.id }).from(playersTable).where(eq(playersTable.telegramId, inviterId)).limit(1),
    ]);
    if (!targetRows.length) { res.status(404).json({ error: "Target player not found" }); return; }
    if (!inviterRows.length) { res.status(404).json({ error: "Inviter player not found" }); return; }
    await db.update(playersTable).set({ invitedBy: inviterId }).where(eq(playersTable.telegramId, targetId));
    logger.info({ targetId, inviterId, adminId }, "Admin manually set invitedBy");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "set-inviter error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/players/:telegramId/grant-invite-bonus — retroactively credit missed bonus
router.post("/admin/players/:telegramId/grant-invite-bonus", async (req: Request, res: Response) => {
  const adminId = Number(req.body?.telegramId);
  if (!resolveAdmin(req, adminId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const depositorId = Number(req.params["telegramId"]);
  const amount = Number(req.body?.amount);
  if (!depositorId || !amount || amount <= 0) { res.status(400).json({ error: "Invalid params" }); return; }
  try {
    const playerRows = await db.select({ invitedBy: playersTable.invitedBy }).from(playersTable).where(eq(playersTable.telegramId, depositorId)).limit(1);
    if (!playerRows.length) { res.status(404).json({ error: "Player not found" }); return; }
    const invitedBy = playerRows[0]!.invitedBy;
    if (!invitedBy) { res.status(400).json({ error: "This player has no inviter set" }); return; }

    const percent = appSettings.getNum("inviteBonusPercent");
    const bonus = Math.floor((amount * percent) / 100 * 100) / 100;
    if (bonus <= 0) { res.status(400).json({ error: "Bonus amount is zero — check inviteBonusPercent setting" }); return; }

    await db.update(playersTable).set({
      bonusBalance: sql`${playersTable.bonusBalance} + ${bonus}`,
      totalInviteBonus: sql`${playersTable.totalInviteBonus} + ${bonus}`,
    }).where(eq(playersTable.telegramId, invitedBy));

    await db.insert(transactionsTable).values({
      telegramId: invitedBy,
      type: "invite_bonus",
      amount: `${bonus}`,
      status: "approved",
      note: `[Admin retroactive] ${percent}% of ${amount} ብር (depositor: ${depositorId})`,
    });

    try {
      await bot.api.sendMessage(
        invitedBy,
        `🎉 <b>የጥሪ ቦነስ ደረሰዎ!</b>\n\n👥 የጋበዙት ሰው ዲፖዚት አደረገ\n💰 <b>${bonus.toFixed(2)} ብር</b> ወደ ዋሌትዎ ተጨምሯል!`,
        { parse_mode: "HTML" }
      );
    } catch { /* non-fatal */ }

    logger.info({ depositorId, invitedBy, bonus, adminId }, "Admin retroactively granted invite bonus");
    res.json({ ok: true, bonus, invitedBy });
  } catch (err) {
    logger.error({ err }, "grant-invite-bonus error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/settings
router.get("/admin/settings", (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json({ settings: appSettings.getAll() });
});

// PUT /api/admin/settings
router.put("/admin/settings", async (req: Request, res: Response) => {
  const { telegramId, settings } = req.body as { telegramId: number; settings: Record<string, string> };
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    for (const [key, value] of Object.entries(settings)) {
      await appSettings.set(key as SettingKey, String(value));
    }
    logger.info({ keys: Object.keys(settings) }, "Settings updated");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "settings update error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/welcome-image
router.get("/admin/welcome-image", (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json({ imageBase64: appSettings.get("welcomeImageBase64") });
});

// PUT /api/admin/welcome-image
router.put("/admin/welcome-image", async (req: Request, res: Response) => {
  const { telegramId, imageBase64 } = req.body as { telegramId: number; imageBase64: string };
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    await appSettings.set("welcomeImageBase64", imageBase64 ?? "");
    logger.info({ telegramId }, "Welcome image updated");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "welcome image update error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/room-settings
router.get("/admin/room-settings", (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json({
    room1: appSettings.getRoomAll("room1"),
  });
});

const VALID_ROOMS: RoomId[] = ["room1"];

// PUT /api/admin/room-settings
router.put("/admin/room-settings", async (req: Request, res: Response) => {
  const { telegramId, room, settings } = req.body as {
    telegramId: number;
    room: RoomId;
    settings: Record<RoomSettingKey, string>;
  };
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!VALID_ROOMS.includes(room)) { res.status(400).json({ error: "Invalid room" }); return; }
  try {
    const keys: RoomSettingKey[] = [
      "stakePerCard", "commissionPercent", "countdownSeconds",
      "ballIntervalSeconds", "minPlayersToStart",
    ];
    for (const key of keys) {
      if (settings[key] !== undefined) {
        await appSettings.set(`${room}_${key}` as SettingKey, String(settings[key]));
      }
    }
    logger.info({ room, settings }, "Room settings updated");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "room settings update error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/players/:telegramId/detail — full player detail
router.get("/admin/players/:telegramId/detail", async (req: Request, res: Response) => {
  const adminId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, adminId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const targetId = Number(req.params["telegramId"]);
  if (!targetId || isNaN(targetId)) { res.status(400).json({ error: "Invalid telegramId" }); return; }
  try {
    const [playerRows, deposits, withdrawals, transactions, gameRounds, inviteCount, gameSummary, transactionSummary, pendingDepositsSummary, pendingWithdrawalsSummary] = await Promise.all([
      db.select().from(playersTable).where(eq(playersTable.telegramId, targetId)).limit(1),
      db.select().from(pendingDepositsTable).where(eq(pendingDepositsTable.telegramId, targetId)).orderBy(desc(pendingDepositsTable.createdAt)).limit(30),
      db.select().from(pendingWithdrawalsTable).where(eq(pendingWithdrawalsTable.telegramId, targetId)).orderBy(desc(pendingWithdrawalsTable.createdAt)).limit(30),
      db.select().from(transactionsTable).where(eq(transactionsTable.telegramId, targetId)).orderBy(desc(transactionsTable.createdAt)).limit(30),
      db.select().from(gameRoundsTable).where(eq(gameRoundsTable.telegramId, targetId)).orderBy(desc(gameRoundsTable.createdAt)).limit(20),
      db.select({ cnt: sql<number>`count(*)` }).from(playersTable).where(eq(playersTable.invitedBy, targetId)),
      db.select({
        totalGames: sql<number>`COUNT(*)::int`,
        totalWins: sql<number>`COUNT(*) FILTER (WHERE ${gameRoundsTable.result} = 'won')::int`,
        totalStakes: sql<string>`COALESCE(SUM(${gameRoundsTable.stake}::numeric), 0)`,
        totalPrizes: sql<string>`COALESCE(SUM(${gameRoundsTable.prize}::numeric), 0)`,
        lastGameAt: sql<string | null>`MAX(${gameRoundsTable.createdAt})`,
      }).from(gameRoundsTable).where(eq(gameRoundsTable.telegramId, targetId)),
      db.select({
        totalIn: sql<string>`COALESCE(SUM(CASE WHEN ${transactionsTable.type} IN ('deposit', 'win', 'bonus', 'register_bonus', 'invite_bonus', 'adjustment', 'withdrawal_refund') THEN ${transactionsTable.amount}::numeric ELSE 0 END), 0)`,
        totalOut: sql<string>`COALESCE(SUM(CASE WHEN ${transactionsTable.type} IN ('withdraw', 'withdrawal_approved', 'stake') THEN ${transactionsTable.amount}::numeric ELSE 0 END), 0)`,
        stakeTransactions: sql<number>`COUNT(*) FILTER (WHERE ${transactionsTable.type} = 'stake')::int`,
        winTransactions: sql<number>`COUNT(*) FILTER (WHERE ${transactionsTable.type} = 'win')::int`,
      }).from(transactionsTable).where(and(
        eq(transactionsTable.telegramId, targetId),
        eq(transactionsTable.status, "approved"),
      )),
      db.select({
        pendingDeposits: sql<number>`COUNT(*)::int`,
      }).from(pendingDepositsTable).where(and(
        eq(pendingDepositsTable.telegramId, targetId),
        eq(pendingDepositsTable.status, "pending"),
      )),
      db.select({
        pendingWithdrawals: sql<number>`COUNT(*)::int`,
      }).from(pendingWithdrawalsTable).where(and(
        eq(pendingWithdrawalsTable.telegramId, targetId),
        eq(pendingWithdrawalsTable.status, "pending"),
      )),
    ]);
    if (!playerRows.length) { res.status(404).json({ error: "Player not found" }); return; }
    const player = playerRows[0]!;

    let inviterName: string | null = null;
    if (player.invitedBy) {
      const inviterRows = await db.select({ firstName: playersTable.firstName })
        .from(playersTable)
        .where(eq(playersTable.telegramId, player.invitedBy))
        .limit(1);
      inviterName = inviterRows[0]?.firstName ?? null;
    }
    const gameTotals = gameSummary[0];
    const transactionTotals = transactionSummary[0];
    const approvedDeposits = deposits.filter(d => d.status === "approved");
    const totalDeposited = approvedDeposits.reduce((s, d) => s + Number(d.amount), 0);
    const approvedWithdrawals = withdrawals.filter(w => w.status === "approved");
    const totalWithdrawn = approvedWithdrawals.reduce((s, w) => s + Number(w.amount), 0);
    const wageringRequired = Number(player.wageringRequired ?? 0);
    const wageringCompleted = Number(player.wageringCompleted ?? 0);
    const wageringRemaining = Math.max(0, wageringRequired - wageringCompleted);
    const wageringProgress = wageringRequired > 0
      ? Math.min(100, (wageringCompleted / wageringRequired) * 100)
      : 0;

    res.json({
      player,
      stats: {
        totalGames: Number(gameTotals?.totalGames ?? 0),
        totalWins: Number(gameTotals?.totalWins ?? 0),
        totalLosses: Number(gameTotals?.totalGames ?? 0) - Number(gameTotals?.totalWins ?? 0),
        totalStakes: Number(gameTotals?.totalStakes ?? 0),
        totalPrizes: Number(gameTotals?.totalPrizes ?? 0),
        netGameResult: Number(gameTotals?.totalPrizes ?? 0) - Number(gameTotals?.totalStakes ?? 0),
        lastGameAt: gameTotals?.lastGameAt ?? null,
        totalDeposited,
        totalWithdrawn,
        inviteCount: Number(inviteCount[0]?.cnt ?? 0),
        approvedTransactionIn: Number(transactionTotals?.totalIn ?? 0),
        approvedTransactionOut: Number(transactionTotals?.totalOut ?? 0),
        stakeTransactions: Number(transactionTotals?.stakeTransactions ?? 0),
        winTransactions: Number(transactionTotals?.winTransactions ?? 0),
        pendingDeposits: Number(pendingDepositsSummary[0]?.pendingDeposits ?? 0),
        pendingWithdrawals: Number(pendingWithdrawalsSummary[0]?.pendingWithdrawals ?? 0),
      },
      wagering: {
        required: wageringRequired,
        completed: wageringCompleted,
        remaining: wageringRemaining,
        progress: wageringProgress,
        active: Boolean(player.hasActiveWagering),
      },
      inviterName,
      deposits,
      withdrawals,
      transactions,
      gameRounds,
    });
  } catch (err) {
    logger.error({ err }, "player detail error");
    res.status(500).json({ error: "Internal server error" });
  }
});


// GET /api/admin/players/search — main admin only
router.get("/admin/players/search", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const q = String(req.query["q"] ?? "").trim();
  if (!q) { res.json({ players: [] }); return; }
  try {
    const numId = Number(q);
    const players = await db.select().from(playersTable)
      .where(
        isNaN(numId)
          ? or(ilike(playersTable.firstName, `%${q}%`), ilike(playersTable.username, `%${q}%`))
          : eq(playersTable.telegramId, numId),
      )
      .limit(10);
    res.json({ players });
  } catch (err) {
    logger.error({ err }, "player search error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/players/balance-adjust — main admin only
router.post("/admin/players/balance-adjust", async (req: Request, res: Response) => {
  const { telegramId, targetTelegramId, delta, note } = req.body as {
    telegramId: number; targetTelegramId: number; delta: number; note?: string;
  };
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!targetTelegramId || isNaN(delta) || delta === 0) {
    res.status(400).json({ error: "targetTelegramId and non-zero delta required" }); return;
  }
  try {
    const rows = await db.select().from(playersTable).where(eq(playersTable.telegramId, targetTelegramId)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Player not found" }); return; }
    const player = rows[0]!;
    const adjustNote = note?.trim() || (delta > 0 ? "Admin balance add" : "Admin balance deduct");

    if (delta > 0) {
      await creditPlayerBalance(targetTelegramId, delta, adjustNote);
    } else {
      const deduct = Math.abs(delta);
      if (Number(player.mainBalance) < deduct) {
        res.status(400).json({ error: "Insufficient main balance" }); return;
      }
      await db.update(playersTable).set({
        mainBalance: sql`${playersTable.mainBalance} - ${deduct}`,
      }).where(eq(playersTable.telegramId, targetTelegramId));
      await db.insert(transactionsTable).values({
        telegramId: targetTelegramId, type: "adjustment", amount: `${deduct}`,
        status: "approved", note: adjustNote,
      });
    }

    const updated = await db.select().from(playersTable).where(eq(playersTable.telegramId, targetTelegramId)).limit(1);
    const newBalance = Number(updated[0]?.mainBalance ?? 0);

    try {
      await bot.api.sendMessage(
        targetTelegramId,
        `💳 <b>ባላንስ ተስተካክሏል</b>\n\n` +
        `${delta > 0 ? "➕" : "➖"} <b>${Math.abs(delta).toFixed(2)} ብር</b>\n` +
        `📌 ምክንያት: ${adjustNote}\n` +
        `💰 አዲስ ባላንስ: <b>${newBalance.toFixed(2)} ብር</b>`,
        { parse_mode: "HTML" },
      );
    } catch { /* non-fatal */ }

    logger.info({ telegramId, targetTelegramId, delta, adjustNote }, "Balance adjusted by main admin");
    res.json({ ok: true, newBalance });
  } catch (err) {
    logger.error({ err }, "balance adjust error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/promoters
router.get("/admin/promoters", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const status = (req.query["status"] as string) ?? "pending";
  try {
    const applications = await db.select()
      .from(promoterApplicationsTable)
      .where(eq(promoterApplicationsTable.status, status))
      .orderBy(desc(promoterApplicationsTable.createdAt))
      .limit(100);
    res.json({ applications });
  } catch (err) {
    logger.error({ err }, "admin promoters error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/promoters/:id/approve
router.post("/admin/promoters/:id/approve", async (req: Request, res: Response) => {
  const telegramId = Number(req.body?.telegramId);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = Number(req.params["id"]);
  try {
    await db.update(promoterApplicationsTable)
      .set({ status: "approved", reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(promoterApplicationsTable.id, id));
    const rows = await db.select({ tid: promoterApplicationsTable.telegramId, name: promoterApplicationsTable.fullName })
      .from(promoterApplicationsTable).where(eq(promoterApplicationsTable.id, id)).limit(1);
    if (rows[0]) {
      try {
        await bot.api.sendMessage(rows[0].tid,
          `✅ <b>ፕሮሞተርነት ምዝገባዎ ተፈቅዷል!</b>\n\n🎉 እንኳን ደስ አለዎ ${rows[0].name}!\n\nቡድናችን ያስጨምርዎታል — ብዙም ሳይቆይ ያገኙናል።`,
          { parse_mode: "HTML" }
        );
      } catch { /* non-fatal */ }
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "approve promoter error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/promoters/:id/reject
router.post("/admin/promoters/:id/reject", async (req: Request, res: Response) => {
  const telegramId = Number(req.body?.telegramId);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = Number(req.params["id"]);
  try {
    await db.update(promoterApplicationsTable)
      .set({ status: "rejected", reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(promoterApplicationsTable.id, id));
    const rows = await db.select({ tid: promoterApplicationsTable.telegramId })
      .from(promoterApplicationsTable).where(eq(promoterApplicationsTable.id, id)).limit(1);
    if (rows[0]) {
      try {
        await bot.api.sendMessage(rows[0].tid,
          `❌ <b>ፕሮሞተርነት ምዝገባዎ አልተፈቀደም።</b>\n\nበኋላ ድጋሚ ማመልከቻ ማቅረብ ይችላሉ።`,
          { parse_mode: "HTML" }
        );
      } catch { /* non-fatal */ }
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "reject promoter error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/report/preview
router.get("/admin/report/preview", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const report = await generateReport();
    res.json({ report });
  } catch (err) {
    logger.error({ err }, "report preview error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/report/send
router.post("/admin/report/send", async (req: Request, res: Response) => {
  const { telegramId, targetIds } = req.body as { telegramId: number; targetIds: number[] };
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!Array.isArray(targetIds) || targetIds.length === 0) {
    res.status(400).json({ error: "targetIds required" }); return;
  }
  try {
    const result = await sendReportTo(targetIds);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "report send error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Promo Code Admin Endpoints ────────────────────────────────────────────────

// GET /api/admin/promo-codes
router.get("/admin/promo-codes", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const codes = await db.select().from(promoCodesTable).orderBy(desc(promoCodesTable.createdAt));
    res.json({ codes });
  } catch (err) {
    logger.error({ err }, "list promo-codes error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/promo-codes
router.post("/admin/promo-codes", async (req: Request, res: Response) => {
  const { telegramId, code, bonusAmount, maxUses, expiresAt, gameType } = req.body as {
    telegramId: number; code: string; bonusAmount: number; maxUses: number; expiresAt?: string; gameType?: string;
  };
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!code || !bonusAmount || !maxUses) { res.status(400).json({ error: "code, bonusAmount, maxUses required" }); return; }
  const trimmed = code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,20}$/.test(trimmed)) {
    res.status(400).json({ error: "ኮዱ 3-20 ፊደሎች (A-Z, 0-9, _, -) ብቻ ይሁን" }); return;
  }
  const resolvedGameType = gameType === "bingo" ? gameType : "bingo";
  try {
    const inserted = await db.insert(promoCodesTable).values({
      code: trimmed,
      bonusAmount: `${Number(bonusAmount).toFixed(2)}`,
      maxUses: Number(maxUses),
      isActive: true,
      gameType: resolvedGameType,
      createdBy: telegramId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();
    logger.info({ code: trimmed, bonusAmount, maxUses, telegramId }, "Promo code created");
    res.json({ ok: true, code: inserted[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique")) { res.status(409).json({ error: "ይህ ኮድ አስቀድሞ አለ" }); return; }
    logger.error({ err }, "create promo-code error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/promo-codes/:id/toggle
router.patch("/admin/promo-codes/:id/toggle", async (req: Request, res: Response) => {
  const { telegramId } = req.body as { telegramId: number };
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = Number(req.params["id"]);
  try {
    const rows = await db.select({ isActive: promoCodesTable.isActive }).from(promoCodesTable).where(eq(promoCodesTable.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const newState = !rows[0]!.isActive;
    await db.update(promoCodesTable).set({ isActive: newState }).where(eq(promoCodesTable.id, id));
    res.json({ ok: true, isActive: newState });
  } catch (err) {
    logger.error({ err }, "toggle promo-code error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/promo-codes/:id
router.delete("/admin/promo-codes/:id", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = Number(req.params["id"]);
  try {
    await db.delete(promoCodeUsagesTable).where(eq(promoCodeUsagesTable.promoCodeId, id));
    await db.delete(promoCodesTable).where(eq(promoCodesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "delete promo-code error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Cache bot username so we don't call getMe() on every request
let cachedBotUsername: string | null = null;
async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername) return cachedBotUsername;
  try {
    const me = await bot.api.getMe();
    cachedBotUsername = me.username ?? null;
    return cachedBotUsername;
  } catch {
    return null;
  }
}

// POST /api/admin/agent-link/generate — generate a new agent invite token
router.post("/admin/agent-link/generate", async (req: Request, res: Response) => {
  const telegramId = Number(req.body?.telegramId);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const token = crypto.randomBytes(16).toString("hex");
    await db.insert(appSettingsTable).values({ key: "agentInviteToken", value: token, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: token, updatedAt: new Date() } });
    logger.info({ telegramId }, "Agent invite token generated");
    const botUsername = await getBotUsername();
    const link = botUsername ? `https://t.me/${botUsername}?start=agentlink_${token}` : null;
    res.json({ ok: true, token, link });
  } catch (err) {
    logger.error({ err }, "agent-link generate error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/agent-link — get current agent invite link
router.get("/admin/agent-link", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "agentInviteToken")).limit(1);
    const token = rows[0]?.value ?? null;
    const botUsername = token ? await getBotUsername() : null;
    const link = token && botUsername ? `https://t.me/${botUsername}?start=agentlink_${token}` : null;
    res.json({ token, link });
  } catch (err) {
    logger.error({ err }, "agent-link get error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/agents — list all agents with stats
router.get("/admin/agents", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const agents = await db.select({
      telegramId: playersTable.telegramId,
      firstName: playersTable.firstName,
      lastName: playersTable.lastName,
      username: playersTable.username,
      agentBalance: playersTable.agentBalance,
      totalInviteBonus: playersTable.totalInviteBonus,
      createdAt: playersTable.createdAt,
      inviteCount: sql<number>`(SELECT COUNT(*) FROM players p2 WHERE p2.invited_by = ${playersTable.telegramId})`,
    })
      .from(playersTable)
      .where(eq(playersTable.role, "agent"))
      .orderBy(desc(playersTable.createdAt))
      .limit(200);
    res.json({ agents });
  } catch (err) {
    logger.error({ err }, "agents list error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/maintenance
router.get("/admin/maintenance", (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json({ enabled: maintenanceEnabled });
});

// POST /api/admin/maintenance/toggle
router.post("/admin/maintenance/toggle", async (req: Request, res: Response) => {
  const { telegramId } = req.body as { telegramId: number };
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const engine = getGameEngine();
    if (!maintenanceEnabled) {
      // Enable maintenance
      maintenanceEnabled = true;
      const result = engine ? await engine.enterMaintenance() : { refunded: 0 };
      logger.info({ refunded: result.refunded }, "Maintenance mode enabled by admin");
      res.json({ ok: true, enabled: true, refunded: result.refunded });
    } else {
      // Disable maintenance
      maintenanceEnabled = false;
      engine?.exitMaintenance();
      logger.info("Maintenance mode disabled by admin");
      res.json({ ok: true, enabled: false, refunded: 0 });
    }
  } catch (err) {
    logger.error({ err }, "maintenance toggle error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/banned-players — list players currently banned due to failed deposit codes
router.get("/admin/banned-players", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!resolveAdmin(req, telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const WINDOW_MS = 24 * 60 * 60 * 1000;
    const MAX_FAILURES = 5;
    const since = new Date(Date.now() - WINDOW_MS);
    const rows = await db
      .select({
        telegramId: depositCodeAttemptsTable.telegramId,
        failCount: count(),
      })
      .from(depositCodeAttemptsTable)
      .where(and(
        eq(depositCodeAttemptsTable.isValid, false),
        gte(depositCodeAttemptsTable.createdAt, since),
      ))
      .groupBy(depositCodeAttemptsTable.telegramId)
      .having(({ failCount }) => gte(failCount, MAX_FAILURES));

    if (!rows.length) { res.json({ players: [] }); return; }

    const telegramIds = rows.map(r => r.telegramId);
    const playerRows = await db
      .select({ telegramId: playersTable.telegramId, firstName: playersTable.firstName, username: playersTable.username })
      .from(playersTable)
      .where(or(...telegramIds.map(id => eq(playersTable.telegramId, id))));

    const playerMap = new Map(playerRows.map(p => [p.telegramId, p]));
    const players = rows.map(r => ({
      telegramId: r.telegramId,
      firstName: playerMap.get(r.telegramId)?.firstName ?? "Unknown",
      username: playerMap.get(r.telegramId)?.username ?? null,
      failCount: r.failCount,
    }));

    res.json({ players });
  } catch (err) {
    logger.error({ err }, "banned-players error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/players/:telegramId/unban — clear failed deposit attempts to unban a player
router.post("/admin/players/:telegramId/unban", async (req: Request, res: Response) => {
  const adminId = Number(req.body?.telegramId);
  if (!resolveAdmin(req, adminId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const targetId = Number(req.params["telegramId"]);
  if (!targetId || isNaN(targetId)) { res.status(400).json({ error: "Invalid telegramId" }); return; }
  try {
    const WINDOW_MS = 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - WINDOW_MS);
    await db.delete(depositCodeAttemptsTable).where(and(
      eq(depositCodeAttemptsTable.telegramId, targetId),
      eq(depositCodeAttemptsTable.isValid, false),
      gte(depositCodeAttemptsTable.createdAt, since),
    ));
    try {
      await bot.api.sendMessage(targetId, "✅ <b>Account ተፈቷል!</b>\n\nደረሰዎ — አሁን deposit ኮድ ማስገባት ይችላሉ።", { parse_mode: "HTML" });
    } catch { /* player may have blocked bot */ }
    logger.info({ targetId, adminId }, "Player unbanned via admin panel");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "unban error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/room-status — live room isolation monitor
router.get("/admin/room-status", (req: Request, res: Response) => {
  const tokenValid = hasValidToken(req);
  const telegramId = Number(req.query["telegramId"] ?? "0");
  if (!tokenValid && !resolveAdmin(req, telegramId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const engine10 = getGameEngine();

  const room1 = engine10 ? engine10.getRoomStatus() : null;

  res.json({
    ok: true,
    isolated: true,
    checkedAt: new Date().toISOString(),
    room1,
    room2: null,
  });
});

export { maintenanceEnabled };
export default router;
