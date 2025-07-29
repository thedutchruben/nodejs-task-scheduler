import 'reflect-metadata';
import { Job, CronJob, Worker, Queue, MetadataStore } from '../decorators';

describe('Decorators', () => {
  describe('@Job decorator', () => {
    it('should store job metadata correctly', () => {
      class TestService {
        @Job({ name: 'test-job', priority: 5 })
        async testMethod() {
          return { success: true };
        }
      }

      const metadata = MetadataStore.getJobMetadata(TestService.prototype, 'testMethod');
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('test-job');
      expect(metadata?.priority).toBe(5);
    });

    it('should use method name as default job name', () => {
      class TestService {
        @Job()
        async processData() {
          return { success: true };
        }
      }

      const metadata = MetadataStore.getJobMetadata(TestService.prototype, 'processData');
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('processData');
    });
  });

  describe('@CronJob decorator', () => {
    it('should store cron job metadata correctly', () => {
      class TestService {
        @CronJob({ 
          schedule: '0 9 * * *', 
          name: 'daily-task',
          timezone: 'America/New_York'
        })
        async dailyTask() {
          return { success: true };
        }
      }

      const metadata = MetadataStore.getCronJobMetadata(TestService.prototype, 'dailyTask');
      expect(metadata).toBeDefined();
      expect(metadata?.schedule).toBe('0 9 * * *');
      expect(metadata?.name).toBe('daily-task');
      expect(metadata?.timezone).toBe('America/New_York');
    });
  });

  describe('@Worker decorator', () => {
    it('should store worker metadata correctly', () => {
      @Worker({ name: 'test-worker', concurrency: 4, queues: ['test-queue'] })
      class TestService {}

      const metadata = MetadataStore.getWorkerMetadata(TestService);
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('test-worker');
      expect(metadata?.concurrency).toBe(4);
      expect(metadata?.queues).toEqual(['test-queue']);
    });

    it('should use class name as default worker name', () => {
      @Worker()
      class MyService {}

      const metadata = MetadataStore.getWorkerMetadata(MyService);
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('MyService');
      expect(metadata?.concurrency).toBe(1);
    });
  });

  describe('@Queue decorator', () => {
    it('should store queue metadata correctly', () => {
      @Queue({ name: 'test-queue', durable: true, exclusive: false })
      class TestService {}

      const metadata = MetadataStore.getQueueMetadata(TestService);
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('test-queue');
      expect(metadata?.durable).toBe(true);
      expect(metadata?.exclusive).toBe(false);
    });
  });

  describe('MetadataStore', () => {
    it('should retrieve all job methods from a class', () => {
      class TestService {
        @Job({ name: 'job1' })
        async method1() {}

        @Job({ name: 'job2' })
        async method2() {}

        async regularMethod() {}
      }

      const jobMethods = MetadataStore.getAllJobMethods(TestService);
      expect(jobMethods).toHaveLength(2);
      expect(jobMethods.map(m => m.metadata.name)).toEqual(['job1', 'job2']);
    });

    it('should retrieve all cron job methods from a class', () => {
      class TestService {
        @CronJob({ schedule: '0 9 * * *', name: 'cron1' })
        async cronMethod1() {}

        @CronJob({ schedule: '0 18 * * *', name: 'cron2' })
        async cronMethod2() {}

        @Job({ name: 'regular-job' })
        async regularJob() {}
      }

      const cronMethods = MetadataStore.getAllCronJobMethods(TestService);
      expect(cronMethods).toHaveLength(2);
      expect(cronMethods.map(m => m.metadata.name)).toEqual(['cron1', 'cron2']);
    });
  });
});