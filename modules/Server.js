'use strict';

import net from 'net';
import process from 'process';
import EventEmitter from 'events';
import { isNull } from 'util';

import { Commands, Records } from '@ez-trigger/core';
import { e, w, i, ClientCollection } from '@ez-trigger/server';

import { recordExportPath } from './config';
import Client from './Client';

class TriggerServer extends EventEmitter {
  constructor({
    ip,
    port,
    clientTypes = { __ANY__: '*' },
    forceVerify = null,
    logger = console
  } = {}) {
    super();

    this.ip = ip;
    this.port = port;

    this.server = net.createServer();
    this.restartTimeout = false;
    this.commands = new Commands(this);
    this.records = new Records(recordExportPath);
    this.clients = new ClientCollection(false);
    this.clientTypes = clientTypes;
    this.clientsByType = new ClientCollection(true);
    this.clientsById = new ClientCollection(false);
    this.logger = logger;
    this.paths = {
      recordExport: recordExportPath
    };

    this.debugCommands = ['ST', 'EN'];

    this.forceVerify = isNull(forceVerify)
      ? !this.clientTypes.__ANY__
      : forceVerify;

    this.server.on('connection', socket => {
      let newClient = new Client({ client: socket, server: this, logger });

      this.clients.registerClient(newClient, newClient.uuid);

      // prettier-ignore
      this.logger.log(i(`${newClient.shortUuid} connected, ip: ${socket.remoteAddress}.`));

      this.updateUserTable();
    });

    this.server.on('error', this.handleServerError);
    this.commands.register('TP', this.handleType, true);
    this.commands.register('ID', this.handleId, true);
    this.commands.register('DC', this.handleDisconnect, true);
    this.commands.register('UUID', this.handleUuid, true);
  }

  removeClient(id) {
    if (!this.clients.hasSet(id)) return false;

    const client = this.clients.getSet(id);

    if (client.props.id) {
      this.clientsById.deregisterClient(client.props.id);
    }
    
    if (client.props.type) {
      this.clientsByType.deregisterClient(client, client.props.type);
    }

    this.clients.deregisterClient(id);

    this.updateUserTable();
    return true;
  }

  handleServerError(err) {
    switch (err.code) {
      case 'EADDRINUSE':
        this.logger.log(w('End point in use, will retry in 1 second...'));

        this.server.close();
        this.restartTimeout = setTimeout(() => {
          this.start();
        }, 1000);
        break;

      case 'EACCES':
        this.logger.log(e('Invalid port/address, check your config.'));
        process.exit(1);
        break;

      default:
        throw err;
    }
  }

  async changeEndPoint(ip, port) {
    let listening;

    listening = this.server.listening;
    clearTimeout(this.restartTimeout);

    this.ip = ip;
    this.port = port;

    if (listening) {
      await this.stop();
      await this.start();
    }

    return this;
  }

  async start() {
    try {
      this.session = await new Promise((resolve, reject) => {
        this.server.listen(this.port, this.ip, () => resolve());
      });

      // prettier-ignore
      this.logger.log(i(`Server initialized at ${this.ip}:${this.port} ${this.forceVerify ? 'in force verify mode' : ''}.`));
    } catch (err) {
      throw err;
    }

    return this.session;
  }

  async stop() {
    if (this.server.listening) this.server.close();

    return this.session;
  }

  async broadcast(message, type = '*') {
    this.clientsByType.broadcast(message, type);
  }

  async send(message, id) {
    if (id && this.clientsById.hasSet(id)) {
      this.clientsById.getSet(id).send(message);
    } else {
      this.clients
        .getClients()
        .filter(client => client.uuid === 'id' || client.shortUuid === 'id')
        .map(client => client.send(message));
    }
  }

  async handleType({ options, client }) {
    const type = options;
    const clientType = client.server.clientTypes;

    if (clientType.__ANY__) return false;

    if (client.props.type) {
      client.send('!EREPEATDECLARE');
      client.logger.log(w(`Refused repeated client type declaration. id: ${client.shortUuid}, ip: ${client.ip}.`)); // prettier-ignore

      return false;
    }

    if (Object.keys(clientType).includes(type)) {
      client.send('VERIFIED');
      client.setProps({ type: type });

      client.server.clientsByType.registerClient(client, type);

      // prettier-ignore
      client.logger.log(i(`${client.shortUuid} was verified as ${clientType[type]}, ip: ${client.ip}.`));
      client.server.updateUserTable();
    } else {
      // prettier-ignore
      client.logger.log(w(`${client.shortUuid} was not verified, will kill it, ip: ${client.ip}.`));

      client.kill('!EWRONGTYPE');
    }
  }

  async handleId({ options, client }) {
    const id = options;

    if (client.props.id) {
      delete client.server.clientsById.deregisterClient(client.props.id);
      client.logger.log(
        i(`${client.shortUuid} deregister its original id, ip: ${client.ip}.`)
      );
    }

    if (!client.server.clientsById.hasSet(id)) {
      client.send('REGISTERED');
      client.setProps({ id: id });

      client.server.clientsById.registerClient(client, id);

      // prettier-ignore
      client.logger.log(i(`${client.shortUuid} registered a ID as ${id}, ip: ${client.ip}.`));
      client.server.updateUserTable();
    } else {
      // prettier-ignore
      client.logger.log(w(`${client.shortUuid} registered a duplicate ID, will kill it, ip: ${client.ip}.`));

      client.kill('!EDUPLICATEID');
    }
  }

  async handleDisconnect({ options, client }) {
    client.kill('!BYE');
  }

  handleUuid({ options, client }) {
    newClient.send(`UUID ${client.uuid}`);
  }

  updateUserTable() {
    this.emit('client-updated', this.clients);
  }

  registerClientTypes(options) {
    this.clientTypes = Object.assign(this.clientTypes, options);
    this.emit('type-updated', this.clientTypes);
  }

  deregisterClientTypes(types) {
    const typeList = Array.isArray(types) ? types : [types];

    typeList.forEach(type => delete this.clientTypes[type]);
    this.emit('type-updated', this.clientTypes);
  }

  registerDebugCommand(commands) {
    this.debugCommands = this.debugCommands.concat(commands);
    this.emit('debug-command-updated', this.debugCommands);
  }

  deregisterDebugCommand(commands) {
    const commandList = Array.isArray(commands) ? commands : [commands];

    commandList.forEach(command => {
      this.debugCommands.splice(this.debugCommands.indexOf(command));
    });

    this.emit('debug-command-updated', this.debugCommands);
  }
}

export default TriggerServer;
