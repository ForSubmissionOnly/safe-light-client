const Watcher = require('./watcher');
const { Web3 } = require('web3');
const DataProviderInfo = require('./data-provider-info');
import express from 'express';
import dotenv from 'dotenv'; 
dotenv.config();

// Create the Watcher instance
const hostname = process.env.WATCHER_HOSTNAME;
const port = process.env.WATCHER_PORT;
const watcher = new Watcher(hostname, port);
// const web3 = new Web3('http://localhost:8546');
const web3 = new Web3('https://sepolia.infura.io/v3/6b01dfaa24264b1fbbf09233b4e6380f');

// Listen on watcher's port and wait for light client to send data
const app = express();
// Parse json body
app.use(express.json());
// Parse urlencoded body
app.use(express.urlencoded({ extended: false }));

app.listen(watcher.getPort(), () => console.log('Watcher is running on port %d', watcher.getPort()))

app.get('/checkData', async (req: any, res: any) => {
    let {data, dataProviderAddress} = req.query;
    console.log("Received data to check: ", data, dataProviderAddress);
    try {
        let [blockNumber, blockHash, proof, signature] = data.split('?');
        // Check if the signature is for the data provider
        const hash = web3.utils.soliditySha3(web3.utils.encodePacked({value: blockNumber.toString() + '?' + blockHash + '?' + proof, type: 'string'}));
        if (web3.eth.accounts.recover(hash, signature) != dataProviderAddress) {
            throw new Error('Invalid data provider signature');
        }

        // Check if the data provider address exists in the available data provider set
        const dataProviderInfo = new DataProviderInfo(process.env.DP_HOSTNAME, process.env.DP_PORT, process.env.DP_STAKE, process.env.DP_ADDRESS);
        let dataProvidersSet: InstanceType<typeof DataProviderInfo>[] = [];
        dataProvidersSet.push(dataProviderInfo);
        if (dataProvidersSet.filter(dp => dp.getAddress() == dataProviderAddress).length == 0) {
            throw new Error('Data provider not in the set');
        }

        // Check if the block with the block number in data, has same blockHash as provided
        let correctBlockHash = await watcher.getBlockHash(blockNumber);
        if (blockHash != correctBlockHash) {
            let slashReceipt = await slashDataProvider(dataProviderAddress, blockNumber, blockHash, signature);
            let alert = createAlert(blockNumber, slashReceipt);
            // Send alert to the light client
            res.send(alert);
        } else {
            res.send('Data is correct');
        }
    } catch (error) {
        console.error('Error in checkData:', error);
        res.statusCode = 500; // Internal Server Error
        res.end(); // End the response
    }
})

async function slashDataProvider(dataProviderAddress: string, blockNumber: number, txRoot: string, signature: string) {
    // call the contract
}

function createAlert(blockNumber: number, slashReceipt: any) {
    // Get the proof of inclusion for the transaction slashing the data provider
    // and return it along with the block number it is included in
}
