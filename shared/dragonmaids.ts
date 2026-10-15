import type { MaskAppearance } from './types.js';

const dragonmaids: [number, string][] = [
  [32600024, '半龙女仆·寝室龙女'],
  [12163590, '半龙女仆·星夜龙女'],
  [76782778, '半龙女仆·地慈龙女'],
  [15848542, '半龙女仆·天风龙女'],
  [49575521, '半龙女仆·苍河龙女'],
  [24799107, '半龙女仆·耀光龙女'],
  [42055234, '半龙女仆·赤焰龙女'],
  [41232647, '半龙女仆·龙女管家'],
  [16960120, '半龙女仆·蒸馏室龙女'],
  [48658295, '半龙女仆·贴身龙女'],
  [13171876, '半龙女仆·洗衣龙女'],
  [40398073, '半龙女仆·育婴龙女'],
  [88453933, '半龙女仆·客厅龙女'],
];

export const DRAGONMAIDS: MaskAppearance[] = dragonmaids.map(([id, name]) => ({
  id,
  name,
  image: 'https://images.ygoprodeck.com/images/cards/' + id + '.jpg',
}));
