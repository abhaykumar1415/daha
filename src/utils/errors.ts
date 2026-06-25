export class VitixError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'VitixError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigError extends VitixError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class DiscoveryError extends VitixError {
  constructor(message: string) {
    super(message, 'DISCOVERY_ERROR');
    this.name = 'DiscoveryError';
  }
}

export class ServerError extends VitixError {
  constructor(message: string) {
    super(message, 'SERVER_ERROR');
    this.name = 'ServerError';
  }
}

export class LighthouseError extends VitixError {
  constructor(message: string) {
    super(message, 'LIGHTHOUSE_ERROR');
    this.name = 'LighthouseError';
  }
}
