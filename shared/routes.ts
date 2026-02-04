import { z } from "zod";

export const api = {
  chat: {
    send: {
      method: 'POST' as const,
      path: '/api/chat',
      input: z.object({
        message: z.string(),
      }),
      responses: {
        200: z.object({
          response: z.string(),
        }),
        500: z.object({
          message: z.string(),
        }),
      },
    },
  },
};
