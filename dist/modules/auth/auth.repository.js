"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findUserById = exports.createUser = exports.findUserByEmail = void 0;
const user_model_1 = __importDefault(require("./user.model"));
const findUserByEmail = async (email) => {
    return user_model_1.default.findOne({ email });
};
exports.findUserByEmail = findUserByEmail;
const createUser = async (email, hashedPassword) => {
    const user = new user_model_1.default({ email, password: hashedPassword });
    return user.save();
};
exports.createUser = createUser;
const findUserById = async (id) => {
    return user_model_1.default.findById(id).select("-password");
};
exports.findUserById = findUserById;
//# sourceMappingURL=auth.repository.js.map