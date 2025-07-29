import { TaskScheduler } from '../src';

interface EmailData {
  to: string;
  subject: string;
  body: string;
  priority?: 'low' | 'normal' | 'high';
}

interface NotificationData {
  userId: string;
  type: 'welcome' | 'reminder' | 'alert';
  data: any;
}

class EmailService {
  private scheduler: TaskScheduler;
  private isRunning = false;

  constructor(rabbitmqUrl: string = 'amqp://localhost:5672') {
    this.scheduler = new TaskScheduler({ url: rabbitmqUrl });
  }

  async start() {
    if (this.isRunning) {
      throw new Error('Email service is already running');
    }

    console.log('📧 Starting Email Service...');
    
    await this.scheduler.initialize();

    // Create email worker (singleton to prevent duplicate sends)
    await this.scheduler.createWorker({
      name: 'email-worker',
      concurrency: 1, // Process one email at a time
      queues: ['email-queue'],
      handlers: {
        'send-email': this.sendEmail.bind(this),
        'send-bulk-emails': this.sendBulkEmails.bind(this)
      }
    });

    // Create notification worker (can process multiple notifications)
    await this.scheduler.createWorker({
      name: 'notification-worker',
      concurrency: 3, // Process up to 3 notifications concurrently
      queues: ['notification-queue'],
      handlers: {
        'send-notification': this.sendNotification.bind(this),
        'process-welcome-sequence': this.processWelcomeSequence.bind(this)
      }
    });

    // Schedule daily digest email
    await this.scheduler.scheduleCronJob({
      id: 'daily-digest',
      name: 'Daily Email Digest',
      handler: 'send-bulk-emails',
      schedule: '0 9 * * *', // 9 AM every day
      data: {
        type: 'daily-digest',
        template: 'digest'
      }
    });

    // Schedule weekly newsletter
    await this.scheduler.scheduleCronJob({
      id: 'weekly-newsletter',
      name: 'Weekly Newsletter',
      handler: 'send-bulk-emails',
      schedule: '0 10 * * 1', // 10 AM every Monday
      data: {
        type: 'newsletter',
        template: 'newsletter'
      }
    });

    this.isRunning = true;
    console.log('✅ Email Service started successfully');
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping Email Service...');
    
    // Cancel all cron jobs
    const cronJobs = this.scheduler.getCronJobs();
    for (const jobId of cronJobs) {
      await this.scheduler.cancelCronJob(jobId);
      console.log(`⏹️  Cancelled cron job: ${jobId}`);
    }

    await this.scheduler.shutdown();
    this.isRunning = false;
    console.log('✅ Email Service stopped');
  }

  // Public API methods
  async sendSingleEmail(emailData: EmailData): Promise<string> {
    const priority = this.getPriorityLevel(emailData.priority || 'normal');
    
    return await this.scheduler.scheduleJob({
      id: `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Send Email: ${emailData.subject}`,
      handler: 'send-email',
      data: emailData,
      priority,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
  }

  async sendWelcomeSequence(userId: string, email: string, name: string): Promise<string> {
    return await this.scheduler.scheduleJob({
      id: `welcome-${userId}`,
      name: 'Send Welcome Sequence',
      handler: 'process-welcome-sequence',
      data: { userId, email, name },
      priority: 7, // High priority for welcome emails
      attempts: 2
    });
  }

  async sendNotificationEmail(notificationData: NotificationData): Promise<string> {
    return await this.scheduler.scheduleJob({
      id: `notification-${notificationData.userId}-${Date.now()}`,
      name: `Send Notification: ${notificationData.type}`,
      handler: 'send-notification',
      data: notificationData,
      priority: this.getNotificationPriority(notificationData.type)
    });
  }

  // Job handlers
  private async sendEmail(data: EmailData): Promise<any> {
    console.log(`📤 Sending email to: ${data.to}`);
    console.log(`📋 Subject: ${data.subject}`);
    
    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    // Simulate occasional failures
    if (Math.random() < 0.1) {
      throw new Error('SMTP server temporarily unavailable');
    }
    
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`✅ Email sent successfully! Message ID: ${messageId}`);
    
    return {
      success: true,
      data: {
        messageId,
        sentAt: new Date().toISOString(),
        recipient: data.to
      }
    };
  }

  private async sendBulkEmails(data: any): Promise<any> {
    console.log(`📮 Processing bulk email: ${data.type}`);
    
    // Simulate fetching recipients from database
    const recipients = this.getMockRecipients(data.type);
    
    console.log(`👥 Found ${recipients.length} recipients for ${data.type}`);
    
    let successCount = 0;
    let failureCount = 0;
    
    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < recipients.length; i += 10) {
      const batch = recipients.slice(i, i + 10);
      
      await Promise.all(
        batch.map(async (recipient) => {
          try {
            await this.sendSingleEmail({
              to: recipient.email,
              subject: this.getSubjectForType(data.type),
              body: this.getBodyForType(data.type, recipient)
            });
            successCount++;
          } catch (error) {
            console.error(`❌ Failed to send to ${recipient.email}:`, error);
            failureCount++;
          }
        })
      );
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`📊 Bulk email complete - Success: ${successCount}, Failed: ${failureCount}`);
    
    return {
      success: true,
      data: {
        type: data.type,
        totalRecipients: recipients.length,
        successCount,
        failureCount,
        completedAt: new Date().toISOString()
      }
    };
  }

  private async sendNotification(data: NotificationData): Promise<any> {
    console.log(`🔔 Sending ${data.type} notification to user: ${data.userId}`);
    
    // Simulate notification processing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const emailData = this.buildNotificationEmail(data);
    
    // Send the notification email
    await this.sendEmail(emailData);
    
    return {
      success: true,
      data: {
        userId: data.userId,
        type: data.type,
        sentAt: new Date().toISOString()
      }
    };
  }

  private async processWelcomeSequence(data: any): Promise<any> {
    console.log(`👋 Processing welcome sequence for user: ${data.userId}`);
    
    const welcomeEmails = [
      {
        delay: 0,
        subject: `Welcome to our platform, ${data.name}!`,
        template: 'welcome'
      },
      {
        delay: 24 * 60 * 60 * 1000, // 1 day
        subject: 'Getting started guide',
        template: 'getting-started'
      },
      {
        delay: 3 * 24 * 60 * 60 * 1000, // 3 days
        subject: 'Tips and tricks',
        template: 'tips'
      }
    ];
    
    // Schedule the welcome sequence
    for (const email of welcomeEmails) {
      setTimeout(async () => {
        await this.sendSingleEmail({
          to: data.email,
          subject: email.subject,
          body: this.getWelcomeEmailBody(email.template, data.name)
        });
      }, email.delay);
    }
    
    return {
      success: true,
      data: {
        userId: data.userId,
        emailsScheduled: welcomeEmails.length,
        sequenceStarted: new Date().toISOString()
      }
    };
  }

  // Helper methods
  private getPriorityLevel(priority: string): number {
    switch (priority) {
      case 'low': return 1;
      case 'normal': return 5;
      case 'high': return 9;
      default: return 5;
    }
  }

  private getNotificationPriority(type: string): number {
    switch (type) {
      case 'alert': return 9;
      case 'reminder': return 5;
      case 'welcome': return 7;
      default: return 3;
    }
  }

  private getMockRecipients(type: string): Array<{email: string, name: string}> {
    // Mock recipients for demonstration
    return [
      { email: 'user1@example.com', name: 'John Doe' },
      { email: 'user2@example.com', name: 'Jane Smith' },
      { email: 'user3@example.com', name: 'Bob Johnson' }
    ];
  }

  private getSubjectForType(type: string): string {
    switch (type) {
      case 'daily-digest': return 'Your Daily Digest';
      case 'newsletter': return 'Weekly Newsletter';
      default: return 'Update from our platform';
    }
  }

  private getBodyForType(type: string, recipient: any): string {
    return `Hello ${recipient.name},\n\nThis is your ${type}.\n\nBest regards,\nThe Team`;
  }

  private buildNotificationEmail(data: NotificationData): EmailData {
    const subjects = {
      welcome: 'Welcome to our platform!',
      reminder: 'Don\'t forget to complete your profile',
      alert: 'Important: Action required'
    };

    return {
      to: `user${data.userId}@example.com`, // In real app, fetch from database
      subject: subjects[data.type],
      body: `This is a ${data.type} notification.`
    };
  }

  private getWelcomeEmailBody(template: string, name: string): string {
    const templates = {
      welcome: `Hello ${name}! Welcome to our platform. We're excited to have you on board!`,
      'getting-started': `Hi ${name}! Here's how to get started with our platform...`,
      tips: `Hello ${name}! Here are some tips to make the most of our platform...`
    };

    return templates[template as keyof typeof templates] || 'Welcome!';
  }

  // Status methods
  getStatus() {
    return {
      isRunning: this.isRunning,
      nodeInfo: this.scheduler.getNodeInfo(),
      cronJobs: this.scheduler.getCronJobs()
    };
  }
}

// Example usage
async function main() {
  const emailService = new EmailService(process.env.RABBITMQ_URL);
  
  try {
    await emailService.start();
    
    // Send some test emails
    console.log('\n📧 Sending test emails...');
    
    await emailService.sendSingleEmail({
      to: 'test@example.com',
      subject: 'Test Email',
      body: 'This is a test email',
      priority: 'high'
    });
    
    await emailService.sendWelcomeSequence('user123', 'newuser@example.com', 'New User');
    
    await emailService.sendNotificationEmail({
      userId: 'user456',
      type: 'alert',
      data: { message: 'Your account needs attention' }
    });
    
    console.log('📊 Service status:', emailService.getStatus());
    
    // Let it run for a while
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await emailService.stop();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}

export { EmailService };