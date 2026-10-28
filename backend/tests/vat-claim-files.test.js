import assert from 'node:assert/strict';
import {test} from 'node:test';
import {crc32} from 'node:zlib';
import sax from 'sax';
import {zip,csvCell,workbook,bundle} from '../src/services/vat-claim-files.js';
export function unpack(bytes){const entries=new Map();let p=0;while(bytes.readUInt32LE(p)===0x04034b50){const length=bytes.readUInt32LE(p+18),nameLength=bytes.readUInt16LE(p+26),extra=bytes.readUInt16LE(p+28),start=p+30+nameLength+extra,name=bytes.subarray(p+30,p+30+nameLength).toString(),value=bytes.subarray(start,start+length);assert.equal(bytes.readUInt16LE(p+8),0);assert.equal(crc32(value),bytes.readUInt32LE(p+14));entries.set(name,value);p=start+length;}assert.equal(bytes.readUInt32LE(p),0x02014b50);assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50);return entries;}
test('review downloads preserve exact text, quote CSV formulas and use valid deterministic OOXML',()=>{
 for(const value of ['=1+1','+cmd','-2+3','@SUM(A1)',' \t=HYPERLINK("x")','\ntext'])assert.ok(csvCell(value).startsWith('"\''));assert.equal(csvCell('00123456789'),'"00123456789"');assert.equal(csvCell('A,"B"'),'"A,""B"""');
 const rows=[{listKind:'INPUT',period:'2026-10',data:{number:'0000123456789000',taxId:'00123456789',description:'=HYPERLINK("https://example.test") & <text>',netTry:'90071992547409.123456'}}],book=workbook('2026-10',rows),files=unpack(book);
 assert.equal(files.size,8);for(const [name,data]of files){const parser=sax.parser(true);parser.write(data.toString()).close();assert.ok(!data.toString().includes('<f>'),name);}
 const sheet=files.get('xl/worksheets/sheet1.xml').toString();assert.match(sheet,/0000123456789000/);assert.match(sheet,/90071992547409.123456/);assert.match(sheet,/t="inlineStr"/);assert.match(sheet,/r="B5"/);
 const item={id:'test',reference:'Test',status:'APPROVED',contextHash:'hash',input:{},plan:{formatVersion:'REVIEW',rows}};assert.deepEqual(bundle(item),bundle(item));const archive=unpack(bundle(item));assert.equal(archive.size,7);assert.ok(archive.has('2026-10/review.xlsx'));assert.throws(()=>zip([['../escape','x']]),/Unsafe/);
});
