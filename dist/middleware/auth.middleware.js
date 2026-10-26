"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const jwt_1 = require("../utils/jwt");
const app_util_1 = require("../core/app.util");
const session_repository_1 = require("../modules/auth/session.repository");
const auth_repository_1 = require("../modules/auth/auth.repository");
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return (0, app_util_1.sendError)(res, 401, "Access token required", [
            { message: "Authorization header is required" },
        ]);
    }
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
        return (0, app_util_1.sendError)(res, 401, "Invalid authorization format");
    }
    const token = parts[1];
    // 1. Separate JWT verification and claims validation
    let decoded;
    try {
        decoded = (0, jwt_1.verifyAccessToken)(token);
    }
    catch {
        return (0, app_util_1.sendError)(res, 401, "Invalid or expired token");
    }
    if (!decoded ||
        typeof decoded.userId !== "string" ||
        typeof decoded.email !== "string" ||
        typeof decoded.sessionId !== "string" ||
        decoded.type !== "access") {
        return (0, app_util_1.sendError)(res, 401, "Invalid or expired token");
    }
    // 2. Database and session checks (isolated so database errors reach centralized error handler)
    try {
        const [session, user] = await Promise.all([
            (0, session_repository_1.findActiveSession)(decoded.sessionId, decoded.userId),
            (0, auth_repository_1.findUserById)(decoded.userId),
        ]);
        if (!session) {
            return (0, app_util_1.sendError)(res, 401, "Session is no longer active");
        }
        if (!user || (user.status && user.status !== "active")) {
            return (0, app_util_1.sendError)(res, 403, "Account is not active");
        }
        req.user = decoded;
        return next();
    }
    catch (dbError) {
        // Database connectivity or query errors must reach centralized error middleware
        return next(dbError);
    }
};
exports.authenticateToken = authenticateToken;
//# sourceMappingURL=auth.middleware.js.map