// Internal test identity only. Production identifiers remain unconfigured.
module.exports=({config})=>{if(process.env.APP_LAYOUT_REVIEW==='1')config={...config,platforms:[...(config.platforms||['ios','android']),'web']};return process.env.APP_VARIANT==='staging'?{
 ...config,
 name:'跟誰學 測試版',
 android:{...config.android,package:'com.marketacademytw.academymobile.staging'},
}:config;};
