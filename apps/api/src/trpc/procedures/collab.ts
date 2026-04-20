import { z } from "zod";
import { router, protectedProcedure } from "../init";

// In-memory room store (production would use Durable Objects / DB)
const rooms = new Map<string, { id: string; name: string; users: string[]; createdAt: string }>();

export const collabRouter = router({
  createRoom: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ input, ctx }) => {
      const id = `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const room = {
        id,
        name: input.name,
        users: [ctx.userId],
        createdAt: new Date().toISOString(),
      };
      rooms.set(id, room);
      return room;
    }),

  getRooms: protectedProcedure.query(() => {
    return [...rooms.values()];
  }),

  getRoomUsers: protectedProcedure
    .input(z.object({ roomId: z.string() }))
    .query(({ input }) => {
      const room = rooms.get(input.roomId);
      return room?.users ?? [];
    }),
});
