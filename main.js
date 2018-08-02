import config from './config';
import TriggerServer from './modules/Server';
import EzNirsTrigger from './modules/EzNirsTrigger';

const clientTypes = {
  TRG: 'ezNirsTrigger client',
  EXP: 'experiment client',
  DYE: 'dynamic scrolling client',
  VP: 'video player client',
  RST: 'resting state client',
  ADO: 'ezAutoDo client'
};

const server = new TriggerServer({
  ip: config.ip,
  port: config.port,
  clientTypes
});

const triggerSystem = new EzNirsTrigger(server);

(async () => {
  triggerSystem.integrate();

  await server.start();
})();
