import type { ItemCard, ItemCardId } from './types.js';

// Server-owned catalogue. Add new cards here; effects are resolved by the server engine.
export const ITEM_CARDS: Record<ItemCardId, ItemCard> = {
  'test-card': {
    id: 'test-card',
    name: '测试卡',
    category: 'spell',
    reference: 'Card Trader',
    image: '/test-item-card.webp',
    description: '亮出这张卡，让大家知道你使用了测试卡。',
    timing: 'own-turn',
    weight: 0,
  },
  'prohibition-card': {
    id: 'prohibition-card', name: '禁止卡', category: 'spell', reference: '禁止令',
    image: '/prohibition-item-card.webp', description: '指定一名其他玩家，跳过他的下一个回合。', timing: 'own-turn', weight: 100,
  },
  'maxx-c-card': {
    id: 'maxx-c-card', name: '增殖卡', category: 'monster', reference: '增殖的G',
    image: '/maxx-c-item-card.webp', description: '可爱的小蟑螂爬上所有人的卡牌，持续 3 分钟。', timing: 'own-turn', weight: 20,
  },
  'mask-change-card': {
    id: 'mask-change-card', name: '假面卡', category: 'spell', reference: '假面变化',
    image: '/mask-change-item-card.webp', description: '所有人的卡牌暂时变成不同的假面英雄，持续 1 分钟。猜卡答案不会改变。', timing: 'own-turn', weight: 50,
  },
  'chance-card': {
    id: 'chance-card', name: '机会卡', category: 'spell', reference: '第二次机会',
    image: '/chance-item-card.webp', description: '你的猜测机会增加 1 次。', timing: 'own-turn', weight: 150,
  },
  'lightning-card': {
    id: 'lightning-card', name: '雷击卡', category: 'spell', reference: '雷击',
    image: '/lightning-item-card.webp', description: '雷电会随机落在页面上，持续 3 分钟。', timing: 'own-turn', weight: 50,
  },
  'fireball-card': {
    id: 'fireball-card', name: '火球卡', category: 'spell', reference: '火球',
    image: '/fireball-item-card.webp', description: '指定一名其他玩家的卡牌，让其燃烧起来，持续 3 分钟。', timing: 'own-turn', weight: 150,
  },
  'outer-entity-card': {
    id: 'outer-entity-card', name: '外神卡', category: 'xyz', reference: '外神 奈亚拉',
    image: '/outer-entity-item-card.webp', description: '来自星空的神秘生物现在注视着所有卡牌，持续5分钟。', timing: 'own-turn', weight: 30,
  },
  'god-rage-card': {
    id: 'god-rage-card', name: '神愤卡', category: 'xyz', reference: 'No.69 纹章神 盾徽-神之愤怒',
    image: '/god-rage-item-card.webp', description: '指定一名其他玩家，遮住他卡牌上的名字，直到这一小局结束。', timing: 'own-turn', weight: 50,
  },
  'crossout-card': {
    id: 'crossout-card', name: '指名卡', category: 'spell', reference: '抹杀的指名者',
    image: '/crossout-item-card.webp', description: '宣布一个词或概念，这场游戏里大家提问时都不能提到它。', timing: 'own-turn', weight: 20,
  },
  'scanner-card': {
    id: 'scanner-card', name: '扫描卡', category: 'spell', reference: '卡片扫描者',
    image: '/scanner-item-card.webp', description: '数一数你的卡名有多少个字、数字和符号，让大家知道结果。', timing: 'own-turn', weight: 100,
  },
  'moon-book-card': {
    id: 'moon-book-card', name: '月书卡', category: 'spell', reference: '月之书',
    image: '/moon-book-item-card.webp', description: '指定一名其他玩家，把他的卡牌盖起来，持续 3 分钟。', timing: 'own-turn', weight: 100,
  },
  'reborn-card': {
    id: 'reborn-card', name: '苏生卡', category: 'spell', reference: '死者苏生',
    image: '/reborn-item-card.webp', description: '让一名仍在线、已经用完猜测机会的玩家重返游戏，并获得 1 次猜测机会。', timing: 'own-turn', weight: 20,
  },
  'void-card': {
    id: 'void-card', name: '虚无卡', category: 'trap', reference: '虚无空间',
    image: '/void-item-card.webp', description: '这局提问时，大家都不能说出“特殊召唤”。', timing: 'own-turn', weight: 30,
  },
  'reversal-card': {
    id: 'reversal-card', name: '逆转卡', category: 'spell', reference: '大逆转谜题',
    image: '/reversal-item-card.webp', description: '这回合你可以问 5 个问题，但猜错或跳过就会立刻失败。', timing: 'own-turn', weight: 30,
  },
  'puzzle-card': {
    id: 'puzzle-card', name: '谜题卡', category: 'spell', reference: '谜题',
    image: '/puzzle-item-card.webp', description: '这回合你可以多问 1 个问题。', timing: 'own-turn', weight: 200,
  },
  'hint-card': {
    id: 'hint-card', name: '提示卡', category: 'monster', reference: '杀手级调整曲·提示员',
    image: '/hint-item-card.webp', description: '指定一名其他玩家，请他给你一个提示。', timing: 'own-turn', weight: 70,
  },
  'stockings-card': {
    id: 'stockings-card', name: '丝袜卡', category: 'monster', reference: '效果遮蒙者',
    image: '/stockings-item-card.webp', description: '请大家回答：场上有多少对丝袜？', timing: 'own-turn', weight: 30,
  },
  'clown-card': {
    id: 'clown-card', name: '小丑卡', category: 'monster', reference: '娱乐法师 戏法小丑',
    image: '/clown-item-card.webp', description: '指定一名其他玩家，让他的昵称变成🤡，持续 5 分钟。', timing: 'own-turn', weight: 50,
  },
  'friendship-card': {
    id: 'friendship-card', name: '友情卡', category: 'spell', reference: '友情 YU-JYO',
    image: '/friendship-item-card.webp', description: '指定一名其他玩家，你和他的猜测机会各增加 1 次。', timing: 'own-turn', weight: 70,
  },
  'unity-card': {
    id: 'unity-card', name: '团结卡', category: 'spell', reference: '团结 UNITY',
    image: '/unity-item-card.webp', description: '所有仍在猜卡的玩家，猜测机会各增加 1 次。', timing: 'own-turn', weight: 20,
  },
  'countdown-card': {
    id: 'countdown-card', name: '终焉卡', category: 'spell', reference: '终焉的倒计时',
    image: '/countdown-item-card.webp', description: '从下一个玩家回合开始，经过 20 个玩家回合后，这一局将结束。', timing: 'own-turn', weight: 5,
  },
  'snatch-card': {
    id: 'snatch-card', name: '抢夺卡', category: 'spell', reference: '强夺',
    image: '/snatch-item-card.webp', description: '指定一名至少还有 2 次猜测机会的其他玩家，夺走他除最后 1 次外的所有机会。（设计者：绫奈崎）', timing: 'own-turn', weight: 20,
  },
};
