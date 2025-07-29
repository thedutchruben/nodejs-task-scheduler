import 'reflect-metadata';
import { 
  MetadataStore, 
  JobMetadata, 
  CronJobMetadata, 
  QueueMetadata, 
  WorkerMetadata 
} from './metadata';

export interface JobOptions {
  name?: string;
  queue?: string;
  priority?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

export interface CronJobOptions {
  schedule: string;
  name?: string;
  timezone?: string;
  queue?: string;
  priority?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

export interface QueueOptions {
  name: string;
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  arguments?: any;
}

export interface WorkerOptions {
  name?: string;
  concurrency?: number;
  queues?: string[];
}

/**
 * Decorator to mark a method as a job handler
 * @param options Job configuration options
 */
export function Job(options: JobOptions = {}): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    if (typeof propertyKey !== 'string') {
      throw new Error('Job decorator can only be applied to string property keys');
    }

    const metadata: JobMetadata = {
      name: options.name || propertyKey,
      queue: options.queue,
      priority: options.priority,
      attempts: options.attempts,
      backoff: options.backoff
    };

    MetadataStore.setJobMetadata(target, propertyKey, metadata);
    
    // Ensure the original method is preserved
    if (descriptor && descriptor.value) {
      const originalMethod = descriptor.value;
      descriptor.value = async function (...args: any[]) {
        return await originalMethod.apply(this, args);
      };
    }
  };
}

/**
 * Decorator to mark a method as a cron job handler
 * @param options Cron job configuration options
 */
export function CronJob(options: CronJobOptions): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    if (typeof propertyKey !== 'string') {
      throw new Error('CronJob decorator can only be applied to string property keys');
    }

    const metadata: CronJobMetadata = {
      name: options.name || propertyKey,
      schedule: options.schedule,
      timezone: options.timezone,
      queue: options.queue,
      priority: options.priority,
      attempts: options.attempts,
      backoff: options.backoff
    };

    MetadataStore.setCronJobMetadata(target, propertyKey, metadata);
    
    // Ensure the original method is preserved
    if (descriptor && descriptor.value) {
      const originalMethod = descriptor.value;
      descriptor.value = async function (...args: any[]) {
        return await originalMethod.apply(this, args);
      };
    }
  };
}

/**
 * Decorator to define queue configuration for a class
 * @param options Queue configuration options
 */
export function Queue(options: QueueOptions): ClassDecorator {
  return function (target: any) {
    const metadata: QueueMetadata = {
      name: options.name,
      durable: options.durable,
      exclusive: options.exclusive,
      autoDelete: options.autoDelete,
      arguments: options.arguments
    };

    MetadataStore.setQueueMetadata(target, metadata);
  };
}

/**
 * Decorator to define worker configuration for a class
 * @param options Worker configuration options
 */
export function Worker(options: WorkerOptions = {}): ClassDecorator {
  return function (target: any) {
    const metadata: WorkerMetadata = {
      name: options.name || target.name,
      concurrency: options.concurrency || 1,
      queues: options.queues || []
    };

    MetadataStore.setWorkerMetadata(target, metadata);
  };
}

/**
 * Decorator to mark a method as a singleton job (concurrency: 1)
 * @param options Job configuration options
 */
export function SingletonJob(options: JobOptions = {}): MethodDecorator {
  return Job({
    ...options,
    queue: options.queue || 'singleton-queue'
  });
}

/**
 * Decorator to mark a method as a high priority job
 * @param options Job configuration options
 */
export function HighPriorityJob(options: JobOptions = {}): MethodDecorator {
  return Job({
    ...options,
    priority: options.priority || 9
  });
}

/**
 * Decorator to mark a method as a low priority job
 * @param options Job configuration options
 */
export function LowPriorityJob(options: JobOptions = {}): MethodDecorator {
  return Job({
    ...options,
    priority: options.priority || 1
  });
}

/**
 * Decorator to add retry configuration to a job
 * @param attempts Number of retry attempts
 * @param backoffType Type of backoff strategy
 * @param delay Initial delay in milliseconds
 */
export function Retry(
  attempts: number = 3, 
  backoffType: 'fixed' | 'exponential' = 'exponential', 
  delay: number = 1000
): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    if (typeof propertyKey !== 'string') {
      throw new Error('Retry decorator can only be applied to string property keys');
    }

    const existingMetadata = MetadataStore.getJobMetadata(target, propertyKey) || 
                            MetadataStore.getCronJobMetadata(target, propertyKey);
    
    if (existingMetadata) {
      existingMetadata.attempts = attempts;
      existingMetadata.backoff = { type: backoffType, delay };
      
      if ('schedule' in existingMetadata) {
        MetadataStore.setCronJobMetadata(target, propertyKey, existingMetadata as CronJobMetadata);
      } else {
        MetadataStore.setJobMetadata(target, propertyKey, existingMetadata as JobMetadata);
      }
    }
  };
}

// Re-export metadata utilities
export { MetadataStore } from './metadata';
export * from './metadata';