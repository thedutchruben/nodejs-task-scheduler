#!/usr/bin/env ts-node

// Simple multi-node test that can be run manually in separate terminals
import { TaskScheduler } from './src';

const nodeId = process.argv[2] || `node-${Math.floor(Math.random() * 1000)}`;
const isScheduler = process.argv[3] === 'scheduler';

console.log(`🚀 Starting ${nodeId} ${isScheduler ? '(with job scheduling)' : '(worker only)'}`);

async function runNode() {
  const scheduler = new TaskScheduler({
    url: process.env.RABBITMQ_URL || 'amqp://admin:password@localhost:5672',
    queuePrefix: 'njs_testing_'
  });

  try {
    await scheduler.initialize();
    console.log(`✅ ${nodeId} initialized`);

    // Create worker
    await scheduler.createWorker({
      name: `${nodeId}-worker`,
      concurrency: 2,
      queues: ['test-jobs'],
      handlers: {
        'test-job': async (data: any) => {
          console.log(`📋 ${nodeId} processing:`, data.message);
          await new Promise(resolve => setTimeout(resolve, 2000));
          return { 
            success: true, 
            processedBy: nodeId,
            timestamp: new Date().toISOString()
          };
        }
      }
    });

    // Show node status every 10 seconds  
    setInterval(async () => {
      try {
        const nodeInfo = await scheduler.getNodeInfo();
          // @ts-ignore
        const status = nodeInfo.isLeader ? '👑 LEADER' : '👥 FOLLOWER';
        console.log(`${nodeId}: ${status} (ID: ${nodeInfo.nodeId.substring(0, 8)}...)`);
      } catch (error) {
        console.log(`${nodeId}: ❌ Status check failed`);
      }
    }, 10000);

    // If this is the scheduler node, schedule some jobs
    if (isScheduler) {
      console.log(`📋 ${nodeId} will schedule jobs every 15 seconds`);
      
      let jobCounter = 1;
      setInterval(async () => {
        try {
            // @ts-ignore
          await scheduler.scheduleJob({
            id: `job-${jobCounter}`,
            name: `Test Job ${jobCounter}`,
            handler: 'test-job',
            data: { 
              message: `Hello from job ${jobCounter}`,
              scheduledBy: nodeId,
              timestamp: new Date().toISOString()
            }
          });
          console.log(`📤 ${nodeId} scheduled job-${jobCounter}`);
          jobCounter++;
        } catch (error) {
          console.error(`❌ ${nodeId} failed to schedule job:`, error.message);
        }
      }, 15000);
    }

    console.log(`🟢 ${nodeId} is running and ready`);

  } catch (error) {
    console.error(`❌ ${nodeId} failed to start:`, error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log(`\n🛑 ${nodeId} shutting down...`);
  process.exit(0);
});

runNode().catch(error => {
  console.error(`❌ ${nodeId} crashed:`, error);
  process.exit(1);
});