// Browser rendering of the same native components for repeatable layout checks.
// This does not enable web in the native release or load the website in the App.
const {spawn}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..');
// Expo 57's web prerequisite reads static rootConfig.platforms rather than the
// environment-resolved config. Dependencies are installed and expo-doctor checked.
const child=spawn(process.execPath,[path.join(root,'node_modules/expo/bin/cli'),'start','--web','--localhost','--port','8087','--max-workers','2'],{cwd:root,stdio:'inherit',env:{...process.env,APP_LAYOUT_REVIEW:'1',EXPO_NO_WEB_SETUP:'1',EXPO_PUBLIC_EXPO_GO_PREVIEW:'1'}});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
