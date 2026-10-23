/* QR Model 2, byte mode, version 6, correction L, mask 0.
 * Self-contained implementation of Reed-Solomon GF(256) and QR placement.
 * Maximum 134 UTF-8 bytes; generated share URLs are ASCII.
 */
'use strict';
function makeQR(value){
 const bytes=Array.from(new TextEncoder().encode(value));if(bytes.length>134)throw new Error('رابط المشاركة أطول من سعة QR. استخدمي مسار نشر أقصر من 80 حرفًا.');
 const bits=[];const put=(n,len)=>{for(let i=len-1;i>=0;i--)bits.push((n>>>i)&1);};
 put(4,4);put(bytes.length,8);bytes.forEach(b=>put(b,8));for(let i=0;i<4&&bits.length<136*8;i++)bits.push(0);while(bits.length%8)bits.push(0);
 const data=[];for(let i=0;i<bits.length;i+=8)data.push(bits.slice(i,i+8).reduce((a,b)=>a*2+b,0));let pad=0;while(data.length<136)data.push(pad++%2?0x11:0xec);
 const exp=new Array(512),log=new Array(256);let x=1;for(let i=0;i<255;i++){exp[i]=x;log[x]=i;x<<=1;if(x&256)x^=0x11d;}for(let i=255;i<512;i++)exp[i]=exp[i-255];
 const mul=(a,b)=>a&&b?exp[log[a]+log[b]]:0;
 let generator=[1];for(let i=0;i<18;i++){const next=Array(generator.length+1).fill(0);generator.forEach((c,j)=>{next[j]^=c;next[j+1]^=mul(c,exp[i]);});generator=next;}
 function ecc(block){const out=[...block,...Array(18).fill(0)];for(let i=0;i<block.length;i++){const factor=out[i];for(let j=0;j<generator.length;j++)out[i+j]^=mul(generator[j],factor);}return out.slice(-18);}
 const blocks=[data.slice(0,68),data.slice(68)],errors=blocks.map(ecc),words=[];
 for(let i=0;i<68;i++)blocks.forEach(b=>words.push(b[i]));for(let i=0;i<18;i++)errors.forEach(b=>words.push(b[i]));
 const n=41,m=Array.from({length:n},()=>Array(n).fill(null));
 function finder(r,c){for(let y=-1;y<=7;y++)for(let z=-1;z<=7;z++){if(r+y<0||r+y>=n||c+z<0||c+z>=n)continue;m[r+y][c+z]=(y>=0&&y<=6&&z>=0&&z<=6&&(y===0||y===6||z===0||z===6||(y>=2&&y<=4&&z>=2&&z<=4)))?1:0;}}
 finder(0,0);finder(n-7,0);finder(0,n-7);
 for(let i=8;i<n-8;i++){if(m[6][i]===null)m[6][i]=i%2===0?1:0;if(m[i][6]===null)m[i][6]=i%2===0?1:0;}
 // Version 6 alignment centers are 6,34; the three finder intersections are omitted.
 for(let y=-2;y<=2;y++)for(let z=-2;z<=2;z++)m[34+y][34+z]=(Math.max(Math.abs(y),Math.abs(z))===2||(y===0&&z===0))?1:0;
 // L level = 01, mask = 000; 15-bit BCH encoded format, XOR 0x5412.
 let formatData=8,rem=formatData<<10;for(let i=14;i>=10;i--)if((rem>>>i)&1)rem^=0x537<<(i-10);const format=((formatData<<10)|rem)^0x5412;
 for(let i=0;i<15;i++){
  const bit=(format>>>i)&1;
  if(i<6)m[i][8]=bit;else if(i<8)m[i+1][8]=bit;else m[n-15+i][8]=bit;
  if(i<8)m[8][n-i-1]=bit;else if(i<9)m[8][15-i]=bit;else m[8][15-i-1]=bit;
 }
 m[n-8][8]=1;
 const stream=[];words.forEach(w=>{for(let i=7;i>=0;i--)stream.push((w>>>i)&1);});let p=0,row=n-1,dir=-1;
 for(let col=n-1;col>0;col-=2){if(col===6)col--;while(true){for(let k=0;k<2;k++){const c=col-k;if(m[row][c]===null){let bit=stream[p++]||0;if((row+c)%2===0)bit^=1;m[row][c]=bit;}}row+=dir;if(row<0||row>=n){row-=dir;dir=-dir;break;}}}
 const cells=[];for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(m[r][c])cells.push(`M${c+4},${r+4}h1v1h-1z`);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 49 49" role="img" aria-label="رمز QR لرابط الاستبيان" shape-rendering="crispEdges"><rect width="49" height="49" fill="white"/><path d="${cells.join('')}" fill="black"/></svg>`;
}
