const DataProvider = require('./data-provider');
import express from 'express';
import dotenv from 'dotenv'; 
dotenv.config();

// Create the DataProvider instance
const hostname = process.env.DP_HOSTNAME;
const port = process.env.DP_PORT;
const stake = process.env.DP_STAKE;
const dataProvider = new DataProvider(hostname, port, stake);

// Data provider signs up on the smart contract
dataProvider.registerAsDataProvider();

// Listen on data provider's port and wait for light client to send request, then, call getData
const app = express();
// Parse json body
app.use(express.json());
// Parse urlencoded body
app.use(express.urlencoded({ extended: false }));

app.listen(dataProvider.getPort(), () => console.log('Data provider is running on port %d', dataProvider.getPort()))


app.get('/getData', async (req: any, res: any) => {
    let {blockNumber, targetState} = req.query;
    console.log("Received query: ", blockNumber, targetState);
    try {
        // get the signed header and proof from the data provider
        const [blockHash, proof, signature] = await dataProvider.getData(blockNumber, targetState);
        res.send(blockNumber.toString() + '?' + blockHash + '?' + proof + '?' + signature);
    } catch (error) {
        res.statusCode = 500; // Internal Server Error
        res.end(); // End the response
    }
})