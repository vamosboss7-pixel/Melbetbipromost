import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use("/api", router);

// Try multiple candidate paths so this works in both local and Railway environments
const publicDirCandidates = [
  path.join(__dirname, "public"),
  path.join(process.cwd(), "artifacts/api-server/dist/public"),
  path.join(process.cwd(), "dist/public"),
];

const publicDir = publicDirCandidates.find((p) => fs.existsSync(path.join(p, "index.html")));

logger.info({ __dirname, cwd: process.cwd(), publicDirCandidates, resolved: publicDir ?? "NOT FOUND" }, "Static files lookup");

if (publicDir) {
  app.use(express.static(publicDir));
  app.use((_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
} else {
  logger.error("Frontend build not found — static files will not be served");
  app.use((_req, res) => {
    res.status(503).send("App is starting up. Please try again in a moment.");
  });
}

export default app;
