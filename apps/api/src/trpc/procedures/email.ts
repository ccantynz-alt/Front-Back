import { z } from "zod";
import { router, protectedProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import { sendEmail } from "../../email/client";
import { collaborationInviteEmail } from "../../email/templates";

export const emailRouter = router({
  sendInvite: protectedProcedure
    .input(
      z.object({
        to: z.string().email(),
        inviterName: z.string().min(1),
        roomName: z.string().min(1),
        joinLink: z.string().url(),
      }),
    )
    .mutation(async ({ input }) => {
      const html = collaborationInviteEmail(
        input.inviterName,
        input.roomName,
        input.joinLink,
      );

      const result = await sendEmail(
        input.to,
        `${input.inviterName} invited you to collaborate on "${input.roomName}"`,
        html,
      );

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Failed to send invite email",
        });
      }

      return { success: true, emailId: result.id };
    }),

  sendTestEmail: protectedProcedure
    .input(
      z.object({
        to: z.string().email(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Admin-only: in a real app, check ctx.userId against an admin list
      const html = `<h1>Test Email</h1><p>This is a test email from Crontech. Sent by user ${ctx.userId}.</p>`;

      const result = await sendEmail(input.to, "Test Email - Crontech", html);

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Failed to send test email",
        });
      }

      return { success: true, emailId: result.id };
    }),
});
