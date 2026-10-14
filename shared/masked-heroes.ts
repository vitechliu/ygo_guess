import type { MaskAppearance } from './types.js';

// YGOPro card passwords. There are more than the room maximum of eight, so
// every visible card can receive a distinct Masked HERO appearance.
const heroes:[number,string][]=[
  [58147549,'假面英雄 刚火'],[10920352,'假面英雄 雾水'],
  [29095552,'假面英雄 酸水'],[62624486,'假面英雄 宝钻'],
  [50608164,'假面英雄 光牙'],[22093873,'假面英雄 神风'],
  [58481572,'假面英雄 暗爪'],[59642500,'假面英雄 暗鬼'],
  [89870349,'假面英雄 阵风'],[85672957,'假面英雄 原子火'],
];
export const MASKED_HEROES:MaskAppearance[]=heroes.map(([id,name])=>({id,name,image:'https://cdn.233.momobako.com/ygopro/pics/'+id+'.jpg!half'}));
