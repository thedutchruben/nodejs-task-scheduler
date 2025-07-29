import 'reflect-metadata';
import { 
  TaskScheduler, 
  Job, 
  CronJob, 
  Worker, 
  Queue,
  SingletonJob,
  HighPriorityJob,
  LowPriorityJob,
  Retry
} from '../src';

// Example 1: Email Service with Decorators
@Worker({ name: 'email-service', concurrency: 1 })
@Queue({ name: 'email-queue', durable: true })
class EmailService {
  
  @SingletonJob({ name: 'send-email' })
  @Retry(3, 'exponential', 2000)
  async sendEmail(data: { to: string; subject: string; body: string }) {
    console.log(`📧 Sending email to: ${data.to}`);
    console.log(`📋 Subject: ${data.subject}`);
    
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    // Simulate occasional failures
    if (Math.random() < 0.1) {
      throw new Error('SMTP server temporarily unavailable');
    }
    
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`✅ Email sent successfully! Message ID: ${messageId}`);
    
    return { messageId, sentAt: new Date().toISOString(), recipient: data.to };
  }

  @Job({ name: 'send-bulk-emails', priority: 5 })
  async sendBulkEmails(data: { emails: Array<{ to: string; subject: string; body: string }> }) {
    console.log(`📮 Processing bulk email batch: ${data.emails.length} emails`);
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const email of data.emails) {
      try {
        await this.sendEmail(email);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to send to ${email.to}:`, error);
        failureCount++;
      }
      
      // Small delay between emails
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`📊 Bulk email complete - Success: ${successCount}, Failed: ${failureCount}`);
    return { successCount, failureCount, totalProcessed: data.emails.length };
  }

  @CronJob({ 
    schedule: '0 9 * * *', // 9 AM every day
    name: 'daily-digest',
    timezone: 'America/New_York'
  })
  async sendDailyDigest() {
    console.log('📰 Sending daily digest emails...');
    
    const recipients = [
      { to: 'user1@example.com', name: 'John Doe' },
      { to: 'user2@example.com', name: 'Jane Smith' }
    ];
    
    for (const recipient of recipients) {
      await this.sendEmail({
        to: recipient.to,
        subject: 'Your Daily Digest',
        body: `Hello ${recipient.name}, here's your daily digest...`
      });
    }
    
    return { digestSent: true, recipientCount: recipients.length };
  }

  @CronJob({ 
    schedule: '0 10 * * 1', // 10 AM every Monday
    name: 'weekly-newsletter'
  })
  async sendWeeklyNewsletter() {
    console.log('📰 Sending weekly newsletter...');
    
    return await this.sendBulkEmails({
      emails: [
        { to: 'subscriber1@example.com', subject: 'Weekly Newsletter', body: 'Newsletter content...' },
        { to: 'subscriber2@example.com', subject: 'Weekly Newsletter', body: 'Newsletter content...' }
      ]
    });
  }
}

// Example 2: Data Processing Service
@Worker({ name: 'data-processor', concurrency: 4 })
@Queue({ name: 'data-processing-queue', durable: true })
class DataProcessingService {
  
  @Job({ name: 'process-user-data', priority: 6 })
  @Retry(2, 'exponential', 1000)
  async processUserData(data: { userId: string; records: any[] }) {
    console.log(`🔄 Processing data for user: ${data.userId} (${data.records.length} records)`);
    
    // Simulate data processing
    const processingTime = 2000 + Math.random() * 3000;
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    // Simulate occasional validation errors
    if (Math.random() < 0.05) {
      throw new Error('Data validation failed');
    }
    
    return {
      userId: data.userId,
      recordsProcessed: data.records.length,
      processingTime: Math.round(processingTime),
      processedAt: new Date().toISOString()
    };
  }

  @HighPriorityJob({ name: 'process-urgent-data' })
  async processUrgentData(data: { alertId: string; payload: any }) {
    console.log(`🚨 Processing urgent data: ${data.alertId}`);
    
    // Urgent processing with shorter timeout
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      alertId: data.alertId,
      processed: true,
      urgentProcessedAt: new Date().toISOString()
    };
  }

  @LowPriorityJob({ name: 'cleanup-old-data' })
  async cleanupOldData(data: { olderThanDays: number }) {
    console.log(`🧹 Cleaning up data older than ${data.olderThanDays} days`);
    
    // Simulate cleanup
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const deletedRecords = Math.floor(Math.random() * 1000);
    console.log(`🗑️  Deleted ${deletedRecords} old records`);
    
    return { deletedRecords, cleanupDate: new Date().toISOString() };
  }

  @CronJob({ 
    schedule: '0 2 * * *', // 2 AM every day
    name: 'daily-cleanup'
  })
  async dailyCleanup() {
    console.log('🌙 Running daily cleanup...');
    return await this.cleanupOldData({ olderThanDays: 30 });
  }

  @CronJob({ 
    schedule: '0 6 * * *', // 6 AM every day
    name: 'generate-daily-report'
  })
  async generateDailyReport() {
    console.log('📊 Generating daily report...');
    
    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    return {
      reportGenerated: true,
      reportUrl: `/reports/daily-${new Date().toISOString().split('T')[0]}.pdf`,
      generatedAt: new Date().toISOString()
    };
  }
}

// Example 3: Image Processing Service
@Worker({ name: 'image-processor', concurrency: 2 })
@Queue({ name: 'image-processing-queue', durable: true })
class ImageProcessingService {
  
  @Job({ name: 'process-image', priority: 7 })
  @Retry(2, 'fixed', 3000)
  async processImage(data: { imageId: string; originalPath: string; transformations: string[] }) {
    console.log(`🖼️  Processing image: ${data.imageId}`);
    console.log(`🔧 Transformations: ${data.transformations.join(', ')}`);
    
    // Simulate image processing (CPU-intensive)
    const processingTime = 5000 + Math.random() * 5000;
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    return {
      imageId: data.imageId,
      processedPath: `/processed/${data.imageId}.jpg`,
      thumbnailPath: `/thumbnails/${data.imageId}_thumb.jpg`,
      transformationsApplied: data.transformations,
      processingTime: Math.round(processingTime),
      processedAt: new Date().toISOString()
    };
  }

  @Job({ name: 'generate-thumbnail', priority: 4 })
  async generateThumbnail(data: { imageId: string; size: string }) {
    console.log(`🔍 Generating ${data.size} thumbnail for image: ${data.imageId}`);
    
    // Simulate thumbnail generation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      imageId: data.imageId,
      thumbnailSize: data.size,
      thumbnailPath: `/thumbnails/${data.imageId}_${data.size}.jpg`,
      generatedAt: new Date().toISOString()
    };
  }
}

// Example 4: Notification Service (Singleton)
@Worker({ name: 'notification-service', concurrency: 1 })
@Queue({ name: 'notification-queue', durable: true })
class NotificationService {
  
  @SingletonJob({ name: 'send-push-notification' })
  async sendPushNotification(data: { userId: string; title: string; body: string; badge?: number }) {
    console.log(`🔔 Sending push notification to user: ${data.userId}`);
    console.log(`📱 ${data.title}: ${data.body}`);
    
    // Simulate push notification sending
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return {
      userId: data.userId,
      notificationId: `notif_${Date.now()}`,
      sentAt: new Date().toISOString(),
      delivered: Math.random() > 0.05 // 95% delivery rate
    };
  }

  @Job({ name: 'send-sms', priority: 8 })
  async sendSMS(data: { phoneNumber: string; message: string }) {
    console.log(`📱 Sending SMS to: ${data.phoneNumber}`);
    
    // Simulate SMS sending
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      phoneNumber: data.phoneNumber,
      messageId: `sms_${Date.now()}`,
      sentAt: new Date().toISOString()
    };
  }

  @CronJob({ 
    schedule: '0 18 * * *', // 6 PM every day
    name: 'daily-reminder'
  })
  async sendDailyReminder() {
    console.log('⏰ Sending daily reminders...');
    
    const users = ['user1', 'user2', 'user3'];
    const results = [];
    
    for (const userId of users) {
      const result = await this.sendPushNotification({
        userId,
        title: 'Daily Reminder',
        body: 'Don\'t forget to check your tasks today!',
        badge: 1
      });
      results.push(result);
    }
    
    return { remindersSent: results.length, results };
  }
}

// Main example function
async function decoratorExamples() {
  console.log('🎯 Starting decorator-based task scheduler examples...');
  
  const scheduler = new TaskScheduler({
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672'
  });

  try {
    // Initialize scheduler
    await scheduler.initialize();
    console.log('✅ Scheduler initialized');

    // Create service instances
    const emailService = new EmailService();
    const dataService = new DataProcessingService();
    const imageService = new ImageProcessingService();
    const notificationService = new NotificationService();

    // Register services with the scheduler
    console.log('\n📋 Registering services...');
    await scheduler.register(emailService);
    await scheduler.register(dataService);
    await scheduler.register(imageService);
    await scheduler.register(notificationService);

    console.log('\n🎯 Services registered successfully!');
    console.log('📊 Registered classes:', scheduler.getRegisteredClasses().map(c => c.name));

    // Execute some direct jobs
    console.log('\n🚀 Executing direct jobs...');

    // Send a single email
    await scheduler.executeJobMethod('EmailService', 'sendEmail', {
      to: 'test@example.com',
      subject: 'Decorator Test Email',
      body: 'This email was sent using decorators!'
    });

    // Process some user data
    await scheduler.executeJobMethod('DataProcessingService', 'processUserData', {
      userId: 'user123',
      records: Array(50).fill(null).map((_, i) => ({ id: i, data: `record-${i}` }))
    });

    // Process an urgent alert
    await scheduler.executeJobMethod('DataProcessingService', 'processUrgentData', {
      alertId: 'alert-001',
      payload: { severity: 'high', message: 'System overload detected' }
    });

    // Process an image
    await scheduler.executeJobMethod('ImageProcessingService', 'processImage', {
      imageId: 'img-001',
      originalPath: '/uploads/image.jpg',
      transformations: ['resize', 'watermark', 'compress']
    });

    // Send a push notification
    await scheduler.executeJobMethod('NotificationService', 'sendPushNotification', {
      userId: 'user456',
      title: 'Welcome!',
      body: 'Thanks for joining our platform',
      badge: 1
    });

    // Send bulk emails
    await scheduler.executeJobMethod('EmailService', 'sendBulkEmails', {
      emails: [
        { to: 'bulk1@example.com', subject: 'Bulk Email 1', body: 'Content 1' },
        { to: 'bulk2@example.com', subject: 'Bulk Email 2', body: 'Content 2' },
        { to: 'bulk3@example.com', subject: 'Bulk Email 3', body: 'Content 3' }
      ]
    });

    console.log('\n📈 Jobs scheduled successfully!');
    console.log('⏰ Active cron jobs:', scheduler.getCronJobs());

    // Monitor for a while
    console.log('\n👀 Monitoring system for 30 seconds...');
    
    const monitorInterval = setInterval(() => {
      const nodeInfo = scheduler.getNodeInfo();
      console.log(`📊 Node: ${nodeInfo.nodeId}, Active nodes: ${nodeInfo.activeNodes.length}`);
      
      // Show worker status
      nodeInfo.workers.forEach(workerName => {
        const status = scheduler.getWorkerStatus(workerName);
        if (status) {
          console.log(`  👷 ${workerName}: Running=${status.isRunning}, Active=${status.activeJobs}`);
        }
      });
    }, 5000);

    await new Promise(resolve => setTimeout(resolve, 30000));
    clearInterval(monitorInterval);

    console.log('\n🏁 Examples completed successfully!');

  } catch (error) {
    console.error('❌ Error in decorator examples:', error);
  } finally {
    console.log('\n🛑 Shutting down...');
    await scheduler.shutdown();
    console.log('✅ Shutdown complete');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

if (require.main === module) {
  decoratorExamples().catch(console.error);
}