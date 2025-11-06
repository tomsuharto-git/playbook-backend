/**
 * Centralized Winston Logger
 *
 * Provides structured logging with consistent formatting across the application.
 * Replaces console.log/error statements with proper log levels and metadata.
 *
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info('Server started', { port: 3001 });
 *   logger.error('Database error', { error: err.message });
 */

const winston = require('winston');
const config = require('../config');

// Define log format with timestamp and colors for console
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format with colors for local development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // Add metadata if present (excluding common noise)
    const metaKeys = Object.keys(meta).filter(key =>
      key !== 'timestamp' && key !== 'level' && key !== 'message'
    );

    if (metaKeys.length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }

    return msg;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.app.isDevelopment ? 'debug' : 'info',
  format: logFormat,
  defaultMeta: {
    service: 'playbook-backend',
    environment: config.app.env
  },
  transports: [
    // Console transport for Railway logs
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});

// Add file transports in production for persistent logs (optional)
if (config.app.isProduction) {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error'
  }));
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log'
  }));
}

// Create child loggers for different modules
logger.job = (jobName) => logger.child({ module: 'job', job: jobName });
logger.service = (serviceName) => logger.child({ module: 'service', service: serviceName });
logger.route = (routeName) => logger.child({ module: 'route', route: routeName });

module.exports = logger;
