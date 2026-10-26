import { NextFunction, Request, Response, Router } from "express";
import { sendSuccess } from "../app.util";
import { validateControllerInput } from "../validator/validator.service";

export interface ControllerInput {
  body: any;
  params: Request["params"];
  query: Request["query"];
  user?: { userId: string; email: string; sessionId: string };
  cookies: Record<string, any>;
  setCookie: (name: string, value: string, options: any) => void;
  clearCookie: (name: string, options: any) => void;
}
export interface ControllerResult<T = unknown> {
  status?: number;
  message?: string;
  data: T;
}
type Controller = (
  input: ControllerInput,
) => Promise<ControllerResult | unknown>;
export class DeclarativeRouter {
  readonly expressRouter: Router = Router();
  register(
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    handler: Controller,
    middleware: Array<
      (req: Request, res: Response, next: NextFunction) => unknown
    > = [],
  ): this {
    this.expressRouter[method](
      path,
      ...middleware,
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!(await validateControllerInput(handler, req, res, next))) return;
          const input: ControllerInput = {
            body: req.body,
            params: req.params,
            query: req.query,
            user: (req as any).user,
            cookies: (req as any).cookies ?? {},
            setCookie: (name, value, options) => {
              res.cookie(name, value, options);
            },
            clearCookie: (name, options) => {
              res.clearCookie(name, options);
            },
          };
          const result = await handler(input);
          const shaped =
            result && typeof result === "object" && "data" in result
              ? (result as ControllerResult)
              : { data: result };
          return sendSuccess(
            res,
            shaped.status ??
              (method === "post" && path === "/register" ? 201 : 200),
            shaped.message ?? "OK",
            shaped.data,
          );
        } catch (error) {
          next(error);
        }
      },
    );
    return this;
  }
}
export const RouterService = DeclarativeRouter;
