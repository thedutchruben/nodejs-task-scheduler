import { TaskScheduler } from '../src';

const scheduler = new TaskScheduler({
  url: process.env.RABBITMQ_URL || 'amqp://localhost:5672'
});

async function basicExample() {
  console.log('🚀 Starting basic task scheduler example...');
  
  await scheduler.initialize();

  // Create a simple worker
  await scheduler.createWorker({
    name: 'basic-worker',
    concurrency: 2,
    queues: ['basic-jobs'],
    handlers: {
      'hello-world': async (data) => {
        console.log(`👋 Hello ${data.name}!`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { success: true, data: { message: `Processed greeting for ${data.name}` } };
      },
      
      'calculate': async (data) => {
        const { a, b, operation } = data;
        let result: number;
        
        switch (operation) {
          case 'add':
            result = a + b;
            break;
          case 'multiply':
            result = a * b;
            break;
          default:
            return { success: false, error: 'Unknown operation' };
        }
        
        console.log(`🧮 ${a} ${operation} ${b} = ${result}`);
        return { success: true, data: { result } };
      }
    }
  });

  // Schedule some jobs
  console.log('📋 Scheduling jobs...');

  await scheduler.scheduleJob({
    id: 'greeting-1',
    name: 'Say Hello',
    handler: 'hello-world',
    data: { name: 'Alice' }
  });

  await scheduler.scheduleJob({
    id: 'calc-1',
    name: 'Addition',
    handler: 'calculate',
    data: { a: 10, b: 5, operation: 'add' }
  });

  await scheduler.scheduleJob({
    id: 'calc-2',
    name: 'Multiplication',
    handler: 'calculate',
    data: { a: 7, b: 3, operation: 'multiply' }
  });

  // Schedule a cron job
  await scheduler.scheduleCronJob({
    id: 'periodic-greeting',
    name: 'Periodic Hello',
    handler: 'hello-world',
    schedule: '*/10 * * * * *', // Every 10 seconds
    data: { name: 'World' }
  });

  console.log('✅ Jobs scheduled! Check the console for processing...');
  console.log('📊 Node info:', scheduler.getNodeInfo());

  // Let it run for a bit
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Cancel the cron job
  await scheduler.cancelCronJob('periodic-greeting');
  console.log('⏹️  Periodic job cancelled');

  // Graceful shutdown
  console.log('🛑 Shutting down...');
  await scheduler.shutdown();
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await scheduler.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await scheduler.shutdown();
  process.exit(0);
});

basicExample().catch(console.error);