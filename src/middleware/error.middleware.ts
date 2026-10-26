import { Request, Response, NextFunction } from "express";
import { sendError } from "../core/app.util";

const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) {
    return next(err);
  }

  const status =
    Number.isInteger(err.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
  if (status >= 500) {
    console.error(
      "Request failed:",
      err instanceof Error ? err.message : "Unknown error",
    );
  }

  if (err instanceof SyntaxError && "body" in err) {
    return sendError(res, 400, "Invalid JSON request body");
  }

  return sendError(
    res,
    status,
    status >= 500 ? "Internal Server Error" : err.message || "Request failed",
    status < 500 && Array.isArray(err.errors) ? err.errors : [],
  );
};

export default errorHandler;
