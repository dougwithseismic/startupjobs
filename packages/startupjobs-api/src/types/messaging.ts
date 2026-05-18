import { z } from "zod";
import { LocalizedStringSchema } from "./common.js";

export const NotificationDataSchema = z.object({
  offer: z.object({ cs: z.string() }).optional(),
  company: z.string().optional(),
  companySlug: z.string().optional(),
  offerId: z.number().optional(),
  offerSlug: z.string().optional(),
});

export const NotificationSchema = z.object({
  type: z.string(),
  viewed: z.boolean(),
  data: NotificationDataSchema,
  date: z.string(),
});

export type Notification = z.infer<typeof NotificationSchema>;

export const ConversationSchema = z.object({
  conversationId: z.number(),
  lastReplyTime: z.string(),
  lastMessage: z.string(),
  company: z.string(),
  lastMessageAuthor: z.number(),
  unread: z.number(),
  img: z.string(),
});

export type Conversation = z.infer<typeof ConversationSchema>;
