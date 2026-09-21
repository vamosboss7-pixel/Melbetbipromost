import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "../lib/db";
import { playersTable, transactionsTable, gameRoundsTable, promoterApplicationsTable, pendingWithdrawalsTable, pendingDepositsTable } from "@workspace/db/schema";
import { eq, desc, count, sql, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getBotUsername } from "../lib/bot";
import { appSettings } from "../lib/settings";
import { verifyTelegramInitData, extractTelegramUser } from "../lib/telegramAuth";

const router: IRouter = Router();
const MIN_WITHDRAW_DEPOSIT = 100;

router.get("/player/wallet", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!telegramId || isNaN(telegramId)) {
    res.status(400).json({ error: "telegramId is required" });
    return;
  }

  try {
    const players = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.telegramId, telegramId))
      .limit(1);

    if (players.length === 0) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    const player = players[0]!;

    // Bonus balance becomes withdrawable once the player has a lifetime deposit >= 100 ETB.
    const qualifyingDeposit = await db
      .select({ id: pendingDepositsTable.id })
      .from(pendingDepositsTable)
      .where(and(
        eq(pendingDepositsTable.telegramId, telegramId),
        eq(pendingDepositsTable.status, "approved"),
        sql`${pendingDepositsTable.amount}::numeric >= 100`
      ))
      .limit(1);
    const bonusWithdrawable = qualifyingDeposit.length > 0;

    const transactions = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.telegramId, telegramId))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(50);

    res.json({
      depositBalance: player.depositBalance,
      mainBalance: player.mainBalance,
      bonusBalance: player.bonusBalance,
      bonusWithdrawable,
      totalInviteBonus: player.totalInviteBonus,
      role: player.role,
      agentBalance: player.agentBalance,
      transactions: transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        status: tx.status,
        note: tx.note,
        createdAt: tx.createdAt,
      })),
    });
  } catch (err) {
    logger.error({ err }, "wallet error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/player/game-history", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!telegramId || isNaN(telegramId)) {
    res.status(400).json({ error: "telegramId is required" });
    return;
  }

  try {
    const rounds = await db
      .select()
      .from(gameRoundsTable)
      .where(eq(gameRoundsTable.telegramId, telegramId))
      .orderBy(desc(gameRoundsTable.createdAt))
      .limit(50);

    const totalGames = rounds.length;
    const totalWins = rounds.filter(r => r.result === "won").length;

    res.json({
      totalGames,
      totalWins,
      rounds: rounds.map(r => ({
        id: r.id,
        roundId: r.roundId,
        cardIds: JSON.parse(r.cardIds) as number[],
        stake: r.stake,
        result: r.result,
        prize: r.prize,
        winnersCount: r.winnersCount,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    logger.error({ err }, "game-history error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/player/invite-info", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!telegramId || isNaN(telegramId)) {
    res.status(400).json({ error: "telegramId is required" });
    return;
  }

  try {
    const [inviteCountResult, playerRows] = await Promise.all([
      db.select({ cnt: count() }).from(playersTable).where(eq(playersTable.invitedBy, telegramId)),
      db.select({ totalInviteBonus: playersTable.totalInviteBonus }).from(playersTable).where(eq(playersTable.telegramId, telegramId)).limit(1),
    ]);

    const inviteCount = Number(inviteCountResult[0]?.cnt ?? 0);
    const totalInviteBonus = Number(playerRows[0]?.totalInviteBonus ?? 0);

    const botUsername = await getBotUsername();
    const inviteLink = botUsername
      ? `https://t.me/${botUsername}?start=ref_${telegramId}`
      : null;

    res.json({ inviteLink, inviteCount, totalInviteBonus });
  } catch (err) {
    logger.error({ err }, "invite-info error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/player/promoter-apply
router.post("/player/promoter-apply", async (req: Request, res: Response) => {
  const { telegramId, firstName, fullName, gender, telegramUsername, socialMediaPlatforms, followerCount, message } = req.body as {
    telegramId: number; firstName: string; fullName: string; gender: string;
    telegramUsername: string; socialMediaPlatforms: string; followerCount: string; message?: string;
  };
  if (!telegramId || !fullName || !gender || !telegramUsername || !socialMediaPlatforms || !followerCount) {
    res.status(400).json({ error: "All fields are required" }); return;
  }
  if (message && message.length > 400) {
    res.status(400).json({ error: "Message must be 400 characters or less" }); return;
  }
  try {
    const existing = await db.select({ id: promoterApplicationsTable.id, status: promoterApplicationsTable.status })
      .from(promoterApplicationsTable)
      .where(eq(promoterApplicationsTable.telegramId, telegramId))
      .orderBy(desc(promoterApplicationsTable.createdAt))
      .limit(1);
    if (existing.length > 0 && existing[0]!.status === "pending") {
      res.status(409).json({ error: "already_pending" }); return;
    }
    await db.insert(promoterApplicationsTable).values({
      telegramId, firstName: firstName ?? "Unknown", fullName, gender,
      telegramUsername, socialMediaPlatforms, followerCount,
      message: message?.trim() || null,
    });
    logger.info({ telegramId }, "Promoter application submitted");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "promoter-apply error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/player/promoter-status
router.get("/player/promoter-status", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }
  try {
    const rows = await db.select()
      .from(promoterApplicationsTable)
      .where(eq(promoterApplicationsTable.telegramId, telegramId))
      .orderBy(desc(promoterApplicationsTable.createdAt))
      .limit(1);
    res.json({ application: rows[0] ?? null });
  } catch (err) {
    logger.error({ err }, "promoter-status error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/player/agent-info
router.get("/player/agent-info", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!telegramId || isNaN(telegramId)) { res.status(400).json({ error: "telegramId required" }); return; }
  try {
    const [playerRows, inviteCountResult] = await Promise.all([
      db.select({ agentBalance: playersTable.agentBalance, totalInviteBonus: playersTable.totalInviteBonus, role: playersTable.role })
        .from(playersTable).where(eq(playersTable.telegramId, telegramId)).limit(1),
      db.select({ cnt: count() }).from(playersTable).where(eq(playersTable.invitedBy, telegramId)),
    ]);
    if (!playerRows.length) { res.status(404).json({ error: "Player not found" }); return; }
    const player = playerRows[0]!;
    const botUsername = await getBotUsername();
    const inviteLink = botUsername ? `https://t.me/${botUsername}?start=ref_${telegramId}` : null;
    res.json({
      agentBalance: player.agentBalance,
      totalInviteBonus: player.totalInviteBonus,
      inviteCount: Number(inviteCountResult[0]?.cnt ?? 0),
      inviteLink,
      role: player.role,
    });
  } catch (err) {
    logger.error({ err }, "agent-info error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/player/agent-withdrawals
router.get("/player/agent-withdrawals", async (req: Request, res: Response) => {
  const telegramId = Number(req.query["telegramId"]);
  if (!telegramId || isNaN(telegramId)) { res.status(400).json({ error: "telegramId required" }); return; }
  try {
    const withdrawals = await db.select()
      .from(pendingWithdrawalsTable)
      .where(and(eq(pendingWithdrawalsTable.telegramId, telegramId), eq(pendingWithdrawalsTable.note, "agent_withdrawal")))
      .orderBy(desc(pendingWithdrawalsTable.createdAt))
      .limit(20);
    res.json({ withdrawals });
  } catch (err) {
    logger.error({ err }, "agent-withdrawals error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/player/agent-withdraw
router.post("/player/agent-withdraw", async (req: Request, res: Response) => {
  const { telegramId, firstName, amount, phone, accountName } = req.body as {
    telegramId: number; firstName: string; amount: number; phone: string; accountName: string;
  };
  if (!telegramId || !amount || !phone || !accountName) {
    res.status(400).json({ error: "All fields are required" }); return;
  }
  const minAgentWithdraw = appSettings.getNum("minAgentWithdrawal");
  if (amount < minAgentWithdraw) { res.status(400).json({ error: `ቢያንስ ${minAgentWithdraw} ብር ማውጣት ይቻላል` }); return; }
  try {
    const playerRows = await db.select({ role: playersTable.role, agentBalance: playersTable.agentBalance })
      .from(playersTable).where(eq(playersTable.telegramId, telegramId)).limit(1);
    if (!playerRows.length) { res.status(404).json({ error: "Player not found" }); return; }
    const player = playerRows[0]!;
    if (player.role !== "agent") { res.status(403).json({ error: "Agent ብቻ ነው" }); return; }

    const qualifyingDeposit = await db
      .select({ id: pendingDepositsTable.id })
      .from(pendingDepositsTable)
      .where(and(
        eq(pendingDepositsTable.telegramId, telegramId),
        eq(pendingDepositsTable.status, "approved"),
        sql`${pendingDepositsTable.amount}::numeric >= ${MIN_WITHDRAW_DEPOSIT}`,
      ))
      .limit(1);
    if (!qualifyingDeposit.length) {
      res.status(400).json({ error: `ዊዝድሮው ለማድረግ ቢያንስ ${MIN_WITHDRAW_DEPOSIT} ብር ዲፖዚት ታሪክ ያስፈልጋል` });
      return;
    }

    const agentBalance = Number(player.agentBalance);
    if (agentBalance < amount) { res.status(400).json({ error: "Agent balance ይቀነሳሉ — ብቂ ሂሳብ የለም" }); return; }
    // Deduct from agentBalance first
    await db.update(playersTable)
      .set({ agentBalance: sql`${playersTable.agentBalance} - ${amount}` })
      .where(eq(playersTable.telegramId, telegramId));
    // Insert pending withdrawal
    await db.insert(pendingWithdrawalsTable).values({
      telegramId,
      firstName: firstName ?? "Agent",
      amount: `${amount}`,
      phone,
      accountName,
      note: "agent_withdrawal",
    });
    logger.info({ telegramId, amount }, "Agent withdrawal requested");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "agent-withdraw error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/player/agent-transfer — move agent balance → play wallet
router.post("/player/agent-transfer", async (req: Request, res: Response) => {
  const { telegramId, amount } = req.body as { telegramId: number; amount: number };
  if (!telegramId || !amount || isNaN(amount) || amount <= 0) {
    res.status(400).json({ error: "telegramId እና amount ያስፈልጋሉ" }); return;
  }
  if (amount < 10) {
    res.status(400).json({ error: "ቢያንስ 10 ብር ማዛወር ይቻላል" }); return;
  }
  try {
    const rows = await db
      .select({ role: playersTable.role, agentBalance: playersTable.agentBalance })
      .from(playersTable)
      .where(eq(playersTable.telegramId, telegramId))
      .limit(1);
    if (!rows.length) { res.status(404).json({ error: "Player not found" }); return; }
    const player = rows[0]!;
    if (player.role !== "agent") { res.status(403).json({ error: "Agent ብቻ ነው" }); return; }
    const agentBal = Number(player.agentBalance);
    if (agentBal < amount) {
      res.status(400).json({ error: "Agent balance ይቀነሳሉ — ብቂ ሂሳብ የለም" }); return;
    }
    // Deduct from agentBalance and credit mainBalance atomically
    await db
      .update(playersTable)
      .set({
        agentBalance: sql`${playersTable.agentBalance} - ${amount}`,
        mainBalance: sql`${playersTable.mainBalance} + ${amount}`,
      })
      .where(eq(playersTable.telegramId, telegramId));
    // Log transaction
    await db.insert(transactionsTable).values({
      telegramId,
      type: "agent_transfer",
      amount: `${amount}`,
      status: "approved",
      note: `Agent balance → Main wallet: ${amount} ብር`,
    });
    logger.info({ telegramId, amount }, "Agent balance transferred to play wallet");
    res.json({ ok: true, transferred: amount });
  } catch (err) {
    logger.error({ err }, "agent-transfer error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/player/settings — update player preferences (preferredBalance)
// Requires Telegram WebApp initData for authentication; telegramId is derived server-side
// from the verified token and never trusted from the request body.
router.patch("/player/settings", async (req: Request, res: Response) => {
  const { initData, preferredBalance } = req.body as { initData?: string; preferredBalance?: string };

  if (!initData) {
    res.status(400).json({ error: "initData is required" }); return;
  }
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (!botToken) {
    res.status(500).json({ error: "Server misconfiguration" }); return;
  }
  const verified = verifyTelegramInitData(initData, botToken);
  if (!verified) {
    res.status(401).json({ error: "Invalid Telegram data" }); return;
  }
  const tgUser = extractTelegramUser(verified);
  if (!tgUser) {
    res.status(401).json({ error: "Could not extract user from initData" }); return;
  }

  if (!preferredBalance || !["main_first", "bonus_first"].includes(preferredBalance)) {
    res.status(400).json({ error: "preferredBalance must be 'main_first' or 'bonus_first'" }); return;
  }

  try {
    const rows = await db
      .update(playersTable)
      .set({ preferredBalance, updatedAt: new Date() })
      .where(eq(playersTable.telegramId, tgUser.id))
      .returning({ preferredBalance: playersTable.preferredBalance });
    if (!rows.length) { res.status(404).json({ error: "Player not found" }); return; }
    logger.info({ telegramId: tgUser.id, preferredBalance }, "Player balance preference updated");
    res.json({ ok: true, preferredBalance: rows[0]!.preferredBalance });
  } catch (err) {
    logger.error({ err }, "player settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/leaderboard", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        telegramId: gameRoundsTable.telegramId,
        firstName: playersTable.firstName,
        totalGames: count(gameRoundsTable.id),
        totalWins: sql<number>`SUM(CASE WHEN ${gameRoundsTable.result} = 'won' THEN 1 ELSE 0 END)`,
      })
      .from(gameRoundsTable)
      .innerJoin(playersTable, eq(gameRoundsTable.telegramId, playersTable.telegramId))
      .groupBy(gameRoundsTable.telegramId, playersTable.firstName)
      .orderBy(desc(count(gameRoundsTable.id)))
      .limit(50);

    res.json(rows.map((r, i) => ({
      rank: i + 1,
      telegramId: r.telegramId,
      firstName: r.firstName,
      totalGames: Number(r.totalGames),
      totalWins: Number(r.totalWins),
    })));
  } catch (err) {
    logger.error({ err }, "leaderboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/leaderboard/daily — most games played today
router.get("/leaderboard/daily", async (_req: Request, res: Response) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const rows = await db
      .select({
        telegramId: gameRoundsTable.telegramId,
        firstName: playersTable.firstName,
        totalGames: count(gameRoundsTable.id),
        totalWins: sql<number>`SUM(CASE WHEN ${gameRoundsTable.result} = 'won' THEN 1 ELSE 0 END)`,
      })
      .from(gameRoundsTable)
      .innerJoin(playersTable, eq(gameRoundsTable.telegramId, playersTable.telegramId))
      .where(sql`${gameRoundsTable.createdAt} >= ${todayStart}`)
      .groupBy(gameRoundsTable.telegramId, playersTable.firstName)
      .orderBy(desc(count(gameRoundsTable.id)))
      .limit(50);

    res.json(rows.map((r, i) => ({
      rank: i + 1,
      telegramId: r.telegramId,
      firstName: r.firstName,
      totalGames: Number(r.totalGames),
      totalWins: Number(r.totalWins),
    })));
  } catch (err) {
    logger.error({ err }, "leaderboard/daily error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
