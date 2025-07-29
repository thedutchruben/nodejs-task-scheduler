# Examples

This directory contains practical examples of how to use the nodejs-task-scheduler package.

## Prerequisites

1. **RabbitMQ**: Make sure you have RabbitMQ running
   ```bash
   # Using Docker
   docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
   
   # Or using Docker Compose (see ../docker-compose.yml)
   docker-compose up -d rabbitmq
   ```

2. **Environment**: Set the RabbitMQ URL (optional, defaults to localhost)
   ```bash
   export RABBITMQ_URL="amqp://admin:password@localhost:5672"
   ```

## Running Examples

### 1. Basic Usage (`basic-usage.ts`)

A simple example showing basic job scheduling and cron jobs.

```bash
cd examples
npm install
npm run basic
```

**What it demonstrates:**
- Creating workers with job handlers
- Scheduling immediate jobs
- Setting up cron jobs
- Graceful shutdown

### 2. Email Service (`email-service.ts`)

A complete email service implementation with singleton workers and bulk operations.

```bash
npm run email-service
```

**What it demonstrates:**
- Singleton workers (concurrency: 1) for critical operations
- Bulk email processing
- Welcome email sequences
- Retry logic with exponential backoff
- Scheduled recurring tasks (daily digest, weekly newsletter)

### 3. Multi-Node Setup (`multi-node-setup.ts`)

A complex example showing distributed processing across specialized nodes.

```bash
npm run multi-node
```

**What it demonstrates:**
- Multiple specialized worker nodes
- Load balancing across nodes
- Different concurrency levels for different task types
- Node specialization (data processing, image processing, email)
- System monitoring and health checks

### 4. Decorator Examples (`decorator-examples.ts`)

Modern decorator-based approach for defining jobs and workers.

```bash
npm run decorators
```

**What it demonstrates:**
- `@Job()`, `@CronJob()`, `@Worker()`, `@Queue()` decorators
- Automatic worker registration with `scheduler.register()`
- Direct job execution with `scheduler.executeJobMethod()`
- Specialized decorators (`@SingletonJob`, `@HighPriorityJob`, `@Retry`)
- Clean separation of concerns with class-based services

## Example Scenarios

### Scenario 1: E-commerce Platform

```typescript
// Order processing workflow
await scheduler.scheduleJob({
  id: `order-${orderId}`,
  handler: 'process-order',
  data: { orderId, items, customerId },
  priority: 8
});

// Send confirmation email (singleton worker)
await scheduler.scheduleJob({
  id: `order-confirmation-${orderId}`,
  handler: 'send-order-confirmation',
  data: { orderId, customerEmail },
  priority: 7
});

// Schedule inventory update
await scheduler.scheduleJob({
  id: `inventory-update-${orderId}`,
  handler: 'update-inventory',
  data: { items },
  priority: 6
});
```

### Scenario 2: Media Processing Platform

```typescript
// High-priority image processing
await scheduler.scheduleJob({
  id: `image-${imageId}`,
  handler: 'process-image',
  data: { imageId, originalPath, transforms },
  priority: 9,
  attempts: 2
});

// Batch thumbnail generation
await scheduler.scheduleJob({
  id: `thumbnails-${batchId}`,
  handler: 'generate-thumbnails',
  data: { imageIds, sizes: ['150x150', '300x300'] },
  priority: 5
});
```

### Scenario 3: Data Analytics Pipeline

```typescript
// Daily data ingestion (cron job)
await scheduler.scheduleCronJob({
  id: 'daily-data-ingestion',
  schedule: '0 2 * * *', // 2 AM daily
  handler: 'ingest-daily-data',
  data: { source: 'api', format: 'json' }
});

// Real-time data processing
await scheduler.scheduleJob({
  id: `realtime-${timestamp}`,
  handler: 'process-realtime-data',
  data: { events, timestamp },
  priority: 8
});
```

## Worker Configuration Patterns

### Singleton Workers (Concurrency: 1)
Best for:
- Email sending (prevent duplicates)
- Database migrations
- File system operations
- Critical system updates

```typescript
await scheduler.createWorker({
  name: 'critical-ops',
  concurrency: 1,
  queues: ['critical-tasks'],
  handlers: { /* handlers */ }
});
```

### High-Concurrency Workers
Best for:
- Data processing
- API calls
- Image/file transformations
- Non-blocking operations

```typescript
await scheduler.createWorker({
  name: 'data-processor',
  concurrency: 10,
  queues: ['data-tasks'],
  handlers: { /* handlers */ }
});
```

### Specialized Workers
Best for:
- Different resource requirements
- Specialized hardware/software
- Isolated processing environments

```typescript
// CPU-intensive tasks
await scheduler.createWorker({
  name: 'cpu-worker',
  concurrency: 4, // Match CPU cores
  queues: ['cpu-intensive'],
  handlers: { /* handlers */ }
});

// I/O-intensive tasks  
await scheduler.createWorker({
  name: 'io-worker',
  concurrency: 20, // Higher concurrency for I/O
  queues: ['io-intensive'],
  handlers: { /* handlers */ }
});
```

## Monitoring and Debugging

### Check Node Status
```typescript
const status = scheduler.getNodeInfo();
console.log('Node ID:', status.nodeId);
console.log('Active Workers:', status.workers);
console.log('Active Nodes:', status.activeNodes);
```

### Check Worker Status
```typescript
const workerStatus = scheduler.getWorkerStatus('my-worker');
console.log('Running:', workerStatus?.isRunning);
console.log('Active Jobs:', workerStatus?.activeJobs);
```

### Check Cron Jobs
```typescript
const cronJobs = scheduler.getCronJobs();
console.log('Active Cron Jobs:', cronJobs);
```

### RabbitMQ Management UI
Access http://localhost:15672 to monitor:
- Queue lengths
- Message rates
- Consumer counts
- Node connections

## Best Practices

1. **Graceful Shutdown**: Always handle SIGINT/SIGTERM for clean shutdown
2. **Error Handling**: Implement proper error handling in job handlers
3. **Retry Logic**: Configure appropriate retry attempts and backoff strategies
4. **Resource Management**: Choose concurrency levels based on resource requirements
5. **Monitoring**: Monitor queue lengths and processing times
6. **Testing**: Test with different load patterns and failure scenarios

## Troubleshooting

### Common Issues

1. **Jobs not processing**: Check if workers are running and consuming from correct queues
2. **High memory usage**: Reduce worker concurrency or optimize job handlers
3. **Connection errors**: Verify RabbitMQ is running and accessible
4. **Duplicate processing**: Use singleton workers (concurrency: 1) for critical operations

### Debug Mode

Enable debug logging:
```bash
DEBUG=nodejs-task-scheduler* npm run basic
```

## Contributing

Feel free to add more examples or improve existing ones. Make sure to:
1. Include comprehensive comments
2. Follow TypeScript best practices
3. Add error handling
4. Test with different scenarios