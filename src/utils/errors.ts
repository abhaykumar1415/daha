export class DahaError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'DahaError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigError extends DahaError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class DiscoveryError extends DahaError {
  constructor(message: string) {
    super(message, 'DISCOVERY_ERROR');
    this.name = 'DiscoveryError';
  }
}

export class ServerError extends DahaError {
  constructor(message: string) {
    super(message, 'SERVER_ERROR');
    this.name = 'ServerError';
  }
}

export class LighthouseError extends DahaError {
  constructor(message: string) {
    super(message, 'LIGHTHOUSE_ERROR');
    this.name = 'LighthouseError';
  }
}
