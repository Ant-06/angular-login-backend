"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = __importDefault(require("./config/env"));
const mongoose_1 = __importDefault(require("mongoose"));
const startServer = async () => {
    try {
        await mongoose_1.default.connect(env_1.default.MONGO_URI);
        console.log("✅ Connected to MongoDB");
    }
    catch (error) {
        console.error("❌ MongoDB connection failed:", error);
        process.exit(1);
    }
    const app = (0, app_1.default)();
    const port = Number(env_1.default.PORT) || 3000;
    const server = app.listen(port, () => {
        console.log(`🚀 Server is running on http://localhost:${port}`);
    });
    const shutdown = async () => {
        server.close();
        await mongoose_1.default.disconnect();
        process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
};
startServer();
//# sourceMappingURL=index.js.map