import {createHash} from 'node:crypto';
import {AppError} from '../shared/AppError.js';
import {sourceLine} from '../validators/exports.validators.js';
export const columns=['lineKey','itemCode','description','quantity','unitCode','packageReference','packageCount','netWeightKg','grossWeightKg'];
const fail=message=>new AppError(422,'INVALID_PACKING_SOURCE',message);
export function csvRows(input){
 const text=input.charCodeAt(0)===0xfeff?input.slice(1):input,rows=[];let row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)throw fail('CSV quote must begin a field.');quoted=true;continue;}
  if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v!==''))rows.push(row);row=[];}continue;}
  if(closed)throw fail('Unexpected text after a quoted CSV field.');cell+=c;
 }
 if(quoted)throw fail('CSV has an unclosed quoted field.');if(cell||closed||row.length){row.push(cell);if(row.some(v=>v!==''))rows.push(row);}return rows;
}
export function parsePackingSource(input){
 const content=input.sourceKind==='CSV'?input.csv:JSON.stringify(input.lines);
 if(Buffer.byteLength(content,'utf8')>750000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\ud800-\udfff]/u.test(content))throw fail('Choose a UTF-8 packing list up to 750,000 bytes, without unsupported control characters.');
 let raw=input.lines;
 if(input.sourceKind==='CSV'){
  const [header,...rows]=csvRows(content);if(!header||new Set(header).size!==header.length||header.some(h=>!columns.includes(h))||columns.slice(0,5).some(h=>!header.includes(h)))throw fail('Use unique template column names; lineKey, itemCode, description, quantity and unitCode are required.');
  raw=rows.map((row,i)=>{if(row.length!==header.length)throw fail(`CSV record ${i+2} has a different number of fields from its header.`);return Object.fromEntries(header.map((h,j)=>[h,row[j]]));});
 }
 if(!raw.length)throw fail('The packing list needs at least one goods line.');const seen=new Set();
 const lines=raw.map((l,i)=>{let normalized;try{normalized=sourceLine(l);}catch{throw fail(`Packing line ${i+1} has invalid fields, quantities, package count or net/gross weights.`);}if(seen.has(normalized.lineKey))throw fail('Packing source line keys must be unique.');seen.add(normalized.lineKey);return {...normalized,lineNumber:i+1,source:l};});
 return {content,hash:createHash('sha256').update(content,'utf8').digest('hex'),lines};
}
