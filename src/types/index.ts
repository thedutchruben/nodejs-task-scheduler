export interface JobConfig {
  id: string;
  name: string;
  handler: string;
  data?: any;
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: BackoffConfig;
}

export interface CronJobConfig extends JobConfig {
  schedule: string;
  timezone?: string;
}

export interface BackoffConfig {
  type: 'fixed' | 'exponential';
  delay: number;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface WorkerConfig {
  name: string;
  concurrency: number;
  queues: string[];
  handlers: { [key: string]: JobHandler };
}

export interface JobHandler {
  (data: any): Promise<JobResult>;
}

export interface QueueConfig {
  name: string;
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  arguments?: any;
}

export interface ConnectionConfig {
  url: string;
  options?: any;
  queuePrefix?: string;
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRY = 'retry'
}

export interface JobMessage {
  id: string;
  config: JobConfig;
  status: JobStatus;
  attempts: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  error?: string;
}