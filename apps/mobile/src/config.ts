import {websiteOrigin} from './market-home';
// Independent public data service. No member credentials or protected-site cookies.
export const MARKET_API_BASE=process.env.EXPO_PUBLIC_MARKET_API_BASE_URL||'https://academy-mobile-data-justy.vercel.app';
export const WEBSITE_BASE=websiteOrigin(process.env.EXPO_PUBLIC_WEBSITE_URL||'https://tw-stock-screener-git-uat-andrew250165s-projects.vercel.app');
