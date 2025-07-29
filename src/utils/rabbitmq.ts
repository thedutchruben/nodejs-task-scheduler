import * as amqp from 'amqplib';
import { ConnectionConfig } from '../types';

export class RabbitMQConnection {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private config: ConnectionConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.config.url, this.config.options);
      this.channel = await this.connection.createChannel();
      
      this.connection.on('error', this.handleConnectionError.bind(this));
      this.connection.on('close', this.handleConnectionClose.bind(this));
      
      this.reconnectAttempts = 0;
      console.log('Connected to RabbitMQ');
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      await this.handleReconnect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
      this.channel = null;
    }
    
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }

  getChannel(): amqp.Channel {
    if (!this.channel) {
      throw new Error('Not connected to RabbitMQ');
    }
    return this.channel;
  }

  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  private async handleConnectionError(error: Error): Promise<void> {
    console.error('RabbitMQ connection error:', error);
    await this.handleReconnect();
  }

  private async handleConnectionClose(): Promise<void> {
    console.log('RabbitMQ connection closed');
    this.connection = null;
    this.channel = null;
    await this.handleReconnect();
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
    await this.connect();
  }
}