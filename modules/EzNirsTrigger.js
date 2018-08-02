import { i } from '@ez-trigger/server';

class EzNirsTrigger {
  constructor(server) {
    this.server = server;
  }

  integrate() {
    this.server.commands.register('MK', ({ options, client }) => {
      this.broadcast(options, client);
    });

    this.server.commands.register('EX', ({ options, client }) => {
      this.broadcast(`EX ${options}`, client);
    });

    ['ST', 'EN', 'CL', 'ZR', 'DR', 'LK', 'UL', 'RC', 'ER', 'PING'] // prettier-ignore
      .forEach(cmd => {
        this.server.commands.register(cmd, ({ options, client }) => {
          this.broadcast(cmd, client);
        });
      });
  }

  stripe() {
    ['MK', 'ST', 'EN', 'CL', 'ZR', 'DR', 'LK', 'UL', 'EX', 'RC', 'ER', 'PING'] // prettier-ignore
      .forEach(cmd => {
        this.server.commands.deregister(cmd);
      });
  }

  broadcast(data, client) {
    this.server.logger.log(i(`Broadcasting ${data} to all TRG client.`));
    client.server.broadcast(data, 'TRG');
  }
}

export default EzNirsTrigger;
