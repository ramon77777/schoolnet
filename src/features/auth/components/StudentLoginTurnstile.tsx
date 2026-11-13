import {useEffect,useRef} from 'react';
type TurnstileApi={
 render:(element:HTMLElement,options:{sitekey:string;callback:(token:string)=>void;
 'expired-callback':()=>void;'error-callback':()=>void})=>string|number;
 remove:(id:string|number)=>void;
};
const SITE_KEY=import.meta.env.VITE_TURNSTILE_SITE_KEY??'';
export default function StudentLoginTurnstile({onToken,nonce=0}:{onToken:(token:string)=>void;nonce?:number}){
 const target=useRef<HTMLDivElement|null>(null);
 const callback=useRef(onToken);
 // React: les refs ne sont modifiées que dans un effet, jamais pendant le rendu.
 useEffect(()=>{callback.current=onToken;},[onToken]);
 useEffect(()=>{
  if(!SITE_KEY)return;
  let cancelled=false;let widget:string|number|null=null;
  const turnstile=()=> (window as Window&{turnstile?:TurnstileApi}).turnstile;
  const render=()=>{
   if(cancelled||!target.current||!turnstile()||widget!==null)return;
   widget=turnstile()!.render(target.current,{
    sitekey:SITE_KEY,
    callback:(token)=>callback.current(token),
    'expired-callback':()=>callback.current(''),
    'error-callback':()=>callback.current(''),
   });
  };
  let script=document.querySelector<HTMLScriptElement>('script[data-schoolnet-turnstile]');
  if(!script){
   script=document.createElement('script');
   script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
   script.async=true;script.defer=true;
   script.setAttribute('data-schoolnet-turnstile','true');document.head.appendChild(script);
  }
  script.addEventListener('load',render);render();
  return ()=>{
   cancelled=true;script?.removeEventListener('load',render);
   if(widget!==null&&turnstile())turnstile()!.remove(widget);
  };
 },[nonce]);
 if(!SITE_KEY)return <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
  Vérification de sécurité non configurée : aucune connexion réelle ne peut être lancée.
 </p>;
 return <div ref={target} aria-label="Vérification anti-robot" />;
}