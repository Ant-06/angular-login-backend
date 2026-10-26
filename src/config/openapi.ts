const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Angular Login API",
    version: "1.0.0",
    description:
      "Authentication API for the Angular login application. Uses JWT access tokens in the Authorization header and rotating HTTP-only refresh-token cookies.",
  },
  servers: [{ url: "http://localhost:3000", description: "Local development" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "JWT access token. Issued on login and refresh. Expires after 15 minutes.",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "refreshToken",
        description:
          "HTTP-only refresh-token cookie. Set automatically by login and refresh endpoints. Expires after 7 days.",
      },
    },
    schemas: {
      ApiError: {
        type: "object",
        required: ["message"],
        properties: {
          field: {
            type: "string",
            description: "Field name for validation errors",
          },
          message: { type: "string" },
        },
      },
      ApiResponse: {
        type: "object",
        required: ["status", "message", "code", "errors"],
        properties: {
          status: {
            type: "string",
            enum: ["SUCCESS", "ERROR"],
            description: "Indicates success or failure",
          },
          message: { type: "string", description: "Human-readable message" },
          code: { type: "integer", description: "HTTP status code" },
          errors: {
            type: "array",
            items: { $ref: "#/components/schemas/ApiError" },
            description:
              "Field-level validation errors. Empty array when not applicable.",
          },
        },
      },
      StandardResponse: {
        type: "object",
        required: ["response", "data"],
        properties: {
          response: { $ref: "#/components/schemas/ApiResponse" },
          data: {
            nullable: true,
            description: "Payload on success; null on error",
          },
        },
      },
      RegisterCredentials: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            format: "email",
            maxLength: 254,
            description: "User email address",
          },
          password: {
            type: "string",
            minLength: 6,
            maxLength: 128,
            description: "Password (at least 6 characters for registration)",
          },
        },
      },
      LoginCredentials: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            format: "email",
            maxLength: 254,
            description: "User email address",
          },
          password: {
            type: "string",
            maxLength: 128,
            description: "User password",
          },
        },
      },
      User: {
        type: "object",
        required: ["id", "email"],
        properties: {
          id: { type: "string", description: "MongoDB ObjectId" },
          email: { type: "string", format: "email" },
        },
      },
      AuthData: {
        type: "object",
        required: ["accessToken", "user"],
        properties: {
          accessToken: {
            type: "string",
            description: "JWT access token (15-minute expiry)",
          },
          user: { $ref: "#/components/schemas/User" },
        },
        description:
          "Returned on successful login and refresh. A refresh-token cookie is also set.",
      },
      RegisterData: {
        type: "object",
        required: ["user"],
        properties: {
          user: { $ref: "#/components/schemas/User" },
        },
      },
      TokenCheckData: {
        type: "object",
        required: ["tokenValid", "user"],
        properties: {
          tokenValid: { type: "boolean" },
          user: { $ref: "#/components/schemas/User" },
        },
      },
    },
  },
  paths: {
    "/api/auth/register": {
      post: {
        summary: "Register a new user",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterCredentials" },
            },
          },
        },
        responses: {
          "201": {
            description: "User registered successfully",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/StandardResponse" },
                    {
                      type: "object",
                      properties: {
                        data: { $ref: "#/components/schemas/RegisterData" },
                      },
                    },
                  ],
                },
              },
            },
          },
          "400": {
            description: "Validation failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
          "409": {
            description: "User already exists",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
        },
      },
    },
    "/api/auth/login": {
      post: {
        summary: "Login and receive tokens",
        description:
          "Authenticates the user, returns an access token in the response body, and sets a refresh-token HTTP-only cookie.",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginCredentials" },
            },
          },
        },
        responses: {
          "200": {
            description: "Login successful",
            headers: {
              "Set-Cookie": {
                description: "refreshToken HTTP-only cookie",
                schema: { type: "string" },
              },
            },
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/StandardResponse" },
                    {
                      type: "object",
                      properties: {
                        data: { $ref: "#/components/schemas/AuthData" },
                      },
                    },
                  ],
                },
              },
            },
          },
          "400": {
            description: "Validation failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
          "401": {
            description: "Invalid email or password",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
          "403": {
            description: "Account is not active (suspended or deleted)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
          "429": {
            description: "Too many authentication attempts",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
        },
      },
    },
    "/api/auth/me": {
      get: {
        summary: "Get the authenticated user's profile",
        tags: ["Protected"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "User profile returned",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/StandardResponse" },
                    {
                      type: "object",
                      properties: {
                        data: { $ref: "#/components/schemas/User" },
                      },
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Missing, invalid, or expired access token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
          "403": {
            description: "Account is not active",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
          "404": {
            description: "User not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
        },
      },
    },
    "/api/auth/dashboard": {
      get: {
        summary:
          "Get the authenticated user's profile (backward-compatible alias)",
        description:
          "Behaves identically to GET /api/auth/me. Provided for backward compatibility.",
        tags: ["Protected"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "User profile returned",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/StandardResponse" },
                    {
                      type: "object",
                      properties: {
                        data: { $ref: "#/components/schemas/User" },
                      },
                    },
                  ],
                },
              },
            },
          },
          "401": { description: "Missing, invalid, or expired access token" },
          "403": { description: "Account is not active" },
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        summary: "Rotate the refresh session and issue a new access token",
        description:
          "Consumes the current refresh-token cookie, rotates to a new refresh session in the same token family, and returns a fresh access token. The previous refresh token is invalidated. If a previously consumed token is replayed, the entire token family is revoked.",
        tags: ["Authentication"],
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            in: "cookie",
            name: "refreshToken",
            required: true,
            schema: { type: "string" },
            description:
              "HTTP-only refresh-token cookie set by login or previous refresh",
          },
        ],
        responses: {
          "200": {
            description: "Token refreshed. A new refresh-token cookie is set.",
            headers: {
              "Set-Cookie": {
                description: "New refreshToken HTTP-only cookie",
                schema: { type: "string" },
              },
            },
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/StandardResponse" },
                    {
                      type: "object",
                      properties: {
                        data: { $ref: "#/components/schemas/AuthData" },
                      },
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description:
              "Invalid, expired, revoked, or replayed refresh token. The cookie is cleared.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
          "403": {
            description: "Account is not active. The token family is revoked.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        summary: "Revoke the current refresh session and clear the cookie",
        description:
          "Revokes the refresh session identified by the refresh-token cookie and clears the cookie. Returns 200 even if no valid session exists.",
        tags: ["Authentication"],
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "Logout successful. Cookie cleared.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
        },
      },
    },
    "/api/auth/check": {
      get: {
        summary: "Validate an access token and return session info",
        tags: ["Protected"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Token is valid",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/StandardResponse" },
                    {
                      type: "object",
                      properties: {
                        data: { $ref: "#/components/schemas/TokenCheckData" },
                      },
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Missing, invalid, or expired token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
          "403": {
            description: "Account is not active",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
        },
      },
    },
    "/": {
      get: {
        summary: "Health check",
        tags: ["System"],
        responses: {
          "200": {
            description: "API is running",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StandardResponse" },
              },
            },
          },
        },
      },
    },
  },
};

export default openApiDocument;
