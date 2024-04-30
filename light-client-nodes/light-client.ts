const DataProviderInfo = require('./data-provider-info');
const { Web3 } = require('web3');
import * as http from 'http';
import Watcher from './watcher';
import dotenv from 'dotenv'; 
dotenv.config();

export default class LightClient {
    private privateKey: any;
    private address: any;
    private latestBlockNumber: number = 0;
    private dataProvidersInfo: InstanceType<typeof DataProviderInfo>[] = [];
    private watchers: Watcher[];
    private contractAddress: string;

    constructor(watchers: Watcher[], contractAddress: string) {
        this.watchers = watchers;
        this.contractAddress = contractAddress;
        // connect to watchers
    }

    getLatestBlockNumber() {
        return this.latestBlockNumber;
    }

    updateLatestBlockNumber(latestBlockNumber: number) {
        if (latestBlockNumber > this.latestBlockNumber) {
            this.latestBlockNumber = latestBlockNumber;
        }
    }

    verifySignature(blockNumber: number, txRoot: string, proof: string, signature: string, dataProviderAddress: string) {
        const web3 = new Web3("https://sepolia.infura.io/v3/6b01dfaa24264b1fbbf09233b4e6380f");
        const hash = web3.utils.soliditySha3(web3.utils.encodePacked({value: blockNumber.toString() + '?' + txRoot + '?' + proof, type: 'string'}));
        if (web3.eth.accounts.recover(hash, signature) != dataProviderAddress) {
            return false;
        }
        return true;
    }

    createRequest(_chosenDataProvider: InstanceType<typeof DataProviderInfo>, _blockNumber: number, _targetState: string) {
        // Create the request
        const reqData = JSON.stringify({
            blockNumber: _blockNumber,
            targetState: _targetState
        });

        const options: http.RequestOptions = {
            hostname: _chosenDataProvider.getHostname(),
            port: _chosenDataProvider.getPort(),
            path: '/getData' + '?' + reqData,
            method: 'GET'
        };

        return options;
    }

    async chooseDataProviders(totalTargetStateValue: number) {
        // find the data providers with total stake of at least totalTargetStateValue
        const chosenDataProviders: InstanceType<typeof DataProviderInfo>[] = [];
        let totalStake = 0;
        for (let i = 0; i < this.dataProvidersInfo.length; i++) {
            if (totalStake >= totalTargetStateValue) {
                break;
            }
            if (this.dataProvidersInfo[i].getStake() > 0) {
                chosenDataProviders.push(this.dataProvidersInfo[i]);
                totalStake += this.dataProvidersInfo[i].getStake();
            }
        }
        return [chosenDataProviders, totalStake];
    }

    async verifyAlert(alert: string) {
        // verify the alert
        return true;
    }

    async bootstrap(fullNode: Watcher): Promise<void> { // we use the honest watcher as the honest full node for the protocol we use for heavy check
        let latestBlock = await this.heavyCheck(fullNode);
        this.updateLatestBlockNumber(latestBlock['number']);
        console.log('Latest block tx root:', latestBlock['transactionsRoot']);
        let dataProvidersInfoProof = await this.getStateWithProof(fullNode, latestBlock, this.contractAddress);
        if (!this.inclusionCheck(latestBlock['transactionsRoot'], dataProvidersInfoProof.storageProof, dataProvidersInfoProof.accountProof)) {
            throw new Error('Invalid inclusion proof. Change Full node.');
        }
        // extract dataProviderInfo for all DPs from contractStorageProof based on contract
        // Data providers should be active(true) and not leaving(flase)
        const dataProviderInfo = new DataProviderInfo(process.env.DP_HOSTNAME, process.env.DP_PORT, process.env.DP_STAKE, process.env.DP_ADDRESS);

        // update the data provider list
        this.dataProvidersInfo.push(dataProviderInfo);
    }

    // get the latest header of the blockchain using a fully secure but heavy computation method
    async heavyCheck(fullNode: Watcher): Promise<any> {
        const web3 = new Web3(fullNode.getHostname());
        let latestBlockNumber: number = await web3.eth.getBlockNumber('latest');
        latestBlockNumber = latestBlockNumber-1;
        console.log('Latest block number:', latestBlockNumber);
        let latestBlock = await web3.eth.getBlock(latestBlockNumber);
        return latestBlock;
    }

    // This function gets the contact storage data and its proof from a full node
    async getStateWithProof(fullNode: Watcher, latestBlock: any, contractAddress: string) {
        const web3 = new Web3(fullNode.getHostname());
        // read the length of the data providers list from the contract storage
        let lengthProof = await web3.eth.getProof(contractAddress, [this.numberToHexWithFixedSize(0,64)], latestBlock['number']);
        if (!this.inclusionCheck(latestBlock['transactionsRoot'], lengthProof.storageProof, lengthProof.accountProof)) {
            throw new Error('Invalid inclusion proof. Change Full node.');
        }
        // read the data providers list from the contract storage
        let dataproviderListIndices = [...Array(lengthProof.storageProof[0].value).keys()].map(v=>this.numberToHexWithFixedSize(v+1, 64));
        let dataProvidersInfoProof = await web3.eth.getProof(contractAddress, dataproviderListIndices, latestBlock['number']);
        return dataProvidersInfoProof;
    }

    /**
     * Checks if the Merkle proof is valid for each value in the storage array.
     * 
     * @param txRoot - The root of the Merkle tree that we trust (got from heavy check).
     * @param storage - An array of values to check against the Merkle proof.
     * @param MerkleProof - An array of Merkle proof nodes for all values in the storage array.
     * @returns A boolean indicating whether the Merkle proof is valid for all values in the storage array.
     */
    inclusionCheck(txRoot: string, storage: any[], MerkleProof: string[]) {
        // First check if Merkle proof root matches the txRoot we trust

        // Second, hash the values in storage array and check if they match the Merkle Nodes

        // Finally, check the intermediate nodes in Merkle proof and verify it
        
        return true;
    }

    addWatchers(watchers: Watcher[]) {
        // add watchers to the list of watchers
        for (let i = 0; i < watchers.length; i++) {
            this.watchers.push(watchers[i]);
        }
    }

    removeWatchers(watchers: Watcher[]) {
        // remove watchers from the list
        for (let i = 0; i < watchers.length; i++) {
            this.watchers = this.watchers.filter(watcher => watcher !== watchers[i]);
        }
    }

    private numberToHexWithFixedSize(number: number, size: number): string {
        // Convert the number to a hexadecimal string
        let hexString: string = number.toString(16);
    
        // Pad the string with zeros to reach the desired size
        while (hexString.length < size) {
            hexString = "0" + hexString;
        }
    
        // Return the padded hexadecimal string
        return '0x' + hexString;
    }

}

module.exports = LightClient;
