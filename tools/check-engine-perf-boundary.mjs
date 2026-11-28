import {readdirSync,readFileSync} from 'node:fs';
import {resolve,relative,dirname,sep} from 'node:path';
import ts from 'typescript';
const root=resolve('tools/voxel-tavern/town-blockout/engine-perf');
const violations=[];
function visit(dir){for(const d of readdirSync(dir,{withFileTypes:true})){const p=resolve(dir,d.name);
 if(d.isDirectory()){visit(p);continue;}
 if(!p.endsWith('.ts'))continue;
 const adapter=relative(root,p).split(sep)[0]==='adapters';
 const file=ts.createSourceFile(p,readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true);
 function check(node){
  let spec;
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))spec=node.moduleSpecifier;
  if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||node.expression.getText(file)==='require')){
   spec=node.arguments[0];if(!spec||!ts.isStringLiteralLike(spec))violations.push(relative(root,p)+': nonliteral dynamic dependency');
  }
  if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument))spec=node.argument.literal;
  if(spec&&ts.isStringLiteralLike(spec)){
   const s=spec.text;
   if(s.startsWith('.')){
    const dest=relative(root,resolve(dirname(p),s));
    if(dest==='..'||dest.startsWith('..'+sep)||(!adapter&&dest.split(sep)[0]==='adapters'))violations.push(relative(root,p)+': '+s);
   }else if(!adapter||!(s==='three'||s.startsWith('three/')))violations.push(relative(root,p)+': '+s);
  }
  ts.forEachChild(node,check);
 }
 check(file);
}}
visit(root);
if(violations.length){console.error(violations.join('\n'));process.exitCode=1;}else console.log('PASS: engine dependency boundary (static imports, exports, literal dynamic imports)');
