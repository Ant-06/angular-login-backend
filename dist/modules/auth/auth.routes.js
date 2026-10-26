"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const router_service_1 = require("../../core/router/router.service");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const auth_controller_1 = require("./auth.controller");
const router = new router_service_1.DeclarativeRouter();
router
    .register("post", "/register", auth_controller_1.AuthController.register)
    .register("post", "/login", auth_controller_1.AuthController.login)
    .register("post", "/refresh", auth_controller_1.AuthController.refresh)
    .register("post", "/logout", auth_controller_1.AuthController.logout)
    .register("get", "/me", auth_controller_1.AuthController.me, [auth_middleware_1.authenticateToken])
    .register("get", "/dashboard", auth_controller_1.AuthController.me, [auth_middleware_1.authenticateToken])
    .register("get", "/check", auth_controller_1.AuthController.check, [auth_middleware_1.authenticateToken]);
exports.default = router.expressRouter;
//# sourceMappingURL=auth.routes.js.map