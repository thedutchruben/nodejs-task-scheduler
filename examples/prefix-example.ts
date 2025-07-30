import { TaskScheduler } from '../src';

async function main() {
  // Create scheduler with queue prefix
  const scheduler = new TaskScheduler({
    url: 'amqp://localhost',
    queuePrefix: 'myapp_'
  });

  await scheduler.initialize();

  // Create a worker - queues will be prefixed automatically
  await scheduler.createWorker({
    name: 'email-worker',
    concurrency: 2,
    queues: ['email_queue'], // This will become 'myapp_email_queue'
    handlers: {
      'send_email': async (data) => {
        console.log('Sending email:', data);
        return { success: true };
      }
    }
  });

  // Schedule a job - queue name will be prefixed automatically
  const jobId = await scheduler.scheduleJob({
    id: 'test-job-1',
    name: 'Send Welcome Email',
    handler: 'send_email',
    data: { to: 'user@example.com', subject: 'Welcome!' }
  });

  console.log(`Scheduled job: ${jobId}`);

  // The job will be sent to queue 'myapp_job_queue_send_email'
  
  await scheduler.shutdown();
}

// Run example (commented out to avoid execution)
// main().catch(console.error);