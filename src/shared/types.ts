export type TaskStatus = "pending" | "picked" | "running" | "done" | "failed";

export interface Task {
  id: string;
  source: "feishu";
  feishuMessageId: string;
  feishuChatId: string;
  feishuUserId: string;
  commandText: string;
  status: TaskStatus;
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
