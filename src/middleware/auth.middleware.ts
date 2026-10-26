import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { sendError } from "../core/app.util";
import { findActiveSession } from "../modules/auth/session.repository";
import { findUserById } from "../modules/auth/auth.repository";

export interface AuthRequest extends Request {
  user?: { userId: string; email: string; sessionId: string };
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return sendError(res, 401, "Access token required", [
      { message: "Authorization header is required" },
    ]);
  }
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return sendError(res, 401, "Invalid authorization format");
  }
  const token = parts[1];

  // 1. Separate JWT verification and claims validation
  let decoded: {
    userId: string;
    email: string;
    sessionId: string;
    type?: string;
  };

  try {
    decoded = verifyAccessToken(token) as {
      userId: string;
      email: string;
      sessionId: string;
      type?: string;
    };
  } catch {
    return sendError(res, 401, "Invalid or expired token");
  }

  if (
    !decoded ||
    typeof decoded.userId !== "string" ||
    typeof decoded.email !== "string" ||
    typeof decoded.sessionId !== "string" ||
    decoded.type !== "access"
  ) {
    return sendError(res, 401, "Invalid or expired token");
  }

  // 2. Database and session checks (isolated so database errors reach centralized error handler)
  try {
    const [session, user] = await Promise.all([
      findActiveSession(decoded.sessionId, decoded.userId),
      findUserById(decoded.userId),
    ]);

    if (!session) {
      return sendError(res, 401, "Session is no longer active");
    }

    if (!user || (user.status && user.status !== "active")) {
      return sendError(res, 403, "Account is not active");
    }

    req.user = decoded;
    return next();
  } catch (dbError) {
    // Database connectivity or query errors must reach centralized error middleware
    return next(dbError);
  }
};
