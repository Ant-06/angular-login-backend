import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import createApp from "../../../app";
import User from "../user.model";
import Session from "../session.model";
import * as sessionRepo from "../session.repository";

let app = createApp();
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGO_URI = uri;
  process.env.JWT_SECRET =
    "test-jwt-secret-key-must-be-at-least-32-characters-long";
  process.env.REFRESH_TOKEN_SECRET =
    "test-refresh-secret-key-must-be-at-least-32-characters-long";
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
});

describe("Auth Endpoints", () => {
  const user = { email: "test@example.com", password: "Password123" };

  it("should register a new user", async () => {
    const res = await request(app).post("/api/auth/register").send(user);
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
    const res = await request(app).post("/api/auth/register").send(user);
    expect(res.status).toBe(409);
    expect(res.body.response.status).toBe("ERROR");
  });

  it("should login with correct credentials", async () => {
    const res = await request(app).post("/api/auth/login").send(user);
    expect(res.status).toBe(200);
    expect(res.body.response.status).toBe("SUCCESS");
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.response.code).toBe(200);
  });

  it("should fail login with wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.response.status).toBe("ERROR");
  });

  it("should reject login with invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "Password123" });
    expect(res.status).toBe(400);
    expect(res.body.response.status).toBe("ERROR");
  });

  it("should reject login with missing password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email });
    expect(res.status).toBe(400);
    expect(res.body.response.status).toBe("ERROR");
  });

  it("should reject register with missing required fields", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: user.email });
    expect(res.status).toBe(400);
    expect(res.body.response.status).toBe("ERROR");
    expect(res.body.response.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "password" })]),
    );
  });

  it("should reject unexpected authentication properties", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...user, role: "admin" });
    expect(res.status).toBe(400);
    expect(res.body.response.code).toBe(400);
  });

  it("should access protected route with token", async () => {
    const loginRes = await request(app).post("/api/auth/login").send(user);
    const token = loginRes.body.data.accessToken;
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.response.status).toBe("SUCCESS");
    expect(res.body.data.email).toBe(user.email);
  });

  it("should reject protected route without token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.response.status).toBe("ERROR");
  });

  it("should reject protected route with invalid token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalid.token.value");
    expect(res.status).toBe(401);
    expect(res.body.response.status).toBe("ERROR");
  });

  it("should reject protected route with expired token", async () => {
    const expiredToken = jwt.sign(
      {
        userId: "expired-user",
        email: user.email,
        type: "access",
        sessionId: new mongoose.Types.ObjectId().toString(),
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: "-1h",
        issuer: "angular-login-api",
        audience: "angular-login-client",
      },
    );
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.response.status).toBe("ERROR");
  });

  it("should reject a token signed with a wrong secret", async () => {
    const wrongToken = jwt.sign(
      {
        userId: new mongoose.Types.ObjectId().toString(),
        email: user.email,
        type: "access",
        sessionId: new mongoose.Types.ObjectId().toString(),
      },
      "wrong-secret-key-that-is-at-least-32-characters-long",
      {
        expiresIn: "15m",
        issuer: "angular-login-api",
        audience: "angular-login-client",
      },
    );
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${wrongToken}`);
    expect(res.status).toBe(401);
  });

  it("should reject a token with missing required claims", async () => {
    const badToken = jwt.sign(
      { email: user.email, type: "access" },
      process.env.JWT_SECRET!,
      {
        expiresIn: "15m",
        issuer: "angular-login-api",
        audience: "angular-login-client",
      },
    );
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  it("should return a controlled response for unknown routes", async () => {
    const res = await request(app).get("/api/unknown");
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
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.response.status).toBe("ERROR");
    expect(res.body.data).toBeNull();
  });

  it("should expose API documentation", async () => {
    const res = await request(app).get("/api/docs/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Swagger UI");
  });
});

describe("Refresh-Token Family Tracking", () => {
  const user = { email: "family@example.com", password: "Password123" };

  beforeAll(async () => {
    await request(app).post("/api/auth/register").send(user);
  });

  it("should successfully refresh a valid token", async () => {
    const loginRes = await request(app).post("/api/auth/login").send(user);
    const originalCookie = loginRes.headers["set-cookie"][0];

    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", originalCookie);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.response.status).toBe("SUCCESS");
    expect(refreshRes.body.data).toHaveProperty("accessToken");
  });

  it("should rotate refresh tokens and reject replayed (consumed) tokens", async () => {
    const loginRes = await request(app).post("/api/auth/login").send(user);
    const originalCookie = loginRes.headers["set-cookie"][0];

    // First refresh succeeds
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", originalCookie);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data).toHaveProperty("accessToken");

    // Age the consumed session past the grace window
    await Session.updateMany(
      { revokedAt: { $ne: null } },
      { $set: { revokedAt: new Date(Date.now() - 15000) } },
    );

    // Replay the original cookie — must be rejected
    const replayRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", originalCookie);
    expect(replayRes.status).toBe(401);
    expect(replayRes.body.response.status).toBe("ERROR");
  });

  it("should revoke the entire token family when genuine replay is detected", async () => {
    const loginRes = await request(app).post("/api/auth/login").send(user);
    const cookie1 = loginRes.headers["set-cookie"][0];

    // Refresh #1: legitimate
    const refresh1 = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie1);
    expect(refresh1.status).toBe(200);
    const cookie2 = refresh1.headers["set-cookie"][0];

    // Age the consumed session past the grace window (outside concurrency window)
    await Session.updateMany(
      { revokedAt: { $ne: null } },
      { $set: { revokedAt: new Date(Date.now() - 15000) } },
    );

    // Replay cookie1 — triggers family revocation
    const replayRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie1);
    expect(replayRes.status).toBe(401);

    // Now even cookie2 (the legitimate successor) must be revoked
    const refresh2 = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie2);
    expect(refresh2.status).toBe(401);
  });

  it("should not affect sessions outside the revoked family", async () => {
    // Create two independent sessions
    const login1 = await request(app).post("/api/auth/login").send(user);
    const cookie1 = login1.headers["set-cookie"][0];

    const login2 = await request(app).post("/api/auth/login").send(user);
    const cookie2 = login2.headers["set-cookie"][0];

    // Refresh session 1 then replay after aging past grace period
    const refresh1 = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie1);
    expect(refresh1.status).toBe(200);

    await Session.updateMany(
      { revokedAt: { $ne: null } },
      { $set: { revokedAt: new Date(Date.now() - 15000) } },
    );

    await request(app).post("/api/auth/refresh").set("Cookie", cookie1);

    // Session 2 (different family) should still work
    const refresh2 = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie2);
    expect(refresh2.status).toBe(200);
  });

  it("should reject expired refresh tokens", async () => {
    // Create a token that is already expired
    const expiredRefresh = jwt.sign(
      {
        userId: new mongoose.Types.ObjectId().toString(),
        email: user.email,
        type: "refresh",
        sessionId: new mongoose.Types.ObjectId().toString(),
        familyId: "expired-family",
      },
      process.env.REFRESH_TOKEN_SECRET!,
      {
        expiresIn: "-1h",
        issuer: "angular-login-api",
        audience: "angular-login-client",
      },
    );

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `refreshToken=${expiredRefresh}`);
    expect(res.status).toBe(401);
  });

  it("should reject refresh with no cookie", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("should handle concurrent refresh attempts deterministically and preserve valid successor token", async () => {
    const loginRes = await request(app).post("/api/auth/login").send(user);
    const cookie = loginRes.headers["set-cookie"][0];

    // Fire two concurrent refresh requests with the same cookie
    const [res1, res2] = await Promise.all([
      request(app).post("/api/auth/refresh").set("Cookie", cookie),
      request(app).post("/api/auth/refresh").set("Cookie", cookie),
    ]);

    // Exactly one should succeed, the other should fail
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 401]);

    // The winning request's new cookie MUST be valid and usable!
    const winningRes = res1.status === 200 ? res1 : res2;
    const nextCookie = winningRes.headers["set-cookie"][0];

    const nextRefresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", nextCookie);
    expect(nextRefresh.status).toBe(200);
    expect(nextRefresh.body.response.status).toBe("SUCCESS");
  });

  it("should recover when a database operation fails during successor creation", async () => {
    const loginRes = await request(app).post("/api/auth/login").send(user);
    const cookie = loginRes.headers["set-cookie"][0];

    // Force createSession to fail once simulating a DB glitch during successor insertion
    jest.spyOn(sessionRepo, "createSession").mockImplementationOnce(() => {
      throw new Error("Simulated database failure during successor creation");
    });

    const failedRefresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);
    expect(failedRefresh.status).toBe(500);

    // Verify session was NOT left unusable: retry with the same cookie must succeed!
    const retryRefresh = await request(app)
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
    await request(app).post("/api/auth/register").send(user);
  });

  it("should revoke the refresh session on logout", async () => {
    const loginRes = await request(app).post("/api/auth/login").send(user);
    const cookie = loginRes.headers["set-cookie"][0];
    const accessToken = loginRes.body.data.accessToken;

    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie);
    expect(logoutRes.status).toBe(200);

    // Refresh after logout must fail
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);
    expect(refreshRes.status).toBe(401);

    // Access token's session is revoked
    const protectedRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(protectedRes.status).toBe(401);
  });

  it("should return 200 even when logging out without a cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
  });
});

describe("Suspended and Deleted Account Handling", () => {
  const user = { email: "suspended@example.com", password: "Password123" };

  beforeAll(async () => {
    await request(app).post("/api/auth/register").send(user);
  });

  afterEach(async () => {
    // Restore the user to active after each test
    await User.updateOne({ email: user.email }, { $set: { status: "active" } });
  });

  it("should reject suspended accounts during login", async () => {
    await User.updateOne(
      { email: user.email },
      { $set: { status: "suspended" } },
    );
    const loginRes = await request(app).post("/api/auth/login").send(user);
    expect(loginRes.status).toBe(403);
  });

  it("should reject suspended accounts during refresh", async () => {
    // Login while active
    const loginRes = await request(app).post("/api/auth/login").send(user);
    expect(loginRes.status).toBe(200);
    const cookie = loginRes.headers["set-cookie"][0];

    // Suspend the account
    await User.updateOne(
      { email: user.email },
      { $set: { status: "suspended" } },
    );

    // Refresh must fail
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);
    expect(refreshRes.status).toBe(403);
  });

  it("should reject suspended accounts on protected routes", async () => {
    // Login while active
    const loginRes = await request(app).post("/api/auth/login").send(user);
    const accessToken = loginRes.body.data.accessToken;

    // Verify access works while active
    const activeRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(activeRes.status).toBe(200);

    // Suspend
    await User.updateOne(
      { email: user.email },
      { $set: { status: "suspended" } },
    );

    // Protected route must reject
    const suspendedRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(suspendedRes.status).toBe(403);
  });

  it("should reject deleted accounts during login with 403", async () => {
    await User.updateOne(
      { email: user.email },
      { $set: { status: "deleted" } },
    );
    const loginRes = await request(app).post("/api/auth/login").send(user);
    expect(loginRes.status).toBe(403);
  });

  it("should reject deleted accounts during refresh with 403", async () => {
    const loginRes = await request(app).post("/api/auth/login").send(user);
    expect(loginRes.status).toBe(200);
    const cookie = loginRes.headers["set-cookie"][0];

    await User.updateOne(
      { email: user.email },
      { $set: { status: "deleted" } },
    );
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);
    expect(refreshRes.status).toBe(403);
  });

  it("should reject deleted accounts on protected routes with 403", async () => {
    const loginRes = await request(app).post("/api/auth/login").send(user);
    const accessToken = loginRes.body.data.accessToken;

    await User.updateOne(
      { email: user.email },
      { $set: { status: "deleted" } },
    );
    const deletedRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deletedRes.status).toBe(403);
  });

  it("should allow re-activated accounts to login normally", async () => {
    await User.updateOne(
      { email: user.email },
      { $set: { status: "suspended" } },
    );
    const failedLogin = await request(app).post("/api/auth/login").send(user);
    expect(failedLogin.status).toBe(403);

    await User.updateOne({ email: user.email }, { $set: { status: "active" } });
    const successLogin = await request(app).post("/api/auth/login").send(user);
    expect(successLogin.status).toBe(200);
  });
});

describe("Refresh Controller Error Handling", () => {
  it("should reject refresh without a cookie with 401", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body.response.status).toBe("ERROR");
    expect(res.body.data).toBeNull();
  });

  it("should return standardized error shape for invalid refresh", async () => {
    const res = await request(app)
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
  let validAccessToken: string;

  beforeAll(async () => {
    await request(app).post("/api/auth/register").send(user);
    const loginRes = await request(app).post("/api/auth/login").send(user);
    validAccessToken = loginRes.body.data.accessToken;
  });

  it("should forward unexpected database errors to centralized error handling with HTTP 500", async () => {
    jest.spyOn(sessionRepo, "findActiveSession").mockImplementationOnce(() => {
      throw new Error("Simulated database connection loss");
    });

    const res = await request(app)
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
    await Session.updateMany({}, { $set: { revokedAt: new Date() } });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${validAccessToken}`);

    expect(res.status).toBe(401);
    expect(res.body.response.status).toBe("ERROR");
    expect(res.body.response.message).toBe("Session is no longer active");
  });
});
