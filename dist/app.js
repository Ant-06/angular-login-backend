"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const error_middleware_1 = __importDefault(require("./middleware/error.middleware"));
const openapi_1 = __importDefault(require("./config/openapi"));
const app_util_1 = require("./core/app.util");
const createApp = () => {
    const app = (0, express_1.default)();
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:4200")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    app.disable("x-powered-by");
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({ origin: allowedOrigins, credentials: true }));
    app.use(express_1.default.json({ limit: "16kb" }));
    app.use((0, cookie_parser_1.default)());
    app.use("/api/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openapi_1.default));
    const authLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        skip: () => process.env.NODE_ENV === "test",
        handler: (req, res) => (0, app_util_1.sendError)(res, 429, "Too many authentication attempts. Please try again later."),
    });
    // routes
    app.use("/api/auth/login", authLimiter);
    app.use("/api/auth/register", authLimiter);
    app.use("/api/auth", auth_routes_1.default);
    app.get("/", (req, res) => {
        (0, app_util_1.sendSuccess)(res, 200, "Angular Login API is running", null);
    });
    app.use((req, res) => {
        (0, app_util_1.sendError)(res, 404, "Route not found");
    });
    // error handling
    app.use(error_middleware_1.default);
    return app;
};
exports.default = createApp;
//# sourceMappingURL=app.js.map