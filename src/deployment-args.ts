import { readFileSync } from "fs";

function loadDeployedContractsWithArgs(fileName: string) {
    const data = readFileSync(`./artifacts/${fileName}`, "utf8");
    try {
        return JSON.parse(data);
    } catch (error) {
        throw new Error(`can't parse deploy file ${fileName}: ${(error as Error).message}`);
    }
}

export {
    loadDeployedContractsWithArgs
}