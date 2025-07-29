# Node.js Task Scheduler

[![CI/CD](https://github.com/your-username/nodejs-task-scheduler/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/nodejs-task-scheduler/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/nodejs-task-scheduler.svg)](https://badge.fury.io/js/nodejs-task-scheduler)

A distributed task scheduler for Node.js using RabbitMQ with support for cron jobs, direct job execution, and load balancing across multiple nodes.

## Features

- **Distributed Job Processing**: Jobs are distributed across multiple worker nodes using RabbitMQ
- **Cron Job Support**: Schedule recurring jobs using cron expressions
- **Direct Job Execution**: Execute jobs immediately on available nodes
- **Load Balancing**: Automatically selects the least loaded available node
- **Singleton & Multi-instance Workers**: Support for both single-threaded and concurrent job processing
- **Retry Logic**: Configurable retry attempts with exponential backoff
- **Dead Letter Queue**: Failed jobs are moved to a dead letter queue for inspection
- **TypeScript Support**: Full TypeScript support with type definitions
- **Auto-reconnection**: Automatic reconnection to RabbitMQ on connection loss
- **Health Monitoring**: Built-in heartbeat system for node health monitoring

## Installation

### From npm (when published)
```bash
npm install nodejs-task-scheduler
```

### From GitHub Packages
```bash
npm install @theduchruben/nodejs-task-scheduler
```

### Development Setup
```bash
git clone https://github.com/your-username/nodejs-task-scheduler.git
cd nodejs-task-scheduler
npm install
npm run build
```

## Prerequisites

- **Node.js**: Version 16 or higher
- **RabbitMQ**: Running RabbitMQ server (local or remote)
- **TypeScript**: For development (automatically handled by npm scripts)

## Quick Start

```typescript
import { TaskScheduler } from './src';

// Initialize the scheduler
const scheduler = new TaskScheduler({
  url: 'amqp://localhost:5672'
});

await scheduler.initialize();

// Create a worker
await scheduler.createWorker({
  name: 'email-worker',
  concurrency: 1, // Singleton worker
  queues: ['email-jobs'],
  handlers: {
    'send-email': async (data) => {
      console.log('Sending email to:', data.email);
      // Email sending logic here
      return { success: true };
    }
  }
});

// Schedule a direct job
await scheduler.scheduleJob({
  id: 'job-1',
  name: 'Send Welcome Email',
  handler: 'send-email',
  data: { email: 'user@example.com' }
});

// Schedule a cron job
await scheduler.scheduleCronJob({
  id: 'daily-report',
  name: 'Daily Report',
  handler: 'generate-report',
  schedule: '0 9 * * *', // Every day at 9 AM
  data: { reportType: 'daily' }
});
```

## Configuration

### Connection Configuration

```typescript
const connectionConfig = {
  url: 'amqp://localhost:5672',
  options: {
    heartbeat: 60,
    // Other amqplib connection options
  }
};
```

### Worker Configuration

```typescript
const workerConfig = {
  name: 'my-worker',
  concurrency: 5, // Max concurrent jobs (1 for singleton)
  queues: ['queue1', 'queue2'],
  handlers: {
    'job-type-1': async (data) => {
      // Job handler logic
      return { success: true, data: result };
    },
    'job-type-2': async (data) => {
      // Another job handler
      return { success: false, error: 'Something went wrong' };
    }
  }
};
```

### Job Configuration

```typescript
// Direct job
const jobConfig = {
  id: 'unique-job-id',
  name: 'Job Name',
  handler: 'job-type-1',
  data: { key: 'value' },
  priority: 5, // Higher number = higher priority
  attempts: 3, // Max retry attempts
  backoff: {
    type: 'exponential',
    delay: 1000 // Initial delay in ms
  }
};

// Cron job
const cronJobConfig = {
  ...jobConfig,
  schedule: '0 */6 * * *', // Every 6 hours
  timezone: 'America/New_York'
};
```

## API Reference

### TaskScheduler

#### Methods

- `initialize()`: Initialize the scheduler and connect to RabbitMQ
- `shutdown()`: Gracefully shutdown all workers and connections
- `createWorker(config)`: Create and start a new worker
- `scheduleJob(config)`: Schedule a job for immediate execution
- `scheduleCronJob(config)`: Schedule a recurring cron job
- `cancelCronJob(jobId)`: Cancel a scheduled cron job
- `register(instance)`: Register a class instance with decorators
- `executeJobMethod(className, methodName, data)`: Execute a job method from registered class
- `getNodeInfo()`: Get information about the current node and active nodes
- `getWorkerStatus(workerName)`: Get status of a specific worker
- `getCronJobs()`: Get list of active cron jobs
- `getRegisteredClasses()`: Get information about registered decorator classes

### Decorators

#### Job Decorators
- `@Job(options?)`: Mark a method as a job handler
- `@CronJob(options)`: Mark a method as a cron job handler  
- `@SingletonJob(options?)`: Mark a method as singleton job (concurrency: 1)
- `@HighPriorityJob(options?)`: Mark a method as high priority job
- `@LowPriorityJob(options?)`: Mark a method as low priority job
- `@Retry(attempts, type, delay)`: Add retry configuration to a job

#### Class Decorators
- `@Worker(options?)`: Define worker configuration for a class
- `@Queue(options)`: Define queue configuration for a class

### Job Handlers

Job handlers are async functions that process job data:

```typescript
const handler = async (data: any): Promise<JobResult> => {
  try {
    // Process job data
    const result = await processData(data);
    
    return {
      success: true,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};
```

## Load Balancing

The scheduler automatically distributes jobs to the least loaded available nodes. Nodes communicate via heartbeat messages to track their status and current load.

## Error Handling

- Failed jobs are automatically retried based on the `attempts` configuration
- Backoff strategies include fixed delay and exponential backoff
- Jobs that exceed max attempts are moved to a dead letter queue
- Connection failures trigger automatic reconnection attempts

## Docker Setup

### Using Docker Compose (Recommended for Testing)

Create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  rabbitmq:
    image: rabbitmq:3-management
    container_name: rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      - RABBITMQ_DEFAULT_USER=admin
      - RABBITMQ_DEFAULT_PASS=password
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq

  scheduler-node-1:
    build: .
    depends_on:
      - rabbitmq
    environment:
      - RABBITMQ_URL=amqp://admin:password@rabbitmq:5672
      - NODE_NAME=scheduler-1
    volumes:
      - ./examples:/app/examples

  scheduler-node-2:
    build: .
    depends_on:
      - rabbitmq
    environment:
      - RABBITMQ_URL=amqp://admin:password@rabbitmq:5672
      - NODE_NAME=scheduler-2
    volumes:
      - ./examples:/app/examples

volumes:
  rabbitmq_data:
```

Start the services:
```bash
docker-compose up -d
```

### RabbitMQ Management UI
Access the RabbitMQ management interface at http://localhost:15672
- Username: admin
- Password: password

## Complete Usage Examples

### Basic Email Service Example

```typescript
import { TaskScheduler } from 'nodejs-task-scheduler';

const scheduler = new TaskScheduler({
  url: process.env.RABBITMQ_URL || 'amqp://localhost:5672'
});

async function setupEmailService() {
  await scheduler.initialize();

  // Create email worker with singleton processing
  await scheduler.createWorker({
    name: 'email-worker',
    concurrency: 1, // Process one email at a time
    queues: ['email-jobs'],
    handlers: {
      'send-welcome-email': async (data) => {
        console.log(`Sending welcome email to: ${data.email}`);
        
        // Simulate email sending
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (Math.random() > 0.9) {
          return { success: false, error: 'Email service temporarily unavailable' };
        }
        
        return { 
          success: true, 
          data: { messageId: `msg_${Date.now()}` }
        };
      },
      
      'send-notification': async (data) => {
        console.log(`Sending notification: ${data.message}`);
        return { success: true };
      }
    }
  });

  // Schedule immediate jobs
  await scheduler.scheduleJob({
    id: 'welcome-123',
    name: 'Welcome Email',
    handler: 'send-welcome-email',
    data: { 
      email: 'user@example.com',
      name: 'John Doe'
    },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  });

  // Schedule daily email digest
  await scheduler.scheduleCronJob({
    id: 'daily-digest',
    name: 'Daily Email Digest',
    handler: 'send-notification',
    schedule: '0 9 * * *', // 9 AM every day
    timezone: 'America/New_York',
    data: {
      message: 'Your daily digest is ready!'
    }
  });
}

setupEmailService().catch(console.error);
```

### Decorator-Based Architecture (Recommended)

```typescript
import 'reflect-metadata';
import { 
  TaskScheduler, 
  Job, 
  CronJob, 
  Worker, 
  Queue,
  SingletonJob,
  HighPriorityJob,
  Retry
} from 'nodejs-task-scheduler';

@Worker({ name: 'email-service', concurrency: 1 })
@Queue({ name: 'email-queue', durable: true })
class EmailService {
  
  @SingletonJob({ name: 'send-email' })
  @Retry(3, 'exponential', 2000)
  async sendEmail(data: { to: string; subject: string; body: string }) {
    console.log(`📧 Sending email to: ${data.to}`);
    
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return { messageId: `msg_${Date.now()}`, sentAt: new Date() };
  }

  @CronJob({ 
    schedule: '0 9 * * *', // 9 AM every day
    name: 'daily-digest',
    timezone: 'America/New_York'
  })
  async sendDailyDigest() {
    console.log('📰 Sending daily digest emails...');
    // Implementation here
    return { digestSent: true };
  }
}

@Worker({ name: 'data-processor', concurrency: 4 })
class DataProcessingService {
  
  @Job({ name: 'process-user-data', priority: 6 })
  @Retry(2, 'exponential', 1000)
  async processUserData(data: { userId: string; records: any[] }) {
    console.log(`🔄 Processing data for user: ${data.userId}`);
    // Processing logic here
    return { processed: true, recordCount: data.records.length };
  }

  @HighPriorityJob({ name: 'process-urgent-data' })
  async processUrgentData(data: { alertId: string }) {
    console.log(`🚨 Processing urgent data: ${data.alertId}`);
    // Urgent processing logic
    return { processed: true, urgent: true };
  }

  @CronJob({ schedule: '0 2 * * *', name: 'daily-cleanup' })
  async dailyCleanup() {
    console.log('🌙 Running daily cleanup...');
    return { cleanedUp: true };
  }
}

// Usage
async function main() {
  const scheduler = new TaskScheduler({
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672'
  });

  await scheduler.initialize();

  // Register services - workers and cron jobs are automatically created
  await scheduler.register(new EmailService());
  await scheduler.register(new DataProcessingService());

  // Execute jobs directly
  await scheduler.executeJobMethod('EmailService', 'sendEmail', {
    to: 'user@example.com',
    subject: 'Welcome!',
    body: 'Thanks for joining!'
  });

  await scheduler.executeJobMethod('DataProcessingService', 'processUserData', {
    userId: 'user123',
    records: [{ id: 1, data: 'sample' }]
  });
}
```

### Multi-Service Architecture Example (Traditional)

```typescript
import { TaskScheduler } from 'nodejs-task-scheduler';

class DataProcessingService {
  private scheduler: TaskScheduler;

  constructor() {
    this.scheduler = new TaskScheduler({
      url: process.env.RABBITMQ_URL || 'amqp://localhost:5672'
    });
  }

  async start() {
    await this.scheduler.initialize();
    
    // High-throughput data processing worker
    await this.scheduler.createWorker({
      name: 'data-processor',
      concurrency: 5, // Process 5 jobs concurrently
      queues: ['data-processing', 'analytics'],
      handlers: {
        'process-user-data': this.processUserData.bind(this),
        'generate-analytics': this.generateAnalytics.bind(this),
        'cleanup-old-data': this.cleanupOldData.bind(this)
      }
    });

    // Critical operations worker (singleton)
    await this.scheduler.createWorker({
      name: 'critical-ops',
      concurrency: 1,
      queues: ['critical-operations'],
      handlers: {
        'backup-database': this.backupDatabase.bind(this),
        'update-system-config': this.updateSystemConfig.bind(this)
      }
    });

    // Schedule recurring maintenance tasks
    await this.scheduleMaintenance();
  }

  private async processUserData(data: any) {
    console.log(`Processing data for user: ${data.userId}`);
    
    // Simulate data processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      success: true,
      data: { processedRecords: data.records?.length || 0 }
    };
  }

  private async generateAnalytics(data: any) {
    console.log(`Generating analytics report: ${data.reportType}`);
    
    // Simulate analytics generation
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    return { 
      success: true, 
      data: { reportUrl: `https://reports.example.com/${data.reportType}` }
    };
  }

  private async cleanupOldData(data: any) {
    console.log(`Cleaning up data older than: ${data.days} days`);
    
    // Simulate cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return { 
      success: true, 
      data: { deletedRecords: Math.floor(Math.random() * 1000) }
    };
  }

  private async backupDatabase(data: any) {
    console.log('Starting database backup...');
    
    // Simulate backup
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    return { 
      success: true, 
      data: { backupSize: '2.5GB', location: '/backups/2024-01-01.sql' }
    };
  }

  private async updateSystemConfig(data: any) {
    console.log(`Updating system config: ${data.configKey}`);
    
    return { success: true };
  }

  private async scheduleMaintenance() {
    // Daily cleanup at 2 AM
    await this.scheduler.scheduleCronJob({
      id: 'daily-cleanup',
      name: 'Daily Data Cleanup',
      handler: 'cleanup-old-data',
      schedule: '0 2 * * *',
      data: { days: 30 }
    });

    // Weekly database backup on Sundays at 3 AM
    await this.scheduler.scheduleCronJob({
      id: 'weekly-backup',
      name: 'Weekly Database Backup',
      handler: 'backup-database',
      schedule: '0 3 * * 0',
      data: { type: 'full' }
    });

    // Generate daily analytics report at 6 AM
    await this.scheduler.scheduleCronJob({
      id: 'daily-analytics',
      name: 'Daily Analytics Report',
      handler: 'generate-analytics',
      schedule: '0 6 * * *',
      data: { reportType: 'daily' }
    });
  }

  async processUserSignup(userId: string, userData: any) {
    // Schedule user data processing
    return await this.scheduler.scheduleJob({
      id: `user-signup-${userId}`,
      name: 'Process User Signup',
      handler: 'process-user-data',
      data: { userId, records: userData },
      priority: 5
    });
  }

  async shutdown() {
    await this.scheduler.shutdown();
  }
}

// Usage
const service = new DataProcessingService();
service.start().then(() => {
  console.log('Data processing service started');
  
  // Example: Process a new user signup
  service.processUserSignup('user123', { name: 'John', email: 'john@example.com' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await service.shutdown();
  process.exit(0);
});
```

## Examples

```typescript
// Node 1 - Scheduler + Worker
const scheduler1 = new TaskScheduler({ url: 'amqp://localhost:5672' });
await scheduler1.initialize();

await scheduler1.createWorker({
  name: 'worker-1',
  concurrency: 3,
  queues: ['tasks'],
  handlers: { 'process': processHandler }
});

// Node 2 - Worker Only
const scheduler2 = new TaskScheduler({ url: 'amqp://localhost:5672' });
await scheduler2.initialize();

await scheduler2.createWorker({
  name: 'worker-2',
  concurrency: 5,
  queues: ['tasks'],
  handlers: { 'process': processHandler }
});

// Jobs scheduled on Node 1 will be distributed between both workers
```

### Singleton Worker

```typescript
// Ensures only one job runs at a time
await scheduler.createWorker({
  name: 'singleton-worker',
  concurrency: 1,
  queues: ['critical-tasks'],
  handlers: {
    'critical-job': async (data) => {
      // Only one instance of this job runs at a time
      return { success: true };
    }
  }
});
```

## Requirements

- Node.js 16+
- RabbitMQ server
- TypeScript (for development)

## License

MIT