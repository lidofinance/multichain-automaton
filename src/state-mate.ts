import * as child_process from "node:child_process";
import fs from "node:fs";
import process from "node:process";

import dotenv from "dotenv";
import { ethers } from "ethers";
import * as YAML from "yaml";

export function setupStateMateEnvs(ethereumRpcUrl: string, optimismRpcUrl: string) {
  dotenv.populate(
    process.env,
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
  statemateConfig: any,
  chainId: bigint,
) {
  function item(anchor: string, sectionEntries: [YAML.Scalar]): YAML.Scalar {
    return sectionEntries.find((addr) => addr.anchor == anchor) as YAML.Scalar;
  }

  const seedConfigPath = `./state-mate/configs/optimism/${configName}`;
  const seedDoc = YAML.parseDocument(fs.readFileSync(seedConfigPath, "utf-8"), { intAsBigInt: true });
  const doc = new YAML.Document(seedDoc);

  const parametersSection = doc.get("parameters") as YAML.YAMLSeq;
  const parametersSectionEntries = parametersSection.items as [YAML.Scalar];
  item("l1CrossDomainMessenger", parametersSectionEntries).value = statemateConfig["l1CrossDomainMessenger"];

  const deployedSection = doc.get("deployed") as YAML.YAMLMap;

  const l1Section = deployedSection.get("l1") as YAML.YAMLSeq;
  const l1SectionEntries = l1Section.items as [YAML.Scalar];
  item("l1TokenBridge", l1SectionEntries).value = newContractsCfg["ethereum"]["bridgeProxyAddress"];
  item("l1TokenBridgeImpl", l1SectionEntries).value = newContractsCfg["ethereum"]["bridgeImplAddress"];
  item("l1OpStackTokenRatePusher", l1SectionEntries).value =
    newContractsCfg["ethereum"]["opStackTokenRatePusherImplAddress"];

  const l2Section = deployedSection.get("l2") as YAML.YAMLSeq;
  const l2SectionEntries = l2Section.items as [YAML.Scalar];
  item("l2GovernanceExecutor", l2SectionEntries).value = newContractsCfg["optimism"]["govBridgeExecutor"];
  item("l2TokenBridge", l2SectionEntries).value = newContractsCfg["optimism"]["tokenBridgeProxyAddress"];
  item("l2TokenBridgeImpl", l2SectionEntries).value = newContractsCfg["optimism"]["tokenBridgeImplAddress"];
  item("l2WstETH", l2SectionEntries).value = newContractsCfg["optimism"]["tokenProxyAddress"];
  item("l2WstETHImpl", l2SectionEntries).value = newContractsCfg["optimism"]["tokenImplAddress"];
  item("l2StETH", l2SectionEntries).value = newContractsCfg["optimism"]["tokenRebasableProxyAddress"];
  item("l2StETHImpl", l2SectionEntries).value = newContractsCfg["optimism"]["tokenRebasableImplAddress"];
  item("l2TokenRateOracle", l2SectionEntries).value = newContractsCfg["optimism"]["tokenRateOracleProxyAddress"];
  item("l2TokenRateOracleImpl", l2SectionEntries).value = newContractsCfg["optimism"]["tokenRateOracleImplAddress"];

  const _l2Section = doc.get("l2") as YAML.YAMLMap;
  const contracts = _l2Section.get("contracts") as YAML.YAMLMap;

  function setDS(token: string, address: string) {
    const stETH = contracts.get(token) as YAML.YAMLMap;
    const checks = stETH.get("checks") as YAML.YAMLMap;
    const name = checks.get("name") as string;
    const version = "1";
    const wstETHDomainSeparator = domainSeparator(name, version, chainId, address);
    checks.set("DOMAIN_SEPARATOR", wstETHDomainSeparator);
  }

  setDS("stETH", newContractsCfg["optimism"]["tokenRebasableProxyAddress"]);
  setDS("wstETH", newContractsCfg["optimism"]["tokenProxyAddress"]);

  fs.mkdirSync("./artifacts/configs", { recursive: true });
  fs.writeFileSync(`./artifacts/configs/${configName}`, doc.toString());

  fs.cpSync("./state-mate/configs/optimism/abi", "./artifacts/configs/abi", { recursive: true });
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

function domainSeparator(name: string, version: string, chainid: bigint, addr: string) {
  const hashedName = ethers.keccak256(ethers.toUtf8Bytes(name));
  const hashedVersion = ethers.keccak256(ethers.toUtf8Bytes(version));
  const typeHash = ethers.keccak256(
    ethers.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
  );
  const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes32", "bytes32", "uint256", "address"],
    [typeHash, hashedName, hashedVersion, chainid, addr],
  );
  return ethers.keccak256(encodedParams);
}
