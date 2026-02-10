# vicinae-snippets

[English](README.md)

一个 Vicinae 扩展：用于创建、管理并快速插入文本/代码片段（交互参考 Raycast Snippets）。

## 功能亮点

- 创建与管理 Snippets（名称、内容、分类、keyword/别名）
- 搜索与预览（支持按分类过滤）
- 一键复制/粘贴到当前应用（粘贴失败会自动降级为复制）
- 动态占位符（部分兼容 Raycast Dynamic Placeholders）
- 导入/导出（JSON 文件优先，剪贴板兜底）

## 命令（Commands）

- **Create Snippet**：创建新片段
- **Search Snippets**：搜索、预览，并执行复制/粘贴/编辑/复制副本/固定等操作
- **Import Snippets**：从 JSON 导入（文件优先，剪贴板兜底），并输出导入报告
- **Export Snippets**：导出为 JSON 文件，并同时复制到剪贴板

## 使用说明

### Create Snippet

表单字段顺序与 Edit 一致：

- **Name**
- **Snippet**
- **Keyword**
- **Category**

> 注意：Raycast 的 keyword 支持全局自动扩展；本扩展的 **Keyword 仅用于 Vicinae 内检索**（alias/过滤），不做任意应用内输入自动扩展。

### Search Snippets

- **右侧详情面板**：

  - 上半部分：显示 Snippet 完整内容（保留换行与行首缩进）
  - 下半部分：显示字段（自上而下）：
    - Name
    - Category
    - Content type
    - Modified

- **Action 区快捷键（右下角）**：
  - Paste to Active App：`Enter`
  - Copy to Clipboard：`Ctrl+Enter`
  - Pin Snippet：`Ctrl+Shift+P`
  - Edit Snippet：`Ctrl+E`
  - Duplicate Snippet：无
  - Move to Other Category：无（更新 Snippet 的 Category 字段）

## 动态占位符（首版支持）

- `{clipboard}`：插入剪贴板文本；若为空则替换为空字符串并提示
- `{selection}`：插入当前选中文本；若失败/为空则替换为空字符串并提示
- `{date}` / `{time}` / `{datetime}` / `{day}`：插入当前日期/时间
- `{uuid}`：插入随机 UUID
- `{argument}`：插入用户输入参数（最多 3 个不同参数；支持 `name`/`default`）
- `{cursor}`：首版仅会被解析并移除（不支持光标定位时会提示）

支持修饰符（modifier）：`uppercase`、`lowercase`、`trim`、`percent-encode`、`json-stringify`、`raw`。

### 未支持但会提示的占位符

- `{snippet name="..."}`：暂不支持引用其他 snippet
- `{browser-tab}`：暂不支持
- `{clipboard offset=...}`：当前 Vicinae API 尚未实现 offset（会读取最新剪贴板文本）

## 导入 / 导出

### 导入（Import）

- **优先**：选择 JSON 文件导入
- **兜底**：直接在页面粘贴 JSON，或使用剪贴板中的 JSON
- **去重规则**：`title + content` 相同视为重复并跳过

支持的 JSON 输入格式（best-effort）：

- **Raycast Import Snippets**：数组格式，字段为 `name`（标题）、`text`（内容）、`keyword`（可选）
- **本扩展格式**：数组，或 `{ "snippets": [...] }` 形式（参见 `specs/001-vicinae-snippets/contracts/snippet-store.schema.json`）

### 导出（Export）

- 导出会把当前 snippets 写入 `environment.supportPath` 下的 `snippets-export-*.json`
- 同时会把同一份 JSON 复制到剪贴板（用于快速分享/迁移）

## 数据存储

- 默认离线：数据保存在 `environment.supportPath` 下的 `snippets.json`
- 不会主动上传/同步 snippet 内容

## 隐私与安全

- 错误会以 Toast/HUD 提示，避免静默失败
- 为了更隐私，Search 页的 “Copy to Clipboard” 默认使用 `concealed: true`，避免内容进入 Vicinae 剪贴板历史

## 开发

### 前置条件

- Node.js 18+
- npm

### 开发运行

```bash
npm install
npm run dev
```

> 注：`npm run dev` 会过滤一条上游 React 噪音警告（避免干扰开发输出）；如需查看原始输出，请使用 `npm run dev:raw`。

### 构建 / 自检

```bash
npm run build
npm run lint
npm run check
```

## 许可

MIT。
