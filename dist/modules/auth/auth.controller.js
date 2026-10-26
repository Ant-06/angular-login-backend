"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const auth_service_1 = require("./auth.service");
const validator_service_1 = require("../../core/validator/validator.service");
const auth_dto_1 = require("./auth.dto");
const env_1 = __importDefault(require("../../config/env"));
const refreshCookieOptions = {
    httpOnly: true,
    secure: env_1.default.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
};
const clearRefreshCookie = (input) => input.clearCookie("refreshToken", {
    ...refreshCookieOptions,
    maxAge: undefined,
});
class AuthController {
    static async register(input) {
        const { email, password } = input.body;
        const user = await auth_service_1.AuthService.register(email, password);
        return {
            status: 201,
            message: "User registered successfully",
            data: { user },
        };
    }
    static async login(input) {
        const { email, password } = input.body;
        const result = await auth_service_1.AuthService.login(email, password);
        input.setCookie("refreshToken", result.refreshToken, refreshCookieOptions);
        return {
            message: "Login successful",
            data: { accessToken: result.accessToken, user: result.user },
        };
    }
    static async refresh(input) {
        const token = input.cookies?.refreshToken;
        if (!token || typeof token !== "string") {
            clearRefreshCookie(input);
            throw { status: 401, message: "Invalid or expired refresh token" };
        }
        try {
            const result = await auth_service_1.AuthService.refresh(token);
            input.setCookie("refreshToken", result.refreshToken, refreshCookieOptions);
            return {
                message: "Token refreshed",
                data: { accessToken: result.accessToken, user: result.user },
            };
        }
        catch (err) {
            if (err?.status === 401 || err?.status === 403)
                clearRefreshCookie(input);
            throw err;
        }
    }
    static async logout(input) {
        await auth_service_1.AuthService.logout(input.cookies?.refreshToken);
        clearRefreshCookie(input);
        return { message: "Logout successful", data: null };
    }
    static async me(input) {
        if (!input.user)
            throw { status: 401, message: "Access token required" };
        return {
            message: "User profile",
            data: await auth_service_1.AuthService.me(input.user.userId),
        };
    }
    static async check(input) {
        if (!input.user)
            throw { status: 401, message: "Access token required" };
        return {
            message: "JWT Token is valid",
            data: {
                tokenValid: true,
                user: { id: input.user.userId, email: input.user.email },
            },
        };
    }
}
exports.AuthController = AuthController;
__decorate([
    (0, validator_service_1.Validator)(auth_dto_1.RegisterDto),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController, "register", null);
__decorate([
    (0, validator_service_1.Validator)(auth_dto_1.LoginDto),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController, "login", null);
//# sourceMappingURL=auth.controller.js.map