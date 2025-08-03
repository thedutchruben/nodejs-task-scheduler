import * as cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { CronJobConfig, JobConfig, JobMessage, JobStatus } from '../types';
import { RabbitMQConnection } from '../utils/rabbitmq';
import { MasterElection, LeadershipState } from '../utils/master-election';

export class JobScheduler {
  private connection: RabbitMQConnection;
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private queuePrefix: string;
  private masterElection: MasterElection;
  private pendingCronJobs: Map<string, CronJobConfig> = new Map();

  constructor(connection: RabbitMQConnection, queuePrefix: string = '') {
    this.connection = connection;
    this.queuePrefix = queuePrefix;
    this.masterElection = new MasterElection({
      connection: this.connection,
      queuePrefix: this.queuePrefix
    });

    this.setupMasterElectionHandlers();
  }

  async scheduleCronJob(config: CronJobConfig): Promise<string> {
    const jobId = config.id || uuidv4();
    const cronConfig = { ...config, id: jobId };
    
    if (this.cronJobs.has(jobId) || this.pendingCronJobs.has(jobId)) {
      throw new Error(`Cron job with ID ${jobId} already exists`);
    }

    // Store the cron job configuration
    this.pendingCronJobs.set(jobId, cronConfig);

    // Only schedule if this node is the master
    if (this.masterElection.isLeader()) {
      await this.activateCronJob(jobId, cronConfig);
    } else {
      console.log(`Cron job ${jobId} queued, waiting for master election`);
    }
    
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

  async startMasterElection(): Promise<void> {
    await this.masterElection.start();
  }

  async stopMasterElection(): Promise<void> {
    await this.masterElection.stop();
  }

  isLeader(): boolean {
    return this.masterElection.isLeader();
  }

  getNodeId(): string {
    return this.masterElection.getNodeId();
  }

  private setupMasterElectionHandlers(): void {
    this.masterElection.on('elected', async () => {
      console.log(`Node ${this.masterElection.getNodeId()} elected as master - activating cron jobs`);
      await this.activateAllPendingCronJobs();
    });

    this.masterElection.on('demoted', () => {
      console.log(`Node ${this.masterElection.getNodeId()} lost leadership - deactivating cron jobs`);
      this.deactivateAllCronJobs();
    });
  }

  private async activateCronJob(jobId: string, config: CronJobConfig): Promise<void> {
    if (this.cronJobs.has(jobId)) {
      return; // Already active
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
    
    console.log(`Activated cron job ${jobId} with schedule: ${config.schedule} on master node ${this.masterElection.getNodeId()}`);
  }

  private async activateAllPendingCronJobs(): Promise<void> {
    for (const [jobId, config] of this.pendingCronJobs.entries()) {
      await this.activateCronJob(jobId, config);
    }
  }

  private deactivateAllCronJobs(): void {
    for (const [jobId, task] of this.cronJobs.entries()) {
      task.stop();
      console.log(`Deactivated cron job ${jobId} - no longer master`);
    }
    this.cronJobs.clear();
  }

  private getQueueForJob(config: JobConfig): string {
    return this.queuePrefix ? `${this.queuePrefix}${config.queue}` : config.queue;
  }
}