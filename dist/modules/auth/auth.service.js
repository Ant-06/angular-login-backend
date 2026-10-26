"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = exports.supportsTransactions = exports.ROTATION_GRACE_PERIOD_MS = void 0;
const password_1 = require("../../utils/password");
const jwt_1 = require("../../utils/jwt");
const auth_repository_1 = require("./auth.repository");
const node_crypto_1 = require("node:crypto");
const mongoose_1 = __importStar(require("mongoose"));
const session_repository_1 = require("./session.repository");
const refreshLifetimeMs = 7 * 24 * 60 * 60 * 1000;
/**
 * Concurrency grace window (in milliseconds).
 * Legitimate concurrent refresh requests from the same client session that arrive
 * within this window after an atomic rotation do not trigger token-family revocation.
 * A token replayed outside this grace period is treated as a genuine replay attack.
 */
exports.ROTATION_GRACE_PERIOD_MS = 10000;
const supportsTransactions = () => {
    const client = mongoose_1.default.connection.getClient();
    const topologyType = client?.topology?.description?.type;
    return (topologyType === "ReplicaSetWithPrimary" ||
        topologyType === "Sharded" ||
        topologyType === "LoadBalanced");
};
exports.supportsTransactions = supportsTransactions;
const hashToken = (token) => (0, node_crypto_1.createHash)("sha256").update(token).digest("hex");
class AuthService {
    // Registration
    static async register(email, password) {
        const existing = await (0, auth_repository_1.findUserByEmail)(email.toLowerCase().trim());
        if (existing) {
            throw { status: 409, message: "User already exists" };
        }
        const hashed = await (0, password_1.hashPassword)(password);
        let user;
        try {
            user = await (0, auth_repository_1.createUser)(email.toLowerCase().trim(), hashed);
        }
        catch (error) {
            if (error?.code === 11000) {
                throw { status: 409, message: "User already exists" };
            }
            throw error;
        }
        return { id: user._id.toString(), email: user.email };
    }
    // Login
    static async login(email, password) {
        const user = await (0, auth_repository_1.findUserByEmail)(email.toLowerCase().trim());
        if (!user) {
            throw { status: 401, message: "Invalid email or password" };
        }
        if (user.status && user.status !== "active") {
            throw { status: 403, message: "Account is not active" };
        }
        const passwordMatch = await (0, password_1.comparePassword)(password, user.password);
        if (!passwordMatch) {
            throw { status: 401, message: "Invalid email or password" };
        }
        // Create a new session family for each login
        const familyId = (0, node_crypto_1.randomUUID)();
        const tokens = await this.issueTokens(user._id.toString(), user.email, familyId);
        await (0, session_repository_1.createSession)(user._id.toString(), hashToken(tokens.refreshToken), new Date(Date.now() + refreshLifetimeMs), familyId, tokens.sessionId);
        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: tokens.user,
        };
    }
    static async refresh(refreshToken) {
        let claims;
        try {
            claims = (0, jwt_1.verifyRefreshToken)(refreshToken);
        }
        catch {
            throw { status: 401, message: "Invalid or expired refresh token" };
        }
        if (claims.type !== "refresh" ||
            typeof claims.sessionId !== "string" ||
            typeof claims.userId !== "string" ||
            typeof claims.familyId !== "string") {
            throw { status: 401, message: "Invalid or expired refresh token" };
        }
        // 1. Check that the user exists and is active
        const user = await (0, auth_repository_1.findUserById)(claims.userId);
        if (!user) {
            throw { status: 401, message: "Invalid or expired refresh token" };
        }
        if (user.status && user.status !== "active") {
            // Revoke the entire family for suspended or deleted accounts
            await (0, session_repository_1.revokeFamily)(claims.familyId, "account_inactive");
            throw { status: 403, message: "Account is not active" };
        }
        // 2. Prevent revoked families from creating or renewing valid sessions
        if (await (0, session_repository_1.isFamilyRevoked)(claims.familyId)) {
            throw { status: 401, message: "Invalid or expired refresh token" };
        }
        // 3. Inspect existing session for replay or recovery
        const currentSession = await (0, session_repository_1.findSessionById)(claims.sessionId);
        if (!currentSession) {
            throw { status: 401, message: "Invalid or expired refresh token" };
        }
        if (currentSession.revokedAt) {
            // Check if this session was rotated but successor creation previously failed
            if (currentSession.replacedByHash) {
                const existingSuccessor = await (0, session_repository_1.findSessionByHash)(currentSession.replacedByHash);
                if (!existingSuccessor) {
                    // Auto-recovery: previous rotation attempt was interrupted without creating a successor.
                    // Restore the session so rotation can proceed safely.
                    await (0, session_repository_1.restoreSession)(claims.sessionId, currentSession.replacedByHash);
                }
                else {
                    // Successor exists: check if this is a legitimate concurrent request within grace period
                    const elapsedMs = Date.now() - new Date(currentSession.revokedAt).getTime();
                    if (elapsedMs < exports.ROTATION_GRACE_PERIOD_MS) {
                        throw {
                            status: 401,
                            message: "Refresh token already consumed by concurrent request",
                        };
                    }
                    // Outside grace window: genuine replay attack. Revoke entire token family.
                    await (0, session_repository_1.revokeFamily)(claims.familyId, "replay");
                    throw { status: 401, message: "Invalid or expired refresh token" };
                }
            }
            else {
                // Revoked without successor (e.g. explicit logout)
                throw { status: 401, message: "Invalid or expired refresh token" };
            }
        }
        const oldHash = hashToken(refreshToken);
        const tokens = await this.issueTokens(user._id.toString(), user.email, claims.familyId);
        const newHash = hashToken(tokens.refreshToken);
        // 4. Multi-document transaction attempt (if supported by MongoDB deployment)
        if ((0, exports.supportsTransactions)()) {
            let mongoSession = null;
            try {
                mongoSession = await mongoose_1.default.startSession();
                mongoSession.startTransaction();
                const rotatedTx = await (0, session_repository_1.rotateSession)(claims.sessionId, oldHash, newHash, tokens.sessionId, mongoSession);
                if (!rotatedTx) {
                    await mongoSession.abortTransaction();
                    await mongoSession.endSession();
                    mongoSession = null;
                }
                else {
                    await (0, session_repository_1.createSession)(user._id.toString(), newHash, new Date(Date.now() + refreshLifetimeMs), claims.familyId, tokens.sessionId, mongoSession);
                    await mongoSession.commitTransaction();
                    await mongoSession.endSession();
                    return {
                        accessToken: tokens.accessToken,
                        refreshToken: tokens.refreshToken,
                        user: tokens.user,
                    };
                }
            }
            catch (txErr) {
                if (mongoSession) {
                    try {
                        await mongoSession.abortTransaction();
                        await mongoSession.endSession();
                    }
                    catch (_e) {
                        void _e;
                    }
                    mongoSession = null;
                }
                const isTxUnsupported = txErr?.message?.includes("Transaction numbers are only allowed") ||
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
        const rotated = await (0, session_repository_1.rotateSession)(claims.sessionId, oldHash, newHash, tokens.sessionId);
        if (!rotated) {
            const existing = await (0, session_repository_1.findSessionById)(claims.sessionId);
            if (existing && existing.revokedAt) {
                const elapsedMs = Date.now() - new Date(existing.revokedAt).getTime();
                if (elapsedMs < exports.ROTATION_GRACE_PERIOD_MS) {
                    throw {
                        status: 401,
                        message: "Refresh token already consumed by concurrent request",
                    };
                }
                await (0, session_repository_1.revokeFamily)(claims.familyId, "replay");
            }
            throw { status: 401, message: "Invalid or expired refresh token" };
        }
        try {
            await (0, session_repository_1.createSession)(user._id.toString(), newHash, new Date(Date.now() + refreshLifetimeMs), claims.familyId, tokens.sessionId);
        }
        catch (createErr) {
            // Roll back revocation so the session is not left unusable without a valid successor
            await (0, session_repository_1.restoreSession)(claims.sessionId, newHash);
            throw createErr;
        }
        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: tokens.user,
        };
    }
    static async logout(refreshToken) {
        if (!refreshToken) {
            return;
        }
        try {
            const claims = (0, jwt_1.verifyRefreshToken)(refreshToken);
            if (claims.type === "refresh" && typeof claims.sessionId === "string") {
                await (0, session_repository_1.revokeSession)(claims.sessionId, hashToken(refreshToken));
            }
        }
        catch {
            return;
        }
    }
    static async issueTokens(userId, email, familyId) {
        const sessionId = new mongoose_1.Types.ObjectId().toString();
        const accessToken = (0, jwt_1.generateAccessToken)({
            userId,
            email,
            type: "access",
            sessionId,
        });
        const refreshToken = (0, jwt_1.generateRefreshToken)({
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
    static async me(userId) {
        const user = await (0, auth_repository_1.findUserById)(userId);
        if (!user) {
            throw { status: 404, message: "User not found" };
        }
        return { id: user._id.toString(), email: user.email };
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map