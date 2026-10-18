import type {CandleData} from './chart-model';
import type {Strategy,RunResult} from './vendor/strategy-engine';
export type BacktestInput={capital:string;fee:string;tax:string;slip:string;allocation:string;start:string;end:string};
export type BacktestReport={format:string;schema_version:number;created_at:string;instrument:{symbol:string;name?:string;kind?:string};source:CandleData['source'];as_of:string;price_basis:string;notice:string;bars:unknown[];result:RunResult};
export function backtest(data:CandleData,strategy:Strategy,input:BacktestInput):BacktestReport;
