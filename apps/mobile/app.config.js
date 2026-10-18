// Internal test identity only. Production identifiers remain unconfigured.
module.exports=({config})=>process.env.APP_VARIANT==='staging'?{
 ...config,
 name:'跟誰學 測試版',
 android:{...config.android,package:'com.marketacademytw.academymobile.staging'},
}:config;
