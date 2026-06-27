import { Address, BASE_FEE, Contract, Keypair, nativeToScVal, rpc, scValToNative, TransactionBuilder } from '@stellar/stellar-sdk';
const RPC='https://soroban-testnet.stellar.org', CID='CDMSQ2YYSDBUUJNEF5SBZZLBY5QT52XAJVUBVGU4WILJ3VKD2KW4EL7D', PASS='Test SDF Network ; September 2015', SECRET='SDL4SWRGFBZ5XBB5EORL3BHLUSETFBVVQ6OIESURFR7D4BFQQJKMJI3P';
const srv=new rpc.Server(RPC), kp=Keypair.fromSecret(SECRET), SRC=kp.publicKey(), c=new Contract(CID);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)), u64=v=>nativeToScVal(BigInt(v),{type:'u64'}), i128=v=>nativeToScVal(BigInt(v),{type:'i128'}), addr=v=>new Address(v).toScVal();
async function invoke(method,args){let last;for(let a=1;a<=9;a++){try{const acct=await srv.getAccount(SRC);const tx=new TransactionBuilder(acct,{fee:(Number(BASE_FEE)*100).toString(),networkPassphrase:PASS}).addOperation(c.call(method,...args)).setTimeout(120).build();const p=await srv.prepareTransaction(tx);p.sign(kp);const sent=await srv.sendTransaction(p);if(sent.status!=='PENDING'){if(a<9){console.log('  resubmit',sent.status,a);await sleep(2500+a*800);continue;}throw new Error('send '+sent.status);}let got=await srv.getTransaction(sent.hash);const dl=Date.now()+28000;while(got.status==='NOT_FOUND'&&Date.now()<dl){await sleep(1500);got=await srv.getTransaction(sent.hash);}if(got.status==='SUCCESS')return{hash:sent.hash,ret:got.returnValue?scValToNative(got.returnValue):null};if(got.status==='NOT_FOUND'&&a<9){await sleep(2500+a*800);continue;}throw new Error('tx '+got.status);}catch(e){last=e;const m=String(e);if(/BadSeq|timeout|fetch failed|TRY_AGAIN|Contract, #6/i.test(m)&&a<9){console.log('  retry',m.slice(0,40),a);await sleep(2500+a*800);continue;}throw e;}}throw last;}
// cleanup leftover streams 2,3
for(const id of [2,3]){try{const r=await invoke('stop',[u64(id)]);console.log('cleanup stop',id,'reclaim',r.ret);}catch(e){console.log('cleanup',id,String(e).slice(0,50));}}
const now=Math.floor(Date.now()/1000);
console.log('create...');const cr=await invoke('create_stream',[addr(SRC),addr(SRC),i128(20000000n),u64(now),u64(now+60)]);console.log('  id=',cr.ret,cr.hash);
const id=String(cr.ret);await sleep(6000);
console.log('withdraw...');const w=await invoke('withdraw',[u64(BigInt(id))]);console.log('  stroops=',w.ret,w.hash);
console.log('stop...');const st=await invoke('stop',[u64(BigInt(id))]);console.log('  reclaim=',st.ret,st.hash);
console.log('OK ALL');
