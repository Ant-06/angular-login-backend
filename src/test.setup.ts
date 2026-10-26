process.env.MONGO_URI = "mongodb://127.0.0.1:27017/auth-test-placeholder";
process.env.JWT_SECRET =
  "test-jwt-secret-key-must-be-at-least-32-characters-long";
process.env.REFRESH_TOKEN_SECRET =
  "test-refresh-secret-key-must-be-at-least-32-characters-long";
process.env.NODE_ENV = "test";
process.env.ALLOWED_ORIGINS = "http://localhost:4200";
