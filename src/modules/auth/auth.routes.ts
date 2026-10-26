import { DeclarativeRouter } from "../../core/router/router.service";
import { authenticateToken } from "../../middleware/auth.middleware";
import { AuthController } from "./auth.controller";
const router = new DeclarativeRouter();
router
  .register("post", "/register", AuthController.register)
  .register("post", "/login", AuthController.login)
  .register("post", "/refresh", AuthController.refresh)
  .register("post", "/logout", AuthController.logout)
  .register("get", "/me", AuthController.me, [authenticateToken])
  .register("get", "/dashboard", AuthController.me, [authenticateToken])
  .register("get", "/check", AuthController.check, [authenticateToken]);
export default router.expressRouter;
