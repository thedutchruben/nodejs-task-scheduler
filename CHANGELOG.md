# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of nodejs-task-scheduler
- Distributed task processing using RabbitMQ
- Cron job scheduling with timezone support
- Load balancing across multiple nodes
- Singleton and multi-instance worker support
- Automatic retry logic with exponential backoff
- Dead letter queue for failed jobs
- TypeScript support with full type definitions
- Comprehensive examples and documentation
- Docker support with Docker Compose setup
- GitHub Actions CI/CD pipeline
- Automatic package publishing to GitHub Packages

### Features
- `TaskScheduler` - Main API class for managing distributed tasks
- `JobScheduler` - Handles cron and direct job scheduling
- `JobWorker` - Processes jobs with configurable concurrency
- `QueueManager` - Manages RabbitMQ queues and exchanges
- `LoadBalancer` - Distributes jobs across available nodes
- `RabbitMQConnection` - Connection management with auto-reconnect

### Documentation
- Comprehensive README with usage examples
- API documentation
- Docker setup instructions
- Multi-node deployment examples
- Email service implementation example
- Basic usage examples

## [1.0.0] - TBD

### Added
- Initial stable release