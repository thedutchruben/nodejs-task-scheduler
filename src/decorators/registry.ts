import { TaskScheduler } from '../index';
import { MetadataStore } from './metadata';
import { JobResult } from '../types';

export class DecoratorRegistry {
  private static instance: DecoratorRegistry;
  private registeredClasses: Map<any, any> = new Map();

  private constructor() {}

  static getInstance(): DecoratorRegistry {
    if (!DecoratorRegistry.instance) {
      DecoratorRegistry.instance = new DecoratorRegistry();
    }
    return DecoratorRegistry.instance;
  }

  /**
   * Register a class instance with the scheduler
   * This will automatically set up workers and schedule cron jobs based on decorators
   */
  async registerClass(scheduler: TaskScheduler, instance: any): Promise<void> {
    const constructor = instance.constructor;
    
    // Check if already registered
    if (this.registeredClasses.has(constructor)) {
      console.warn(`Class ${constructor.name} is already registered`);
      return;
    }

    // Get worker metadata
    const workerMetadata = MetadataStore.getWorkerMetadata(constructor);
    
    // Get all job methods
    const jobMethods = MetadataStore.getAllJobMethods(constructor);
    const cronJobMethods = MetadataStore.getAllCronJobMethods(constructor);

    // Collect all queues needed
    const queues = new Set<string>();
    
    // Add queues from worker metadata
    if (workerMetadata?.queues) {
      workerMetadata.queues.forEach(queue => queues.add(queue));
    }

    // Add queues from job metadata
    jobMethods.forEach(({ metadata }) => {
      if (metadata.queue) {
        queues.add(metadata.queue);
      }
    });

    cronJobMethods.forEach(({ metadata }) => {
      if (metadata.queue) {
        queues.add(metadata.queue);
      }
    });

    // If no queues specified, use class name as default queue
    if (queues.size === 0) {
      queues.add(`${constructor.name.toLowerCase()}-queue`);
    }

    // Create handlers map
    const handlers: { [key: string]: (data: any) => Promise<JobResult> } = {};

    // Add job handlers
    jobMethods.forEach(({ method, metadata }) => {
      handlers[metadata.name] = async (data: any) => {
        try {
          const result = await instance[method](data);
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      };
    });

    // Add cron job handlers
    cronJobMethods.forEach(({ method, metadata }) => {
      handlers[metadata.name] = async (data: any) => {
        try {
          const result = await instance[method](data);
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      };
    });

    // Create worker if we have handlers
    if (Object.keys(handlers).length > 0) {
      const workerName = workerMetadata?.name || `${constructor.name.toLowerCase()}-worker`;
      const concurrency = workerMetadata?.concurrency || 1;

      await scheduler.createWorker({
        name: workerName,
        concurrency,
        queues: Array.from(queues),
        handlers
      });

      console.log(`✅ Registered worker ${workerName} with ${Object.keys(handlers).length} handlers`);
    }

    // Schedule cron jobs
    for (const { method, metadata } of cronJobMethods) {
      const jobId = `${constructor.name}-${method}`;
      
      await scheduler.scheduleCronJob({
        id: jobId,
        name: metadata.name,
        handler: metadata.name,
        schedule: metadata.schedule,
        timezone: metadata.timezone,
        data: {}, // Cron jobs typically don't need initial data
        priority: metadata.priority,
        attempts: metadata.attempts,
        backoff: metadata.backoff
      });

      console.log(`⏰ Scheduled cron job ${jobId}: ${metadata.schedule}`);
    }

    // Mark as registered
    this.registeredClasses.set(constructor, instance);
    
    console.log(`🎯 Successfully registered class ${constructor.name}`);
  }

  /**
   * Execute a job method directly
   */
  async executeJob(
    scheduler: TaskScheduler, 
    className: string, 
    methodName: string, 
    data: any = {}
  ): Promise<string> {
    // Find the registered class
    let targetInstance: any = null;
    let targetMetadata: any = null;

    for (const [constructor, instance] of this.registeredClasses.entries()) {
      if (constructor.name === className) {
        targetInstance = instance;
        
        // Find the method metadata
        const jobMethods = MetadataStore.getAllJobMethods(constructor);
        const method = jobMethods.find(m => m.method === methodName);
        
        if (method) {
          targetMetadata = method.metadata;
          break;
        }
      }
    }

    if (!targetInstance || !targetMetadata) {
      throw new Error(`Job ${className}.${methodName} not found or not registered`);
    }

    // Schedule the job
    return await scheduler.scheduleJob({
      id: `${className}-${methodName}-${Date.now()}`,
      name: targetMetadata.name,
      handler: targetMetadata.name,
      data,
      priority: targetMetadata.priority,
      attempts: targetMetadata.attempts,
      backoff: targetMetadata.backoff
    });
  }

  /**
   * Get all registered classes
   */
  getRegisteredClasses(): Array<{ name: string; instance: any }> {
    return Array.from(this.registeredClasses.entries()).map(([constructor, instance]) => ({
      name: constructor.name,
      instance
    }));
  }

  /**
   * Get job methods for a registered class
   */
  getJobMethods(className: string): Array<{ method: string; metadata: any }> {
    for (const [constructor] of this.registeredClasses.entries()) {
      if (constructor.name === className) {
        return MetadataStore.getAllJobMethods(constructor);
      }
    }
    return [];
  }

  /**
   * Get cron job methods for a registered class
   */
  getCronJobMethods(className: string): Array<{ method: string; metadata: any }> {
    for (const [constructor] of this.registeredClasses.entries()) {
      if (constructor.name === className) {
        return MetadataStore.getAllCronJobMethods(constructor);
      }
    }
    return [];
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void {
    this.registeredClasses.clear();
  }
}