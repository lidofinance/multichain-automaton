import { loadDeployedContractsWithArgs } from "./deployment-args";
import { LogCallback, LogType } from "./log-utils";

async function checkAddressesContractStatus({
  configWihAddresses,
  endpoint,
  apiKey,
  maxTries = 3,
  checkInterval = 1000,
  logCallback
}: {
  configWihAddresses: string,
  endpoint: string,
  apiKey: string,
  maxTries: number;
  checkInterval: number;
  logCallback: LogCallback;
}) {
  const args = loadDeployedContractsWithArgs(configWihAddresses);
  let contract: keyof typeof args;
  for (contract in args) {
    await checkAddressContractStatus({
      address: contract,
      endpoint: endpoint,
      apiKey: apiKey,
      maxTries: maxTries,
      checkInterval: checkInterval,
      logCallback: logCallback
    });
  }
}

async function checkAddressContractStatus({
  address,
  endpoint,
  apiKey,
  maxTries = 3,
  checkInterval = 1000,
  logCallback
}: {
  address: string;
  endpoint: string,
  apiKey: string,
  maxTries: number;
  checkInterval: number;
  logCallback: LogCallback;
}) {
  logCallback(`Check address ${address} for being contract in block explorer`, LogType.Level1);

  for (let tryIndex = 0; tryIndex < maxTries; tryIndex++) {
    try {
      const query = `${endpoint}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
      const response = await fetch(query);
      const body = await response.json();

      if (body.status === "1" && body.result.length > 0) {
        const contractInfo = body.result[0];
        const isContract = !!(contractInfo.SourceCode || contractInfo.ABI);

        if (isContract) {
          logCallback(`${address} is identified as a contract.`, LogType.Level1);
          return;
        }
      }

      logCallback(`${address} appears to be an EOA. Retrying in ${checkInterval / 1000} seconds...`, LogType.Level1);
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    } catch (error) {
      logCallback(`Error ${error} checking address ${address}`, LogType.Level1);
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }
  }

  logCallback(`${address} could not be confirmed as a contract after ${maxTries} attempts.`, LogType.Level1);
}

export {
  checkAddressesContractStatus
}
