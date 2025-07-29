import { ConsumeMessage } from 'amqplib';
import { WorkerConfig, JobMessage, JobStatus, JobResult } from '../types';
import { RabbitMQConnection } from '../utils/rabbitmq';

export class JobWorker {
  private connection: RabbitMQConnection;
  private config: WorkerConfig;
  private isRunning = false;
  private activeJobs = new Set<string>();

  constructor(connection: RabbitMQConnection, config: WorkerConfig) {
    this.connection = connection;
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Worker is already running');
    }

    const channel = this.connection.getChannel();
    
    for (const queueName of this.config.queues) {
      await channel.assertQueue(queueName, { durable: true });
      await channel.prefetch(this.config.concurrency);
      
      await channel.consume(queueName, async (msg) => {
        if (msg) {
          await this.processMessage(msg, queueName);
        }
      });
    }

    this.isRunning = true;
    console.log(`Worker ${this.config.name} started with concurrency ${this.config.concurrency}`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    
    while (this.activeJobs.size > 0) {
      console.log(`Waiting for ${this.activeJobs.size} active jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`Worker ${this.config.name} stopped`);
  }

  private async processMessage(msg: ConsumeMessage, queueName: string): Promise<void> {
    const channel = this.connection.getChannel();
    
    try {
      const jobMessage: JobMessage = JSON.parse(msg.content.toString());
      
      if (this.shouldSkipJob(jobMessage)) {
        channel.ack(msg);
        return;
      }

      this.activeJobs.add(jobMessage.id);
      
      jobMessage.status = JobStatus.PROCESSING;
      jobMessage.processedAt = new Date();
      jobMessage.attempts++;

      console.log(`Processing job ${jobMessage.id} (attempt ${jobMessage.attempts})`);

      const handler = this.config.handlers[jobMessage.config.handler];
      if (!handler) {
        throw new Error(`No handler found for job type: ${jobMessage.config.handler}`);
      }

      const result = await handler(jobMessage.config.data);
      
      if (result.success) {
        jobMessage.status = JobStatus.COMPLETED;
        jobMessage.completedAt = new Date();
        console.log(`Job ${jobMessage.id} completed successfully`);
        channel.ack(msg);
      } else {
        throw new Error(result.error || 'Job failed without error message');
      }
      
    } catch (error) {
      await this.handleJobError(msg, error as Error, queueName);
    } finally {
      const jobMessage: JobMessage = JSON.parse(msg.content.toString());
      this.activeJobs.delete(jobMessage.id);
    }
  }

  private async handleJobError(msg: ConsumeMessage, error: Error, queueName: string): Promise<void> {
    const channel = this.connection.getChannel();
    const jobMessage: JobMessage = JSON.parse(msg.content.toString());
    
    jobMessage.error = error.message;
    const maxAttempts = jobMessage.config.attempts || 3;
    
    if (jobMessage.attempts >= maxAttempts) {
      jobMessage.status = JobStatus.FAILED;
      console.error(`Job ${jobMessage.id} failed permanently after ${jobMessage.attempts} attempts:`, error.message);
      
      await this.sendToDeadLetterQueue(jobMessage);
      channel.ack(msg);
    } else {
      jobMessage.status = JobStatus.RETRY;
      console.log(`Job ${jobMessage.id} will be retried (attempt ${jobMessage.attempts + 1}/${maxAttempts})`);
      
      const delay = this.calculateBackoffDelay(jobMessage);
      await this.scheduleRetry(jobMessage, delay);
      channel.ack(msg);
    }
  }

  private shouldSkipJob(jobMessage: JobMessage): boolean {
    if (this.config.concurrency === 1 && this.activeJobs.size > 0) {
      return true;
    }
    
    if (this.activeJobs.size >= this.config.concurrency) {
      return true;
    }
    
    return false;
  }

  private calculateBackoffDelay(jobMessage: JobMessage): number {
    const backoff = jobMessage.config.backoff;
    if (!backoff) {
      return 5000;
    }

    if (backoff.type === 'exponential') {
      return backoff.delay * Math.pow(2, jobMessage.attempts - 1);
    }
    
    return backoff.delay;
  }

  private async scheduleRetry(jobMessage: JobMessage, delay: number): Promise<void> {
    setTimeout(async () => {
      const channel = this.connection.getChannel();
      const queueName = `job_queue_${jobMessage.config.handler}`;
      
      const message = Buffer.from(JSON.stringify(jobMessage));
      await channel.sendToQueue(queueName, message, {
        persistent: true,
        priority: jobMessage.config.priority || 0
      });
    }, delay);
  }

  private async sendToDeadLetterQueue(jobMessage: JobMessage): Promise<void> {
    const channel = this.connection.getChannel();
    const deadLetterQueue = 'dead_letter_queue';
    
    await channel.assertQueue(deadLetterQueue, { durable: true });
    
    const message = Buffer.from(JSON.stringify(jobMessage));
    await channel.sendToQueue(deadLetterQueue, message, { persistent: true });
    
    console.log(`Job ${jobMessage.id} sent to dead letter queue`);
  }

  getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  isWorkerRunning(): boolean {
    return this.isRunning;
  }
}