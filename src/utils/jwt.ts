import jwt from "jsonwebtoken";
import env from "../config/env";

export const generateAccessToken = (payload: object): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "15m",
    issuer: "angular-login-api",
    audience: "angular-login-client",
  });
};

export const generateRefreshToken = (payload: object): string => {
  return jwt.sign(payload, env.REFRESH_TOKEN_SECRET!, {
    expiresIn: "7d",
    issuer: "angular-login-api",
    audience: "angular-login-client",
  });
};

export const verifyAccessToken = (token: string): jwt.JwtPayload => {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: "angular-login-api",
    audience: "angular-login-client",
  }) as jwt.JwtPayload;
};

export const verifyRefreshToken = (token: string): jwt.JwtPayload => {
  return jwt.verify(token, env.REFRESH_TOKEN_SECRET!, {
    issuer: "angular-login-api",
    audience: "angular-login-client",
  }) as jwt.JwtPayload;
};
