const dotenv = require('dotenv')
import * as child_process from 'node:child_process'
import process from "node:process";
import fs from "node:fs";
import { Submodules } from "./types"; 

export function setupDiffyscan(newContractsCfg: any, remoteRpcUrl: string) {
  dotenv.populate(process.env, {
    ETHERSCAN_EXPLORER_TOKEN: process.env.L1_EXPLORER_TOKEN,
    OPTISCAN_EXPLORER_TOKEN: process.env.L2_EXPLORER_TOKEN,
    REMOTE_RPC_URL: remoteRpcUrl,
    LOCAL_RPC_URL: process.env.LOCAL_RPC_URL_DIFFYSCAN,
    GITHUB_API_TOKEN: process.env.GITHUB_API_TOKEN
  }, { override: true });

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
  const nodeCmd = 'poetry';
  const nodeArgs = [
    'run',
    'diffyscan',
    `../artifacts/configs/${configName}`,
    './hardhat_configs/sepolia_optimism_hardhat_config.js',
    '--enable-binary-comparison'
  ];
  child_process.spawnSync(nodeCmd, nodeArgs, {
    cwd: './diffyscan',
    stdio: 'inherit',
    env: process.env
  });
}
