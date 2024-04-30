const { Web3 } = require('web3');
export default class Watcher {
    private web3;
    private address: any;
    public hostname: string;
    public port: number;

    constructor(hostname:string, port: number) {
        // Set up a connection to the Ethereum network
        // this.web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8546'));
        this.web3 = new Web3('https://sepolia.infura.io/v3/6b01dfaa24264b1fbbf09233b4e6380f');

        // Generate a new Ethereum account
        const { address, privateKey } = this.web3.eth.accounts.create();
        this.address = address;
        this.hostname = hostname;
        this.port = port;
    }

    getHostname() {
        return this.hostname;
      }
    
    getPort() {
    return this.port;
    }

    async getBlockHash(blockNumber: number): Promise<string> {
        try {
          const block: any = await this.web3.eth.getBlock(blockNumber);
          const blockHash: string = block['hash'];
        return blockHash;
        } catch (error: any) {
          console.error('Error:', error.message);
          throw error;
        }
    }
}

module.exports = Watcher;