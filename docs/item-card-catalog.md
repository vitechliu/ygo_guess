# 道具卡清单

此表记录当前卡牌实现。新卡需求可直接在会话中提出；状态统一使用：**待设计、待开发、开发中、待上线、已上线、已停用**。“已上线”仅用于确认已经部署且玩家可以使用的卡。

| 名称  | 来源卡                                                                                                             | 状态  | 功能                          | 备注                                                              |
| --- | --------------------------------------------------------------------------------------------------------------- | --- | --------------------------- | --------------------------------------------------------------- |
| 测试卡 | [Card Trader](https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=7001&ope=2&request_locale=en)（魔法卡） | 待上线 | 无游戏效果；使用后在聊天框显示“玩家名使用了测试卡”。 | 权重 0，不参与随机抽取；卡牌 ID：`test-card`；绿色魔法卡外框，原创卡通插画；仅本人回合使用，使用后消耗。代码和测试已完成，尚未确认部署。 |
| 禁止卡 | [Prohibition](https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4968&ope=2&request_locale=en)（禁止令） | 待上线 | 自己回合指定一名仍在本局行动的其他玩家，跳过其下次回合。 | 权重 100；卡牌 ID：`prohibition-card`；可叠加，多次跳过依次生效；被跳过的回合不计入其得分用的个人回合数。 |
| 增殖卡 | [Maxx "C"](https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=9455&ope=2&request_locale=en)（增殖的G） | 待上线 | 自己回合使用后，所有玩家卡图出现会随机变换位置的可爱卡通蟑螂，持续 3 分钟。 | 权重 20；卡牌 ID：`maxx-c-card`；再次使用会刷新持续时间；本局结算时效果结束。 |
| 假面卡 | [Mask Change](https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=9066&ope=2&request_locale=en)（假面变化） | 待上线 | 自己回合使用后，场上每张卡获得不同的随机假面英雄外观，持续 1 分钟，真实答案和猜测规则不变。 | 权重 50；卡牌 ID：`mask-change-card`；再次使用会重新随机并刷新持续时间；本局结算时效果结束。 |
