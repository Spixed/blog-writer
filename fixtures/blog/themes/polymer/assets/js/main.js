// --- 0. MOTION PREFERENCE ---
// Shared gate for every decorative animation (hero autoplay, card tilt /
// parallax, Lottie). The CSS side lives in the prefers-reduced-motion block
// of main.css.
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- 1. THEME LOGIC ---
function toggleMenu() {
    const menu = document.getElementById("mobile-menu");
    menu.classList.toggle("open");
    document.body.style.overflow = menu.classList.contains("open") ? "hidden" : "";
}

function getTheme() {
    return localStorage.getItem("theme") || "auto";
}

function applyTheme(theme) {
    const btns = document.querySelectorAll('.btn-toggle[id*="theme-btn"]');
    let effectiveTheme = theme;
    
    if (theme === "auto") {
        const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        effectiveTheme = sysDark ? "dark" : "light";
        btns.forEach(b => b.textContent = "AUTO");
    } else {
        btns.forEach(b => b.textContent = theme.toUpperCase());
    }
    
    document.documentElement.setAttribute("data-theme", effectiveTheme);
}

function initTheme() {
    const theme = getTheme();
    applyTheme(theme);
    
    // Listen for system preference changes
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        if (getTheme() === "auto") {
            applyTheme("auto");
        }
    });
}

function toggleTheme() {
    const current = getTheme();
    let next;
    
    if (current === "auto") next = "light";
    else if (current === "light") next = "dark";
    else next = "auto";
    
    localStorage.setItem("theme", next);
    applyTheme(next);
}

// --- 2. FILTER & GRID ---
function filterGrid(type, btn) {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");

    const heroCard = document.getElementById("hero-card");
    if (heroCard) {
        if (type === "all") {
            heroCard.style.display = "";
        } else {
            heroCard.style.display = "none";
        }
    }

    const profileContainer = document.getElementById("author-profile");
    const profileCards = document.querySelectorAll(".profile-card-data");
    if (profileCards.length > 0) {
        profileCards.forEach((c) => (c.style.display = "none"));
        if (type === "all") {
            profileContainer.classList.remove("visible");
        } else {
            const targetCard = document.getElementById("profile-" + type);
            if (targetCard) {
                targetCard.style.display = "flex";
                profileContainer.classList.add("visible");
            } else {
                profileContainer.classList.remove("visible");
            }
        }
    }

    document.querySelectorAll(".card-wrapper:not(#hero-card)").forEach((card) => {
        const author = card.dataset.author;
        const filterStr = card.dataset.filter || "";

        let shouldShow = type === "all" || author === type || filterStr.includes(type);

        if (type === "all" && card.classList.contains("featured-card")) {
            shouldShow = false;
        }

        if (shouldShow) {
            card.classList.remove("hidden");
        } else {
            card.classList.add("hidden");
        }
    });

    distributeColorsAndSizes();
}

function distributeColorsAndSizes() {
    const visibleCards = Array.from(document.querySelectorAll(".grid-container > .card-wrapper:not(.hidden):not(#hero-card)"));
    const styles = ["style-blue", "style-yellow", "style-green", "style-grey", "style-black", "style-red"];
    const spans = ["span-4", "span-4", "span-4", "span-6", "span-3", "span-3", "span-3", "span-3", "span-3", "span-3"];

    visibleCards.forEach((card, i) => {
        styles.forEach((s) => card.classList.remove(s));
        spans.forEach((s) => card.classList.remove(s));

        card.classList.add(styles[i % styles.length]);
        const spanClass = spans[i % spans.length];
        card.classList.add(spanClass);
    });
}

// --- 3. HERO LOGIC ---
let heroInterval;
let isHeroPlaying = true;

function startHeroAutoPlay() {
    stopHeroAutoPlay();
    if (!isHeroPlaying) return;
    
    heroInterval = setInterval(() => {
        const active = document.querySelector(".hero-slide.active");
        if (!active) return;
        const currentId = parseInt(active.id.split("-")[1]);
        const total = document.querySelectorAll(".hero-slide").length;
        const nextId = (currentId % total) + 1;
        switchHero(nextId);
    }, 5000);
}

function stopHeroAutoPlay() {
    if (heroInterval) clearInterval(heroInterval);
}

function toggleHeroPlay(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    isHeroPlaying = !isHeroPlaying;
    const btn = document.getElementById("hero-play-btn");
    if (btn) {
        btn.innerHTML = isHeroPlaying
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    }
    
    if (isHeroPlaying) startHeroAutoPlay();
    else stopHeroAutoPlay();
}

function prevHero(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    stopHeroAutoPlay();
    
    const active = document.querySelector(".hero-slide.active");
    if (!active) return;
    const currentId = parseInt(active.id.split("-")[1]);
    const total = document.querySelectorAll(".hero-slide").length;
    let prevId = currentId - 1;
    if (prevId < 1) prevId = total;
    
    switchHero(prevId);
    if (isHeroPlaying) startHeroAutoPlay();
}

function nextHero(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    stopHeroAutoPlay();
    
    const active = document.querySelector(".hero-slide.active");
    if (!active) return;
    const currentId = parseInt(active.id.split("-")[1]);
    const total = document.querySelectorAll(".hero-slide").length;
    const nextId = (currentId % total) + 1;
    
    switchHero(nextId);
    if (isHeroPlaying) startHeroAutoPlay();
}

function switchHero(idx, e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
        stopHeroAutoPlay(); 
        if (isHeroPlaying) startHeroAutoPlay();
    }
    
    document.querySelectorAll(".hero-slide").forEach((s) => s.classList.remove("active"));
    const targetSlide = document.getElementById("slide-" + idx);
    const heroCard = document.getElementById("hero-card");

    if (targetSlide) {
        targetSlide.classList.add("active");
        // Update Link
        const url = targetSlide.getAttribute("data-url");
        const link = document.getElementById("hero-link");
        if (link && url) link.setAttribute("href", url);

        // Update Hero Color (Task 4)
        const style = targetSlide.getAttribute("data-style");
        if (heroCard && style) {
            ["style-red", "style-blue", "style-green", "style-yellow", "style-black"].forEach((s) => heroCard.classList.remove(s));
            heroCard.classList.add(style);
        }
    }

    document.querySelectorAll(".hero-dot").forEach((d) => d.classList.remove("active"));
    const targetDot = document.querySelector(`.hero-dot[onclick*="${idx}"]`);
    if (targetDot) targetDot.classList.add("active");
}

// --- 4. EFFECTS & INIT ---
function generateRandomBlob() {
    const r = () => Math.floor(Math.random() * 40 + 30);
    return `${r()}% ${r()}% ${r()}% ${r()}% / ${r()}% ${r()}% ${r()}% ${r()}%`;
}

document.addEventListener("DOMContentLoaded", () => {
    initTheme();

    const defaultFilterBtn = document.querySelector(".filter-btn.active");
    if (defaultFilterBtn) {
        filterGrid("all", defaultFilterBtn);
    }

    // Start Hero Auto Play (skipped for reduced-motion users)
    if (document.querySelector(".hero-slide") && !prefersReducedMotion) {
        startHeroAutoPlay();
    }

    // Blobs
    document.querySelectorAll(".ink-blob").forEach((blob) => {
        // Random Shape
        blob.style.borderRadius = generateRandomBlob();

        // Random Visibility (Higher probability for blobs)
        if (Math.random() > 0.98) {
            // Only 2% chance to hide
            blob.style.opacity = "0";
        }

        // Random Position for cards (not hero)
        if (blob.parentElement.classList.contains("card-inner")) {
            const positions = [
                { top: "-20px", left: "-20px", right: "auto", bottom: "auto" },
                { top: "-20px", right: "-20px", left: "auto", bottom: "auto" },
                { bottom: "-20px", left: "-20px", right: "auto", top: "auto" },
                { bottom: "-20px", right: "-20px", left: "auto", top: "auto" },
                { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
            ];
            const pos = positions[Math.floor(Math.random() * positions.length)];
            Object.assign(blob.style, pos);
            if (pos.transform) blob.style.transform = pos.transform;
        }
    });

    document.querySelectorAll(".blob-title").forEach((blob) => {
        blob.style.borderRadius = generateRandomBlob();
    });

    // Desktop Interactions (skipped for reduced-motion users)
    const isDesktop = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)").matches;
    if (isDesktop && !prefersReducedMotion) {
        document.querySelectorAll(".card-wrapper").forEach((wrapper) => {
            const inner = wrapper.querySelector(".card-inner");
            const blob = wrapper.querySelector(".ink-blob");
            if (!inner) return;

            const type = Math.random() > 0.5 ? "tilt" : "parallax";

            if (type === "tilt") {
                wrapper.addEventListener("mousemove", (e) => {
                    const rect = wrapper.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const cx = rect.width / 2;
                    const cy = rect.height / 2;
                    const rotateX = ((y - cy) / cy) * -15;
                    const rotateY = ((x - cx) / cx) * 15;
                    inner.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
                    if (blob) {
                        const currentTransform = blob.style.transform || "";
                        let baseTransform = currentTransform.includes("translate(-50%, -50%)") ? "translate(-50%, -50%) " : "";
                        blob.style.transform = `${baseTransform}translate(${x / 20}px, ${y / 20}px)`;
                    }
                });
                wrapper.addEventListener("mouseleave", () => {
                    inner.style.transform = "perspective(1000px) rotateX(0) rotateY(0) scale(1)";
                    if (blob) {
                        const currentTransform = blob.style.transform || "";
                        let baseTransform = currentTransform.includes("translate(-50%, -50%)") ? "translate(-50%, -50%) " : "";
                        blob.style.transform = `${baseTransform}translate(0,0)`;
                    }
                });
            } else {
                const content = wrapper.querySelector(".card-content");
                wrapper.addEventListener("mousemove", (e) => {
                    const rect = wrapper.getBoundingClientRect();
                    const x = e.clientX - rect.left - rect.width / 2;
                    const y = e.clientY - rect.top - rect.height / 2;
                    if (content) content.style.transform = `translate(${x * 0.1}px, ${y * 0.1}px)`;
                    if (blob) {
                        const currentTransform = blob.style.transform || "";
                        let baseTransform = currentTransform.includes("translate(-50%, -50%)") ? "translate(-50%, -50%) " : "";
                        blob.style.transform = `${baseTransform}scale(1.2) translate(${x * -0.05}px, ${y * -0.05}px)`;
                    }
                });
                wrapper.addEventListener("mouseleave", () => {
                    if (content) content.style.transform = "translate(0, 0)";
                    if (blob) {
                        const currentTransform = blob.style.transform || "";
                        let baseTransform = currentTransform.includes("translate(-50%, -50%)") ? "translate(-50%, -50%) " : "";
                        blob.style.transform = `${baseTransform}scale(1) translate(0,0)`;
                    }
                });
            }
        });
    }

    // --- 5. CODE COPY & TOAST & TOOLTIP ---
    // Tooltip Helper
    const tooltip = document.createElement("div");
    tooltip.className = "custom-tooltip";
    tooltip.textContent = "Click to Copy";
    document.body.appendChild(tooltip);

    const showTooltip = (e, text) => {
        if (text) tooltip.textContent = text;
        const rect = e.target.getBoundingClientRect();
        // Center tooltip
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.top - 35}px`;
        tooltip.classList.add("visible");
    };

    const hideTooltip = () => {
        tooltip.classList.remove("visible");
    };

    const copyToClipboard = (text, btn) => {
        navigator.clipboard
            .writeText(text)
            .then(() => {
                showToast("COPIED!");
                if (btn) {
                    const originalText = btn.textContent;
                    btn.textContent = "COPIED";
                    setTimeout(() => (btn.textContent = originalText), 2000);
                }
            })
            .catch((err) => {
                console.error("Failed to copy:", err);
                showToast("ERROR");
            });
    };

    // Code Blocks
    // IMPORTANT: the copy button must NOT live inside <pre>, because <pre>
    // is the horizontal scroll container — an absolutely positioned child
    // still scrolls with the content. It goes into .code-toolbar instead,
    // which sits in .code-container and therefore never moves.
    document.querySelectorAll("pre").forEach((pre) => {
        let host = pre.closest(".code-container");

        // Bare <pre> (raw HTML in markdown, third-party markup, …):
        // wrap it so it gets the same positioning context.
        if (!host) {
            host = document.createElement("div");
            host.className = "code-container";
            pre.parentNode.insertBefore(host, pre);
            host.appendChild(pre);
        }

        let toolbar = host.querySelector(":scope > .code-toolbar");
        if (!toolbar) {
            toolbar = document.createElement("div");
            toolbar.className = "code-toolbar";
            host.insertBefore(toolbar, host.firstChild);
        }

        // Guard against double injection.
        if (toolbar.querySelector(".copy-btn")) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "copy-btn";
        btn.textContent = "COPY";
        btn.setAttribute("aria-label", "Copy code");
        btn.onclick = (e) => {
            e.preventDefault();
            // Chroma gives us one .cl per logical line, so rebuilding the text
            // from them keeps blank lines (which Chrome's innerText drops
            // because their block is empty) and still excludes the gutter.
            const cells = pre.querySelectorAll(".line .cl");
            const text = cells.length
                ? Array.from(cells).map((cl) => cl.innerText).join("\n")
                : (pre.querySelector("code") || pre).innerText;
            copyToClipboard(text, btn);
        };
        // Prepend, so the DOM order is [copy-btn][code-lang]: the language
        // tag keeps the far corner and the button sits to its left.
        toolbar.insertBefore(btn, toolbar.firstChild);

        // Line numbers via CSS counters: opt in only when the gutter markup
        // (injected by the render hook) is present and the block has more
        // than one line — a lone "1" above a one-liner is pure noise.
        if (pre.querySelector(".ln") && pre.querySelectorAll(".line").length > 1) {
            pre.classList.add("linenos");
        }
    });

    document.querySelectorAll(".content code:not(pre code)").forEach((code) => {
        code.addEventListener("mouseenter", (e) => showTooltip(e, "Click to Copy"));
        code.addEventListener("mouseleave", hideTooltip);
        code.onclick = () => copyToClipboard(code.innerText);
    });

    // KaTeX Display (Block) - Click to Copy (No button)
    document.querySelectorAll(".katex-display").forEach((block) => {
        block.style.cursor = "pointer";
        block.addEventListener("mouseenter", (e) => showTooltip(e, "Click to Copy TeX"));
        block.addEventListener("mouseleave", hideTooltip);
        block.onclick = () => {
            const tex = block.querySelector("annotation[encoding='application/x-tex']");
            if (tex) copyToClipboard(tex.textContent);
        };
    });

    // KaTeX Inline
    document.querySelectorAll(".katex:not(.katex-display)").forEach((inline) => {
        inline.style.cursor = "pointer";
        inline.addEventListener("mouseenter", (e) => showTooltip(e, "Click to Copy TeX"));
        inline.addEventListener("mouseleave", hideTooltip);
        inline.onclick = () => {
            const tex = inline.querySelector("annotation[encoding='application/x-tex']");
            if (tex) copyToClipboard(tex.textContent);
        };
    });

    // MathJax Processing
    const processMathJax = (root) => {
        if (typeof MathJax === "undefined" || !MathJax.startup || !MathJax.startup.document) return;

        // Display Math
        root.querySelectorAll("mjx-container[display='true']").forEach((block) => {
            block.style.cursor = "pointer";
            // Remove default MathJax click handling if any (mostly handled by disable accessibility)
            block.addEventListener("click", (e) => {
                e.stopPropagation();
                try {
                    const items = MathJax.startup.document.getMathItemsWithin(block);
                    if (items.length > 0) copyToClipboard(items[0].math);
                } catch (e) {
                    console.log(e);
                }
            });
            block.addEventListener("mouseenter", (e) => showTooltip(e, "Click to Copy TeX"));
            block.addEventListener("mouseleave", hideTooltip);
        });

        // Inline Math
        root.querySelectorAll("mjx-container:not([display='true'])").forEach((inline) => {
            inline.style.cursor = "pointer";
            inline.addEventListener("click", (e) => {
                e.stopPropagation(); // Prevent selection behavior
                try {
                    const items = MathJax.startup.document.getMathItemsWithin(inline);
                    if (items.length > 0) copyToClipboard(items[0].math);
                } catch (e) {}
            });
            inline.addEventListener("mouseenter", (e) => showTooltip(e, "Click to Copy TeX"));
            inline.addEventListener("mouseleave", hideTooltip);
        });
    };

    if (typeof MathJax !== "undefined") {
        // Initial
        setTimeout(() => processMathJax(document.body), 1000);
        // Observe for new math (Waline, etc)
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        if (node.tagName.toLowerCase().startsWith("mjx-container") || node.querySelector("mjx-container")) {
                            processMathJax(node);
                        }
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // --- 5. FANCYBOX ---
    if (typeof Fancybox !== "undefined") {
        Fancybox.bind(".content img:not(.qmoji):not(.no-lightbox)", {
            groupAll: true,
            Carousel: {
                Toolbar: {
                    display: {
                        left: ["counter"],
                        middle: [
                            "zoomIn",
                            "zoomOut",
                            "toggle1to1",
                            "moveLeft",
                            "moveRight",
                            "moveUp",
                            "moveDown",
                            "rotateCCW",
                            "rotateCW",
                            "flipX",
                            "flipY",
                            "reset",
                        ],
                        right: ["fullscreen", "thumbs", "close"],
                    },
                },
            },
            Images: {
                zoom: true,
            },
            Panzoom: {
                maxScale: 3,
                panMode: "mousemove",
                mouseMoveFactor: 1.1,
            },
            caption: (fancybox, slide) => {
                const figure = slide.triggerEl?.closest("figure");
                const figcaption = figure?.querySelector("figcaption");
                return figcaption ? figcaption.textContent : slide.triggerEl?.alt || slide.triggerEl?.title;
            },
        });
    }

    // --- 6. TOC SPY ---
    const tocHeaders = document.querySelectorAll(".content h2[id], .content h3[id]");
    const tocLinks = document.querySelectorAll("aside nav a");
    
    // Use requestAnimationFrame for smoother scrolling
    let ticking = false;

    function highlightToc() {
        const scrollPos = window.scrollY + 50;
        let currentId = "";

        tocHeaders.forEach(header => {
            if (header.offsetTop <= scrollPos) {
                currentId = header.id;
            }
        });

        // Before the first heading nothing is highlighted yet — highlighting
        // EVERY link at once (the old behaviour) read as a broken underline.
        tocLinks.forEach(link => {
            link.classList.remove("active");
            // .hash returns "#id" even when the href is a full URL, so this
            // survives Hugo ToCs that emit absolute anchors.
            if (currentId && link.hash === "#" + currentId) {
                link.classList.add("active");
            }
        });
    }
    
    function onScroll() {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                highlightToc();
                ticking = false;
            });
            ticking = true;
        }
    }

    if (tocHeaders.length > 0) {
        window.addEventListener("scroll", onScroll);
        highlightToc();
    }

    distributeColorsAndSizes();
});

function showToast(msg) {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.style.cssText = `
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            background: var(--ink); color: var(--bg); padding: 10px 20px;
            font-family: 'Space Mono'; font-weight: bold; border: 2px solid var(--bg);
            z-index: 10000; opacity: 0; transition: 0.3s; pointer-events: none;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = "1";
    setTimeout(() => (toast.style.opacity = "0"), 2000);
}

function adjustDropCap() {
    const content = document.querySelector(".content");
    if (!content) return;

    // Remove existing drop caps to avoid duplication if called multiple times
    content.querySelectorAll('[style*="--drop-cap-size"]').forEach((el) => el.style.removeProperty("--drop-cap-size"));

    // Apply to first paragraph if not a footnote
    const firstP = content.querySelector(":scope > p:first-of-type");
    if (firstP && !firstP.closest(".footnotes")) applyDropCap(firstP);

    const quoteParas = content.querySelectorAll("blockquote p:first-of-type");
    quoteParas.forEach((p) => {
        if (!p.closest(".footnotes")) applyDropCap(p);
    });
}

function applyDropCap(element) {
    if (!element) return;
    // Guard: paragraphs that START with a digit, punctuation or symbol
    // (a dated postscript like "2024.2.18 …") must not get a drop cap —
    // ::first-letter would slice the date into "2|024.2.18".
    element.classList.remove("no-drop-cap");
    const text = (element.textContent || "").trim();
    if (text && /^[\p{Nd}\p{P}\p{S}]/u.test(text)) {
        element.classList.add("no-drop-cap");
        return;
    }

    // Every drop cap is EXACTLY two of the paragraph's own text lines
    // tall. The old rule shrank single-line paragraphs to fontSize * 2.2,
    // which made the first paragraph of a multi-paragraph blockquote (one
    // visual line) render visibly smaller than the multi-line quote in
    // the next block. line-height is unitless (1.6) in the stylesheet, so
    // this scales with the element's own font-size and needs no clone
    // measuring — the size is identical for every cap on the page.
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
    if (!lineHeight) return;
    element.style.setProperty("--drop-cap-size", `${lineHeight * 2}px`);
}

document.addEventListener("DOMContentLoaded", adjustDropCap);
window.addEventListener("resize", adjustDropCap);

// --- 7. QMOJI ---
document.addEventListener("DOMContentLoaded", function () {
    const lotties = document.querySelectorAll(".qmoji-lottie");
    if (lotties.length > 0) {
        if (typeof lottie === "undefined") {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js";
            script.onload = initLotties;
            document.body.appendChild(script);
        } else {
            initLotties();
        }
    }
    function initLotties() {
        lotties.forEach((container) => {
            const path = container.dataset.lottiePath;
            if (path && container.innerHTML === "") {
                lottie.loadAnimation({
                    container: container,
                    renderer: "svg",
                    loop: true,
                    autoplay: !prefersReducedMotion,
                    path: path,
                });
            }
        });
    }
});
