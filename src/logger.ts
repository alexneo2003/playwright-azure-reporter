import chalk from 'chalk';
import debug from 'debug';

class Logger {
  private rootNamespace: string;
  private namespace: string;
  private isLogging: boolean;

  constructor(isLogging: boolean) {
    this.rootNamespace = 'azure:pw';
    this.namespace = process.env.AZUREPWDEBUG === '1' ? 'azure:pw:*' : 'azure:pw:log,azure:pw:warn,azure:pw:error';
    this.isLogging = isLogging;

    if (this.isLogging && !this.isDisabled()) {
      debug.enable(this.namespace);
    }
  }

  private isDisabled() {
    return process.env.AZURE_PW_DISABLED === 'true';
  }

  // eslint-disable-next-line no-unused-vars
  private logMessage(level: string, message: string, colorFunc: (msg: string) => string) {
    if (!this.isDisabled()) {
      if (typeof message === 'object') {
        message = JSON.stringify(message, null, 2);
      }
      let enabled = false;
      if (['warn', 'error'].includes(level) || this.namespace === 'azure:pw:*') {
        enabled = debug.enabled(`${this.rootNamespace}:${level}`);
        debug.enable(`${this.rootNamespace}:${level}`);
        debug(this.rootNamespace).extend(level)(colorFunc(message));
      } else {
        debug(this.rootNamespace).extend(level)(colorFunc(message));
      }
      if (!enabled) {
        debug.disable();
      }
    }
  }

  log(message: string) {
    this.logMessage('log', message, chalk.white);
  }

  warn(message: string) {
    this.logMessage('warn', message, chalk.yellow);
  }

  error(message: string) {
    this.logMessage('error', message, chalk.red);
  }

  debug(message: any) {
    this.logMessage('debug', message, chalk.blue);
  }
}

export default Logger;
