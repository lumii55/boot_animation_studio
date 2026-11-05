/* Optional P15 single-origin architecture:
 * The canonical BAS SPA lives at /studio/ on the SAME HTTPS origin as
 * /v1/auth, /v1/publishing, and /v1/beta. No iframe or cross-site cookies.
 *
 * Assets are not active until a real Cloudflare Assets upload has completed
 * AND BAS_UNIFIED_STUDIO_ENABLED is explicitly approved for staging.
 */
import {verifyPrivateProfileReader} from './auth.mjs';
import {betaPortalReady} from './beta-portal.mjs';
const ALLOWED=/^\/(?:index\.html|manifest\.webmanifest|sw\.js|(?:js|css|vendor|icons|diagnostics)\/[A-Za-z0-9_./-]+)$/;
export async function serveUnifiedStudio(request,env,url){
 if(url.pathname!=='/studio'&&!url.pathname.startsWith('/studio/'))return null;
 if(request.method!=='GET'&&request.method!=='HEAD')
   return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 if(env?.BAS_UNIFIED_STUDIO_ENABLED!=='true'||!betaPortalReady(env)||
    url.origin!==env.AUTH_SITE_ORIGIN||typeof env.ASSETS?.fetch!=='function')
   return new Response('Not Found',{status:404,headers:{'Cache-Control':'no-store'}});
 const owner=await verifyPrivateProfileReader(request,env);
 if(!owner)return Response.redirect(url.origin+'/v1/auth/github/start',302);
 const path=url.pathname==='/studio'||url.pathname==='/studio/'?'/index.html':
   url.pathname.slice('/studio'.length);
 if(!ALLOWED.test(path)||path.includes('/../')||path.includes('//'))
   return new Response('Not Found',{status:404});
 const assetUrl=new URL(path,url.origin);
 const result=await env.ASSETS.fetch(new Request(assetUrl,{method:request.method,headers:request.headers}));
 const response=new Response(request.method==='HEAD'?null:result.body,result);
 response.headers.set('X-Content-Type-Options','nosniff');
 response.headers.set('Referrer-Policy','same-origin');
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
