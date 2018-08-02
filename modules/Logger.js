import isCallable from 'is-callable';
import { isNull } from 'util';

class Logger {
  constructor() {
    this.logger = console.log;
  }

  setTarget(fn) {
    if (!isCallable(fn) && !isNull(fn))
      throw TypeError('`fn` should be callable or `null`.');
    
    this.logger = fn;
  }

  log(msg) {
    if (isNull(this.logger)) return false;

    this.logger(msg);
    return true;
  }
}

export default Logger;