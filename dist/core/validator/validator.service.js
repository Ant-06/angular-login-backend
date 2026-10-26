"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Validator = Validator;
exports.validateControllerInput = validateControllerInput;
require("reflect-metadata");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const app_util_1 = require("../app.util");
const DTO_METADATA = Symbol("validator:dto");
function Validator(dto) {
    return (_target, _propertyKey, descriptor) => {
        if (!descriptor || typeof descriptor.value !== "function")
            throw new Error("@Validator() can only decorate methods");
        Reflect.defineMetadata(DTO_METADATA, dto, descriptor.value);
    };
}
async function validateControllerInput(handler, req, res, _next) {
    const dto = Reflect.getMetadata(DTO_METADATA, handler);
    if (!dto)
        return true;
    const input = req.body && typeof req.body === "object" ? req.body : {};
    const instance = (0, class_transformer_1.plainToInstance)(dto, input);
    const errors = await (0, class_validator_1.validate)(instance, {
        whitelist: true,
        forbidNonWhitelisted: true,
    });
    if (errors.length) {
        const details = errors.flatMap((error) => Object.values(error.constraints ?? {}).map((message) => ({
            field: error.property,
            message,
        })));
        (0, app_util_1.sendError)(res, 400, "Validation failed", details);
        return false;
    }
    req.body = instance;
    return true;
}
//# sourceMappingURL=validator.service.js.map