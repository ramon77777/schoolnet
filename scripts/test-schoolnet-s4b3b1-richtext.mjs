import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mapSafeRichNode,parseSafeRichText} from
 "../src/components/editor/safeRichText.ts";

const read=(p)=>readFileSync(p,"utf8");
const page=read("src/features/student/pages/StudentSchoolAssessmentPreview.tsx");
const parser=read("src/components/editor/safeRichText.ts");
const view=read("src/components/editor/SafeRichText.tsx");
const editor=read("src/components/editor/RichTextEditor.tsx");
const ci=read(".github/workflows/schoolnet-s4b3b1-preview-ci.yml");

function textNode(content) {
 return {nodeType:3,textContent:content,childNodes:[]};
}
function element(tag,children=[],attributes={}) {
 return {
  nodeType:1,tagName:tag.toUpperCase(),childNodes:children,
  getAttribute:(name)=>attributes[name]??null,
 };
}
const convert=(tree)=>mapSafeRichNode(tree);

test("TipTap : un paragraphe affiche le texte sans les balises litterales",()=>{
 const tree=convert(element("p",[textNode("Lisez bien les questions")]));
 assert.deepEqual(tree,[{
  kind:"element",tag:"p",children:[{kind:"text",text:"Lisez bien les questions"}],
 }]);
});
test("Question mathematique : le contenu source reste intact",()=>{
 const tree=convert(element("p",[textNode("8*6")]));
 assert.deepEqual(tree[0].children[0],{kind:"text",text:"8*6"});
 assert.doesNotMatch(JSON.stringify(tree),/8 × 6/);
});
test("Formats TipTap autorises : gras, italique, paragraphes, listes",()=>{
 const tree=convert(element("div",[
  element("p",[textNode("Calculez "),element("strong",[textNode("la somme")])]),
  element("ul",[element("li",[textNode("Premier point")]),element("li",[
   element("em",[textNode("Deuxieme point")]),
  ])]),
 ]));
 assert.equal(tree[0].tag,"div");
 assert.equal(tree[0].children[0].tag,"p");
 assert.equal(tree[0].children[0].children[1].tag,"strong");
 assert.equal(tree[0].children[1].tag,"ul");
 assert.equal(tree[0].children[1].children[1].children[0].tag,"em");
});
test("Text-align accepte uniquement left, center, right ou justify",()=>{
 const accepted=convert(element("p",[textNode("Centre")],{
  style:"text-align: center; color: red; background-image:url(https://evil.example/a)",
 }));
 assert.equal(accepted[0].align,"center");
 assert.equal(JSON.stringify(accepted).includes("evil.example"),false);
 const rejected=convert(element("p",[textNode("Texte")],{
  style:"text-align: expression(alert(1)); position:fixed;",
 }));
 assert.equal(rejected[0].align,undefined);
 const span=convert(element("span",[textNode("abc")],{style:"text-align: right"}));
 assert.equal(span[0].align,undefined);
});
test("Aucun attribut onclick, style arbitraire, href ou src n'est transmis",()=>{
 const tree=convert(element("p",[
  element("a",[textNode("Consulter un lien")],{
   href:"javascript:alert(1)",onclick:"alert(1)",
  }),
  element("span",[textNode("Remarques")],{
   style:"position:absolute;color:red",onmouseover:"alert(1)",
  }),
 ],{
  onclick:"alert('danger')",class:"arbitrary",
 }));
 assert.deepEqual(tree[0].children,[
  {kind:"text",text:"Consulter un lien"},
  {kind:"element",tag:"span",children:[{kind:"text",text:"Remarques"}]},
 ]);
 assert.doesNotMatch(JSON.stringify(tree),/href|javascript|onclick|onmouseover|position:absolute/);
});
test("Scripts, styles, iframes et images sont supprimes avec leur contenu",()=>{
 const tree=convert(element("div",[
  element("p",[textNode("Consigne fiable")]),
  element("script",[textNode("alert('secret')")]),
  element("style",[textNode("body{display:none}")]),
  element("iframe",[textNode("contenu externe")],{src:"https://evil.example"}),
  element("img",[],{src:"https://evil.example/image"}),
  element("svg",[element("script",[textNode("vol")])]),
 ]));
 assert.deepEqual(tree,[{
  kind:"element",tag:"div",children:[{
   kind:"element",tag:"p",children:[{kind:"text",text:"Consigne fiable"}],
  }],
 }]);
});
test("Les autres balises non reconnues perdent leurs attributs mais gardent leur texte",()=>{
 const tree=convert(element("unknown-widget",[
  element("span",[textNode("Texte utile")]),
 ],{onclick:"alert(1)"}));
 assert.deepEqual(tree,[{
  kind:"element",tag:"span",children:[{kind:"text",text:"Texte utile"}],
 }]);
});
test("Aucune interpretation de commentaires ou de gestionnaires d'evenements",()=>{
 const comment={nodeType:8,textContent:"<script>danger</script>",childNodes:[]};
 assert.deepEqual(convert(comment),[]);
 assert.deepEqual(convert(element("input",[],{onchange:"alert(1)"})),[]);
});
test("Les textes scientifiques et mathematiques conservent leurs symboles",()=>{
 const value="π × √ ∑ ∞ 10⁻³ H₂SO₄ a < b";
 const tree=convert(element("p",[textNode(value)]));
 assert.equal(tree[0].children[0].text,value);
});
test("Les profondeurs HTML pathologiques sont bornees",()=>{
 let tree=textNode("Invisible");
 for(let i=0;i<60;i++)tree=element("span",[tree]);
 const safe=convert(tree);
 let depth=0;
 let current=safe[0];
 while(current?.kind==="element"){
  depth++;
  current=current.children[0];
 }
 assert.ok(depth<=49,"La profondeur de la projection doit rester bornée");
 assert.doesNotMatch(JSON.stringify(safe),/Invisible/);
});
test("En absence de DOMParser, seul du texte non interprete est expose",()=>{
 // En Node, DOMParser n'est pas global ; il n'existe aucun fallback innerHTML.
 assert.equal(typeof DOMParser,"undefined");
 assert.deepEqual(parseSafeRichText("<p>8*6</p>"),[
  {kind:"text",text:"<p>8*6</p>"},
 ]);
});
test("Le navigateur parse le HTML inerte, puis valide chaque noeud",()=>{
 assert.match(parser,/new DOMParser\(\)\.parseFromString\(html, "text\/html"\)/);
 assert.match(parser,/mapSafeRichNode\(node\)/);
 assert.match(parser,/DROP_WITH_CONTENTS/);
 assert.match(view,/parseSafeRichText\(html\)/);
 assert.match(view,/createElement\(/);
 assert.doesNotMatch(parser+view,/dangerouslySetInnerHTML\s*=|\.innerHTML\s*=|\beval\s*\(|\bnew\s+Function\s*\(/);
});
test("Les trois contenus du preview utilisent le nouveau composant securise",()=>{
 assert.match(page,/import SafeRichText from "@\/components\/editor\/SafeRichText"/);
 assert.match(page,/<SafeRichText value=\{question\.prompt\}/);
 assert.match(page,/<SafeRichText value=\{choice\.text\}/);
 assert.match(page,/value=\{current\.description\}/);
 assert.doesNotMatch(page,/dangerouslySetInnerHTML|\.innerHTML|<iframe|<script/);
 assert.match(page,/Lecture seule/);
 assert.match(page,/aucune réponse n'est sélectionnable ou enregistrée/);
});
test("L'editeur TipTap enseignant reste inchange et conserve ses formats",()=>{
 assert.match(editor,/StarterKit/);
 assert.match(editor,/TextAlign/);
 assert.match(editor,/editor\.getHTML\(\)/);
 assert.match(editor,/Mathématiques/);
});
test("La CI teste le rendu en plus des contrats B1 et du build",()=>{
 assert.match(ci,/npm run qa:s4b3b1:richtext/);
 assert.match(ci,/npm run qa:s4b3b1/);
 assert.match(ci,/npm run build/);
 assert.match(ci,/src\/components\/editor\/safeRichText\.ts/);
 assert.match(ci,/src\/components\/editor\/SafeRichText\.tsx/);
 assert.doesNotMatch(ci,/supabase db push|vercel --prod|supabase db reset --linked/);
});
