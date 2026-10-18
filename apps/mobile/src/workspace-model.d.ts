import type {WatchItem,Draft} from './Workspace';
type State={watch:WatchItem[];drafts:Draft[]};
export function validState(s:unknown):s is State;
export function backupText(state:State):string;
export function mergeBackup(current:State,text:string):State;
