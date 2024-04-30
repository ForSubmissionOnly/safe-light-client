const { Web3 } = require('web3');
var fs = require('fs');

class DataProvider {
  private web3;
  private privateKey: any;
  private address: any;
  public hostname: string;
  public port: number;
  public stake: number;

  constructor(hostname:string, port: number, stake: number) {
    // Set up a connection to the Ethereum network through the running local full node
    // this.web3 = new Web3('http://localhost:8546');
    this.web3 = new Web3('https://sepolia.infura.io/v3/6b01dfaa24264b1fbbf09233b4e6380f');

    // Generate a new Ethereum account
    const { address, privateKey } = this.web3.eth.accounts.create();
    this.privateKey = privateKey;
    this.address = address;
    this.hostname = hostname;
    this.port = port;
    this.stake = stake;
    console.log("Private Key:", privateKey);
    console.log("Address:", address);
    console.log("This DP listens on", hostname, ":", port);
    console.log("Stake:", stake);
    console.log("------------------- Data Provider Created -------------------")
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

  async getData(blockNumber: number, targetState: string): Promise<Array<string>> {
    try {
      // get the block header if finalized
      const blockHeader: any = await this.getHeader(blockNumber);
      const blockHash: string = blockHeader['hash'];
      // create the proof of inclusion for the target state (call createProof)
      const proof: string = await this.createProof(blockHeader, targetState);
      // concatenate, hash and sign the header and the proof
      const hash = this.web3.utils.soliditySha3(this.web3.utils.encodePacked({value: blockNumber.toString() + '?' + blockHash + '?' + proof, type: 'string'}));
      console.log("The hash to sign:", hash);
      const signature: string = this.web3.eth.accounts.sign(hash, this.privateKey).signature;
      return [blockHash, proof, signature];
    } catch (error: any) {
      console.error('Error:', error.message);
      throw error;
    }
  }

  async createProof(blockHeader: any, targetState: string): Promise<string> {
    // create the proof of inclusion for the target state
    return "";
  }

  registerAsDataProvider() {
    // call the contract with tokens to join the system as a data provider
    fs.appendFile('.env', '\nDP_ADDRESS = ' + this.address, function (err: any) {
      if (err) throw err;
    });
    console.log("Registering the network");
  }

  exit() {
    // call the contract to request to exit the system 
    console.log("Exiting the network");
  }

  claimStake() {
    // call the contract to claim the stake after exiting
    console.log("Claiming stake");
  }
  
  private async getHeader(blockNumber: number): Promise<string> {
    try {
        // Retrieve block header
        const blockHeader = await this.web3.eth.getBlock(blockNumber);
        if (!blockHeader) {
            throw new Error(`Block with number ${blockNumber} not found`);
        }
        return blockHeader;
    } catch (error: any) {
        throw error;
    }
  }
}

module.exports = DataProvider;
