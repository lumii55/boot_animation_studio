/* BAS Community private same-origin profile portal.
 * Not the public catalog; requires explicit beta approval and a real allowlist.
 */
import {authConfigured} from './auth.mjs';
import {profilePage} from './beta-profile-page.mjs';
import {profileStyles} from './beta-profile-styles.mjs';
import {profileClient} from './beta-profile-client.mjs';
const assets=new Map([
 ['/', ['text/html; charset=utf-8',profilePage]],
 ['/beta',['text/html; charset=utf-8',profilePage]],
 ['/beta/style.css',['text/css; charset=utf-8',profileStyles]],
 ['/beta/app.js',['text/javascript; charset=utf-8',profileClient]]
]);
const CSP="default-src 'none'; base-uri 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'";
export function betaPortalReady(env){
 const ids=String(env?.AUTH_BETA_GITHUB_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 return env?.BETA_PORTAL_ENABLED==='true' && env?.AUTH_PUBLIC_SIGNUP_APPROVED!=='true' &&
   ids.length>0&&ids.every(id=>/^[1-9][0-9]{0,19}$/.test(id))&&authConfigured(env);
}
export function serveBetaPortal(req,env,url){
 const asset=assets.get(url.pathname);
 if(!asset)return null;
 const h=new Headers({'Cache-Control':'no-store, private','Content-Security-Policy':CSP,
   'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});
 if(!betaPortalReady(env)||url.origin!==env.AUTH_SITE_ORIGIN)
   return new Response('Not Found',{status:404,headers:h});
 if(req.method!=='GET'&&req.method!=='HEAD'){
   h.set('Allow','GET, HEAD');return new Response('Method Not Allowed',{status:405,headers:h});
 }
 h.set('Content-Type',asset[0]);
 return new Response(req.method==='HEAD'?null:asset[1],{status:200,headers:h});
}
