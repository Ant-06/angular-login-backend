"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findSessionById = exports.findActiveSession = exports.findSessionByHash = exports.isFamilyRevoked = exports.revokeFamily = exports.revokeSession = exports.restoreSession = exports.rotateSession = exports.createSession = void 0;
const session_model_1 = __importDefault(require("./session.model"));
const createSession = async (userId, tokenHash, expiresAt, familyId, sessionId, mongoSession) => {
    const doc = new session_model_1.default({
        _id: sessionId,
        userId,
        familyId,
        tokenHash,
        expiresAt,
    });
    await doc.save(mongoSession ? { session: mongoSession } : undefined);
    return doc;
};
exports.createSession = createSession;
/**
 * Atomically consume the current session by marking it revoked and recording
 * the replacement hash and successor session ID. Returns the consumed session document
 * if the token matched an active, unexpired, non-revoked session; null otherwise.
 */
const rotateSession = async (sessionId, tokenHash, replacedByHash, successorSessionId, mongoSession) => {
    return session_model_1.default.findOneAndUpdate({
        _id: sessionId,
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
    }, {
        $set: {
            revokedAt: new Date(),
            replacedByHash,
            successorSessionId,
        },
    }, { returnDocument: "after", session: mongoSession });
};
exports.rotateSession = rotateSession;
/**
 * Restores a session back to an active state if a subsequent database operation
 * (such as inserting the successor session) fails.
 */
const restoreSession = async (sessionId, replacedByHash) => {
    await session_model_1.default.updateOne({ _id: sessionId, replacedByHash }, {
        $set: {
            revokedAt: null,
            replacedByHash: null,
            successorSessionId: null,
        },
    });
};
exports.restoreSession = restoreSession;
const revokeSession = async (sessionId, tokenHash) => {
    await session_model_1.default.updateOne({ _id: sessionId, tokenHash, revokedAt: null }, { $set: { revokedAt: new Date() } });
};
exports.revokeSession = revokeSession;
/**
 * Revoke every session belonging to the given token family.
 * Used when refresh-token replay is detected or an account is suspended/deleted.
 */
const revokeFamily = async (familyId, reason = "replay") => {
    await session_model_1.default.updateMany({ familyId }, {
        $set: {
            revokedAt: new Date(),
            familyRevoked: true,
            revokeReason: reason,
        },
    });
};
exports.revokeFamily = revokeFamily;
/**
 * Check if the token family has been marked as revoked.
 */
const isFamilyRevoked = async (familyId) => {
    const session = await session_model_1.default.findOne({
        familyId,
        familyRevoked: true,
    });
    return !!session;
};
exports.isFamilyRevoked = isFamilyRevoked;
/**
 * Find a session by its token hash.
 */
const findSessionByHash = async (tokenHash) => {
    return session_model_1.default.findOne({ tokenHash });
};
exports.findSessionByHash = findSessionByHash;
/**
 * Find an active (non-revoked, non-expired) session for the given user.
 */
const findActiveSession = async (sessionId, userId) => {
    return session_model_1.default.findOne({
        _id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
    });
};
exports.findActiveSession = findActiveSession;
/**
 * Find a session by its ID regardless of revocation status.
 * Used to inspect replay scenarios.
 */
const findSessionById = async (sessionId) => {
    return session_model_1.default.findById(sessionId);
};
exports.findSessionById = findSessionById;
//# sourceMappingURL=session.repository.js.map