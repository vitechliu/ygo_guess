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
    image: '/prohibition-item-card.webp', description: '指定一名其他玩家，跳过他的下一个回合。', timing: 'own-turn', weight: 50,
  },
  'maxx-c-card': {
    id: 'maxx-c-card', name: '增殖卡', category: 'monster', reference: '增殖的G',
    image: '/maxx-c-item-card.webp', description: '可爱的G爬上所有人的卡牌，持续 3 分钟。', timing: 'own-turn', weight: 50,
  },
  'mask-change-card': {
    id: 'mask-change-card', name: '假面卡', category: 'spell', reference: '假面变化',
    image: '/mask-change-item-card.webp', description: '所有人的卡牌暂时变化变成不同的假面英雄，持续 1 分钟。', timing: 'own-turn', weight: 50,
  },
  'chance-card': {
    id: 'chance-card', name: '机会卡', category: 'spell', reference: '第二次机会',
    image: '/chance-item-card.webp', description: '你的猜测机会增加 1 次。', timing: 'own-turn', weight: 150,
  },
  'lightning-card': {
    id: 'lightning-card', name: '雷击卡', category: 'spell', reference: '雷击',
    image: '/lightning-item-card.webp', description: '雷电会随机落下，持续 3 分钟。', timing: 'own-turn', weight: 80,
  },
  'fireball-card': {
    id: 'fireball-card', name: '火球卡', category: 'spell', reference: '火球',
    image: '/fireball-item-card.webp', description: '让一名其他玩家的卡牌燃烧！持续 3 分钟。', timing: 'own-turn', weight: 150,
  },
  'outer-entity-card': {
    id: 'outer-entity-card', name: '外神卡', category: 'xyz', reference: '外神 奈亚拉',
    image: '/outer-entity-item-card.webp', description: '来自星空的神秘生物现在注视着所有卡牌，持续5分钟。', timing: 'own-turn', weight: 30,
  },
  'god-rage-card': {
    id: 'god-rage-card', name: '神愤卡', category: 'xyz', reference: 'No.69 纹章神 盾徽-神之愤怒',
    image: '/god-rage-item-card.webp', description: '指定一名其他玩家，抹除他的卡名，直到这一小局结束。', timing: 'own-turn', weight: 50,
  },
  'crossout-card': {
    id: 'crossout-card', name: '指名卡', category: 'spell', reference: '抹杀的指名者',
    image: '/crossout-item-card.webp', description: '宣布一个词或概念，这局游戏里大家提问时都不能提及。', timing: 'own-turn', weight: 40,
  },
  'scanner-card': {
    id: 'scanner-card', name: '扫描卡', category: 'spell', reference: '卡片扫描者',
    image: '/scanner-item-card.webp', description: '得知你的卡牌有多少字。', timing: 'own-turn', weight: 100,
  },
  'moon-book-card': {
    id: 'moon-book-card', name: '月书卡', category: 'spell', reference: '月之书',
    image: '/moon-book-item-card.webp', description: '指定一名其他玩家，把他的卡牌盖伏，持续 3 分钟。', timing: 'own-turn', weight: 100,
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
    image: '/reversal-item-card.webp', description: '这回合你可以额外问 5 个问题，但猜错或跳过就会立刻失败。', timing: 'own-turn', weight: 30,
  },
  'puzzle-card': {
    id: 'puzzle-card', name: '谜题卡', category: 'spell', reference: '谜题',
    image: '/puzzle-item-card.webp', description: '这回合你可以额外问 1 个问题。', timing: 'own-turn', weight: 200,
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
    image: '/clown-item-card.webp', description: '指定一名其他玩家，让他的变成🤡，持续 5 分钟。', timing: 'own-turn', weight: 50,
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
    image: '/countdown-item-card.webp', description: '从下一个玩家回合开始，经过 20 个玩家回合后，游戏强制结束。', timing: 'own-turn', weight: 5,
  },
  'snatch-card': {
    id: 'snatch-card', name: '抢夺卡', category: 'spell', reference: '强夺',
    image: '/snatch-item-card.webp', description: '指定一名至少还有 2 次猜测机会的其他玩家，夺走他除最后 1 次外的所有机会。（设计者：绫奈崎）', timing: 'own-turn', weight: 20,
  },
  'flower-card': {
    id: 'flower-card', name: '鲜花卡', category: 'synchro', reference: '鲜花女男爵',
    image: '/flower-item-card.webp', description: '鲜花女男爵现在来为场上助兴。', timing: 'own-turn', weight: 100,
  },
  'mind-eye-card': {
    id: 'mind-eye-card', name: '看透卡', category: 'trap', reference: '看透心灵之眼',
    image: '/mind-eye-item-card.webp', description: '查看其他玩家现在持有的道具卡。', timing: 'own-turn', weight: 50,
  },
  'time-magic-card': {
    id: 'time-magic-card', name: '魔术卡', category: 'monster', reference: '时间魔术师',
    image: '/time-magic-item-card.webp', description: '抛一枚硬币：正面增加 1 次猜测机会，反面减少 1 次，但至少保留 1 次。', timing: 'own-turn', weight: 150,
  },
  'cyclone-card': {
    id: 'cyclone-card', name: '旋风卡', category: 'spell', reference: '旋风',
    image: '/cyclone-item-card.webp', description: '指定场上一张卡牌，旋风会绕着它盘旋并让它翻转几秒。', timing: 'own-turn', weight: 150,
  },
  'storm-card': {
    id: 'storm-card', name: '风暴卡', category: 'spell', reference: '大风暴',
    image: '/storm-item-card.webp', description: '场上所有卡牌一起剧烈翻转几秒。', timing: 'own-turn', weight: 50,
  },
  'meteor-card': {
    id: 'meteor-card', name: '陨石卡', category: 'monster', reference: '原始生命态 尼比鲁',
    image: '/meteor-item-card.webp', description: '随机一张卡牌会迎来陨石坠落。', timing: 'own-turn', weight: 20,
  },
  'ground-break-card': {
    id: 'ground-break-card', name: '地碎卡', category: 'spell', reference: '地碎',
    image: '/ground-break-item-card.webp', description: '猜测机会最少的一名玩家，他的卡牌会出现裂痕，持续 5 分钟。', timing: 'own-turn', weight: 100,
  },
  'eclipse-book-card': {
    id: 'eclipse-book-card', name: '日书卡', category: 'spell', reference: '日全食之书',
    image: '/eclipse-book-item-card.webp', description: '把场上所有卡牌盖起来，持续 1 分钟。', timing: 'own-turn', weight: 20,
  },
  'convulsion-card': {
    id: 'convulsion-card', name: '天变卡', category: 'spell', reference: '天变地异',
    image: '/convulsion-item-card.webp', description: '所有玩家随机获得一张灾难卡。', timing: 'own-turn', weight: 20,
  },
};
