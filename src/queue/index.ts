import { QueueConfig, JobMessage } from '../types';
import { RabbitMQConnection } from '../utils/rabbitmq';

export class QueueManager {
  private connection: RabbitMQConnection;
  private queues: Map<string, QueueConfig> = new Map();

  constructor(connection: RabbitMQConnection) {
    this.connection = connection;
  }

  async createQueue(config: QueueConfig): Promise<void> {
    const channel = this.connection.getChannel();
    
    await channel.assertQueue(config.name, {
      durable: config.durable !== false,
      exclusive: config.exclusive || false,
      autoDelete: config.autoDelete || false,
      arguments: config.arguments || {}
    });

    this.queues.set(config.name, config);
    console.log(`Queue ${config.name} created/asserted`);
  }

  async deleteQueue(queueName: string): Promise<void> {
    const channel = this.connection.getChannel();
    
    await channel.deleteQueue(queueName);
    this.queues.delete(queueName);
    console.log(`Queue ${queueName} deleted`);
  }

  async purgeQueue(queueName: string): Promise<void> {
    const channel = this.connection.getChannel();
    
    await channel.purgeQueue(queueName);
    console.log(`Queue ${queueName} purged`);
  }

  async getQueueInfo(queueName: string): Promise<any> {
    const channel = this.connection.getChannel();
    
    try {
      const queueInfo = await channel.checkQueue(queueName);
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
    
    await channel.bindQueue(queueName, exchangeName, routingKey);
    console.log(`Queue ${queueName} bound to exchange ${exchangeName} with routing key: ${routingKey}`);
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
        'x-dead-letter-routing-key': 'job_queue'
      }
    });
  }

  getQueueConfig(queueName: string): QueueConfig | undefined {
    return this.queues.get(queueName);
  }
}