const LightClient = require('./light-client');
const Watcher = require('./watcher');
import axios from 'axios';
import dotenv from 'dotenv'; 
dotenv.config();

// Create the LightClient instance
const honest_watcher = new Watcher(process.env.WATCHER_HOSTNAME, process.env.WATCHER_PORT);
const lightClient = new LightClient(honest_watcher, process.env.CONTRACT_ADDRESS);

// Parameters
let inputTcp = 3; // in sec
let inputBlockNumber = 12345; 
let inputTargetState = 'exampleState'; 

const totalTargetStateValue = 1000;
let chosenDataProviders;
let totalStake;


run_lc();

async function sendRequest(dataProvider: any) {
    let response = await axios.get('http://' + dataProvider.getHostname() + ':' + dataProvider.getPort() + '/getData', {
            params: {
            blockNumber: inputBlockNumber,
            targetState: inputTargetState,
            },
        }
    );
    return response;
}

function forwardToWatcher(dataToForward: string, fromDataProviderAddress: string) {
    return axios.get('http://' + honest_watcher.getHostname() + ':' + honest_watcher.getPort() + '/checkData', {
        params: {
            data: dataToForward,
            dataProviderAddress: fromDataProviderAddress,
        },
    });
}

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

async function run_lc() {
    // Sync with the latest state of Ethereum and update data providers list
    if (inputBlockNumber > lightClient.latestBlockNumber) {
        try{
            let fullNode = new Watcher('https://sepolia.infura.io/v3/6b01dfaa24264b1fbbf09233b4e6380f', 0);
            await lightClient.bootstrap(fullNode);
        } catch (error) {
            console.error('Error in bootstrapping:', error);
            process.exit(1);
        }
    }
    // Choose the data providers to query
    [chosenDataProviders, totalStake] = await lightClient.chooseDataProviders(totalTargetStateValue);
    if (totalStake < totalTargetStateValue) {
        console.error('Not enough data providers to serve the request');
        process.exit(1);
    }
    // Send the request to all chosen data providers and get the signed root and proofs
    console.log("the block number to query: ", inputBlockNumber);
    let [blockHash, proof, signature] = ['','',''];
    let watcherResponse = Array(chosenDataProviders.length);
    for (let i = 0; i < chosenDataProviders.length; i++) {
        // Send the request to the data provider
        console.log('----------------------');
        console.log('Sending request to data provider:', chosenDataProviders[i].getHostname() + ":" + chosenDataProviders[i].getPort());
        let response = await sendRequest(chosenDataProviders[i]);
        console.log("Received from data provider: ", chosenDataProviders[i].getAddress())
        console.log("This data:", response.data);
        console.log('----------------------');
        // Forwards the response to the watchers
        try {
            watcherResponse[i] = forwardToWatcher(response.data, chosenDataProviders[i].getAddress());
        } catch (error) {
            console.error('Error received from watcher:', error);
        }
        
        let [_blockNumber, _blockHash, _proof, _signature] = response.data.split('?');
        // Check if responses from different data providers are consistent
        if (blockHash === '') {
            [blockHash, proof, signature] = [_blockHash, _proof, _signature];
        } else if (blockHash !== _blockHash || proof !== _proof) {
            console.error('Inconsistent response from data providers');
            process.exit(1);
        }
    }
    console.log('Watcher responses:', watcherResponse[0].data);
    // wait for Tcp seconds
    await delay(inputTcp * 1000);
    // Check if watcher responses have value (see if any alerts receieved)
    for (let i = 0; i < watcherResponse.length; i++) {
        if (watcherResponse[i].data != undefined) {
            if (lightClient.verifyAlert(watcherResponse[i].data)) {
                console.error('Alert received from a watcher');
                process.exit(1);
            }
        }
        console.log('No alert received from watcher for data provider https://' + chosenDataProviders[i].getHostname() + ":" + chosenDataProviders[i].getPort());
    }
    // Verify the signatures of all the data providers
    for (let i = 0; i < chosenDataProviders.length; i++) {
        if (!lightClient.verifySignature(inputBlockNumber, blockHash, proof, signature, chosenDataProviders[i].getAddress())) {
            console.error('Invalid signature from data provider:', chosenDataProviders[i].getAddress());
            process.exit(1);
        }
    }

    // Verify the proof of inclusion
    if (!lightClient.inclusionCheck(blockHash, [inputTargetState], [proof])) {
        console.error('Invalid inclusion proof');
        process.exit(1);
    }

}
