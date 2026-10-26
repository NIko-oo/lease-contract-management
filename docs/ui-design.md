# UI 设计指南（行政租赁合同管理系统）

> 本文件由 `AGENTS.md` 披露而来：改动任何页面视觉前查阅。

# UI 设计指南

> **场景类型**: <scene_type>prototype-app</scene_type>（应用架构设计）
> **确认检查**: 本指南适用于行政租赁合同管理后台系统，包含合同录入、财务审核、台账管理等多页面功能模块。

> ℹ️ Section 1-2 为设计意图与决策上下文。Code agent 实现时以 Section 3 及之后的具体参数为准。

## 1. Design Archetype (设计原型)

### 1.1 内容理解
- **目标用户**: 行政人员（合同录入/终止申请）、财务人员（审核/台账/收款）、后勤人员（水电费登记）、超级管理员（全权限）
- **核心目的**: 建立信任（财务数据准确性）、引导行动（审核流程/数据录入）、高效操作（表格批量处理）
- **期望情绪**: 专业、可控、清晰、稳重
- **需避免的感受**: 焦虑（数据误操作）、混乱（导航不清）、廉价感（不专业的视觉）

### 1.2 设计语言
- **Aesthetic Direction**: 企业级后台系统，强调数据秩序与操作严谨性，通过清晰的视觉层级和充足的留白降低认知负荷
- **Visual Signature**: 极细边框区分层级、深冷色 Sidebar 锚定导航、高对比度表格数据、状态色标签明确流程节点
- **Emotional Tone**: 专业可信 — 深蓝灰主调传递稳重感，清晰的排版建立掌控感
- **Design Style**: Muji 极简 — 行政财务系统需严谨秩序感，极细边框 + 充裕留白 + Sharp 直角强化理性气质
- **Application Type**: App（多页面后台管理系统）

## 2. Design Principles (设计理念)

1. **数据优先**：表格和表单位于视觉核心，减少装饰干扰，确保数字和状态一目了然
2. **流程可视**：通过颜色编码（待审核/已通过/已驳回）和明确的状态标签，让业务流程进度清晰可见
3. **防错设计**：关键操作（审核通过/终止合同）使用强对比色和二次确认，避免误操作
4. **高效扫描**：列表页支持快速筛选和批量操作，减少页面跳转，提升行政财务工作效率
5. **层级克制**：仅使用必要的视觉层级（Sidebar > 页面标题 > 卡片/表格 > 操作按钮），避免过度嵌套

## 3. Color System (色彩系统)

> 基于内容理解推导配色方案：企业级财务合同系统需建立专业信任感，选择沉稳的深蓝灰主调，配合清晰的语义状态色。

**配色设计理由**：财务数据系统需要传达专业、可信、冷静的气质。深蓝灰色系（Navy-Charcoal）作为导航和主色调，配合纯白内容区和高对比度文字，确保长时间办公场景下的可读性和专注度。

### 3.1 主题颜色

> **App 场景约束**：自主设计的专业企业配色，Primary 与 Accent 保持足够差异（Primary 饱和度高用于行动号召，Accent 低饱和度用于状态反馈）。

| 角色 | CSS 变量 | Tailwind Class | HSL 值 | 设计说明 |
|-----|---------|----------------|--------|---------|
| bg | `--background` | `bg-background` | `hsl(220 14% 96%)` | 浅灰蓝页面背景，减少纯白刺眼感 |
| surface | `--card` | `bg-card` | `hsl(0 0% 100%)` | 纯白卡片/表格背景 |
| header | `--header` | `bg-[hsl(220_30%_18%)]` | `hsl(220 30% 18%)` | 深蓝灰 Sidebar/Header，专业稳重 |
| text | `--foreground` | `text-foreground` | `hsl(220 20% 15%)` | 近黑深蓝灰，确保可读性 |
| textMuted | `--muted-foreground` | `text-muted-foreground` | `hsl(220 10% 45%)` | 中灰，用于次要信息 |
| primary | `--primary` | `bg-primary` | `hsl(220 50% 35%)` | 深蓝主交互色，按钮/链接 |
| primary-foreground | `--primary-foreground` | `text-primary-foreground` | `hsl(0 0% 100%)` | 主按钮上的白色文字 |
| accent | `--accent` | `bg-accent` | `hsl(220 20% 92%)` | 浅灰蓝，hover/选中态背景 |
| accent-foreground | `--accent-foreground` | `text-accent-foreground` | `hsl(220 30% 25%)` | accent 区域上的深色文字 |
| border | `--border` | `border-border` | `hsl(220 13% 90%)` | 极浅灰蓝边框，Muji 极简风格 |
| destructive | `--destructive` | `bg-destructive` | `hsl(0 72% 51%)` | 删除/驳回/终止等危险操作 |
| destructive-foreground | `--destructive-foreground` | `text-destructive-foreground` | `hsl(0 0% 100%)` | 危险按钮上的白色文字 |
| success | `--success` | `text-success` | `hsl(142 71% 35%)` | 审核通过/已收款等正向状态 |
| warning | `--warning` | `text-warning` | `hsl(38 92% 45%)` | 待审核/部分收款等警示状态 |

> **Color Token 语义速查（供 code agent 参考）**:
> - `primary` → 主行动：保存、提交审核、通过、录入
> - `accent` → 状态反馈：表格行 hover、菜单选中、Sidebar 项 hover
> - `muted` → 静态非交互：禁用态、占位符、说明文字
> - `destructive` → 危险操作：驳回、终止合同、删除
> - `success/warning` → 流程状态标签：已通过（绿）、待审核（橙）、已驳回（红）

### 3.2 Sidebar 颜色（Sidebar 导航专用）

> **定义时机**：本系统使用 Sidebar 导航，必须定义此章节

| 角色 | CSS 变量 | Tailwind Class | HSL 值 | 设计说明 |
|-----|---------|----------------|--------|---------|
| sidebar | `--sidebar` | `bg-sidebar` | `hsl(220 30% 18%)` | 深蓝灰背景，与 header 一致 |
| sidebar-foreground | `--sidebar-foreground` | `text-sidebar-foreground` | `hsl(220 10% 85%)` | 浅灰文字，确保在深色背景上可读 |
| sidebar-primary | `--sidebar-primary` | `bg-sidebar-primary` | `hsl(220 50% 35%)` | 激活态菜单项背景（使用 primary 色）|
| sidebar-primary-foreground | `--sidebar-primary-foreground` | `text-sidebar-primary-foreground` | `hsl(0 0% 100%)` | 激活态菜单项白色文字 |
| sidebar-accent | `--sidebar-accent` | `bg-sidebar-accent` | `hsl(220 25% 25%)` | Hover 态背景，比 sidebar 稍亮 |
| sidebar-accent-foreground | `--sidebar-accent-foreground` | `text-sidebar-accent-foreground` | `hsl(0 0% 100%)` | Hover 态白色文字 |
| sidebar-border | `--sidebar-border` | `border-sidebar-border` | `hsl(220 25% 25%)` | Sidebar 分割线，微妙区分 |
| sidebar-ring | `--sidebar-ring` | `ring-sidebar-ring` | `hsl(220 50% 45%)` | 聚焦环，稍亮的蓝色 |

## 4. Typography (字体排版)

- **Heading**: Inter, SF Pro Display, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
- **Body**: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif
- **数字专用**: "SF Mono", Monaco, "Cascadia Mono", "Roboto Mono", Consolas, "Courier New", monospace（用于金额、合同编号等，确保等宽对齐）
- **字体导入**: 使用系统字体栈，禁止引入 Google Fonts

## 5. Global Layout Structure (全局布局结构)

### 5.1 Page Content Zones (页面区块配置)

> ⚠️ **全局统一规则**：以下参数为所有页面共享的**唯一**内容区定义。禁止按页面拆分、禁止为不同页面定义不同的 max-w。
> 禁止使用 `max-w-full` 或 `w-full` 作为内容区最大宽度。

**Standard Content Zone（全页面统一）**:
- **Maximum Width**: `max-w-[1400px]`（后台系统表格数据密集，适当放宽）
- **Padding**: `px-6 py-8`（桌面端），`px-4 py-6`（移动端，若需适配）
- **Alignment**: `mx-auto`
- **Vertical Spacing**: `gap-6`（卡片/区块间距），`space-y-6`（内容流间距）

**宽内容溢出策略**：当页面内某个组件（如宽表格）超出 Standard Content Zone 宽度时，在该组件外层使用 `overflow-x-auto` 实现横向滚动，禁止为此放大容器 max-w。

### 5.2 布局骨架

```html
<div class="min-h-screen bg-background flex">
  <!-- Sidebar 固定左侧 -->
  <aside class="w-64 bg-sidebar fixed left-0 top-0 h-screen border-r border-sidebar-border flex flex-col">
    <!-- Logo 区域 -->
    <div class="h-16 flex items-center px-6 border-b border-sidebar-border">
      <span class="text-sidebar-foreground font-bold text-lg">租赁合同管理</span>
    </div>
    <!-- 导航菜单 -->
    <nav class="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
      <!-- 导航项示例 -->
      <a href="/contracts" class="flex items-center gap-3 px-3 py-2 rounded-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
        <FileText class="w-5 h-5" />
        <span>合同管理</span>
      </a>
      <!-- 激活态示例 -->
      <a href="/ledger" class="flex items-center gap-3 px-3 py-2 rounded-sm bg-sidebar-primary text-sidebar-primary-foreground">
        <BookOpen class="w-5 h-5" />
        <span>台账管理</span>
      </a>
    </nav>
    <!-- 底部用户信息 -->
    <div class="p-4 border-t border-sidebar-border">
      <div class="text-sidebar-foreground text-sm">当前用户</div>
      <div class="text-sidebar-foreground/60 text-xs">财务专员</div>
    </div>
  </aside>

  <!-- 主内容区 -->
  <main class="flex-1 ml-64 bg-background min-h-screen">
    <!-- 可选：页面级 Topbar（简单标题栏，非导航） -->
    <header class="h-16 bg-surface border-b border-border flex items-center justify-between px-6 sticky top-0 z-10">
      <h1 class="text-xl font-semibold text-foreground">页面标题</h1>
      <div class="flex items-center gap-3">
        <!-- 操作按钮区域 -->
      </div>
    </header>
    
    <!-- 页面内容 -->
    <div class="max-w-[1400px] mx-auto px-6 py-8">
      <!-- 页面具体内容 -->
    </div>
  </main>
</div>
```

## 6. Visual Effects & Motion (视觉效果与动效)

- **Header/Hero 视觉方案**: 无（后台系统无需 Hero 区域，页面标题使用简单边框分隔）
- **装饰手法**: 无（Muji 极简风格，零装饰元素，依靠边框和留白建立层级）
- **圆角**: 
  - 按钮：`rounded-sm` (2px) 或 `rounded` (4px)，保持 sharp 感
  - 卡片/表格：`rounded-sm` (2px) 或 `rounded` (4px)
  - 输入框：`rounded-sm` (2px)
  - Sidebar 菜单项：`rounded-sm` (2px)
- **阴影**: 
  - 卡片：`shadow-sm`（极浅，仅用于悬浮感）
  - Modal/Dropdown：`shadow-lg`（适度提升）
  - 禁止：大面积阴影、彩色阴影
- **复杂背景文字处理**: 无需处理（后台系统无复杂背景，Sidebar 使用高对比度浅色文字）
- **缓动函数**: `cubic-bezier(0.4, 0, 0.2, 1)`（标准 ease-out）
- **关键动效**:
  - 页面切换：淡入 150ms
  - 表格行 hover：背景色变化 150ms
  - 按钮 hover：背景色/透明度变化 150ms
  - Modal 打开：淡入 + 轻微下滑 200ms

## 7. Components (组件指南)

> **必须引用 Color System 中的颜色角色**（如 `primary`、`accent`、`border`）
> 每个组件需定义 Default/Hover/Active/Focus/Disabled 状态

### Buttons

- **Primary**: 
  - 背景 `bg-primary` 
  - 文字 `text-primary-foreground` 
  - Hover `bg-primary/90`（透明度降低）
  - 用于：保存、提交审核、通过、确认收款
  
- **Secondary**: 
  - 背景 `bg-card` 
  - 边框 `border border-border` 
  - 文字 `text-foreground`
  - Hover `bg-accent text-accent-foreground`
  - 用于：取消、返回、次要操作

- **Ghost**: 
  - 背景 透明 
  - 文字 `text-foreground` 
  - Hover `bg-accent text-accent-foreground`
  - 用于：表格内操作链接、图标按钮

- **Destructive**: 
  - 背景 `bg-destructive` 
  - 文字 `text-destructive-foreground`
  - Hover `bg-destructive/90`
  - 用于：驳回、终止合同、删除

- **Outline**: 
  - 背景 透明 
  - 边框 `border border-border` 
  - Hover `bg-accent text-accent-foreground`
  - 用于：筛选器、导出按钮

### Form Elements

- **输入框**: 
  - 背景 `bg-card` 
  - 边框 `border border-border` 
  - Focus `ring-2 ring-primary/20 border-primary`
  - Placeholder `text-muted-foreground`

- **选择框 (Select)**: 同输入框样式，下拉菜单使用 `bg-card border border-border shadow-lg`

- **日期选择器**: 同输入框样式，日历面板 `bg-card border border-border`

- **开关 (Switch)**: 
  - 关闭 `bg-muted` 
  - 开启 `bg-primary` 
  - 旋钮 `bg-white`

- **复选框/单选**: 
  - 未选 `border-border bg-card` 
  - 选中 `bg-primary border-primary`

### Cards

- 背景 `bg-card` 
- 边框 `border border-border` 
- 阴影 `shadow-sm` 
- 圆角 `rounded-sm`
- 内边距 `p-6`（标准），`p-4`（紧凑）

### Tables

- 表头：背景 `bg-muted/50`（极浅灰），文字 `text-foreground font-medium`，边框 `border-b border-border`
- 表体行：背景 `bg-card`，Hover `bg-accent/50`
- 单元格：内边距 `px-4 py-3`，文字 `text-sm`
- 斑马纹：可选 `even:bg-muted/30`
- 选中行：`bg-accent`
- 空状态：居中显示，图标 + 文字提示

### Menu / Dropdown

- 容器 `bg-card border border-border shadow-lg rounded-sm`
- **菜单项**: 
  - Default `text-foreground`
  - Hover/Focus `bg-accent text-accent-foreground`
  - 激活 `bg-primary text-primary-foreground`

### Sidebar Navigation

- 容器 `bg-sidebar`
- **菜单项**:
  - Default `text-sidebar-foreground` 
  - Hover `bg-sidebar-accent text-sidebar-accent-foreground`
  - 激活 `bg-sidebar-primary text-sidebar-primary-foreground`
- 图标尺寸 `w-5 h-5`
- 文字大小 `text-sm`

### Status Tags（状态标签）

- **待审核**: `bg-warning/10 text-warning border border-warning/20`（橙黄背景+边框）
- **已通过/已收款**: `bg-success/10 text-success border border-success/20`（绿色背景+边框）
- **已驳回/已终止**: `bg-destructive/10 text-destructive border border-destructive/20`（红色背景+边框）
- **处理中**: `bg-accent text-accent-foreground`（灰色背景）
- 圆角 `rounded-full`（胶囊形状）或 `rounded-sm`
- 字号 `text-xs font-medium px-2.5 py-0.5`

### Skeleton

- 背景 `bg-muted` 或 `bg-accent`
- 动画 `animate-pulse`
- 圆角同对应组件（如表格行 skeleton 用 `rounded-sm`）

## 8. Flexibility Note (灵活性说明)

> **一致性优先原则**：多页应用（MPA）中，所有页面必须使用相同的核心参数（最大宽度、容器边距、圆角、阴影等），确保整体设计语言统一。
>
> **允许的微调范围**（code agent 可自行判断）：
> - 响应式断点适配（如移动端边距可减小，但后台系统主要面向桌面端）
> - 表格密度调整（标准 `p-4` vs 紧凑 `p-3`）
> - 页面内部的局部间距（如表单分组间距）
> - 单页组件（如 Modal、Drawer）的独立样式
>
> **禁止的随意变更**：
> - ❌ 不同页面使用不同的最大宽度
> - ❌ 不同页面使用不同的圆角/阴影风格
> - ❌ 不同页面使用不同的主色调
> - ❌ 未经用户要求使用深色主题

## 9. Signature & Constraints (设计签名与禁区)

### DO (视觉签名)
1. **极细边框表格**: `border-border` (hsl(220 13% 90%)) 作为表格和卡片的主要分隔手段，保持 Muji 极简的理性美感
2. **深蓝灰 Sidebar**: `bg-[hsl(220_30%_18%)]` 作为全局导航锚点，传递专业稳重感
3. **等宽数字对齐**: 金额、合同编号使用等宽字体栈，确保表格列完美对齐
4. **状态色胶囊标签**: 流程状态使用带半透明背景的胶囊标签，颜色编码清晰（绿/橙/红）
5. **充裕的表格留白**: 行高 `py-3`~`py-4`，确保财务数据扫描时的呼吸感

### DON'T (禁止做法)
> 通用约束参见「通用约束」。以下为 Prototype 特有：
- ❌ 使用渐变背景（Muji 极简风格禁止渐变，纯 flat 设计）
- ❌ 使用圆角大于 4px 的卡片（保持 sharp 理性感）
- ❌ 在表格中使用斑马纹以外的装饰（如左侧彩色边框，除非标识选中态）
- ❌ 使用彩色阴影（仅允许黑色透明度阴影）
- ❌ 图标使用彩色（仅允许 `text-foreground` 或 `text-muted-foreground`，操作按钮除外）

---

