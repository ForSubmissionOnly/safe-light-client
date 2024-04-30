import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";
import "hardhat-deploy-tenderly";
import "hardhat-contract-sizer";

dotenv.config();

const config: HardhatUserConfig = {
    solidity: {        
      compilers: [
          {                
            version: "0.8.24",
              settings: {                    
                optimizer: {
                  enabled: true,                        
                  runs: 20,
                },                
              },
          }        
        ],
    },    
    networks: {          
        hardhat: {
          allowUnlimitedContractSize: true,        
        },
        sepolia: {
          url: "https://sepolia.infura.io/v3/6b01dfaa24264b1fbbf09233b4e6380f",
          accounts: [process.env.PRIVATE_KEY ?? ""]
        },
    },
  };
export default config;