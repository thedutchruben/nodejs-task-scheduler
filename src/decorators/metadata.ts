import 'reflect-metadata';

export const JOB_METADATA_KEY = Symbol('job');
export const CRON_JOB_METADATA_KEY = Symbol('cronJob');
export const QUEUE_METADATA_KEY = Symbol('queue');
export const WORKER_METADATA_KEY = Symbol('worker');

export interface JobMetadata {
  name: string;
  queue?: string;
  priority?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

export interface CronJobMetadata {
  name: string;
  schedule: string;
  timezone?: string;
  queue?: string;
  priority?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

export interface QueueMetadata {
  name: string;
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  arguments?: any;
}

export interface WorkerMetadata {
  name: string;
  concurrency?: number;
  queues?: string[];
}

export class MetadataStore {
  static getJobMetadata(target: any, propertyKey: string): JobMetadata | undefined {
    return Reflect.getMetadata(JOB_METADATA_KEY, target, propertyKey);
  }

  static setJobMetadata(target: any, propertyKey: string, metadata: JobMetadata): void {
    Reflect.defineMetadata(JOB_METADATA_KEY, metadata, target, propertyKey);
  }

  static getCronJobMetadata(target: any, propertyKey: string): CronJobMetadata | undefined {
    return Reflect.getMetadata(CRON_JOB_METADATA_KEY, target, propertyKey);
  }

  static setCronJobMetadata(target: any, propertyKey: string, metadata: CronJobMetadata): void {
    Reflect.defineMetadata(CRON_JOB_METADATA_KEY, metadata, target, propertyKey);
  }

  static getQueueMetadata(target: any): QueueMetadata | undefined {
    return Reflect.getMetadata(QUEUE_METADATA_KEY, target);
  }

  static setQueueMetadata(target: any, metadata: QueueMetadata): void {
    Reflect.defineMetadata(QUEUE_METADATA_KEY, metadata, target);
  }

  static getWorkerMetadata(target: any): WorkerMetadata | undefined {
    return Reflect.getMetadata(WORKER_METADATA_KEY, target);
  }

  static setWorkerMetadata(target: any, metadata: WorkerMetadata): void {
    Reflect.defineMetadata(WORKER_METADATA_KEY, metadata, target);
  }

  static getAllJobMethods(target: any): Array<{ method: string; metadata: JobMetadata }> {
    const prototype = target.prototype || target;
    const methods: Array<{ method: string; metadata: JobMetadata }> = [];
    
    const propertyNames = Object.getOwnPropertyNames(prototype);
    
    for (const propertyName of propertyNames) {
      if (propertyName === 'constructor') continue;
      
      const jobMetadata = this.getJobMetadata(prototype, propertyName);
      if (jobMetadata) {
        methods.push({ method: propertyName, metadata: jobMetadata });
      }
    }
    
    return methods;
  }

  static getAllCronJobMethods(target: any): Array<{ method: string; metadata: CronJobMetadata }> {
    const prototype = target.prototype || target;
    const methods: Array<{ method: string; metadata: CronJobMetadata }> = [];
    
    const propertyNames = Object.getOwnPropertyNames(prototype);
    
    for (const propertyName of propertyNames) {
      if (propertyName === 'constructor') continue;
      
      const cronJobMetadata = this.getCronJobMetadata(prototype, propertyName);
      if (cronJobMetadata) {
        methods.push({ method: propertyName, metadata: cronJobMetadata });
      }
    }
    
    return methods;
  }

  static getAllQueues(target: any): QueueMetadata[] {
    const queueMetadata = this.getQueueMetadata(target);
    return queueMetadata ? [queueMetadata] : [];
  }
}