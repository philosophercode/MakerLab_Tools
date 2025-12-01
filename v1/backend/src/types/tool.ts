export interface Tool {
  id: string;
  toolName: string;
  imageUrl: string;
  toolPurpose: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
}

