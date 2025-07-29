import * as cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { CronJobConfig, JobConfig, JobMessage, JobStatus } from '../types';
import { RabbitMQConnection } from '../utils/rabbitmq';

export class JobScheduler {
  private connection: RabbitMQConnection;
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();

  constructor(connection: RabbitMQConnection) {
    this.connection = connection;
  }

  async scheduleCronJob(config: CronJobConfig): Promise<string> {
    const jobId = config.id || uuidv4();
    
    if (this.cronJobs.has(jobId)) {
      throw new Error(`Cron job with ID ${jobId} already exists`);
    }

    const task = cron.schedule(
      config.schedule,
      async () => {
        await this.executeJob({
          ...config,
          id: uuidv4()
        });
      },
      {
        scheduled: false,
        timezone: config.timezone
      }
    );

    this.cronJobs.set(jobId, task);
    task.start();
    
    console.log(`Scheduled cron job ${jobId} with schedule: ${config.schedule}`);
    return jobId;
  }

  async executeJob(config: JobConfig): Promise<string> {
    const jobId = config.id || uuidv4();
    
    const jobMessage: JobMessage = {
      id: jobId,
      config,
      status: JobStatus.PENDING,
      attempts: 0,
      createdAt: new Date()
    };

    const channel = this.connection.getChannel();
    const queueName = this.getQueueForJob(config);
    
    await channel.assertQueue(queueName, { durable: true });
    
    const message = Buffer.from(JSON.stringify(jobMessage));
    
    await channel.sendToQueue(queueName, message, {
      persistent: true,
      priority: config.priority || 0
    });

    console.log(`Job ${jobId} added to queue ${queueName}`);
    return jobId;
  }

  async cancelCronJob(jobId: string): Promise<boolean> {
    const task = this.cronJobs.get(jobId);
    if (!task) {
      return false;
    }

    task.stop();
    this.cronJobs.delete(jobId);
    console.log(`Cancelled cron job ${jobId}`);
    return true;
  }

  getCronJobs(): string[] {
    return Array.from(this.cronJobs.keys());
  }

  private getQueueForJob(config: JobConfig): string {
    return `job_queue_${config.handler}`;
  }
}