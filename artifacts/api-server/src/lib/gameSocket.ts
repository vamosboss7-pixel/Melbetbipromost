import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { GameEngine } from "./gameEngine";
import { logger } from "./logger";

let gameEngine10: GameEngine | null = null;
let ioInstance: Server | null = null;

export function getIo(): Server | null {
  return ioInstance;
}

export function getGameEngine(): GameEngine | null {
  return gameEngine10;
}

export function getGameEngine5(): GameEngine | null {
  return null;
}

export function setupGameSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: "/api/socket.io",
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  ioInstance = io;

  // ── 10 Birr Bingo room (default namespace "/") ────────────────────────────
  gameEngine10 = new GameEngine(io, { roomId: "room1" });
  const bingo10Ns = gameEngine10.getNamespace();

  bingo10Ns.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Bingo10 socket connected");

    socket.on("join_room", (data: { telegramId: number; firstName: string }) => {
      void gameEngine10?.handleJoin(socket, data);
    });

    socket.on("select_card", (cardId: number) => {
      void gameEngine10?.handleSelectCard(socket, cardId);
    });

    socket.on("deselect_card", (cardId: number) => {
      void gameEngine10?.handleDeselectCard(socket, cardId);
    });

    socket.on("claim_bingo", (data: { roundId: string; cardId: number; card: number[][] }) => {
      gameEngine10?.handleClaimBingo(socket, data);
    });

    socket.on("disconnect", () => {
      gameEngine10?.handleDisconnect(socket.id);
      logger.info({ socketId: socket.id }, "Bingo10 socket disconnected");
    });
  });

  return io;
}
