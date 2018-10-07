'use strict';
import { v4 } from 'uuid';


import { parseCmd, Commands } from '@ez-trigger/core';
import { w, i } from '@ez-trigger/server';

class Client {
  constructor({ client, server, uuid = v4(), logger = console } = {}) {
    this.socket = client;
    this.ip = client.remoteAddress;
    this.server = server;
    this.destoried = false;
    this.props = {};
    this.uuid = uuid;
    this.shortUuid = uuid.split('-')[0];
    this.logger = logger;

    this.socket.on('data', async data => {
      const parseResult = parseCmd(data.toString());

      return Promise.all(
        parseResult.map(async ({ command, options }) => {
          if (
            server.forceVerify &
            !['TP', 'DC'].includes(command) &
            !this.props.type
          ) {
            this.send('!ENOTVERIFIED');

            return false;
          }

          if (!Object.keys(this.server.commands.commands).includes(command)) {
            this.logger.log(w(`Unknown command '${command} ${options}' from ${this.shortUuid}, ip: ${this.ip}.`)); // prettier-ignore
            this.send('!EUNKNOWNCMD');
            return false;
          }

          await this.server.commands.callCmd(command, {
            options: options,
            client: this
          });
        })
      );
    });

    this.socket.on('error', err => {
      if (err.code !== 'ECONNRESET') {
        throw err.message;
        return false;
      }

      // prettier-ignore
      this.logger.log(w(`Connection reseted, ip: ${this.ip}, uuid: ${this.shortUuid}, you may need to check the experiment client.`));
      this.server.removeClient(this.uuid);
    });

    this.socket.on('close', () => {
      this.logger.log(i(`${this.shortUuid} closed the connection, ip: ${this.ip}.`));

      this.server.removeClient(this.uuid);
    });

    this.socket.on('end', () => {
      // prettier-ignore
      this.logger.log(i(`${this.shortUuid} is going to disconnect, ip: ${this.ip}.`));

      this.server.removeClient(this.uuid);
    });

    setTimeout(() => this.send('WHO'), 100);
  }

  send(data) {
    try {
      this.socket.write(`${data}\r\n`);
    } catch (err) {
      if (err === 'write after end') {
        console.log('w Write after server disconnected.');
      } else {
        throw err;
      }
    }

    return true;
  }

  kill(msg) {
    this.socket.end(`${msg}\r\n`);
    this.socket.destroy();
  }

  setProps(newProps) {
    this.props = Object.assign(this.props, newProps);
  }
}

export default Client;
