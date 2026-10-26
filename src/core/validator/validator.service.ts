import "reflect-metadata";
import { ClassConstructor, plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { NextFunction, Request, Response } from "express";
import { sendError } from "../app.util";

const DTO_METADATA = Symbol("validator:dto");
export function Validator(dto: ClassConstructor<object>): MethodDecorator {
  return (_target, _propertyKey, descriptor) => {
    if (!descriptor || typeof descriptor.value !== "function")
      throw new Error("@Validator() can only decorate methods");
    (Reflect as any).defineMetadata(DTO_METADATA, dto, descriptor.value);
  };
}
export async function validateControllerInput(
  handler: Function,
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<boolean> {
  const dto = (Reflect as any).getMetadata(DTO_METADATA, handler) as
    ClassConstructor<object> | undefined;
  if (!dto) return true;
  const input = req.body && typeof req.body === "object" ? req.body : {};
  const instance = plainToInstance(dto, input);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    const details = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}).map((message) => ({
        field: error.property,
        message,
      })),
    );
    sendError(res, 400, "Validation failed", details);
    return false;
  }
  req.body = instance;
  return true;
}
