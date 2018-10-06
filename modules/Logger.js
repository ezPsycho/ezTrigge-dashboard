import { isNull } from 'util';
import EventEmitter from 'events';

import isCallable from 'is-callable';

class Logger extends EventEmitter {
  constructor() {
    super();

    this.logger = console.log;
    this.timer = null;
  }

  setTarget(fn) {
    if (!isCallable(fn) && !isNull(fn))
      throw TypeError('`fn` should be callable or `null`.');
    
    this.logger = fn;
  }

  log(msg) {
    if (isNull(this.logger)) return false;
    if (!isNull(this.timer)) clearTimeout(this.timer);

    this.logger(msg);
    this.timer = setTimeout(() => {
      this.emit('log-updated');
      this.timer = null
    }, 100);
    return true;
  }
}

export default Logger;