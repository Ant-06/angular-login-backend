"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouterService = exports.DeclarativeRouter = void 0;
const express_1 = require("express");
const app_util_1 = require("../app.util");
const validator_service_1 = require("../validator/validator.service");
class DeclarativeRouter {
    expressRouter = (0, express_1.Router)();
    register(method, path, handler, middleware = []) {
        this.expressRouter[method](path, ...middleware, async (req, res, next) => {
            try {
                if (!(await (0, validator_service_1.validateControllerInput)(handler, req, res, next)))
                    return;
                const input = {
                    body: req.body,
                    params: req.params,
                    query: req.query,
                    user: req.user,
                    cookies: req.cookies ?? {},
                    setCookie: (name, value, options) => {
                        res.cookie(name, value, options);
                    },
                    clearCookie: (name, options) => {
                        res.clearCookie(name, options);
                    },
                };
                const result = await handler(input);
                const shaped = result && typeof result === "object" && "data" in result
                    ? result
                    : { data: result };
                return (0, app_util_1.sendSuccess)(res, shaped.status ??
                    (method === "post" && path === "/register" ? 201 : 200), shaped.message ?? "OK", shaped.data);
            }
            catch (error) {
                next(error);
            }
        });
        return this;
    }
}
exports.DeclarativeRouter = DeclarativeRouter;
exports.RouterService = DeclarativeRouter;
//# sourceMappingURL=router.service.js.map