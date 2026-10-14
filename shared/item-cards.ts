import type { ItemCard, ItemCardId } from './types.js';

// Server-owned catalogue. Add new cards here; effects are resolved by the server engine.
export const ITEM_CARDS: Record<ItemCardId, ItemCard> = {
  'test-card': {
    id: 'test-card',
    name: '测试卡',
    category: 'spell',
    reference: 'Card Trader',
    image: '/test-item-card.webp',
    description: '无实际效果。发动后在聊天中公布使用者。',
    timing: 'own-turn',
    weight: 0,
  },
  'prohibition-card': {
    id: 'prohibition-card', name: '禁止卡', category: 'spell', reference: '禁止令',
    image: '/prohibition-item-card.webp', description: '指定一名其他玩家，跳过其下次回合。', timing: 'own-turn', weight: 100,
  },
  'maxx-c-card': {
    id: 'maxx-c-card', name: '增殖卡', category: 'monster', reference: '增殖的G',
    image: '/maxx-c-item-card.webp', description: '所有玩家的卡图出现可爱蟑螂，持续 3 分钟。', timing: 'own-turn', weight: 20,
  },
  'mask-change-card': {
    id: 'mask-change-card', name: '假面卡', category: 'spell', reference: '假面变化',
    image: '/mask-change-item-card.webp', description: '所有场上卡牌变成不同的假面英雄外观，持续 1 分钟。真实答案不变。', timing: 'own-turn', weight: 50,
  },
};
