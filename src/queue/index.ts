import { QueueConfig, JobMessage } from '../types';
import { RabbitMQConnection } from '../utils/rabbitmq';

export class QueueManager {
  private connection: RabbitMQConnection;
  private queues: Map<string, QueueConfig> = new Map();
  private queuePrefix: string;

  constructor(connection: RabbitMQConnection, queuePrefix: string = '') {
    this.connection = connection;
    this.queuePrefix = queuePrefix;
  }

  private applyPrefix(queueName: string): string {
    if (!this.queuePrefix) {
      return queueName;
    }
    return `${this.queuePrefix}${queueName}`;
  }

  async createQueue(config: QueueConfig): Promise<void> {
    const channel = this.connection.getChannel();
    const prefixedName = this.applyPrefix(config.name);
    
    await channel.assertQueue(prefixedName, {
      durable: config.durable !== false,
      exclusive: config.exclusive || false,
      autoDelete: config.autoDelete || false,
      arguments: config.arguments || {}
    });

    this.queues.set(config.name, config);
    console.log(`Queue ${prefixedName} created/asserted`);
  }

  async deleteQueue(queueName: string): Promise<void> {
    const channel = this.connection.getChannel();
    const prefixedName = this.applyPrefix(queueName);
    
    await channel.deleteQueue(prefixedName);
    this.queues.delete(queueName);
    console.log(`Queue ${prefixedName} deleted`);
  }

  async purgeQueue(queueName: string): Promise<void> {
    const channel = this.connection.getChannel();
    const prefixedName = this.applyPrefix(queueName);
    
    await channel.purgeQueue(prefixedName);
    console.log(`Queue ${prefixedName} purged`);
  }

  async getQueueInfo(queueName: string): Promise<any> {
    const channel = this.connection.getChannel();
    const prefixedName = this.applyPrefix(queueName);
    
    try {
      const queueInfo = await channel.checkQueue(prefixedName);
      return {
        queue: queueName,
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount
      };
    } catch (error) {
      throw new Error(`Queue ${queueName} does not exist`);
    }
  }

  async listQueues(): Promise<string[]> {
    return Array.from(this.queues.keys());
  }

  async getQueueLength(queueName: string): Promise<number> {
    const info = await this.getQueueInfo(queueName);
    return info.messageCount;
  }

  async bindQueueToExchange(
    queueName: string,
    exchangeName: string,
    routingKey: string = ''
  ): Promise<void> {
    const channel = this.connection.getChannel();
    const prefixedQueueName = this.applyPrefix(queueName);
    
    await channel.bindQueue(prefixedQueueName, exchangeName, routingKey);
    console.log(`Queue ${prefixedQueueName} bound to exchange ${exchangeName} with routing key: ${routingKey}`);
  }

  async createExchange(
    exchangeName: string,
    type: 'direct' | 'topic' | 'headers' | 'fanout' = 'direct',
    options: any = {}
  ): Promise<void> {
    const channel = this.connection.getChannel();
    
    await channel.assertExchange(exchangeName, type, {
      durable: options.durable !== false,
      autoDelete: options.autoDelete || false,
      arguments: options.arguments || {}
    });
    
    console.log(`Exchange ${exchangeName} of type ${type} created/asserted`);
  }

  async setupDeadLetterQueue(): Promise<void> {
    await this.createQueue({
      name: 'dead_letter_queue',
      durable: true
    });
  }

  async setupDelayedJobQueue(): Promise<void> {
    await this.createExchange('delayed_jobs', 'direct');
    
    await this.createQueue({
      name: 'delayed_job_queue',
      durable: true,
      arguments: {
        'x-message-ttl': 60000,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': this.applyPrefix('job_queue')
      }
    });
  }

  getQueueConfig(queueName: string): QueueConfig | undefined {
    return this.queues.get(queueName);
  }
}