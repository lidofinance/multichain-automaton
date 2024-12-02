const dotenv = require('dotenv');
import * as child_process from 'node:child_process'
import process from "node:process";
import { NetworkType } from './types';
import { readFileSync, cpSync } from "node:fs";

export function runDeployScript(throwOnFail: boolean = false) {
  const nodeCmd = 'ts-node';
  const nodeArgs = [
    '--files',
    './scripts/optimism/deploy-automaton.ts'
  ];
  console.debug(`\nRun deploy script: ${nodeCmd} ${nodeArgs.join(' ')}`)
  const result = child_process.spawnSync(nodeCmd, nodeArgs, {
    cwd: './lido-l2-with-steth',
    stdio: 'inherit',
    env: process.env
  });

  if (throwOnFail && result.status !== 0) {
    throw new Error(`Deploy script failed with exit code ${result.status}`);
  }
}

export function populateDeployScriptEnvs(deploymentConfig: any, govBridgeExecutor: string, networkType: NetworkType) {

  function formattedArray(configArray: Array<string>) {
    return `[${configArray.map((ts: string) => `"${ts.toString()}"`)}]`;
  }
  const ethereumConfig = deploymentConfig["ethereum"];
  const optimismConfig = deploymentConfig["optimism"];

  dotenv.populate(process.env, {
    ETH_DEPLOYER_PRIVATE_KEY: process.env.L1_DEPLOYER_PRIVATE_KEY,
    OPT_DEPLOYER_PRIVATE_KEY: process.env.L2_DEPLOYER_PRIVATE_KEY,

    RPC_ETH_SEPOLIA: process.env.L1_REMOTE_RPC_URL,
    RPC_OPT_SEPOLIA: process.env.L2_REMOTE_RPC_URL,
    NETWORK: deploymentConfig["network"],
    FORKING: networkType == NetworkType.Forked ? true : false,

    // L1
    L1_PROXY_ADMIN: ethereumConfig["proxyAdmin"],

    ACCOUNTING_ORACLE: ethereumConfig["tokenBridge"]["accountingOracle"],
    L2_GAS_LIMIT_FOR_PUSHING_TOKEN_RATE: deploymentConfig["ethereum"]["opStackTokenRatePusher"]["l2GasLimitForPushingTokenRate"],

    L1_BRIDGE_ADMIN: ethereumConfig["tokenBridge"]["bridgeAdmin"],
    L1_CROSSDOMAIN_MESSENGER: ethereumConfig["tokenBridge"]["messenger"],
    L1_NON_REBASABLE_TOKEN: ethereumConfig["tokenBridge"]["l1NonRebasableToken"],
    L1_REBASABLE_TOKEN: ethereumConfig["tokenBridge"]["l1RebasableToken"],
    L1_DEPOSITS_ENABLED: ethereumConfig["tokenBridge"]["depositsEnabled"],
    L1_WITHDRAWALS_ENABLED: ethereumConfig["tokenBridge"]["withdrawalsEnabled"],
    L1_DEPOSITS_ENABLERS: formattedArray(ethereumConfig["tokenBridge"]["depositsEnablers"]),
    L1_DEPOSITS_DISABLERS: formattedArray(ethereumConfig["tokenBridge"]["depositsDisablers"]),
    L1_WITHDRAWALS_ENABLERS: formattedArray(ethereumConfig["tokenBridge"]["withdrawalsEnablers"]),
    L1_WITHDRAWALS_DISABLERS: formattedArray(ethereumConfig["tokenBridge"]["withdrawalsDisablers"]),

    // L2
    L2_PROXY_ADMIN: govBridgeExecutor,

    TOKEN_RATE_ORACLE_PROXY_ADMIN: govBridgeExecutor,
    TOKEN_RATE_ORACLE_ADMIN: govBridgeExecutor,
    TOKEN_RATE_UPDATE_ENABLED: optimismConfig["tokenRateOracle"]["updateEnabled"],
    TOKEN_RATE_UPDATE_ENABLERS: formattedArray([...optimismConfig["tokenRateOracle"]["updateEnablers"], govBridgeExecutor]),
    TOKEN_RATE_UPDATE_DISABLERS: formattedArray([...optimismConfig["tokenRateOracle"]["updateDisablers"], govBridgeExecutor]),
    TOKEN_RATE_OUTDATED_DELAY: optimismConfig["tokenRateOracle"]["tokenRateOutdatedDelay"],
    MAX_ALLOWED_L2_TO_L1_CLOCK_LAG: optimismConfig["tokenRateOracle"]["maxAllowedL2ToL1ClockLag"],
    MAX_ALLOWED_TOKEN_RATE_DEVIATION_PER_DAY_BP: optimismConfig["tokenRateOracle"]["maxAllowedTokenRateDeviationPerDayBp"],
    OLDEST_RATE_ALLOWED_IN_PAUSE_TIME_SPAN: optimismConfig["tokenRateOracle"]["oldestRateAllowedInPauseTimeSpan"],
    MIN_TIME_BETWEEN_TOKEN_RATE_UPDATES: optimismConfig["tokenRateOracle"]["minTimeBetweenTokenRateUpdates"],
    INITIAL_TOKEN_RATE_VALUE: optimismConfig["tokenRateOracle"]["initialTokenRateValue"],
    INITIAL_TOKEN_RATE_L1_TIMESTAMP: optimismConfig["tokenRateOracle"]["initialTokenRateL1Timestamp"],

    L2_TOKEN_NON_REBASABLE_NAME: optimismConfig["nonRebasableToken"]["name"],
    L2_TOKEN_NON_REBASABLE_SYMBOL: optimismConfig["nonRebasableToken"]["symbol"],
    L2_TOKEN_NON_REBASABLE_SIGNING_DOMAIN_VERSION: optimismConfig["nonRebasableToken"]["signingDomainVersion"],

    L2_TOKEN_REBASABLE_NAME: optimismConfig["rebasableToken"]["name"],
    L2_TOKEN_REBASABLE_SYMBOL: optimismConfig["rebasableToken"]["symbol"],
    L2_TOKEN_REBASABLE_SIGNING_DOMAIN_VERSION: optimismConfig["rebasableToken"]["signingDomainVersion"],

    L2_BRIDGE_ADMIN: govBridgeExecutor,
    L2_DEPOSITS_ENABLED: optimismConfig["tokenBridge"]["depositsEnabled"],
    L2_WITHDRAWALS_ENABLED: optimismConfig["tokenBridge"]["withdrawalsEnabled"],
    L2_DEPOSITS_ENABLERS: formattedArray([...optimismConfig["tokenBridge"]["depositsEnablers"], govBridgeExecutor]),
    L2_DEPOSITS_DISABLERS: formattedArray([...optimismConfig["tokenBridge"]["depositsDisablers"], govBridgeExecutor]),
    L2_WITHDRAWALS_ENABLERS: formattedArray([...optimismConfig["tokenBridge"]["withdrawalsEnablers"], govBridgeExecutor]),
    L2_WITHDRAWALS_DISABLERS: formattedArray([...optimismConfig["tokenBridge"]["withdrawalsDisablers"], govBridgeExecutor]),

    L2_CROSSDOMAIN_MESSENGER: optimismConfig["tokenBridge"]["messenger"],

    L2_DEPLOY_SKIP_PROMPTS: "1",
  }, { override: true });
}

export function setupL2RepoTests(testingParameters: any, govBridgeExecutor: string, newContractsCfg: any) {
  dotenv.populate(process.env, {
    TESTING_OPT_NETWORK: "sepolia",
    TESTING_USE_DEPLOYED_CONTRACTS: true,
    TESTING_OPT_L1_LIDO: testingParameters["lido"],
    TESTING_OPT_L1_REBASABLE_TOKEN: testingParameters["l1RebasableToken"],
    TESTING_OPT_L1_NON_REBASABLE_TOKEN: testingParameters["l1NonRebasableToken"],
    TESTING_OPT_L1_ACCOUNTING_ORACLE: testingParameters["accountingOracle"],
    TESTING_L1_TOKENS_HOLDER: testingParameters["l1TokensHolder"],
    TESTING_OPT_GOV_BRIDGE_EXECUTOR: govBridgeExecutor,
    TESTING_OPT_L1_ERC20_TOKEN_BRIDGE: newContractsCfg["ethereum"]["bridgeProxyAddress"],
    TESTING_OPT_L1_TOKEN_RATE_NOTIFIER: testingParameters["tokenRateNotifier"],
    TESTING_OPT_L1_OP_STACK_TOKEN_RATE_PUSHER: newContractsCfg["ethereum"]["opStackTokenRatePusherImplAddress"],
    TESTING_OPT_L2_TOKEN_RATE_ORACLE: newContractsCfg["optimism"]["tokenRateOracleProxyAddress"],
    TESTING_OPT_L2_NON_REBASABLE_TOKEN: newContractsCfg["optimism"]["tokenProxyAddress"],
    TESTING_OPT_L2_REBASABLE_TOKEN: newContractsCfg["optimism"]["tokenRebasableProxyAddress"],
    TESTING_OPT_L2_ERC20_TOKEN_BRIDGE: newContractsCfg["optimism"]["tokenBridgeProxyAddress"],
  });
}

export function runIntegrationTest(test: string) {
  const nodeCmd = 'npx';
  const nodeArgs = [
    'hardhat',
    'test',
    `./test/integration/${test}`
  ];
  child_process.spawnSync(nodeCmd, nodeArgs, {
    cwd: './lido-l2-with-steth',
    stdio: 'inherit',
    env: process.env
  });
}

export function copyDeploymentArtifacts(originalDeployFileName: string, deployResultFileName: string) {
  const originalDeployFilePath = `./lido-l2-with-steth/${originalDeployFileName}`;
  cpSync(originalDeployFilePath, `./artifacts/${deployResultFileName}`);
}

export function configFromArtifacts(fileName: string) {
  const data = readFileSync(`./artifacts/${fileName}`, "utf8");
  try {
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`can't parse deploy file ${fileName}: ${(error as Error).message}`);
  }
}

export function runVerification(fileName: string, networkName: string) {
  dotenv.populate(process.env, {
    ETHERSCAN_API_KEY_ETH: process.env.L1_EXPLORER_TOKEN,
    ETHERSCAN_API_KEY_OPT: process.env.L2_EXPLORER_TOKEN,
    RPC_ETH_SEPOLIA: process.env.L1_REMOTE_RPC_URL,
    RPC_UNI_SEPOLIA: process.env.L2_REMOTE_RPC_URL,
  }, { override: true });

  const args = configFromArtifacts(fileName);

  let contract: keyof typeof args;
  for (contract in args) {
    const ctorArgs = args[contract]

    const nodeCmd = 'npx';
    const nodeArgs = [
      'hardhat',
      'verify',
      '--network',
      networkName,
      contract,
      ...ctorArgs,
    ];
    console.log("nodeArgs=", nodeArgs);

    child_process.spawnSync(nodeCmd, nodeArgs, {
      cwd: './lido-l2-with-steth',
      stdio: 'inherit',
      env: process.env
    });
  }
}

export function runVerificationGovExecutor(fileName: string, networkName: string) {
  dotenv.populate(process.env, {
    OPTIMISTIC_ETHERSCAN_KEY: process.env.L2_EXPLORER_TOKEN,
    ALCHEMY_KEY: process.env.ALCHEMY_KEY,
    PRIVATE_KEY: process.env.L2_DEPLOYER_PRIVATE_KEY,
  }, { override: true });

  const args = configFromArtifacts(fileName);

  let contract: keyof typeof args;
  for (contract in args) {
      console.log(`${contract}: ${args[contract]}`);

      const nodeCmd = 'npx';
      const nodeArgs = [
        'hardhat',
        'verify',
        '--network',
        networkName,
        contract,
        ...args[contract]
      ];
      console.log("nodeArgs=",nodeArgs);

      child_process.spawnSync(nodeCmd, nodeArgs, {
        cwd: './governance-crosschain-bridges',
        stdio: 'inherit',
        env: process.env
      });
  }
}
