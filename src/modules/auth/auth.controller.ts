import { AuthService } from "./auth.service";
import {
  ControllerInput,
  ControllerResult,
} from "../../core/router/router.service";
import { Validator } from "../../core/validator/validator.service";
import { LoginDto, RegisterDto } from "./auth.dto";
import env from "../../config/env";

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
const clearRefreshCookie = (input: ControllerInput) =>
  input.clearCookie("refreshToken", {
    ...refreshCookieOptions,
    maxAge: undefined,
  });
export class AuthController {
  @Validator(RegisterDto)
  static async register(input: ControllerInput): Promise<ControllerResult> {
    const { email, password } = input.body;
    const user = await AuthService.register(email, password);
    return {
      status: 201,
      message: "User registered successfully",
      data: { user },
    };
  }
  @Validator(LoginDto)
  static async login(input: ControllerInput): Promise<ControllerResult> {
    const { email, password } = input.body;
    const result = await AuthService.login(email, password);
    input.setCookie("refreshToken", result.refreshToken, refreshCookieOptions);
    return {
      message: "Login successful",
      data: { accessToken: result.accessToken, user: result.user },
    };
  }
  static async refresh(input: ControllerInput): Promise<ControllerResult> {
    const token = input.cookies?.refreshToken;
    if (!token || typeof token !== "string") {
      clearRefreshCookie(input);
      throw { status: 401, message: "Invalid or expired refresh token" };
    }
    try {
      const result = await AuthService.refresh(token);
      input.setCookie(
        "refreshToken",
        result.refreshToken,
        refreshCookieOptions,
      );
      return {
        message: "Token refreshed",
        data: { accessToken: result.accessToken, user: result.user },
      };
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) clearRefreshCookie(input);
      throw err;
    }
  }
  static async logout(input: ControllerInput): Promise<ControllerResult> {
    await AuthService.logout(input.cookies?.refreshToken);
    clearRefreshCookie(input);
    return { message: "Logout successful", data: null };
  }
  static async me(input: ControllerInput): Promise<ControllerResult> {
    if (!input.user) throw { status: 401, message: "Access token required" };
    return {
      message: "User profile",
      data: await AuthService.me(input.user.userId),
    };
  }
  static async check(input: ControllerInput): Promise<ControllerResult> {
    if (!input.user) throw { status: 401, message: "Access token required" };
    return {
      message: "JWT Token is valid",
      data: {
        tokenValid: true,
        user: { id: input.user.userId, email: input.user.email },
      },
    };
  }
}
