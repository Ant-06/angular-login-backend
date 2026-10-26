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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const mongoose_1 = __importDefault(require("mongoose"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
const app_1 = __importDefault(require("../../../app"));
const user_model_1 = __importDefault(require("../user.model"));
const session_model_1 = __importDefault(require("../session.model"));
const sessionRepo = __importStar(require("../session.repository"));
let app = (0, app_1.default)();
let mongod;
beforeAll(async () => {
    mongod = await mongodb_memory_server_1.MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGO_URI = uri;
    process.env.JWT_SECRET =
        "test-jwt-secret-key-must-be-at-least-32-characters-long";
    process.env.REFRESH_TOKEN_SECRET =
        "test-refresh-secret-key-must-be-at-least-32-characters-long";
    await mongoose_1.default.connect(uri);
});
afterAll(async () => {
    await mongoose_1.default.connection.dropDatabase();
    await mongoose_1.default.connection.close();
    await mongod.stop();
});
describe("Auth Endpoints", () => {
    const user = { email: "test@example.com", password: "Password123" };
    it("should register a new user", async () => {
        const res = await (0, supertest_1.default)(app).post("/api/auth/register").send(user);
        expect(res.status).toBe(201);
        expect(res.body.response.status).toBe("SUCCESS");
        expect(res.body.response).toEqual({
            status: "SUCCESS",
            message: "User registered successfully",
            code: 201,
            errors: [],
        });
    });
    it("should not register duplicate user", async () => {
        const res = await (0, supertest_1.default)(app).post("/api/auth/register").send(user);
        expect(res.status).toBe(409);
        expect(res.body.response.status).toBe("ERROR");
    });
    it("should login with correct credentials", async () => {
        const res = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        expect(res.status).toBe(200);
        expect(res.body.response.status).toBe("SUCCESS");
        expect(res.body.data).toHaveProperty("accessToken");
        expect(res.body.response.code).toBe(200);
    });
    it("should fail login with wrong password", async () => {
        const res = await (0, supertest_1.default)(app)
            .post("/api/auth/login")
            .send({ email: user.email, password: "wrong" });
        expect(res.status).toBe(401);
        expect(res.body.response.status).toBe("ERROR");
    });
    it("should reject login with invalid email format", async () => {
        const res = await (0, supertest_1.default)(app)
            .post("/api/auth/login")
            .send({ email: "not-an-email", password: "Password123" });
        expect(res.status).toBe(400);
        expect(res.body.response.status).toBe("ERROR");
    });
    it("should reject login with missing password", async () => {
        const res = await (0, supertest_1.default)(app)
            .post("/api/auth/login")
            .send({ email: user.email });
        expect(res.status).toBe(400);
        expect(res.body.response.status).toBe("ERROR");
    });
    it("should reject register with missing required fields", async () => {
        const res = await (0, supertest_1.default)(app)
            .post("/api/auth/register")
            .send({ email: user.email });
        expect(res.status).toBe(400);
        expect(res.body.response.status).toBe("ERROR");
        expect(res.body.response.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "password" })]));
    });
    it("should reject unexpected authentication properties", async () => {
        const res = await (0, supertest_1.default)(app)
            .post("/api/auth/register")
            .send({ ...user, role: "admin" });
        expect(res.status).toBe(400);
        expect(res.body.response.code).toBe(400);
    });
    it("should access protected route with token", async () => {
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        const token = loginRes.body.data.accessToken;
        const res = await (0, supertest_1.default)(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.response.status).toBe("SUCCESS");
        expect(res.body.data.email).toBe(user.email);
    });
    it("should reject protected route without token", async () => {
        const res = await (0, supertest_1.default)(app).get("/api/auth/me");
        expect(res.status).toBe(401);
        expect(res.body.response.status).toBe("ERROR");
    });
    it("should reject protected route with invalid token", async () => {
        const res = await (0, supertest_1.default)(app)
            .get("/api/auth/me")
            .set("Authorization", "Bearer invalid.token.value");
        expect(res.status).toBe(401);
        expect(res.body.response.status).toBe("ERROR");
    });
    it("should reject protected route with expired token", async () => {
        const expiredToken = jsonwebtoken_1.default.sign({
            userId: "expired-user",
            email: user.email,
            type: "access",
            sessionId: new mongoose_1.default.Types.ObjectId().toString(),
        }, process.env.JWT_SECRET, {
            expiresIn: "-1h",
            issuer: "angular-login-api",
            audience: "angular-login-client",
        });
        const res = await (0, supertest_1.default)(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${expiredToken}`);
        expect(res.status).toBe(401);
        expect(res.body.response.status).toBe("ERROR");
    });
    it("should reject a token signed with a wrong secret", async () => {
        const wrongToken = jsonwebtoken_1.default.sign({
            userId: new mongoose_1.default.Types.ObjectId().toString(),
            email: user.email,
            type: "access",
            sessionId: new mongoose_1.default.Types.ObjectId().toString(),
        }, "wrong-secret-key-that-is-at-least-32-characters-long", {
            expiresIn: "15m",
            issuer: "angular-login-api",
            audience: "angular-login-client",
        });
        const res = await (0, supertest_1.default)(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${wrongToken}`);
        expect(res.status).toBe(401);
    });
    it("should reject a token with missing required claims", async () => {
        const badToken = jsonwebtoken_1.default.sign({ email: user.email, type: "access" }, process.env.JWT_SECRET, {
            expiresIn: "15m",
            issuer: "angular-login-api",
            audience: "angular-login-client",
        });
        const res = await (0, supertest_1.default)(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${badToken}`);
        expect(res.status).toBe(401);
    });
    it("should return a controlled response for unknown routes", async () => {
        const res = await (0, supertest_1.default)(app).get("/api/unknown");
        expect(res.status).toBe(404);
        expect(res.body.response.status).toBe("ERROR");
        expect(res.body.response.message).toBe("Route not found");
        expect(res.body.data).toBeNull();
        expect(res.body.response).toEqual({
            status: "ERROR",
            message: "Route not found",
            code: 404,
            errors: [],
        });
    });
    it("should reject malformed JSON safely", async () => {
        const res = await (0, supertest_1.default)(app)
            .post("/api/auth/login")
            .set("Content-Type", "application/json")
            .send('{"email":');
        expect(res.status).toBe(400);
        expect(res.body.response.status).toBe("ERROR");
        expect(res.body.data).toBeNull();
    });
    it("should expose API documentation", async () => {
        const res = await (0, supertest_1.default)(app).get("/api/docs/");
        expect(res.status).toBe(200);
        expect(res.text).toContain("Swagger UI");
    });
});
describe("Refresh-Token Family Tracking", () => {
    const user = { email: "family@example.com", password: "Password123" };
    beforeAll(async () => {
        await (0, supertest_1.default)(app).post("/api/auth/register").send(user);
    });
    it("should successfully refresh a valid token", async () => {
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        const originalCookie = loginRes.headers["set-cookie"][0];
        const refreshRes = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", originalCookie);
        expect(refreshRes.status).toBe(200);
        expect(refreshRes.body.response.status).toBe("SUCCESS");
        expect(refreshRes.body.data).toHaveProperty("accessToken");
    });
    it("should rotate refresh tokens and reject replayed (consumed) tokens", async () => {
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        const originalCookie = loginRes.headers["set-cookie"][0];
        // First refresh succeeds
        const refreshRes = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", originalCookie);
        expect(refreshRes.status).toBe(200);
        expect(refreshRes.body.data).toHaveProperty("accessToken");
        // Age the consumed session past the grace window
        await session_model_1.default.updateMany({ revokedAt: { $ne: null } }, { $set: { revokedAt: new Date(Date.now() - 15000) } });
        // Replay the original cookie — must be rejected
        const replayRes = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", originalCookie);
        expect(replayRes.status).toBe(401);
        expect(replayRes.body.response.status).toBe("ERROR");
    });
    it("should revoke the entire token family when genuine replay is detected", async () => {
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        const cookie1 = loginRes.headers["set-cookie"][0];
        // Refresh #1: legitimate
        const refresh1 = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", cookie1);
        expect(refresh1.status).toBe(200);
        const cookie2 = refresh1.headers["set-cookie"][0];
        // Age the consumed session past the grace window (outside concurrency window)
        await session_model_1.default.updateMany({ revokedAt: { $ne: null } }, { $set: { revokedAt: new Date(Date.now() - 15000) } });
        // Replay cookie1 — triggers family revocation
        const replayRes = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", cookie1);
        expect(replayRes.status).toBe(401);
        // Now even cookie2 (the legitimate successor) must be revoked
        const refresh2 = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", cookie2);
        expect(refresh2.status).toBe(401);
    });
    it("should not affect sessions outside the revoked family", async () => {
        // Create two independent sessions
        const login1 = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        const cookie1 = login1.headers["set-cookie"][0];
        const login2 = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        const cookie2 = login2.headers["set-cookie"][0];
        // Refresh session 1 then replay after aging past grace period
        const refresh1 = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", cookie1);
        expect(refresh1.status).toBe(200);
        await session_model_1.default.updateMany({ revokedAt: { $ne: null } }, { $set: { revokedAt: new Date(Date.now() - 15000) } });
        await (0, supertest_1.default)(app).post("/api/auth/refresh").set("Cookie", cookie1);
        // Session 2 (different family) should still work
        const refresh2 = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", cookie2);
        expect(refresh2.status).toBe(200);
    });
    it("should reject expired refresh tokens", async () => {
        // Create a token that is already expired
        const expiredRefresh = jsonwebtoken_1.default.sign({
            userId: new mongoose_1.default.Types.ObjectId().toString(),
            email: user.email,
            type: "refresh",
            sessionId: new mongoose_1.default.Types.ObjectId().toString(),
            familyId: "expired-family",
        }, process.env.REFRESH_TOKEN_SECRET, {
            expiresIn: "-1h",
            issuer: "angular-login-api",
            audience: "angular-login-client",
        });
        const res = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", `refreshToken=${expiredRefresh}`);
        expect(res.status).toBe(401);
    });
    it("should reject refresh with no cookie", async () => {
        const res = await (0, supertest_1.default)(app).post("/api/auth/refresh");
        expect(res.status).toBe(401);
    });
    it("should handle concurrent refresh attempts deterministically and preserve valid successor token", async () => {
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        const cookie = loginRes.headers["set-cookie"][0];
        // Fire two concurrent refresh requests with the same cookie
        const [res1, res2] = await Promise.all([
            (0, supertest_1.default)(app).post("/api/auth/refresh").set("Cookie", cookie),
            (0, supertest_1.default)(app).post("/api/auth/refresh").set("Cookie", cookie),
        ]);
        // Exactly one should succeed, the other should fail
        const statuses = [res1.status, res2.status].sort();
        expect(statuses).toEqual([200, 401]);
        // The winning request's new cookie MUST be valid and usable!
        const winningRes = res1.status === 200 ? res1 : res2;
        const nextCookie = winningRes.headers["set-cookie"][0];
        const nextRefresh = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", nextCookie);
        expect(nextRefresh.status).toBe(200);
        expect(nextRefresh.body.response.status).toBe("SUCCESS");
    });
    it("should recover when a database operation fails during successor creation", async () => {
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        const cookie = loginRes.headers["set-cookie"][0];
        // Force createSession to fail once simulating a DB glitch during successor insertion
        jest.spyOn(sessionRepo, "createSession").mockImplementationOnce(() => {
            throw new Error("Simulated database failure during successor creation");
        });
        const failedRefresh = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", cookie);
        expect(failedRefresh.status).toBe(500);
        // Verify session was NOT left unusable: retry with the same cookie must succeed!
        const retryRefresh = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", cookie);
        expect(retryRefresh.status).toBe(200);
        expect(retryRefresh.body.response.status).toBe("SUCCESS");
        expect(retryRefresh.body.data).toHaveProperty("accessToken");
    });
});
describe("Logout and Session Revocation", () => {
    const user = { email: "logout@example.com", password: "Password123" };
    beforeAll(async () => {
        await (0, supertest_1.default)(app).post("/api/auth/register").send(user);
    });
    it("should revoke the refresh session on logout", async () => {
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        const cookie = loginRes.headers["set-cookie"][0];
        const accessToken = loginRes.body.data.accessToken;
        const logoutRes = await (0, supertest_1.default)(app)
            .post("/api/auth/logout")
            .set("Cookie", cookie);
        expect(logoutRes.status).toBe(200);
        // Refresh after logout must fail
        const refreshRes = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", cookie);
        expect(refreshRes.status).toBe(401);
        // Access token's session is revoked
        const protectedRes = await (0, supertest_1.default)(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${accessToken}`);
        expect(protectedRes.status).toBe(401);
    });
    it("should return 200 even when logging out without a cookie", async () => {
        const res = await (0, supertest_1.default)(app).post("/api/auth/logout");
        expect(res.status).toBe(200);
    });
});
describe("Suspended and Deleted Account Handling", () => {
    const user = { email: "suspended@example.com", password: "Password123" };
    beforeAll(async () => {
        await (0, supertest_1.default)(app).post("/api/auth/register").send(user);
    });
    afterEach(async () => {
        // Restore the user to active after each test
        await user_model_1.default.updateOne({ email: user.email }, { $set: { status: "active" } });
    });
    it("should reject suspended accounts during login", async () => {
        await user_model_1.default.updateOne({ email: user.email }, { $set: { status: "suspended" } });
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        expect(loginRes.status).toBe(403);
    });
    it("should reject suspended accounts during refresh", async () => {
        // Login while active
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        expect(loginRes.status).toBe(200);
        const cookie = loginRes.headers["set-cookie"][0];
        // Suspend the account
        await user_model_1.default.updateOne({ email: user.email }, { $set: { status: "suspended" } });
        // Refresh must fail
        const refreshRes = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", cookie);
        expect(refreshRes.status).toBe(403);
    });
    it("should reject suspended accounts on protected routes", async () => {
        // Login while active
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        const accessToken = loginRes.body.data.accessToken;
        // Verify access works while active
        const activeRes = await (0, supertest_1.default)(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${accessToken}`);
        expect(activeRes.status).toBe(200);
        // Suspend
        await user_model_1.default.updateOne({ email: user.email }, { $set: { status: "suspended" } });
        // Protected route must reject
        const suspendedRes = await (0, supertest_1.default)(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${accessToken}`);
        expect(suspendedRes.status).toBe(403);
    });
    it("should reject deleted accounts during login with 403", async () => {
        await user_model_1.default.updateOne({ email: user.email }, { $set: { status: "deleted" } });
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        expect(loginRes.status).toBe(403);
    });
    it("should reject deleted accounts during refresh with 403", async () => {
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        expect(loginRes.status).toBe(200);
        const cookie = loginRes.headers["set-cookie"][0];
        await user_model_1.default.updateOne({ email: user.email }, { $set: { status: "deleted" } });
        const refreshRes = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", cookie);
        expect(refreshRes.status).toBe(403);
    });
    it("should reject deleted accounts on protected routes with 403", async () => {
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        const accessToken = loginRes.body.data.accessToken;
        await user_model_1.default.updateOne({ email: user.email }, { $set: { status: "deleted" } });
        const deletedRes = await (0, supertest_1.default)(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${accessToken}`);
        expect(deletedRes.status).toBe(403);
    });
    it("should allow re-activated accounts to login normally", async () => {
        await user_model_1.default.updateOne({ email: user.email }, { $set: { status: "suspended" } });
        const failedLogin = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        expect(failedLogin.status).toBe(403);
        await user_model_1.default.updateOne({ email: user.email }, { $set: { status: "active" } });
        const successLogin = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        expect(successLogin.status).toBe(200);
    });
});
describe("Refresh Controller Error Handling", () => {
    it("should reject refresh without a cookie with 401", async () => {
        const res = await (0, supertest_1.default)(app).post("/api/auth/refresh");
        expect(res.status).toBe(401);
        expect(res.body.response.status).toBe("ERROR");
        expect(res.body.data).toBeNull();
    });
    it("should return standardized error shape for invalid refresh", async () => {
        const res = await (0, supertest_1.default)(app)
            .post("/api/auth/refresh")
            .set("Cookie", "refreshToken=invalid-token-value");
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty("response");
        expect(res.body).toHaveProperty("data");
        expect(res.body.response.status).toBe("ERROR");
        expect(res.body.response).toHaveProperty("code");
        expect(res.body.response).toHaveProperty("errors");
        expect(res.body.data).toBeNull();
    });
});
describe("Authentication Middleware Error Handling", () => {
    const user = { email: "autherror@example.com", password: "Password123" };
    let validAccessToken;
    beforeAll(async () => {
        await (0, supertest_1.default)(app).post("/api/auth/register").send(user);
        const loginRes = await (0, supertest_1.default)(app).post("/api/auth/login").send(user);
        validAccessToken = loginRes.body.data.accessToken;
    });
    it("should forward unexpected database errors to centralized error handling with HTTP 500", async () => {
        jest.spyOn(sessionRepo, "findActiveSession").mockImplementationOnce(() => {
            throw new Error("Simulated database connection loss");
        });
        const res = await (0, supertest_1.default)(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${validAccessToken}`);
        expect(res.status).toBe(500);
        expect(res.body.response.status).toBe("ERROR");
        expect(res.body.response.code).toBe(500);
        expect(res.body.response.message).toBe("Internal Server Error");
        expect(res.body.data).toBeNull();
    });
    it("should reject when session is revoked with 401", async () => {
        // Revoke all sessions for this specific test
        await session_model_1.default.updateMany({}, { $set: { revokedAt: new Date() } });
        const res = await (0, supertest_1.default)(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${validAccessToken}`);
        expect(res.status).toBe(401);
        expect(res.body.response.status).toBe("ERROR");
        expect(res.body.response.message).toBe("Session is no longer active");
    });
});
//# sourceMappingURL=auth.test.js.map