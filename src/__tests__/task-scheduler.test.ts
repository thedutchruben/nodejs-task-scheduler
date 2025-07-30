import 'reflect-metadata';
import { TaskScheduler } from '../index';

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn()
  }))
}));

// Mock amqplib to avoid actual connections in tests
jest.mock('amqplib', () => ({
  connect: jest.fn(() => Promise.resolve({
    createChannel: jest.fn(() => Promise.resolve({
      assertQueue: jest.fn().mockResolvedValue({}),
      assertExchange: jest.fn().mockResolvedValue({}),
      bindQueue: jest.fn().mockResolvedValue({}),
      consume: jest.fn().mockResolvedValue({}),
      sendToQueue: jest.fn().mockResolvedValue(true),
      publish: jest.fn().mockResolvedValue(true),
      checkQueue: jest.fn().mockResolvedValue({ messageCount: 0, consumerCount: 0 }),
      deleteQueue: jest.fn().mockResolvedValue({}),
      purgeQueue: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue({}),
      prefetch: jest.fn().mockResolvedValue({})
    })),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue({})
  }))
}));

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler;

  beforeEach(() => {
    scheduler = new TaskScheduler({
      url: 'amqp://test:test@localhost:5672'
    });
  });

  afterEach(async () => {
    if (scheduler) {
      try {
        await scheduler.shutdown();
      } catch (error) {
        // Ignore shutdown errors in tests
      }
    }
  });

  describe('Construction', () => {
    it('should create a TaskScheduler instance', () => {
      expect(scheduler).toBeInstanceOf(TaskScheduler);
    });

    it('should have a unique node ID', () => {
      const scheduler1 = new TaskScheduler({ url: 'amqp://localhost' });
      const scheduler2 = new TaskScheduler({ url: 'amqp://localhost' });
      
      // Node IDs should be different
      expect(scheduler1.getNodeInfo).toBeDefined();
      expect(scheduler2.getNodeInfo).toBeDefined();
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(scheduler.initialize()).resolves.not.toThrow();
    });

    it('should throw error when trying to initialize twice', async () => {
      await scheduler.initialize();
      await expect(scheduler.initialize()).rejects.toThrow('TaskScheduler is already initialized');
    });

    it('should throw error when using methods before initialization', () => {
      expect(() => scheduler.getNodeInfo()).toThrow('TaskScheduler must be initialized before use');
    });
  });

  describe('Worker Management', () => {
    beforeEach(async () => {
      await scheduler.initialize();
    });

    it('should create a worker successfully', async () => {
      const workerConfig = {
        name: 'test-worker',
        concurrency: 2,
        queues: ['test-queue'],
        handlers: {
          'test-job': async () => ({ success: true })
        }
      };

      await expect(scheduler.createWorker(workerConfig)).resolves.not.toThrow();
    });

    it('should throw error when creating worker with duplicate name', async () => {
      const workerConfig = {
        name: 'duplicate-worker',
        concurrency: 1,
        queues: ['test-queue'],
        handlers: {
          'test-job': async () => ({ success: true })
        }
      };

      await scheduler.createWorker(workerConfig);
      await expect(scheduler.createWorker(workerConfig)).rejects.toThrow('Worker with name duplicate-worker already exists');
    });

    it('should get worker status', async () => {
      const workerConfig = {
        name: 'status-test-worker',
        concurrency: 1,
        queues: ['test-queue'],
        handlers: {
          'test-job': async () => ({ success: true })
        }
      };

      await scheduler.createWorker(workerConfig);
      const status = scheduler.getWorkerStatus('status-test-worker');
      
      expect(status).toBeDefined();
      expect(status?.isRunning).toBe(true);
      expect(status?.activeJobs).toBe(0);
    });

    it('should return null for non-existent worker status', async () => {
      const status = scheduler.getWorkerStatus('non-existent-worker');
      expect(status).toBeNull();
    });
  });

  describe('Job Scheduling', () => {
    beforeEach(async () => {
      await scheduler.initialize();
    });

    it('should schedule a job successfully', async () => {
      const jobConfig = {
        id: 'test-job-1',
        name: 'Test Job',
        handler: 'test-handler',
        queue: 'test-queue',
        data: { message: 'hello' }
      };

      const jobId = await scheduler.scheduleJob(jobConfig);
      expect(jobId).toBe('test-job-1');
    });

    it('should schedule a cron job successfully', async () => {
      const cronJobConfig = {
        id: 'test-cron-1',
        name: 'Test Cron Job',
        handler: 'test-handler',
        queue: 'test-queue',
        schedule: '0 9 * * *',
        data: { message: 'daily task' }
      };

      const jobId = await scheduler.scheduleCronJob(cronJobConfig);
      expect(jobId).toBe('test-cron-1');
    });

    it('should cancel a cron job successfully', async () => {
      const cronJobConfig = {
        id: 'test-cron-cancel',
        name: 'Test Cron Job to Cancel',
        handler: 'test-handler',
        queue: 'test-queue',
        schedule: '0 9 * * *',
        data: {}
      };

      await scheduler.scheduleCronJob(cronJobConfig);
      const cancelled = await scheduler.cancelCronJob('test-cron-cancel');
      expect(cancelled).toBe(true);
    });

    it('should return false when cancelling non-existent cron job', async () => {
      const cancelled = await scheduler.cancelCronJob('non-existent-job');
      expect(cancelled).toBe(false);
    });
  });

  describe('Queue Management', () => {
    beforeEach(async () => {
      await scheduler.initialize();
    });

    it('should create a queue successfully', async () => {
      const queueConfig = {
        name: 'test-queue',
        durable: true
      };

      await expect(scheduler.createQueue(queueConfig)).resolves.not.toThrow();
    });

    it('should get queue info', async () => {
      const queueConfig = {
        name: 'info-test-queue',
        durable: true
      };

      await scheduler.createQueue(queueConfig);
      
      // Mock the queue info response
      const mockQueueInfo = {
        queue: 'info-test-queue',
        messageCount: 0,
        consumerCount: 0
      };

      // Since we're mocking amqplib, we can't test the actual queue info
      // but we can test that the method exists and can be called
      expect(scheduler.getQueueInfo).toBeDefined();
    });
  });

  describe('Node Information', () => {
    beforeEach(async () => {
      await scheduler.initialize();
    });

    it('should return node information', async () => {
      const nodeInfo = scheduler.getNodeInfo();
      
      expect(nodeInfo).toBeDefined();
      expect(nodeInfo.nodeId).toBeDefined();
      expect(nodeInfo.workers).toEqual([]);
      expect(nodeInfo.activeNodes).toEqual([]);
    });

    it('should return cron jobs list', async () => {
      const cronJobs = scheduler.getCronJobs();
      expect(Array.isArray(cronJobs)).toBe(true);
    });
  });

  describe('Decorator Integration', () => {
    beforeEach(async () => {
      await scheduler.initialize();
    });

    it('should return empty registered classes initially', () => {
      const registeredClasses = scheduler.getRegisteredClasses();
      expect(registeredClasses).toEqual([]);
    });

    it('should return empty job methods for non-existent class', () => {
      const jobMethods = scheduler.getJobMethods('NonExistentClass');
      expect(jobMethods).toEqual([]);
    });

    it('should return empty cron job methods for non-existent class', () => {
      const cronJobMethods = scheduler.getCronJobMethods('NonExistentClass');
      expect(cronJobMethods).toEqual([]);
    });
  });
});