import { existsSync, readFileSync, writeFileSync } from "fs";

interface DeploymentArtifacts {
  l1: {
    bridgeImplAddress: string;
    bridgeProxyAddress: string;
    opStackTokenRatePusherImplAddress: string;
    lastBlockNumber: number;
  };
  l2: {
    govBridgeExecutor: string;
    tokenImplAddress: string;
    tokenProxyAddress: string;
    tokenRebasableImplAddress: string;
    tokenRebasableProxyAddress: string;
    tokenBridgeImplAddress: string;
    tokenBridgeProxyAddress: string;
    tokenRateOracleImplAddress: string;
    tokenRateOracleProxyAddress: string;
    lastBlockNumber: number;
  };
}

function loadDeploymentArtifacts({
  fileName,
  folder = "./artifacts"
}: {
  fileName: string,
  folder?: string
}): DeploymentArtifacts {
    const filePath = `${folder}/${fileName}`;
    if (!existsSync(filePath)) {
      writeFileSync(filePath, JSON.stringify({}, null, 2), "utf8");
      return {
        l1: {
          bridgeImplAddress: "",
          bridgeProxyAddress: "",
          opStackTokenRatePusherImplAddress: "",
          lastBlockNumber: 0,
        },
        l2: {
          govBridgeExecutor: "",
          tokenImplAddress: "",
          tokenProxyAddress: "",
          tokenRebasableImplAddress: "",
          tokenRebasableProxyAddress: "",
          tokenBridgeImplAddress: "",
          tokenBridgeProxyAddress: "",
          tokenRateOracleImplAddress: "",
          tokenRateOracleProxyAddress: "",
          lastBlockNumber: 0,
        },
      };
    }

      
  const data = readFileSync(`${folder}/${fileName}`, "utf8");
  try {
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`can't parse deploy file ${fileName}: ${(error as Error).message}`);
  }
}

function saveDeployArtifacts(deployArtifacts: DeploymentArtifacts, deploymentResultsFilename: string) {
  writeFileSync(`./artifacts/${deploymentResultsFilename}`, JSON.stringify(deployArtifacts, null, 2));
}

export {
    DeploymentArtifacts,
    loadDeploymentArtifacts,
    saveDeployArtifacts
}