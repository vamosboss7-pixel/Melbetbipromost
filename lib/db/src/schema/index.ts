// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

export * from "./players";
export * from "./transactions";
export * from "./game_rounds";
export * from "./pending_deposits";
export * from "./pending_withdrawals";
export * from "./app_settings";
export * from "./device_fingerprints";
export * from "./scheduled_broadcasts";
export * from "./auto_deposits";
export * from "./promoter_applications";
export * from "./promo_codes";
export * from "./lucky_boxes";
export * from "./daily_checkins";
export * from "./player_achievements";
export * from "./deposit_code_attempts";
export * from "./daily_play_bonus";
