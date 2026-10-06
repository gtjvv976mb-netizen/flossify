const r = await import('/home/user/fl-simple/src/lib/record.ts');
const x = await import('/home/user/fl-simple/src/lib/record-extra.ts');
console.log(Object.keys(r).length, [...r.RECORD_INTENTS].length, Object.keys(x.EXTRA_ANCHOR).length);
process.exit(0);
