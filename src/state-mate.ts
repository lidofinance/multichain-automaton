import * as child_process from "node:child_process";
import fs from "node:fs";
import process from "node:process";

import dotenv from "dotenv";
import { ethers } from "ethers";
import * as YAML from "yaml";

export function setupStateMateEnvs(ethereumRpcUrl: string, optimismRpcUrl: string) {
  dotenv.populate(
    process.env as { [key: string]: string },
    {
      L1_TESTNET_RPC_URL: ethereumRpcUrl,
      L2_TESTNET_RPC_URL: optimismRpcUrl,
      L1_MAINNET_RPC_URL: ethereumRpcUrl,
      L2_MAINNET_RPC_URL: optimismRpcUrl,
    },
    { override: true },
  );
}

export function setupStateMateConfig(
  configName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newContractsCfg: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mainConfig: any,
  mainConfigDoc: any,
  l2ChainId: number,
) {
  function item(anchor: string, sectionEntries: [YAML.Scalar]): YAML.Scalar {
    return sectionEntries.find((addr) => addr.anchor == anchor) as YAML.Scalar;
  }

  const seedConfigPath = `./state-mate/configs/optimism/${configName}`;
  const seedDoc = YAML.parseDocument(fs.readFileSync(seedConfigPath, "utf-8"), { intAsBigInt: true });
  const doc = new YAML.Document(seedDoc);

  const parametersSection = doc.get("parameters") as YAML.YAMLSeq;
  const parametersSectionEntries = parametersSection.items as [YAML.Scalar];

  const mainConfigParsedDoc = new YAML.Document(mainConfigDoc);
  const mainConfigParametersSection = mainConfigParsedDoc.get("parameters") as YAML.YAMLSeq;
  const mainConfigParametersSectionEntries = mainConfigParametersSection.items as [YAML.Scalar];

  // copy 'parameter' section
  item("agent", parametersSectionEntries).value = item("agent", mainConfigParametersSectionEntries).value;
  item("lido", parametersSectionEntries).value = item("lido", mainConfigParametersSectionEntries).value;
  item("accountingOracle", parametersSectionEntries).value = item("accountingOracle", mainConfigParametersSectionEntries).value;
  item("wstETH", parametersSectionEntries).value = item("wstETH", mainConfigParametersSectionEntries).value;
  item("stETH", parametersSectionEntries).value = item("stETH", mainConfigParametersSectionEntries).value;
  item("l1EmergencyBreaksMultisig", parametersSectionEntries).value = item("l1EmergencyBreaksMultisig", mainConfigParametersSectionEntries).value;
  item("l2EmergencyBreaksMultisig", parametersSectionEntries).value = item("l2EmergencyBreaksMultisig", mainConfigParametersSectionEntries).value;
  item("l1CrossDomainMessenger", parametersSectionEntries).value = item("l1CrossDomainMessenger", mainConfigParametersSectionEntries).value;
  item("l2CrossDomainMessenger", parametersSectionEntries).value = item("l2CrossDomainMessenger", mainConfigParametersSectionEntries).value;

  const deployedSection = doc.get("deployed") as YAML.YAMLMap;

  const l1DeployedSection = deployedSection.get("l1") as YAML.YAMLSeq;
  const l1SectionEntries = l1DeployedSection.items as [YAML.Scalar];
  item("l1TokenBridge", l1SectionEntries).value = newContractsCfg["ethereum"]["bridgeProxyAddress"];
  item("l1TokenBridgeImpl", l1SectionEntries).value = newContractsCfg["ethereum"]["bridgeImplAddress"];
  item("l1OpStackTokenRatePusher", l1SectionEntries).value =
    newContractsCfg["ethereum"]["opStackTokenRatePusherImplAddress"];

  const l2DeployedSection = deployedSection.get("l2") as YAML.YAMLSeq;
  const l2SectionEntries = l2DeployedSection.items as [YAML.Scalar];
  item("l2GovernanceExecutor", l2SectionEntries).value = newContractsCfg["optimism"]["govBridgeExecutor"];
  item("l2TokenBridge", l2SectionEntries).value = newContractsCfg["optimism"]["tokenBridgeProxyAddress"];
  item("l2TokenBridgeImpl", l2SectionEntries).value = newContractsCfg["optimism"]["tokenBridgeImplAddress"];
  item("l2WstETH", l2SectionEntries).value = newContractsCfg["optimism"]["tokenProxyAddress"];
  item("l2WstETHImpl", l2SectionEntries).value = newContractsCfg["optimism"]["tokenImplAddress"];
  item("l2StETH", l2SectionEntries).value = newContractsCfg["optimism"]["tokenRebasableProxyAddress"];
  item("l2StETHImpl", l2SectionEntries).value = newContractsCfg["optimism"]["tokenRebasableImplAddress"];
  item("l2TokenRateOracle", l2SectionEntries).value = newContractsCfg["optimism"]["tokenRateOracleProxyAddress"];
  item("l2TokenRateOracleImpl", l2SectionEntries).value = newContractsCfg["optimism"]["tokenRateOracleImplAddress"];

  // L1 -----------------------------------------
  const l1Section = doc.get("l1") as YAML.YAMLMap;
  const l1Contracts = l1Section.get("contracts") as YAML.YAMLMap;

  // OpStackTokenRatePusher
  const opStackTokenRatePusher = l1Contracts.get("opStackTokenRatePusher") as YAML.YAMLMap;
  const opStackTokenRatePusherChecks = opStackTokenRatePusher.get("checks") as YAML.YAMLMap;
  const opStackTokenRatePusherConfig = mainConfig["deployParameters"]["l1"]["opStackTokenRatePusher"];
  opStackTokenRatePusherChecks.set("L2_GAS_LIMIT_FOR_PUSHING_TOKEN_RATE", Number(opStackTokenRatePusherConfig["l2GasLimitForPushingTokenRate"]));

  // L1TokenBridge
  const l1TokenBridge = l1Contracts.get("tokenBridge") as YAML.YAMLMap;
  const l1TokenBridgeChecks = l1TokenBridge.get("checks") as YAML.YAMLMap;
  const l1TokenBridgeConfig = mainConfig["deployParameters"]["l1"]["tokenBridge"];
  l1TokenBridgeChecks.set("isDepositsEnabled", l1TokenBridgeConfig["depositsEnabled"]);
  l1TokenBridgeChecks.set("isWithdrawalsEnabled", l1TokenBridgeConfig["withdrawalsEnabled"]);


  // L2 -----------------------------------------
  const l2Section = doc.get("l2") as YAML.YAMLMap;
  const l2Contracts = l2Section.get("contracts") as YAML.YAMLMap;

  // GovBridgeExecutor
  const governanceExecutor = l2Contracts.get("governanceExecutor") as YAML.YAMLMap;
  const governanceExecutorChecks = governanceExecutor.get("checks") as YAML.YAMLMap;
  const govBridgeExecutorConfig = mainConfig["deployParameters"]["l2"]["govBridgeExecutor"];
  governanceExecutorChecks.set("OVM_L2_CROSS_DOMAIN_MESSENGER", govBridgeExecutorConfig["ovmL2Messenger"]);
  governanceExecutorChecks.set("getDelay", Number(govBridgeExecutorConfig["delay"]));
  governanceExecutorChecks.set("getGracePeriod", Number(govBridgeExecutorConfig["gracePeriod"]));
  governanceExecutorChecks.set("getMinimumDelay", Number(govBridgeExecutorConfig["minDelay"]));
  governanceExecutorChecks.set("getMaximumDelay", Number(govBridgeExecutorConfig["maxDelay"]));
  governanceExecutorChecks.set("getGuardian", govBridgeExecutorConfig["ovmGuiardian"]);

  // L2WstETH
  const l2WstETH = l2Contracts.get("wstETH") as YAML.YAMLMap;
  const l2WstETHChecks = l2WstETH.get("checks") as YAML.YAMLMap;
  const l2WstETHConfig = mainConfig["deployParameters"]["l2"]["nonRebasableToken"];
  l2WstETHChecks.set("name", l2WstETHConfig["name"]);
  l2WstETHChecks.set("symbol", l2WstETHConfig["symbol"]);
  l2WstETHChecks.set("getContractVersion", Number(l2WstETHConfig["signingDomainVersion"]));
  setDomainSeparatorAndEIP712Domain("wstETH", newContractsCfg["optimism"]["tokenProxyAddress"], l2WstETHConfig["signingDomainVersion"]);

  // L2StETH
  const l2StETH = l2Contracts.get("stETH") as YAML.YAMLMap;
  const l2StETHChecks = l2StETH.get("checks") as YAML.YAMLMap;
  const l2StETHConfig = mainConfig["deployParameters"]["l2"]["rebasableToken"];
  l2StETHChecks.set("name", l2StETHConfig["name"]);
  l2StETHChecks.set("symbol", l2StETHConfig["symbol"]);
  l2StETHChecks.set("getContractVersion", Number(l2StETHConfig["signingDomainVersion"]));
  setDomainSeparatorAndEIP712Domain("stETH", newContractsCfg["optimism"]["tokenRebasableProxyAddress"], l2StETHConfig["signingDomainVersion"]);

  // TokenRateOracle
  const tokenRateOracle = l2Contracts.get("tokenRateOracle") as YAML.YAMLMap;
  const tokenRateOracleChecks = tokenRateOracle.get("checks") as YAML.YAMLMap;
  const tokenRateOracleConfig = mainConfig["deployParameters"]["l2"]["tokenRateOracle"];
  tokenRateOracleChecks.set("MAX_ALLOWED_L2_TO_L1_CLOCK_LAG", Number(tokenRateOracleConfig["maxAllowedL2ToL1ClockLag"]));
  tokenRateOracleChecks.set("MAX_ALLOWED_TOKEN_RATE_DEVIATION_PER_DAY_BP", Number(tokenRateOracleConfig["maxAllowedTokenRateDeviationPerDayBp"]));
  tokenRateOracleChecks.set("MIN_TIME_BETWEEN_TOKEN_RATE_UPDATES", Number(tokenRateOracleConfig["minTimeBetweenTokenRateUpdates"]));
  tokenRateOracleChecks.set("OLDEST_RATE_ALLOWED_IN_PAUSE_TIME_SPAN", Number(tokenRateOracleConfig["oldestRateAllowedInPauseTimeSpan"]));
  tokenRateOracleChecks.set("TOKEN_RATE_OUTDATED_DELAY", Number(tokenRateOracleConfig["tokenRateOutdatedDelay"]));
  tokenRateOracleChecks.set("isTokenRateUpdatesPaused", !Boolean(tokenRateOracleConfig["updateEnabled"]));

  // L2TokenBridge
  const l2TokenBridge = l2Contracts.get("tokenBridge") as YAML.YAMLMap;
  const l2TokenBridgeChecks = l2TokenBridge.get("checks") as YAML.YAMLMap;
  const l2TokenBridgeConfig = mainConfig["deployParameters"]["l2"]["tokenBridge"];
  l2TokenBridgeChecks.set("isDepositsEnabled", l2TokenBridgeConfig["depositsEnabled"]);
  l2TokenBridgeChecks.set("isWithdrawalsEnabled", l2TokenBridgeConfig["withdrawalsEnabled"]);

  fs.mkdirSync("./artifacts/configs", { recursive: true });
  fs.writeFileSync(`./artifacts/configs/${configName}`, doc.toString());
  fs.cpSync("./state-mate/configs/optimism/abi", "./artifacts/configs/abi", { recursive: true });

  function setDomainSeparatorAndEIP712Domain(token: string, address: string, version: string) {
    const stETH = l2Contracts.get(token) as YAML.YAMLMap;
    const checks = stETH.get("checks") as YAML.YAMLMap;
    const name = checks.get("name") as string;
    const wstETHDomainSeparator = domainSeparator(name, version, l2ChainId, address);
    checks.set("DOMAIN_SEPARATOR", wstETHDomainSeparator);
    checks.set("eip712Domain", ["0x0f",name,version,l2ChainId,address,"0x0000000000000000000000000000000000000000000000000000000000000000",[]]);
  }
}

export function runStateMate(configFile: string) {
  const nodeCmd = "yarn";
  const nodeArgs = ["start", `../artifacts/configs/${configFile}`];
  child_process.spawnSync(nodeCmd, nodeArgs, {
    cwd: "./state-mate",
    stdio: "inherit",
    env: process.env,
  });
}

function domainSeparator(name: string, version: string, l2ChainId: number, addr: string) {
  const hashedName = ethers.keccak256(ethers.toUtf8Bytes(name));
  const hashedVersion = ethers.keccak256(ethers.toUtf8Bytes(version));
  const typeHash = ethers.keccak256(
    ethers.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
  );
  const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes32", "bytes32", "uint256", "address"],
    [typeHash, hashedName, hashedVersion, l2ChainId, addr],
  );
  return ethers.keccak256(encodedParams);
}
