class DataProviderInfo {
  private address: any;
  public hostname: string;
  public port: number;
  public stake: number;

  constructor(hostname:string, port: number, stake: number, address: any) {
    this.address = address;
    this.hostname = hostname;
    this.port = port;
    this.stake = stake;
  }

  getHostname() {
    return this.hostname;
  }

  getPort() {
    return this.port;
  }

  getStake() {
    return this.stake;
  }

  getAddress() {
    return this.address;
  }
}

module.exports = DataProviderInfo;
