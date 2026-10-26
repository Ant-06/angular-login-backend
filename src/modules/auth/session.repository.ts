import mongoose from "mongoose";
import Session, { ISession } from "./session.model";

export const createSession = async (
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  familyId: string,
  sessionId?: string,
  mongoSession?: mongoose.ClientSession,
): Promise<ISession> => {
  const doc = new Session({
    _id: sessionId,
    userId,
    familyId,
    tokenHash,
    expiresAt,
  });
  await doc.save(mongoSession ? { session: mongoSession } : undefined);
  return doc;
};

/**
 * Atomically consume the current session by marking it revoked and recording
 * the replacement hash and successor session ID. Returns the consumed session document
 * if the token matched an active, unexpired, non-revoked session; null otherwise.
 */
export const rotateSession = async (
  sessionId: string,
  tokenHash: string,
  replacedByHash: string,
  successorSessionId?: string,
  mongoSession?: mongoose.ClientSession,
): Promise<ISession | null> => {
  return Session.findOneAndUpdate(
    {
      _id: sessionId,
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        revokedAt: new Date(),
        replacedByHash,
        successorSessionId,
      },
    },
    { returnDocument: "after", session: mongoSession },
  );
};

/**
 * Restores a session back to an active state if a subsequent database operation
 * (such as inserting the successor session) fails.
 */
export const restoreSession = async (
  sessionId: string,
  replacedByHash: string,
): Promise<void> => {
  await Session.updateOne(
    { _id: sessionId, replacedByHash },
    {
      $set: {
        revokedAt: null,
        replacedByHash: null,
        successorSessionId: null,
      },
    },
  );
};

export const revokeSession = async (
  sessionId: string,
  tokenHash: string,
): Promise<void> => {
  await Session.updateOne(
    { _id: sessionId, tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
};

/**
 * Revoke every session belonging to the given token family.
 * Used when refresh-token replay is detected or an account is suspended/deleted.
 */
export const revokeFamily = async (
  familyId: string,
  reason: "replay" | "logout" | "account_inactive" = "replay",
): Promise<void> => {
  await Session.updateMany(
    { familyId },
    {
      $set: {
        revokedAt: new Date(),
        familyRevoked: true,
        revokeReason: reason,
      },
    },
  );
};

/**
 * Check if the token family has been marked as revoked.
 */
export const isFamilyRevoked = async (familyId: string): Promise<boolean> => {
  const session = await Session.findOne({
    familyId,
    familyRevoked: true,
  });
  return !!session;
};

/**
 * Find a session by its token hash.
 */
export const findSessionByHash = async (
  tokenHash: string,
): Promise<ISession | null> => {
  return Session.findOne({ tokenHash });
};

/**
 * Find an active (non-revoked, non-expired) session for the given user.
 */
export const findActiveSession = async (sessionId: string, userId: string) => {
  return Session.findOne({
    _id: sessionId,
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
};

/**
 * Find a session by its ID regardless of revocation status.
 * Used to inspect replay scenarios.
 */
export const findSessionById = async (
  sessionId: string,
): Promise<ISession | null> => {
  return Session.findById(sessionId);
};
