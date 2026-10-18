// This SDK 57 preview stays isolated from UAT and uses no production credentials.
const {spawn}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const marketApi=process.env.EXPO_PUBLIC_MARKET_API_BASE_URL||'https://academy-mobile-data-justy.vercel.app';
console.log('Market API:',marketApi,'(independent public data service)');
const child=spawn(process.execPath,[path.join(root,'node_modules/expo/bin/cli'),'start','--go','--lan','--port','8086','--max-workers','2'],{
 cwd:root,stdio:'inherit',env:{...process.env,EXPO_PUBLIC_API_BASE_URL:'https://tw-stock-mobile-preview.vercel.app',EXPO_PUBLIC_MARKET_API_BASE_URL:marketApi,EXPO_PUBLIC_EXPO_GO_PREVIEW:'1'},
});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
