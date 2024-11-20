import * as child_process from "node:child_process";
import fs from "node:fs";
import process from "node:process";

import dotenv from "dotenv";

const UNICHAIN_CONFIGS_PATH = "./diffyscan/config_samples/unichain";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setupDiffyscan(
  newContractsCfg: any,
  govBridgeExecutor: string,
  deploymentConfig: any,
  remoteRpcUrl: string,
) {
  dotenv.populate(
    process.env,
    {
      // l2-steth
      ETHERSCAN_API_KEY_ETH: process.env.L1_EXPLORER_TOKEN,
      ETHERSCAN_API_KEY_OPT: process.env.L2_EXPLORER_TOKEN,
      RPC_UNI_SEPOLIA: remoteRpcUrl,
      // diffyscan
      ETHERSCAN_EXPLORER_TOKEN: process.env.L1_EXPLORER_TOKEN,
      OPTISCAN_EXPLORER_TOKEN: process.env.L2_EXPLORER_TOKEN,
      REMOTE_RPC_URL: remoteRpcUrl,
      LOCAL_RPC_URL: process.env.LOCAL_RPC_URL_DIFFYSCAN,
      GITHUB_API_TOKEN: process.env.GITHUB_API_TOKEN,
    },
    { override: true },
  );

  const ethereumConfig = deploymentConfig["ethereum"];
  const optimismConfig = deploymentConfig["optimism"];

  // ethereum
  const fileNameL1 = `${UNICHAIN_CONFIGS_PATH}/testnet/unichain_testnet_config_L1.json`;
  const optimismTestnetConfigL1 = JSON.parse(fs.readFileSync(fileNameL1, "utf8"));
  optimismTestnetConfigL1["contracts"] = {
    [newContractsCfg["ethereum"]["bridgeProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["ethereum"]["bridgeImplAddress"]]: "L1LidoTokensBridge",
    [newContractsCfg["ethereum"]["opStackTokenRatePusherImplAddress"]]: "OpStackTokenRatePusher",
  };
  optimismTestnetConfigL1["bytecode_comparison"]["constructor_args"] = {
    [newContractsCfg["ethereum"]["bridgeProxyAddress"]]: [
      newContractsCfg["ethereum"]["bridgeImplAddress"],
      ethereumConfig["tokenBridge"]["bridgeAdmin"],
      "0x",
    ],
    [newContractsCfg["ethereum"]["bridgeImplAddress"]]: [
      ethereumConfig["tokenBridge"]["messenger"],
      newContractsCfg["optimism"]["tokenBridgeProxyAddress"],
      ethereumConfig["tokenBridge"]["l1NonRebasableToken"],
      ethereumConfig["tokenBridge"]["l1RebasableToken"],
      newContractsCfg["optimism"]["tokenProxyAddress"],
      newContractsCfg["optimism"]["tokenRebasableProxyAddress"],
      ethereumConfig["tokenBridge"]["accountingOracle"],
    ],
    [newContractsCfg["ethereum"]["opStackTokenRatePusherImplAddress"]]: [
      ethereumConfig["opStackTokenRatePusher"]["messenger"],
      ethereumConfig["opStackTokenRatePusher"]["wstETH"],
      ethereumConfig["opStackTokenRatePusher"]["accountingOracle"],
      newContractsCfg["optimism"]["tokenRateOracleProxyAddress"],
      Number(ethereumConfig["opStackTokenRatePusher"]["l2GasLimitForPushingTokenRate"]),
    ],
  };
  fs.writeFileSync(
    "./artifacts/configs/optimism_testnet_config_L1.json",
    JSON.stringify(optimismTestnetConfigL1, null, 2),
  );

  // gov executor
  const fileNameL2Gov = `${UNICHAIN_CONFIGS_PATH}/testnet/unichain_testnet_config_L2_gov.json`;
  const optimismTestnetConfigL2Gov = JSON.parse(fs.readFileSync(fileNameL2Gov, "utf8"));
  optimismTestnetConfigL2Gov["contracts"] = {
    [govBridgeExecutor]: "OptimismBridgeExecutor",
  };
  optimismTestnetConfigL2Gov["bytecode_comparison"]["constructor_args"] = {
    [govBridgeExecutor]: [
      optimismConfig["govBridgeExecutor"]["ovmL2Messenger"],
      optimismConfig["govBridgeExecutor"]["ethereumGovExecutor"],
      Number(optimismConfig["govBridgeExecutor"]["delay"]),
      Number(optimismConfig["govBridgeExecutor"]["gracePeriod"]),
      Number(optimismConfig["govBridgeExecutor"]["minDelay"]),
      Number(optimismConfig["govBridgeExecutor"]["maxDelay"]),
      optimismConfig["govBridgeExecutor"]["ovmGuiardian"],
    ],
  };
  fs.writeFileSync(
    "./artifacts/configs/optimism_testnet_config_L2_gov.json",
    JSON.stringify(optimismTestnetConfigL2Gov, null, 2),
  );

  // optimism
  const fileNameL2 = `${UNICHAIN_CONFIGS_PATH}/testnet/unichain_testnet_config_L2.json`;
  const optimismTestnetConfigL2 = JSON.parse(fs.readFileSync(fileNameL2, "utf8"));
  optimismTestnetConfigL2["contracts"] = {
    [newContractsCfg["optimism"]["tokenRateOracleProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["optimism"]["tokenRateOracleImplAddress"]]: "TokenRateOracle",
    [newContractsCfg["optimism"]["tokenProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["optimism"]["tokenImplAddress"]]: "ERC20BridgedPermit",
    [newContractsCfg["optimism"]["tokenRebasableProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["optimism"]["tokenRebasableImplAddress"]]: "ERC20RebasableBridgedPermit",
    [newContractsCfg["optimism"]["tokenBridgeProxyAddress"]]: "OssifiableProxy",
    [newContractsCfg["optimism"]["tokenBridgeImplAddress"]]: "L2ERC20ExtendedTokensBridge",
  };
  optimismTestnetConfigL2["bytecode_comparison"]["constructor_args"] = {
    [newContractsCfg["optimism"]["tokenRateOracleProxyAddress"]]: [
      newContractsCfg["optimism"]["tokenRateOracleImplAddress"],
      govBridgeExecutor,
      "0x",
    ],
    [newContractsCfg["optimism"]["tokenRateOracleImplAddress"]]: [
      optimismConfig["tokenRateOracle"]["l2Messenger"],
      newContractsCfg["optimism"]["tokenBridgeProxyAddress"],
      newContractsCfg["ethereum"]["opStackTokenRatePusherImplAddress"],
      Number(optimismConfig["tokenRateOracle"]["tokenRateOutdatedDelay"]),
      Number(optimismConfig["tokenRateOracle"]["maxAllowedL2ToL1ClockLag"]),
      Number(optimismConfig["tokenRateOracle"]["maxAllowedTokenRateDeviationPerDayBp"]),
      Number(optimismConfig["tokenRateOracle"]["oldestRateAllowedInPauseTimeSpan"]),
      Number(optimismConfig["tokenRateOracle"]["minTimeBetweenTokenRateUpdates"]),
    ],
    [newContractsCfg["optimism"]["tokenProxyAddress"]]: [
      newContractsCfg["optimism"]["tokenImplAddress"],
      govBridgeExecutor,
      "0x",
    ],
    [newContractsCfg["optimism"]["tokenImplAddress"]]: [
      optimismConfig["nonRebasableToken"]["name"],
      optimismConfig["nonRebasableToken"]["symbol"],
      optimismConfig["nonRebasableToken"]["signingDomainVersion"],
      18,
      newContractsCfg["optimism"]["tokenBridgeProxyAddress"],
    ],
    [newContractsCfg["optimism"]["tokenRebasableProxyAddress"]]: [
      newContractsCfg["optimism"]["tokenRebasableImplAddress"],
      govBridgeExecutor,
      "0x",
    ],
    [newContractsCfg["optimism"]["tokenRebasableImplAddress"]]: [
      optimismConfig["rebasableToken"]["name"],
      optimismConfig["rebasableToken"]["symbol"],
      optimismConfig["rebasableToken"]["signingDomainVersion"],
      18,
      newContractsCfg["optimism"]["tokenProxyAddress"],
      newContractsCfg["optimism"]["tokenRateOracleProxyAddress"],
      newContractsCfg["optimism"]["tokenBridgeProxyAddress"],
    ],
    [newContractsCfg["optimism"]["tokenBridgeProxyAddress"]]: [
      newContractsCfg["optimism"]["tokenBridgeImplAddress"],
      govBridgeExecutor,
      "0x",
    ],
    [newContractsCfg["optimism"]["tokenBridgeImplAddress"]]: [
      optimismConfig["tokenBridge"]["messenger"],
      newContractsCfg["ethereum"]["tokenBridgeProxyAddress"],
      optimismConfig["tokenBridge"]["l1NonRebasableToken"],
      optimismConfig["tokenBridge"]["l1RebasableToken"],
      newContractsCfg["optimism"]["tokenProxyAddress"],
      newContractsCfg["optimism"]["tokenRebasableProxyAddress"],
    ],
  };

  fs.writeFileSync(
    "./artifacts/configs/optimism_testnet_config_L2.json",
    JSON.stringify(optimismTestnetConfigL2, null, 2),
  );
}

export function runDiffyscan(configName: string, withBinaryComparison: boolean) {
  const nodeCmd = "poetry";
  const nodeArgs = [
    "run",
    "diffyscan",
    `../artifacts/configs/${configName}`,
    "./hardhat_configs/sepolia_unichain_hardhat_config.js",
    "--yes",
  ];
  if (withBinaryComparison) {
    nodeArgs.push("--enable-binary-comparison");
  }
  console.log(`${nodeCmd} ${nodeArgs.join(" ")}`);
  child_process.spawnSync(nodeCmd, nodeArgs, {
    cwd: "./diffyscan",
    stdio: "inherit",
    env: process.env,
  });
}
