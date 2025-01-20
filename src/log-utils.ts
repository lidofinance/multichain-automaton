import { Writable } from "stream";

export enum LogType {
  Level1,
  Level2,
}
export type LogCallback = (message: string, type: LogType) => void;

export function logToStream(stream: Writable, message: string, logType: LogType) {
  switch (logType) {
    case LogType.Level1:
      stream.write(`[${new Date().toISOString()}] ${message}\n`);
      break;
    case LogType.Level2:
      stream.write(`[${new Date().toISOString()}] ${message}`);
      break;
  }
}
