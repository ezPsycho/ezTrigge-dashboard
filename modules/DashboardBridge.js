import { isNull } from 'util';
import process from 'process';

class DashboardBridge {
  constructor(screen) {
    this.screen = screen;
    this.server = null;
    this.userTable = null;
  };

  connectServer(server) {
    this.server = server;
  }

  setUserTable(element) {
    this.userTable = element;
  }

  updateUserTable() {
    if (isNull(this.userTable) || isNull(this.server)) return false;

    const result = [];

    this.server.client.forEach(client => {
      const type = client.type ? client.type : 'UNK';
      result.push([client.shortUuid, client.ip, type]);
    });

    this.userTable.setData({
      headers: ['UUID', 'IP', 'Group'],
      data: result
    });

    this.screen.render();
    return true;
  };
}

export default DashboardBridge;