---
title: Editor Showcase
date: 2026-01-15 10:00:00+08:00
draft: false
author: spixed
featured: false
categories: [Testing]
tags: [fixture, editor]
description: 'A small post covering every block type'
weight: 0
---

Intro: this post covers every block type Blog Writer supports, for round-trip tests, render comparison and screenshots.

<!--more-->

# Text blocks

A plain paragraph with **bold**, *italic*, ~~strikethrough~~, `inline code` and a [link](https://gohugo.io).

> A blockquote with **formatting** inside.

Inline math: $G=mg$

# Code block

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("fixture"))
```

# Highlights

{{% hl "orange" %}}Orange highlight{{% /hl %}} and {{% hl "blue" %}}**blue highlight with bold**{{% /hl %}}

# Emoji and ruby

Inline emoji: {{< qq-emoji "惊讶" >}}{{< qq-emoji "流泪" >}}

Ruby: {{< ruby "漢字" "かんじ" >}}

# Table

| Feature | Status |
| --- | --- |
| WYSIWYG | done |
| Split render | done |
| Bilingual | done |

# Lists and task lists

1. First item
2. Second item

- [x] Done
- [ ] Todo

# Math block

$$
E = mc^2
$$

# Image

![A sample image with caption and width](/images/sample.png?width=130px "Sample title")
