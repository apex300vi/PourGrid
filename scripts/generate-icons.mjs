import {mkdir} from 'node:fs/promises';
import sharp from 'sharp';
await mkdir('icons',{recursive:true});
const source='sapphire-logo-original.png',background='#08090B';
for(const size of [180,192,512]) await sharp(source).resize(size,size,{fit:'contain',background}).png().toFile(`icons/icon-${size}.png`);
await sharp(source).resize(360,360,{fit:'contain',background}).extend({top:76,bottom:76,left:76,right:76,background}).png().toFile('icons/icon-maskable-512.png');
