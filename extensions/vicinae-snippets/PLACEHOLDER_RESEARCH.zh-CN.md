# 任务 2 调研报告：Raycast Snippets 动态占位符 vs Vicinae Snippets（本扩展）

更新时间：2026-01-26  
范围：仅聚焦 **Snippets 场景** 的动态占位符（Dynamic Placeholders），以及与本仓库 `extensions/vicinae-snippets` 当前实现的差异与可优化点。

## 1. Raycast 官方支持的动态占位符（Snippets 相关）

来源：

- Raycast Manual - Dynamic Placeholders：`https://manual.raycast.com/dynamic-placeholders`
- Raycast Manual - 自定义日期格式字母表（TR35）：`https://manual.raycast.com/snippets/reference-for-supported-alphabets-in-custom-date-format`

### 1.1 占位符列表（Snippets 场景）

| 占位符 | 说明 | 备注/限制 |
|---|---|---|
| `{clipboard}` | 插入最近一次复制的文本 | 若近期无复制文本，占位符会被移除 |
| `{clipboard offset=1}` | 插入更早的剪贴板历史（第 2 条） | 依赖开启 Clipboard History；offset=2 表示第 3 条… |
| `{selection}` | 插入前台应用选中文本 | Snippets 可用 |
| `{cursor}` | 粘贴后把光标定位到该位置 | Snippets 可用；**同一 snippet 只允许 1 个** |
| `{argument}` | 在搜索栏增加输入项，用输入值替换占位符 | **最多 3 个不同参数**；支持命名复用、默认值、选项 |
| `{argument name="tone"}` | 命名参数：同名 `{argument}` 会复用同一个输入值 |  |
| `{argument default="happy"}` | 默认值：参数变为可选 |  |
| `{argument name="tone" options="happy, sad"}` | 预设选项 |  |
| `{snippet name="…"} ` | 插入另一个 snippet 的内容 | **只能插入“不引用其它 snippet 的 snippet”**（避免嵌套引用） |
| `{date}` / `{time}` / `{datetime}` / `{day}` | 插入当前日期/时间/日期时间/星期 | 可叠加 offset；可用 format 自定义格式 |
| `{date offset="+3M -5d"}` | 日期/时间偏移 | offset 由多个 token 组成：`+/-数字 + 单位(m/h/d/M/y)`；大小写敏感（m=分钟，M=月） |
| `{date format="yyyy-MM-dd"}` | 自定义日期格式 | 使用 Unicode TR35 date patterns（大小写敏感）；支持引号内插入固定文本（单引号转义） |
| `{uuid}` | 插入 UUID |  |

> 备注：`{browser-tab}` 属于 Raycast 的动态占位符，但它需要 Browser Extension，且在 Snippets 场景是否可用取决于 Raycast 侧标注；本报告重点围绕 Snippets 主路径，浏览器占位符的可行性仅在“差距与建议”中评估。

### 1.2 修饰符（Modifiers）

语法：`{clipboard | uppercase}`，支持链式：`{clipboard | trim | uppercase}`。适用于所有占位符。

| 修饰符 | 作用 |
|---|---|
| `uppercase` | 转大写 |
| `lowercase` | 转小写 |
| `trim` | 去除首尾空白 |
| `percent-encode` | URL 百分号编码 |
| `json-stringify` | 变为可安全放入 JSON 字符串的值 |
| `raw` | 禁用 Raycast 在不同场景下可能施加的默认格式化（Snippets 场景通常不强依赖） |

### 1.3 自定义日期格式（TR35）要点

Raycast 文档明确了常用字母表（示例时间基于 2022-06-15 14:45 PM UTC）：

- 年：`y`/`yy`/`yyyy`
- 月：`M`/`MM`/`MMM`/`MMMM`/`MMMMM`
- 日：`d`/`dd`
- 星期：`E`/`EEEE`/`EEEEE`/`EEEEEE`
- 小时：`h`/`hh`（12 小时制），`H`/`HH`（24 小时制），`a`（AM/PM）
- 分：`m`/`mm`
- 秒：`s`/`ss`，毫秒：`SSS`
- 时区：`zzz`/`zzzz`/`ZZZZ`/`Z`/`ZZZZZ`

## 2. 本扩展当前占位符实现（Vicinae Snippets）

实现位置：

- 占位符解析与渲染：`extensions/vicinae-snippets/src/lib/placeholder-engine.ts`
- 占位符输入（argument）弹窗：`extensions/vicinae-snippets/src/search-snippets.tsx`（`ArgumentPrompt`）

### 2.1 已支持

#### 2.1.1 核心占位符

| 占位符 | 当前行为 |
|---|---|
| `{clipboard}` | 读取最新剪贴板文本；为空时替换为空字符串并提示 |
| `{selection}` | 读取当前选中文本；失败/为空时替换为空字符串并提示 |
| `{uuid}` | `crypto.randomUUID()` |
| `{date}` / `{time}` / `{datetime}` / `{day}` | `toLocale*` 默认格式；支持 `format=` 与 `offset=`（见下） |
| `{argument}` | 支持 `name/default/options`，且 **最多 3 个不同参数**；同名参数复用同一输入值 |

#### 2.1.2 修饰符（与 Raycast 基本对齐）

语法：`{clipboard|trim}` 或 `{clipboard | trim}`（内部会按 `|` 分割并 `trim`）。

- `raw`（no-op，本扩展默认不做格式化）
- `trim`
- `uppercase`
- `lowercase`
- `percent-encode`
- `json-stringify`

#### 2.1.3 日期时间：format/offset 支持现状

- 支持 `offset` 参数：例如 `{date offset="+2y +5M"}`、`{day offset=-3d}`
- offset token 规则与 Raycast 一致：`+/-数字 + 单位(m/h/d/M/y)`，大小写敏感
- 支持 `format` 参数，但 **当前仅实现了极小子集**：
  - `yyyy` `MM` `dd` `HH` `mm` `ss`
  - 其它 TR35 字母（如 `EEE`/`MMM`/`SSS`/`Z`）目前不会按 Raycast 预期工作

### 2.2 明确不支持/仅提示

| 占位符 | 当前行为 | 关键原因 |
|---|---|---|
| `{cursor}` | 替换为空字符串，并提示“不支持光标定位” | Vicinae API 暂不保证“粘贴后光标定位”能力 |
| `{snippet name="..."}` | **保持原样**，并提示不支持 | 尚未实现“snippet 引用/插入” |
| `{browser-tab}` | **保持原样**，并提示不支持 | 缺少浏览器扩展能力/接口 |
| `{clipboard offset=...}` | 会提示不支持并退化为读取最新剪贴板 | 代码中已标注：Vicinae API 的 offset 未实现 |

> 设计选择：对 **未知 `{...}`** 不做替换也不提示，避免误伤包含花括号的代码片段（如 JSON/JSX），同时避免噪音提示。

## 3. 差距清单与“可实现性”评估（面向任务优化）

### 3.1 高价值且可在扩展侧落地（推荐）

1) **实现 `{snippet name="..."}`**

- 可行性：高（纯扩展侧逻辑即可）
- 建议实现策略：
  - name 匹配规则：优先匹配 snippet `title`（必要时支持 `keyword` 作为别名匹配）
  - 递归/循环保护：对齐 Raycast 的限制——“只允许插入不引用其它 snippet 的 snippet”；或者实现更通用的 **递归展开 + 最大深度/循环检测**
  - 出错策略：找不到/不允许引用时保留原样或替换为空并提示（建议保留原样 + toast 提示，减少误删）

2) **增强日期 format：支持 Raycast TR35 常用子集**

- 可行性：中（需要实现 TR35 子集解析/格式化）
- 推荐范围（先做兼容面最大的部分）：`y/yy/yyyy`、`M/MM/MMM/MMMM`、`d/dd`、`E/EEEE`、`H/HH`、`h/hh`、`a`、`m/mm`、`s/ss`、`SSS`、`Z/ZZZZZ`
- 风险点：时区符号与 locale 行为差异；需在文档中声明“兼容子集与不兼容点”

### 3.2 受 Vicinae 能力限制，短期仅能提示/部分模拟（保守）

1) `{cursor}`

- 需要宿主提供“粘贴后光标定位/注入”的能力；没有可靠 API 时不建议模拟（键盘事件注入在不同应用中不稳定）

2) `{clipboard offset=...}`

- 需要宿主开放剪贴板历史 API，或扩展长期后台运行记录历史；目前扩展是命令式运行，难以长期采集

3) `{browser-tab ...}`

- 依赖浏览器扩展或宿主 API 读取当前 tab 的 DOM/text/html；没有能力时只能保持占位符原样并提示

## 4. 对任务2“提示 UI”的建议（本次先不实现，仅作为方案备忘）

> 你当前选择“先只出调研报告，暂不做 UI/代码”。这里仅记录可选方案，便于你后续给出最新执行方案时快速对齐。

- **方案 A（最稳）**：在编辑表单（Create/Edit）里强化 `TextArea.info` + 增强“Placeholder Guide”帮助面板（中英文/示例/对齐 Raycast）
- **方案 B（更直观）**：若 `@vicinae/api` 支持 `Form.Description`/类似组件，在 `Snippet` 字段下方常驻展示“速查表”（同时保留帮助面板）
- **方案 C（体验最佳，成本最高）**：输入框内联提示/hover 提示/自动补全（需要宿主组件支持，通常难以在扩展侧实现）

## 5. 结论

- 本扩展在 Snippets 场景已经覆盖 Raycast 动态占位符的核心子集（clipboard/selection/date/time/uuid/argument + modifiers + date offset）。
- 主要差距集中在 `{snippet name="..."}`、完整 TR35 日期格式、以及宿主能力相关的 cursor/clipboard offset/browser-tab。
- 下一步若要“兼容 Raycast 生态”，最推荐优先落地 `{snippet name="..."}` 与日期 format 子集扩展；UI 提示可以用低成本方案 A/B 显著提升可用性与可发现性。

