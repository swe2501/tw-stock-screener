// This SDK 57 preview stays isolated from UAT and uses no production credentials.
const {spawn}=require('node:child_process');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
const networks=Object.entries(os.networkInterfaces()).sort(([a],[b])=>Number(/wi-?fi/i.test(b))-Number(/wi-?fi/i.test(a)));
const lan=networks.flatMap(([,rows])=>rows).find(row=>row.family==='IPv4'&&!row.internal&&/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(row.address));
const marketApi=process.env.EXPO_PUBLIC_MARKET_API_BASE_URL||(lan?'http://'+lan.address+':8788':'https://tw-stock-mobile-preview.vercel.app');
console.log('Market API:',marketApi,'(local API must be running for LAN development)');
const child=spawn(process.execPath,[path.join(root,'node_modules/expo/bin/cli'),'start','--go','--lan','--port','8086','--max-workers','2'],{
 cwd:root,stdio:'inherit',env:{...process.env,EXPO_PUBLIC_API_BASE_URL:'https://tw-stock-mobile-preview.vercel.app',EXPO_PUBLIC_MARKET_API_BASE_URL:marketApi,EXPO_PUBLIC_EXPO_GO_PREVIEW:'1'},
});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
