/**
 * Lista los ciclos (for/while/forEach/map...) que tienen adentro un `await`
 * a la BD (query, findOne, save, ...): el patrón "una consulta por
 * elemento" que hacía tardar ~36 s el guardado de roles. Ver
 * documentacion/Portal Clientes/mejoras/escalabilidad-rendimiento.md.
 *
 * Es un análisis estático: encuentra candidatos, no mide. Que un ciclo
 * aparezca no significa que sea lento — depende de cuántas vueltas da y
 * cada cuánto se ejecuta.
 *
 * Uso (desde Backend_portal/):  node scripts/buscar-consultas-en-ciclos.cjs
 */
const fs = require("fs"), path = require("path");
const backendRoot = process.argv[2] || path.resolve(__dirname, "..");
process.argv[2] = backendRoot;
const ts = require(backendRoot + "/node_modules/typescript");
const root = backendRoot + "/src";
const DB = new Set(["query","findOne","findOneBy","find","findBy","save","update","delete","insert","count","getMany","getOne","getRawMany","getRawOne","execute","findAndCount","upsert","remove","exists"]);
const out = [];
function walk(d){ for (const f of fs.readdirSync(d)) { const p = path.join(d,f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith(".ts") && !p.endsWith(".spec.ts")) scan(p); } }
function isLoop(n){ return ts.isForStatement(n)||ts.isForOfStatement(n)||ts.isForInStatement(n)||ts.isWhileStatement(n)||ts.isDoStatement(n); }
function isIterCb(n){ if(!(ts.isArrowFunction(n)||ts.isFunctionExpression(n))) return false; const c=n.parent; return c&&ts.isCallExpression(c)&&ts.isPropertyAccessExpression(c.expression)&&["forEach","map","flatMap","reduce","filter","some","every"].includes(c.expression.name.text); }
function fnName(n){ while(n){ if((ts.isMethodDeclaration(n)||ts.isFunctionDeclaration(n))&&n.name) return n.name.getText(); n=n.parent; } return "?"; }
function scan(file){
  const sf = ts.createSourceFile(file, fs.readFileSync(file,"utf8"), ts.ScriptTarget.Latest, true);
  const seen = new Set();
  function visit(n, loopStack){
    const inLoop = isLoop(n)||isIterCb(n) ? [...loopStack, n] : loopStack;
    if (ts.isAwaitExpression(n) && inLoop.length){
      let c = n.expression; let db=false;
      ts.forEachChild(n, function f(x){ if(ts.isCallExpression(x)&&ts.isPropertyAccessExpression(x.expression)&&DB.has(x.expression.name.text)) db=true; ts.forEachChild(x,f); });
      if (ts.isCallExpression(c)&&ts.isPropertyAccessExpression(c.expression)&&DB.has(c.expression.name.text)) db=true;
      if (db){ const loop=inLoop[inLoop.length-1]; const key=loop.pos; if(!seen.has(key)){ seen.add(key); const {line}=sf.getLineAndCharacterOfPosition(loop.getStart()); out.push({file:path.relative(process.argv[2],file).split(path.sep).join("/"), line:line+1, fn:fnName(loop), depth:inLoop.length}); } }
    }
    ts.forEachChild(n, x=>visit(x,inLoop));
  }
  visit(sf, []);
}
walk(root);
out.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line);
for (const o of out) console.log(`${o.file}:${o.line}  ${o.fn}${o.depth>1?"  (ciclo anidado)":""}`);
console.log("TOTAL:", out.length);
