import dotenv from "dotenv";

import { runCommand } from "./command-utils";
import { TestingParameters } from "./config";
import { LogCallback } from "./log-utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setupIntegrationTests(
  testingParameters: TestingParameters,
  govBridgeExecutor: string,
  newContractsCfg: any,
) {
  dotenv.populate(process.env as { [key: string]: string }, {
    TESTING_USE_DEPLOYED_CONTRACTS: "true",
    TESTING_OPT_L1_LIDO: testingParameters.lido,
    TESTING_OPT_L1_REBASABLE_TOKEN: testingParameters.l1RebasableToken,
    TESTING_OPT_L1_NON_REBASABLE_TOKEN: testingParameters.l1NonRebasableToken,
    TESTING_OPT_L1_ACCOUNTING_ORACLE: testingParameters.accountingOracle,
    TESTING_L1_TOKENS_HOLDER: testingParameters.l1TokensHolder,
    TESTING_OPT_GOV_BRIDGE_EXECUTOR: govBridgeExecutor,
    TESTING_OPT_L1_ERC20_TOKEN_BRIDGE: newContractsCfg["ethereum"]["bridgeProxyAddress"],
    TESTING_OPT_L1_TOKEN_RATE_NOTIFIER: testingParameters.tokenRateNotifier,
    TESTING_OPT_L1_OP_STACK_TOKEN_RATE_PUSHER: newContractsCfg["ethereum"]["opStackTokenRatePusherImplAddress"],
    TESTING_OPT_L2_TOKEN_RATE_ORACLE: newContractsCfg["optimism"]["tokenRateOracleProxyAddress"],
    TESTING_OPT_L2_NON_REBASABLE_TOKEN: newContractsCfg["optimism"]["tokenProxyAddress"],
    TESTING_OPT_L2_REBASABLE_TOKEN: newContractsCfg["optimism"]["tokenRebasableProxyAddress"],
    TESTING_OPT_L2_ERC20_TOKEN_BRIDGE: newContractsCfg["optimism"]["tokenBridgeProxyAddress"],
  });
}

export async function runIntegrationTestsScript({
  testName,
  throwOnFail = true,
  tryNumber = 1,
  maxTries = 3,
  logCallback,
}: {
  testName: string;
  throwOnFail?: boolean;
  tryNumber?: number;
  maxTries?: number;
  logCallback: LogCallback;
}) {
  await runCommand({
    command: "npx",
    args: ["hardhat", "test", `./test/integration/${testName}`],
    workingDirectory: "./lido-l2-with-steth",
    environment: process.env,
    throwOnFail,
    tryNumber,
    maxTries,
    logCallback: logCallback,
  });
}
