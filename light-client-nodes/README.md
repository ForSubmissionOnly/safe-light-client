# LightClient
Unconditionally safe light client

Light client sends a request to the data provider. The request contains a block number. the data provider replies with the signed block hash in that height.

## Note
- We only have 1 data provider so we didn't implement the gossip protocol for the p2p network of data providers. We assume that the light client is connected to the data provider (after bootstrapping, the light client goes to a website and extracts the public IP of the data provider it wants to connect to -- Here we do not have the problem of fake IPs since the light client can verify the identity of the data provider by verfiying its signature in the process of getting blockchain data from it).


## data provider
    Call register() and send stake to the smart contract
    Listen for requests
    when request received:
        if local block with request.blockNumber is finalized
            send back sign_pk{block hash + proof of inclusion for the target state}

## light client
    connect to a number of watchers
    create request
        choose request.Tcp locally based on needed security
    if request.blocknumber > latestBlockNumber + 1 {
        bootstrap{
            save latestActiveDataProviderSet (list of public keys) + their stake amounts
            save latestBlockNumber (latest finalized block from which we get the active dps)
        }
    }
    (*) choose data providers to query 
    (chooseDataProviders(totalTargetStateValue) and check if the returned totalStake >= totalTargetStateValue)
    send {blockNumber + target state} to the selected data providers

    listen on data providers to receive data
    when received data:
        forward it all to the connected watchers
        start timer for Tcp:
            on receiving alert from watchers:
                verifyAlert(alert)? discard the data and restart the protocol from (*): ignore the alert
            verifySignature(data provider signature) for all data providers
            if all verify == true and data from different data providers match:
                inclusionCheck(proof of inclusion) for all data providers 
                if all inclusionCheck == true:
                    accept the data
                else
                    discard data and restart from (*)
            else
                discard data and restart from (*)

