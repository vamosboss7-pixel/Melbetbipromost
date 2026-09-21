import { Router, type IRouter } from "express";
import healthRouter from "./health";
import telegramRouter from "./telegram";
import playerRouter from "./player";
import adminRouter from "./admin";
import broadcastRouter from "./broadcast";
import smsWebhookRouter from "./smsWebhook";
import promoRouter from "./promo";
import luckyBoxesRouter from "./luckyBoxes";
import gameRouter from "./game";
import bonusesRouter from "./bonuses";

const router: IRouter = Router();

router.use(healthRouter);
router.use(telegramRouter);
router.use(playerRouter);
router.use(adminRouter);
router.use(broadcastRouter);
router.use(smsWebhookRouter);
router.use(promoRouter);
router.use(luckyBoxesRouter);
router.use(gameRouter);
router.use(bonusesRouter);

export default router;
