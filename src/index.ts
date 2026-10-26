import createApp from "./app";
import env from "./config/env";
import mongoose from "mongoose";

const startServer = async () => {
  try {
    await mongoose.connect(env.MONGO_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error);
    process.exit(1);
  }

  const app = createApp();
  const port = Number(env.PORT) || 3000;
  const server = app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
  });

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
};

startServer();
