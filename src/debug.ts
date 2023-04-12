import chalk from 'chalk';
import debug from 'debug';

debug.formatArgs = function (args) {
  args[0] = `${chalk.magenta.bold('azure:')} ${args[0].slice(0, -1)}`;
  return args;
};

export default debug;
