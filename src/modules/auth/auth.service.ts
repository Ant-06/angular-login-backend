import { hashPassword, comparePassword } from "../../utils/password";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt";
import { findUserByEmail, createUser, findUserById } from "./auth.repository";
import { createHash, randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import {
  createSession,
  revokeSession,
  revokeFamily,
  rotateSession,
  findSessionById,
  isFamilyRevoked,
  findSessionByHash,
  restoreSession,
} from "./session.repository";

const refreshLifetimeMs = 7 * 24 * 60 * 60 * 1000;

/**
 * Concurrency grace window (in milliseconds).
 * Legitimate concurrent refresh requests from the same client session that arrive
 * within this window after an atomic rotation do not trigger token-family revocation.
 * A token replayed outside this grace period is treated as a genuine replay attack.
 */
export const ROTATION_GRACE_PERIOD_MS = 10000;

export const supportsTransactions = (): boolean => {
  const client = mongoose.connection.getClient() as any;
  const topologyType = client?.topology?.description?.type;
  return (
    topologyType === "ReplicaSetWithPrimary" ||
    topologyType === "Sharded" ||
    topologyType === "LoadBalanced"
  );
};

const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export class AuthService {
  // Registration
  static async register(email: string, password: string) {
    const existing = await findUserByEmail(email.toLowerCase().trim());
    if (existing) {
      throw { status: 409, message: "User already exists" };
    }
    const hashed = await hashPassword(password);
    let user;
    try {
      user = await createUser(email.toLowerCase().trim(), hashed);
    } catch (error: any) {
      if (error?.code === 11000) {
        throw { status: 409, message: "User already exists" };
      }
      throw error;
    }
    return { id: user._id.toString(), email: user.email };
  }

  // Login
  static async login(email: string, password: string) {
    const user = await findUserByEmail(email.toLowerCase().trim());
    if (!user) {
      throw { status: 401, message: "Invalid email or password" };
    }
    if (user.status && user.status !== "active") {
      throw { status: 403, message: "Account is not active" };
    }
    const passwordMatch = await comparePassword(password, user.password);
    if (!passwordMatch) {
      throw { status: 401, message: "Invalid email or password" };
    }

    // Create a new session family for each login
    const familyId = randomUUID();
    const tokens = await this.issueTokens(
      user._id.toString(),
      user.email,
      familyId,
    );
    await createSession(
      user._id.toString(),
      hashToken(tokens.refreshToken),
      new Date(Date.now() + refreshLifetimeMs),
      familyId,
      tokens.sessionId,
    );
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
    };
  }

  static async refresh(refreshToken: string) {
    let claims;
    try {
      claims = verifyRefreshToken(refreshToken);
    } catch {
      throw { status: 401, message: "Invalid or expired refresh token" };
    }

    if (
      claims.type !== "refresh" ||
      typeof claims.sessionId !== "string" ||
      typeof claims.userId !== "string" ||
      typeof claims.familyId !== "string"
    ) {
      throw { status: 401, message: "Invalid or expired refresh token" };
    }

    // 1. Check that the user exists and is active
    const user = await findUserById(claims.userId);
    if (!user) {
      throw { status: 401, message: "Invalid or expired refresh token" };
    }
    if (user.status && user.status !== "active") {
      // Revoke the entire family for suspended or deleted accounts
      await revokeFamily(claims.familyId, "account_inactive");
      throw { status: 403, message: "Account is not active" };
    }

    // 2. Prevent revoked families from creating or renewing valid sessions
    if (await isFamilyRevoked(claims.familyId)) {
      throw { status: 401, message: "Invalid or expired refresh token" };
    }

    // 3. Inspect existing session for replay or recovery
    const currentSession = await findSessionById(claims.sessionId);
    if (!currentSession) {
      throw { status: 401, message: "Invalid or expired refresh token" };
    }

    if (currentSession.revokedAt) {
      // Check if this session was rotated but successor creation previously failed
      if (currentSession.replacedByHash) {
        const existingSuccessor = await findSessionByHash(
          currentSession.replacedByHash,
        );
        if (!existingSuccessor) {
          // Auto-recovery: previous rotation attempt was interrupted without creating a successor.
          // Restore the session so rotation can proceed safely.
          await restoreSession(claims.sessionId, currentSession.replacedByHash);
        } else {
          // Successor exists: check if this is a legitimate concurrent request within grace period
          const elapsedMs =
            Date.now() - new Date(currentSession.revokedAt).getTime();
          if (elapsedMs < ROTATION_GRACE_PERIOD_MS) {
            throw {
              status: 401,
              message: "Refresh token already consumed by concurrent request",
            };
          }

          // Outside grace window: genuine replay attack. Revoke entire token family.
          await revokeFamily(claims.familyId, "replay");
          throw { status: 401, message: "Invalid or expired refresh token" };
        }
      } else {
        // Revoked without successor (e.g. explicit logout)
        throw { status: 401, message: "Invalid or expired refresh token" };
      }
    }

    const oldHash = hashToken(refreshToken);
    const tokens = await this.issueTokens(
      user._id.toString(),
      user.email,
      claims.familyId,
    );
    const newHash = hashToken(tokens.refreshToken);

    // 4. Multi-document transaction attempt (if supported by MongoDB deployment)
    if (supportsTransactions()) {
      let mongoSession: mongoose.ClientSession | null = null;
      try {
        mongoSession = await mongoose.startSession();
        mongoSession.startTransaction();

        const rotatedTx = await rotateSession(
          claims.sessionId,
          oldHash,
          newHash,
          tokens.sessionId,
          mongoSession,
        );

        if (!rotatedTx) {
          await mongoSession.abortTransaction();
          await mongoSession.endSession();
          mongoSession = null;
        } else {
          await createSession(
            user._id.toString(),
            newHash,
            new Date(Date.now() + refreshLifetimeMs),
            claims.familyId,
            tokens.sessionId,
            mongoSession,
          );
          await mongoSession.commitTransaction();
          await mongoSession.endSession();
          return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: tokens.user,
          };
        }
      } catch (txErr: any) {
        if (mongoSession) {
          try {
            await mongoSession.abortTransaction();
            await mongoSession.endSession();
          } catch (_e) {
            void _e;
          }
          mongoSession = null;
        }
        const isTxUnsupported =
          txErr?.message?.includes("Transaction numbers are only allowed") ||
          txErr?.message?.includes("does not support retryable writes") ||
          txErr?.message?.includes("standalone") ||
          txErr?.codeName === "IllegalOperation" ||
          txErr?.code === 20;
        if (!isTxUnsupported) {
          throw txErr;
        }
      }
    }

    // 5. Standalone MongoDB conditional-update and compensation recovery strategy
    const rotated = await rotateSession(
      claims.sessionId,
      oldHash,
      newHash,
      tokens.sessionId,
    );

    if (!rotated) {
      const existing = await findSessionById(claims.sessionId);
      if (existing && existing.revokedAt) {
        const elapsedMs = Date.now() - new Date(existing.revokedAt).getTime();
        if (elapsedMs < ROTATION_GRACE_PERIOD_MS) {
          throw {
            status: 401,
            message: "Refresh token already consumed by concurrent request",
          };
        }
        await revokeFamily(claims.familyId, "replay");
      }
      throw { status: 401, message: "Invalid or expired refresh token" };
    }

    try {
      await createSession(
        user._id.toString(),
        newHash,
        new Date(Date.now() + refreshLifetimeMs),
        claims.familyId,
        tokens.sessionId,
      );
    } catch (createErr) {
      // Roll back revocation so the session is not left unusable without a valid successor
      await restoreSession(claims.sessionId, newHash);
      throw createErr;
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
    };
  }

  static async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }
    try {
      const claims = verifyRefreshToken(refreshToken);
      if (claims.type === "refresh" && typeof claims.sessionId === "string") {
        await revokeSession(claims.sessionId, hashToken(refreshToken));
      }
    } catch {
      return;
    }
  }

  private static async issueTokens(
    userId: string,
    email: string,
    familyId: string,
  ) {
    const sessionId = new Types.ObjectId().toString();
    const accessToken = generateAccessToken({
      userId,
      email,
      type: "access",
      sessionId,
    });
    const refreshToken = generateRefreshToken({
      userId,
      email,
      type: "refresh",
      sessionId,
      familyId,
    });
    return {
      accessToken,
      refreshToken,
      user: { id: userId, email },
      sessionId,
    };
  }

  // Get profile (me)
  static async me(userId: string) {
    const user = await findUserById(userId);
    if (!user) {
      throw { status: 404, message: "User not found" };
    }
    return { id: user._id.toString(), email: user.email };
  }
}
