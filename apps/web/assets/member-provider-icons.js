/* Original provider marks from the vendors. See auth-brands/README.md. */
(() => {'use strict';
 const labels={email:'Email',google:'Google',apple:'Apple',facebook:'Facebook',line:'LINE',phone:'手機簡訊'};
 const generic={email:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="4"/><path d="m4 7 8 6 8-6"/></svg>',phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3.5"/><path d="M10 5h4M11 18.5h2"/></svg>'};
 function icon(provider,inverse=false){if(!Object.hasOwn(labels,provider))return '';const files={google:'google.svg',apple:inverse?'apple-white.svg':'apple-black.svg',facebook:'facebook.ico',line:'line.png'};return '<span class="academy-provider-icon api-'+provider+'" aria-hidden="true">'+(generic[provider]||'<img src="assets/auth-brands/'+files[provider]+'" width="40" height="40" alt="">')+'</span>';}
 window.AcademyProviderUI={labels,icon};
})();
