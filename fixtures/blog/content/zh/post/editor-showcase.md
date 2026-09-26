---
title: 编辑器全功能测试文章
date: 2026-01-15 10:00:00+08:00
draft: false
author: spixed
featured: true
categories: [测试]
tags: [fixture, editor]
description: '覆盖所有块类型的小型测试文章'
weight: 0
---

简介：这篇文章覆盖 Blog Writer 支持的每一种块类型，供 round-trip 测试、渲染对比与截图使用。

<!--more-->

# 文本块

这是一个普通段落，包含 **粗体**、*斜体*、~~删除线~~、`行内代码` 和一个 [链接](https://gohugo.io)。

> 这是一段引用。引用可以包含 **格式**。

行内公式：$G=mg$

# 代码块

```cpp
#include <iostream>

int main() {
    std::cout << "Hello, fixture!" << std::endl;
    return 0;
}
```

# 高亮

{{% hl "orange" %}}橙色高亮{{% /hl %}} 与 {{% hl "blue" %}}**蓝色高亮内含粗体**{{% /hl %}}

多行高亮：

{{< hl "orange" >}}
第一行高亮
第二行高亮
{{< /hl >}}

# 表情与注音

行内表情：{{< qq-emoji "惊讶" >}}{{< qq-emoji "流泪" >}}

块状表情：{{< qq-emoji "惊讶" "block" >}}

注音：{{< ruby "漢字" "かんじ" >}} {{< ruby "汉字" "hàn zì" >}}

# 表格

| 功能 | 状态 |
| --- | --- |
| 所见即所得 | 支持 |
| 分栏渲染 | 支持 |
| 双语模式 | 支持 |

# 列表与任务列表

1. 有序列表第一项
2. 有序列表第二项

- [x] 已完成任务
- [ ] 未完成任务

# 公式块

$$
\text{质能方程}:\quad E = mc^2
$$

# 图片

![示例图片，带图注与宽度](/images/sample.png?width=130px "示例标题")

# 原始 HTML

<div align="center">居中的原始 HTML 块</div>

# 缩进代码块

    这是一个缩进代码块
    第二行
