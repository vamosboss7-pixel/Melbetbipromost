import { db } from "./db";
import { appSettingsTable } from "@workspace/db/schema";
import { logger } from "./logger";

export type RoomId = "room1";

export type RoomSettingKey =
  | "stakePerCard"
  | "commissionPercent"
  | "countdownSeconds"
  | "ballIntervalSeconds"
  | "minPlayersToStart";

export type SettingKey =
  | "telebirrNumber"
  | "minDeposit"
  | "minWithdrawal"
  | "minAgentWithdrawal"
  | "commissionPercent"
  | "stakePerCard"
  | "countdownSeconds"
  | "ballIntervalSeconds"
  | "autoReportHour"
  | "reportAdminIds"
  | "registerBonusEnabled"
  | "registerBonusAmount"
  | "inviteBonusEnabled"
  | "inviteBonusPercent"
  | "inviteBonusAmount"
  | "inviteBonusMinDeposit"
  | "welcomeImageBase64"
  | "wageringMultiplier"
  | "room1_stakePerCard"
  | "room1_commissionPercent"
  | "room1_countdownSeconds"
  | "room1_ballIntervalSeconds"
  | "room1_minPlayersToStart";

export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  telebirrNumber: process.env["TELEBIRR_PHONE"] ?? "0980682889",
  minDeposit: "10",
  minWithdrawal: "100",
  minAgentWithdrawal: "150",
  commissionPercent: "0",
  stakePerCard: "10",
  countdownSeconds: "60",
  ballIntervalSeconds: "3",
  autoReportHour: "-1",
  reportAdminIds: process.env["ADMIN_TELEGRAM_ID"] ?? "",
  registerBonusEnabled: "true",
  registerBonusAmount: "30",
  inviteBonusEnabled: "true",
  inviteBonusPercent: "5",
  inviteBonusAmount: "10",
  inviteBonusMinDeposit: "0",
  welcomeImageBase64: "",
  wageringMultiplier: "30",
  room1_stakePerCard: "10",
  room1_commissionPercent: "10",
  room1_countdownSeconds: "60",
  room1_ballIntervalSeconds: "3",
  room1_minPlayersToStart: "2",
};

class AppSettings {
  private cache: Map<string, string> = new Map();

  async init() {
    try {
      const rows = await db.select().from(appSettingsTable);
      for (const row of rows) {
        this.cache.set(row.key, row.value);
      }
      logger.info({ count: rows.length }, "App settings loaded from DB");
    } catch (err) {
      logger.error({ err }, "Failed to load app settings — using defaults");
    }
  }

  get(key: SettingKey): string {
    return this.cache.get(key) ?? SETTING_DEFAULTS[key];
  }

  getNum(key: SettingKey): number {
    const val = Number(this.get(key));
    return isNaN(val) ? Number(SETTING_DEFAULTS[key]) : val;
  }

  getBool(key: SettingKey): boolean {
    return this.get(key) === "true";
  }

  getRoomNum(room: RoomId, key: RoomSettingKey): number {
    const prefixed = `${room}_${key}` as SettingKey;
    const val = Number(this.cache.get(prefixed) ?? SETTING_DEFAULTS[prefixed]);
    return isNaN(val) ? Number(SETTING_DEFAULTS[prefixed]) : val;
  }

  getRoomAll(room: RoomId): Record<RoomSettingKey, string> {
    const keys: RoomSettingKey[] = [
      "stakePerCard", "commissionPercent", "countdownSeconds",
      "ballIntervalSeconds", "minPlayersToStart",
    ];
    const result = {} as Record<RoomSettingKey, string>;
    for (const k of keys) {
      const prefixed = `${room}_${k}` as SettingKey;
      result[k] = this.cache.get(prefixed) ?? SETTING_DEFAULTS[prefixed];
    }
    return result;
  }

  getAll(): Record<SettingKey, string> {
    const result = {} as Record<SettingKey, string>;
    for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
      result[key] = this.get(key);
    }
    return result;
  }

  async set(key: SettingKey, value: string): Promise<void> {
    await db
      .insert(appSettingsTable)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value, updatedAt: new Date() },
      });
    this.cache.set(key, value);
  }
}

export const appSettings = new AppSettings();
