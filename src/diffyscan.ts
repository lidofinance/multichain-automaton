const dotenv = require('dotenv')
import * as child_process from 'node:child_process'
import process from "node:process";
import fs from "node:fs";
import { Submodules } from "./types";

export function setupDiffyscan(config: any, newContractsCfg: any) {
  dotenv.populate(process.env, {
    ETHERSCAN_EXPLORER_TOKEN: config["etherscanExplorerToken"],
    OPTISCAN_EXPLORER_TOKEN: config["optiscanExplorerToken"],
    REMOTE_RPC_URL: config["localRpcUrl"],
    LOCAL_RPC_URL: config["localRpcUrl"],
    GITHUB_API_TOKEN: config["githubApiToken"]
  }, { override: true });

  // copy 3 configs
  // change them
  // ethereum
  const fileNameL1 = './diffyscan/config_samples/optimism/testnet/optimism_testnet_config_L1.json';
  let optimismTestnetConfigL1 = JSON.parse(fs.readFileSync(fileNameL1, 'utf8'));
  optimismTestnetConfigL1["contracts"] = {
    [newContractsCfg["ethereum"]["bridgeProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["ethereum"]["bridgeImplAddress"]]: "L1LidoTokensBridge",
    [newContractsCfg["ethereum"]["opStackTokenRatePusherImplAddress"]]: "OpStackTokenRatePusher"
  };
  fs.writeFileSync('./artifacts/configs/optimism_testnet_config_L1.json', JSON.stringify(optimismTestnetConfigL1, null, 2));

  // optimism
  const fileNameL2 = './diffyscan/config_samples/optimism/testnet/optimism_testnet_config_L2.json';
  let optimismTestnetConfigL2 = JSON.parse(fs.readFileSync(fileNameL2, 'utf8'));
  optimismTestnetConfigL2["contracts"] = {
    [newContractsCfg["optimism"]["tokenRateOracleProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["optimism"]["tokenRateOracleImplAddress"]]: "TokenRateOracle",
    [newContractsCfg["optimism"]["tokenProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["optimism"]["tokenImplAddress"]]: "ERC20BridgedPermit",
    [newContractsCfg["optimism"]["tokenRebasableProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["optimism"]["tokenRebasableImplAddress"]]: "ERC20RebasableBridgedPermit",
    [newContractsCfg["optimism"]["tokenBridgeProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["optimism"]["tokenBridgeImplAddress"]]: "L2ERC20ExtendedTokensBridge"
  };
  fs.writeFileSync('./artifacts/configs/optimism_testnet_config_L2.json', JSON.stringify(optimismTestnetConfigL2, null, 2));
  fs.copyFileSync('./diffyscan/config_samples/optimism/testnet/optimism_testnet_config_L2_gov.json', './artifacts/configs/optimism_testnet_config_L2_gov.json');
}

export function runDiffyscan(configName: string) {
  const nodeCmd = 'diffyscan';
  const nodeArgs = [
    `../artifacts/configs/${configName}`
  ];
  child_process.spawnSync(nodeCmd, nodeArgs, {
    cwd: './diffyscan',
    stdio: 'inherit',
    env: process.env
  });
}
