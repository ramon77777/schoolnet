import {createElement,useMemo} from "react";
import type {CSSProperties,ReactNode} from "react";
import {parseSafeRichText} from "./safeRichTextParser";
import type {SafeRichNode,SafeRichTag} from "./safeRichTextParser";

type Props={
  value:string|null|undefined;
  fallback?:string;
  className?:string;
};

const TAG_CLASSES: Record<SafeRichTag,string>={
  p:"my-1.5 whitespace-pre-wrap leading-relaxed",
  div:"my-1.5 whitespace-pre-wrap",
  br:"",
  hr:"my-3 border-slate-200",
  strong:"font-semibold",
  b:"font-semibold",
  em:"italic",
  i:"italic",
  u:"underline",
  s:"line-through",
  del:"line-through",
  h1:"my-2 text-lg font-bold text-slate-900",
  h2:"my-2 text-base font-bold text-slate-900",
  h3:"my-2 text-sm font-semibold text-slate-900",
  ul:"my-2 list-disc space-y-1 pl-5",
  ol:"my-2 list-decimal space-y-1 pl-5",
  li:"leading-relaxed",
  blockquote:"my-2 border-l-4 border-slate-200 pl-3 italic text-slate-600",
  code:"rounded bg-slate-100 px-1 font-mono text-xs",
  pre:"my-2 overflow-x-auto rounded-lg bg-slate-100 p-3 font-mono text-xs whitespace-pre-wrap",
  sub:"text-xs",
  sup:"text-xs",
  span:"",
};

function renderNode(node:SafeRichNode,key:number):ReactNode{
  if(node.kind==="text")return node.text;
  const style:CSSProperties|undefined=node.align
    ?{textAlign:node.align}
    :undefined;
  return createElement(
    node.tag,
    {key,className:TAG_CLASSES[node.tag],...(style?{style}:{})},
    ...node.children.map(renderNode),
  );
}

/**
 * L'afficheur doit être utilisé à la place de dangerouslySetInnerHTML
 * dans la consultation scolaire officielle. Seule une liste fermée
 * de composants de présentation peut être construite.
 */
export default function SafeRichText({value,fallback="",className=""}:Props){
  const html=value?.trim()||fallback;
  const tree=useMemo(()=>parseSafeRichText(html),[html]);
  return (
    <div className={"min-w-0 max-w-full break-words text-sm "+className}>
      {tree.map(renderNode)}
    </div>
  );
}
