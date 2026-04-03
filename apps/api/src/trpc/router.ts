import { z } from "zod";
import { router, publicProcedure } from "./init";
import { usersRouter } from "./procedures/users";
import { auditRouter } from "./procedures/audit";
import { authRouter } from "./procedures/auth";
import { billingRouter } from "./procedures/billing";
import { projectsRouter } from "./procedures/projects";
import { assetsRouter } from "./procedures/assets";

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" as const };
  }),

  hello: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return { greeting: `Hello, ${input.name}!` };
    }),

  users: usersRouter,
  audit: auditRouter,
  auth: authRouter,
  billing: billingRouter,
  projects: projectsRouter,
  assets: assetsRouter,
});

export type AppRouter = typeof appRouter;
