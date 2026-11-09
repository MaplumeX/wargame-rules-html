# 1.0 游戏设置

红方单位放在河流西岸，蓝方单位放在河流东岸。

## 1.1 增援

增援在己方移动阶段开始时进场。

# 2.0 回合流程

游戏共 4 回合，每天分为白天和夜间。

## 2.1 回合顺序

<div class="turn-flow" data-turnflow>
<div class="tf-controls" role="group" aria-label="选择当前回合">%%TRACK%%</div>
<div class="tf-now" id="tf-now" hidden></div>

<div class="tf-seg" data-only="day">
<h3 id="r-2-1-1" data-rule="2.1.1" class="rh rh3"><span class="rn">2.1.1</span> 补给阶段（仅限白天）</h3>
<ol class="tf-steps"><li>检查每个单位的补给。</li></ol>
</div>

<div class="tf-two">
<div class="tf-side tf-a">
<h4>红方回合</h4>
<ol class="tf-steps">
<li>移动单位（§3.0）。</li>
<li data-strike="night" data-badge="night:夜间不可用">发起炮击（§4.2）。</li>
<li>发起突击（§4.0）。</li>
</ol>
</div>
<div class="tf-side tf-b">
<h4>蓝方回合</h4>
<ol class="tf-steps">
<li>移动单位，移动力<span class="cond" data-only="day"><b>白天：</b>不变</span><span class="cond" data-only="night"><b>夜间：</b>减半</span>。</li>
<li>发起突击（§4.0）。</li>
</ol>
</div>
</div>
</div>

# 3.0 移动

每个单位每回合可以移动一次，最多移动 3 格。

:::except
炮兵单位最多移动 1 格。
:::

## 3.1 河流

进入河流格的单位立刻停止移动。

:::example 渡河
一个步兵单位从 0301 出发，第 2 格进入河流，立刻停止移动。
:::

## 3.2 撤退距离

| 单位 | 最大撤退距离 |
|---|---|
| 步兵 | 2 格 |
| 炮兵 | 1 格 |

# 4.0 战斗

单位可以攻击相邻格的敌方单位。撤退距离见 §3.2。

## 4.1 结算

投 1 个六面骰，加上攻击力，减去防御力：

| 结果 | 效果 |
|---|---|
| ≤ 2 | 无效 |
| 3–4 | 目标撤退 |
| ≥ 5 | 目标消灭 |

## 4.2 炮击

炮兵单位可以攻击 2 格内的目标。

<div class="choice">
<div class="choice-a">

**直接射击**

1. 目标必须在视线内。

</div>
<div class="choice-b">

**间接射击**

1. 需要友方单位观测目标。

</div>
</div>

# 5.0 胜利条件

第 4 回合结束时，控制桥梁的一方获胜。
