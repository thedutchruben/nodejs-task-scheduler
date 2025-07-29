import { TaskScheduler } from '../src';

// This example demonstrates how to set up multiple nodes
// in a distributed task processing system

class Node {
  private scheduler: TaskScheduler;
  private nodeName: string;

  constructor(nodeName: string, rabbitmqUrl: string = 'amqp://localhost:5672') {
    this.nodeName = nodeName;
    this.scheduler = new TaskScheduler({ url: rabbitmqUrl });
  }

  async start() {
    console.log(`🚀 Starting node: ${this.nodeName}`);
    await this.scheduler.initialize();
  }

  async stop() {
    console.log(`🛑 Stopping node: ${this.nodeName}`);
    await this.scheduler.shutdown();
  }

  getScheduler() {
    return this.scheduler;
  }

  getNodeName() {
    return this.nodeName;
  }
}

// Scheduler Node - Responsible for scheduling jobs
class SchedulerNode extends Node {
  constructor(rabbitmqUrl?: string) {
    super('Scheduler', rabbitmqUrl);
  }

  async start() {
    await super.start();
    
    // Scheduler node can also be a worker, but with lower concurrency
    await this.getScheduler().createWorker({
      name: 'scheduler-worker',
      concurrency: 1,
      queues: ['management-tasks'],
      handlers: {
        'cleanup-completed-jobs': this.cleanupCompletedJobs.bind(this),
        'generate-system-report': this.generateSystemReport.bind(this),
        'health-check': this.performHealthCheck.bind(this)
      }
    });

    // Schedule system maintenance tasks
    await this.setupMaintenanceTasks();
    
    console.log('📅 Scheduler node is ready to schedule jobs');
  }

  async scheduleDataProcessingJob(jobData: any) {
    return await this.getScheduler().scheduleJob({
      id: `data-processing-${Date.now()}`,
      name: 'Data Processing Job',
      handler: 'process-data',
      data: jobData,
      priority: 5,
      attempts: 3
    });
  }

  async scheduleImageProcessingJob(imageData: any) {
    return await this.getScheduler().scheduleJob({
      id: `image-processing-${Date.now()}`,
      name: 'Image Processing Job',
      handler: 'process-image',
      data: imageData,
      priority: 7, // Higher priority for image processing
      attempts: 2
    });
  }

  async scheduleEmailJob(emailData: any) {
    return await this.getScheduler().scheduleJob({
      id: `email-${Date.now()}`,
      name: 'Send Email',
      handler: 'send-email',
      data: emailData,
      priority: 6
    });
  }

  private async setupMaintenanceTasks() {
    // Daily cleanup at 2 AM
    await this.getScheduler().scheduleCronJob({
      id: 'daily-cleanup',
      name: 'Daily System Cleanup',
      handler: 'cleanup-completed-jobs',
      schedule: '0 2 * * *',
      data: { olderThanHours: 24 }
    });

    // System health check every hour
    await this.getScheduler().scheduleCronJob({
      id: 'health-check',
      name: 'System Health Check',
      handler: 'health-check',
      schedule: '0 * * * *',
      data: {}
    });

    // Generate system report daily at 9 AM
    await this.getScheduler().scheduleCronJob({
      id: 'daily-report',
      name: 'Daily System Report',
      handler: 'generate-system-report',
      schedule: '0 9 * * *',
      data: { reportType: 'daily' }
    });
  }

  private async cleanupCompletedJobs(data: any) {
    console.log(`🧹 Cleaning up completed jobs older than ${data.olderThanHours} hours`);
    // Simulate cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { success: true, data: { cleanedJobs: 150 } };
  }

  private async generateSystemReport(data: any) {
    console.log(`📊 Generating ${data.reportType} system report`);
    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 5000));
    return { success: true, data: { reportUrl: '/reports/system-report.pdf' } };
  }

  private async performHealthCheck(data: any) {
    console.log('🏥 Performing system health check');
    const nodeInfo = this.getScheduler().getNodeInfo();
    return { 
      success: true, 
      data: { 
        timestamp: new Date().toISOString(),
        activeNodes: nodeInfo.activeNodes.length,
        nodeId: nodeInfo.nodeId
      } 
    };
  }
}

// Data Processing Node - Specialized for data processing tasks
class DataProcessingNode extends Node {
  constructor(nodeId: string, rabbitmqUrl?: string) {
    super(`DataProcessor-${nodeId}`, rabbitmqUrl);
  }

  async start() {
    await super.start();
    
    await this.getScheduler().createWorker({
      name: 'data-worker',
      concurrency: 4, // High concurrency for data processing
      queues: ['data-processing-queue'],
      handlers: {
        'process-data': this.processData.bind(this),
        'transform-data': this.transformData.bind(this),
        'validate-data': this.validateData.bind(this)
      }
    });

    console.log(`💾 Data processing node ${this.getNodeName()} is ready`);
  }

  private async processData(data: any) {
    console.log(`🔄 Processing data batch: ${data.batchId} on ${this.getNodeName()}`);
    
    // Simulate data processing
    const processingTime = 2000 + Math.random() * 3000;
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    return {
      success: true,
      data: {
        batchId: data.batchId,
        processedBy: this.getNodeName(),
        recordsProcessed: data.records?.length || 0,
        processingTime: Math.round(processingTime)
      }
    };
  }

  private async transformData(data: any) {
    console.log(`🔄 Transforming data: ${data.transformationType}`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    return { success: true, data: { transformed: true } };
  }

  private async validateData(data: any) {
    console.log(`✅ Validating data batch: ${data.batchId}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate validation with occasional failures
    const isValid = Math.random() > 0.1;
    
    return {
      success: isValid,
      error: isValid ? undefined : 'Data validation failed',
      data: { batchId: data.batchId, isValid }
    };
  }
}

// Image Processing Node - Specialized for image processing
class ImageProcessingNode extends Node {
  constructor(nodeId: string, rabbitmqUrl?: string) {
    super(`ImageProcessor-${nodeId}`, rabbitmqUrl);
  }

  async start() {
    await super.start();
    
    await this.getScheduler().createWorker({
      name: 'image-worker',
      concurrency: 2, // Moderate concurrency for resource-intensive tasks
      queues: ['image-processing-queue'],
      handlers: {
        'process-image': this.processImage.bind(this),
        'resize-image': this.resizeImage.bind(this),
        'generate-thumbnail': this.generateThumbnail.bind(this)
      }
    });

    console.log(`🖼️  Image processing node ${this.getNodeName()} is ready`);
  }

  private async processImage(data: any) {
    console.log(`🖼️  Processing image: ${data.imageId} on ${this.getNodeName()}`);
    
    // Simulate image processing (typically CPU-intensive)
    const processingTime = 5000 + Math.random() * 5000;
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    return {
      success: true,
      data: {
        imageId: data.imageId,
        processedBy: this.getNodeName(),
        originalSize: data.size,
        processedUrl: `/processed/${data.imageId}.jpg`,
        processingTime: Math.round(processingTime)
      }
    };
  }

  private async resizeImage(data: any) {
    console.log(`📏 Resizing image to ${data.width}x${data.height}`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    return { success: true, data: { resized: true, dimensions: `${data.width}x${data.height}` } };
  }

  private async generateThumbnail(data: any) {
    console.log(`🔍 Generating thumbnail for image: ${data.imageId}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { success: true, data: { thumbnailUrl: `/thumbnails/${data.imageId}_thumb.jpg` } };
  }
}

// Email Processing Node - Singleton for email sending
class EmailProcessingNode extends Node {
  constructor(rabbitmqUrl?: string) {
    super('EmailProcessor', rabbitmqUrl);
  }

  async start() {
    await super.start();
    
    await this.getScheduler().createWorker({
      name: 'email-worker',
      concurrency: 1, // Singleton to prevent duplicate emails
      queues: ['email-queue'],
      handlers: {
        'send-email': this.sendEmail.bind(this),
        'send-notification': this.sendNotification.bind(this)
      }
    });

    console.log(`📧 Email processing node ${this.getNodeName()} is ready`);
  }

  private async sendEmail(data: any) {
    console.log(`📤 Sending email to: ${data.to} from ${this.getNodeName()}`);
    
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate occasional failures
    if (Math.random() < 0.05) {
      throw new Error('SMTP server temporarily unavailable');
    }
    
    return {
      success: true,
      data: {
        messageId: `msg_${Date.now()}`,
        sentTo: data.to,
        sentBy: this.getNodeName()
      }
    };
  }

  private async sendNotification(data: any) {
    console.log(`🔔 Sending notification: ${data.type}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { success: true, data: { notificationSent: true } };
  }
}

// Main orchestrator
async function runMultiNodeExample() {
  console.log('🌐 Starting multi-node distributed task processing example');
  
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
  
  // Create nodes
  const schedulerNode = new SchedulerNode(rabbitmqUrl);
  const dataNode1 = new DataProcessingNode('1', rabbitmqUrl);
  const dataNode2 = new DataProcessingNode('2', rabbitmqUrl);
  const imageNode = new ImageProcessingNode('1', rabbitmqUrl);
  const emailNode = new EmailProcessingNode(rabbitmqUrl);
  
  const nodes = [schedulerNode, dataNode1, dataNode2, imageNode, emailNode];
  
  try {
    // Start all nodes
    console.log('🚀 Starting all nodes...');
    await Promise.all(nodes.map(node => node.start()));
    
    console.log('✅ All nodes started successfully');
    
    // Give nodes time to register with each other
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Schedule some test jobs from the scheduler node
    console.log('\n📋 Scheduling test jobs...');
    
    // Schedule data processing jobs
    for (let i = 0; i < 5; i++) {
      await schedulerNode.scheduleDataProcessingJob({
        batchId: `batch-${i + 1}`,
        records: Array(100).fill(null).map((_, idx) => ({ id: idx, data: `record-${idx}` }))
      });
    }
    
    // Schedule image processing jobs
    for (let i = 0; i < 3; i++) {
      await schedulerNode.scheduleImageProcessingJob({
        imageId: `image-${i + 1}`,
        size: '1920x1080',
        format: 'jpg'
      });
    }
    
    // Schedule email jobs
    await schedulerNode.scheduleEmailJob({
      to: 'user@example.com',
      subject: 'Multi-node test email',
      body: 'This email was processed by our distributed system!'
    });
    
    console.log('📊 Jobs scheduled successfully');
    
    // Monitor the system for a while
    console.log('\n👀 Monitoring system for 30 seconds...');
    
    const monitorInterval = setInterval(() => {
      const nodeInfo = schedulerNode.getScheduler().getNodeInfo();
      console.log(`📈 Active nodes: ${nodeInfo.activeNodes.length}, Current node: ${nodeInfo.nodeId}`);
    }, 5000);
    
    await new Promise(resolve => setTimeout(resolve, 30000));
    clearInterval(monitorInterval);
    
    console.log('\n🏁 Example completed successfully');
    
  } catch (error) {
    console.error('❌ Error in multi-node example:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Shutting down all nodes...');
    await Promise.all(nodes.map(node => node.stop()));
    console.log('✅ All nodes shut down successfully');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  process.exit(0);
});

if (require.main === module) {
  runMultiNodeExample().catch(console.error);
}