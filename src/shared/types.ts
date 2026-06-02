export type TaskStatus = "pending" | "picked" | "running" | "done" | "failed";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type FeishuFileType = "text" | "image" | "file" | "audio" | "media" | "sticker" | "post" | "interactive";

export interface Attachment {
  fileKey: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  feishuFileType: FeishuFileType;
}

export interface Device {
  id: string;
  name: string;
  token: string;
  capabilities?: string;
  lastSeen?: string;
  createdAt: string;
}

export interface Task {
  id: string;
  source: "feishu";
  feishuMessageId: string;
  feishuChatId: string;
  feishuUserId: string;
  commandText: string;
  status: TaskStatus;
  priority: TaskPriority;
  attachments?: Attachment[];
  assignedDeviceId?: string;
  createdAt: string;
  updatedAt: string;
  resultSummary?: string;
  resultDetails?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
