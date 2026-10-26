import "reflect-metadata";
import express, { Application, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import authRoutes from "./modules/auth/auth.routes";
import errorMiddleware from "./middleware/error.middleware";
import openApiDocument from "./config/openapi";
import { sendError, sendSuccess } from "./core/app.util";

const createApp = (): Application => {
  const app = express();
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS || "http://localhost:4200"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "16kb" }));
  app.use(cookieParser());
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    handler: (req, res) =>
      sendError(
        res,
        429,
        "Too many authentication attempts. Please try again later.",
      ),
  });

  // routes
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/register", authLimiter);
  app.use("/api/auth", authRoutes);

  app.get("/", (req: Request, res: Response) => {
    sendSuccess(res, 200, "Angular Login API is running", null);
  });

  app.use((req: Request, res: Response) => {
    sendError(res, 404, "Route not found");
  });

  // error handling
  app.use(errorMiddleware);

  return app;
};

export default createApp;
