import 'reflect-metadata';
import { v4 as uuidv4 } from 'uuid';
import { RabbitMQConnection } from './utils/rabbitmq';
import { LoadBalancer, NodeInfo } from './utils/load-balancer';
import { JobScheduler } from './scheduler';
import { JobWorker } from './worker';
import { QueueManager } from './queue';
import { DecoratorRegistry } from './decorators/registry';
import { 
  ConnectionConfig, 
  WorkerConfig, 
  JobConfig, 
  CronJobConfig,
  QueueConfig 
} from './types';

export class TaskScheduler {
  private connection: RabbitMQConnection;
  private scheduler: JobScheduler;
  private workers: Map<string, JobWorker> = new Map();
  private queueManager: QueueManager;
  private loadBalancer: LoadBalancer;
  private decoratorRegistry: DecoratorRegistry;
  private nodeId: string;
  private queuePrefix: string;
  private isInitialized = false;

  constructor(connectionConfig: ConnectionConfig) {
    this.nodeId = uuidv4();
    this.queuePrefix = connectionConfig.queuePrefix || '';
    this.connection = new RabbitMQConnection(connectionConfig);
    this.scheduler = new JobScheduler(this.connection, this.queuePrefix);
    this.queueManager = new QueueManager(this.connection, this.queuePrefix);
    this.loadBalancer = new LoadBalancer(this.connection, this.nodeId);
    this.decoratorRegistry = DecoratorRegistry.getInstance();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('TaskScheduler is already initialized');
    }

    await this.connection.connect();
    await this.queueManager.setupDeadLetterQueue();
    await this.queueManager.setupDelayedJobQueue();
    await this.loadBalancer.start();
    
    this.isInitialized = true;
    console.log(`TaskScheduler initialized with node ID: ${this.nodeId}`);
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down TaskScheduler...');
    
    for (const [name, worker] of this.workers) {
      await worker.stop();
      console.log(`Worker ${name} stopped`);
    }
    
    await this.loadBalancer.stop();
    await this.connection.disconnect();
    
    this.isInitialized = false;
    console.log('TaskScheduler shut down successfully');
  }

  async createWorker(config: WorkerConfig): Promise<void> {
    this.ensureInitialized();
    
    if (this.workers.has(config.name)) {
      throw new Error(`Worker with name ${config.name} already exists`);
    }

    for (const queueName of config.queues) {
      await this.queueManager.createQueue({ name: queueName });
    }

    const worker = new JobWorker(this.connection, config, this.queuePrefix);
    this.workers.set(config.name, worker);
    
    const nodeInfo: Omit<NodeInfo, 'lastHeartbeat'> = {
      id: this.nodeId,
      name: config.name,
      activeJobs: 0,
      maxConcurrency: config.concurrency,
      queues: config.queues,
      status: 'active'
    };
    
    await this.loadBalancer.registerNode(nodeInfo);
    await worker.start();
    
    console.log(`Worker ${config.name} created and started`);
  }

  async startWorker(workerName: string): Promise<void> {
    this.ensureInitialized();
    
    const worker = this.workers.get(workerName);
    if (!worker) {
      throw new Error(`Worker ${workerName} not found`);
    }
    
    await worker.start();
    console.log(`Worker ${workerName} started`);
  }

  async stopWorker(workerName: string): Promise<void> {
    this.ensureInitialized();
    
    const worker = this.workers.get(workerName);
    if (!worker) {
      throw new Error(`Worker ${workerName} not found`);
    }
    
    await worker.stop();
    console.log(`Worker ${workerName} stopped`);
  }

  async scheduleJob(config: JobConfig): Promise<string> {
    this.ensureInitialized();
    return await this.scheduler.executeJob(config);
  }

  async scheduleCronJob(config: CronJobConfig): Promise<string> {
    this.ensureInitialized();
    return await this.scheduler.scheduleCronJob(config);
  }

  async cancelCronJob(jobId: string): Promise<boolean> {
    this.ensureInitialized();
    return await this.scheduler.cancelCronJob(jobId);
  }

  async createQueue(config: QueueConfig): Promise<void> {
    this.ensureInitialized();
    await this.queueManager.createQueue(config);
  }

  async getQueueInfo(queueName: string): Promise<any> {
    this.ensureInitialized();
    return await this.queueManager.getQueueInfo(queueName);
  }

  async purgeQueue(queueName: string): Promise<void> {
    this.ensureInitialized();
    await this.queueManager.purgeQueue(queueName);
  }

  getNodeInfo(): { nodeId: string; workers: string[]; activeNodes: NodeInfo[] } {
    this.ensureInitialized();
    
    return {
      nodeId: this.nodeId,
      workers: Array.from(this.workers.keys()),
      activeNodes: this.loadBalancer.getActiveNodes()
    };
  }

  getWorkerStatus(workerName: string): { isRunning: boolean; activeJobs: number } | null {
    const worker = this.workers.get(workerName);
    if (!worker) {
      return null;
    }
    
    return {
      isRunning: worker.isWorkerRunning(),
      activeJobs: worker.getActiveJobCount()
    };
  }

  getCronJobs(): string[] {
    this.ensureInitialized();
    return this.scheduler.getCronJobs();
  }

  // Decorator-based methods

  /**
   * Register a class instance with decorators
   * This will automatically create workers and schedule cron jobs based on decorators
   */
  async register(instance: any): Promise<void> {
    this.ensureInitialized();
    await this.decoratorRegistry.registerClass(this, instance);
  }

  /**
   * Execute a job method from a registered class
   */
  async executeJobMethod(className: string, methodName: string, data: any = {}): Promise<string> {
    this.ensureInitialized();
    return await this.decoratorRegistry.executeJob(this, className, methodName, data);
  }

  /**
   * Get information about registered classes
   */
  getRegisteredClasses(): Array<{ name: string; instance: any }> {
    return this.decoratorRegistry.getRegisteredClasses();
  }

  /**
   * Get job methods for a registered class
   */
  getJobMethods(className: string): Array<{ method: string; metadata: any }> {
    return this.decoratorRegistry.getJobMethods(className);
  }

  /**
   * Get cron job methods for a registered class
   */
  getCronJobMethods(className: string): Array<{ method: string; metadata: any }> {
    return this.decoratorRegistry.getCronJobMethods(className);
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('TaskScheduler must be initialized before use');
    }
  }
}

export * from './types';
export { RabbitMQConnection } from './utils/rabbitmq';
export { JobScheduler } from './scheduler';
export { JobWorker } from './worker';
export { QueueManager } from './queue';
export { LoadBalancer } from './utils/load-balancer';
export * from './decorators';