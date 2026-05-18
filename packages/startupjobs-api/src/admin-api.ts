import { HttpClient } from "./http.js";
import type {
  Conversation,
  FileUploadResponse,
  Notification,
} from "./types/index.js";

export class AdminApi {
  constructor(private http: HttpClient) {}

  async getNotifications(page: number = 1): Promise<Notification[]> {
    return this.http.get("/admin-api/notifications", {
      params: { page },
    });
  }

  async getConversationMessages(page: number = 1): Promise<Conversation[]> {
    return this.http.get("/admin-api/conversations/messages", {
      params: { page },
    });
  }

  async getEmptyConversations(page: number = 1): Promise<Conversation[]> {
    return this.http.get("/admin-api/conversations/empty", {
      params: { page },
    });
  }

  async uploadFile(
    file: Blob,
    filename: string,
  ): Promise<FileUploadResponse> {
    return this.http.uploadFile(
      "/admin-api/file",
      file,
      filename,
    ) as Promise<FileUploadResponse>;
  }
}
