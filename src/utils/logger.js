const pc = require('picocolors');

const logger = {
  info: (message) => {
    console.log(pc.blue('ℹ ') + message);
  },
  success: (message) => {
    console.log(pc.green('✔ ') + pc.bold(message));
  },
  warn: (message) => {
    console.warn(pc.yellow('⚠ ') + pc.yellow(message));
  },
  error: (message, errorStack = '') => {
    console.error(pc.red('✖ ') + pc.red(pc.bold(message)));
    if (errorStack) {
      console.error(pc.dim(errorStack));
    }
  },
  step: (stage, message) => {
    console.log('\n' + pc.cyan(pc.bold(`[Stage ${stage}/4] `)) + pc.bold(message));
  },
  header: (title) => {
    const border = '='.repeat(title.length + 4);
    console.log('\n' + pc.magenta(pc.bold(border)));
    console.log(pc.magenta(pc.bold(`| ${title} |`)));
    console.log(pc.magenta(pc.bold(border)) + '\n');
  },
  divider: () => {
    console.log(pc.dim('--------------------------------------------------'));
  }
};

module.exports = logger;
