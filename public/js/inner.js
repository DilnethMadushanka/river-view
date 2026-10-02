/* Motion for the hotel page: same language as home. */
(() => {
  const root = document.documentElement;
  if (!window.gsap || !window.ScrollTrigger) { root.classList.remove("js"); return; }
  if (!root.classList.contains("js")) return;

  gsap.registerPlugin(ScrollTrigger);
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  let lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, anchors: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    const nav = document.querySelector(".nav");
    lenis.on("scroll", ({ scroll }) => nav.classList.toggle("scrolled", scroll > 40));
  }

  /* split titles into masked words */
  document.querySelectorAll(".split").forEach((el) => {
    el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span class="line"><span>${w}</span></span>`).join("");
  });
  gsap.set(".split .line > span", { y: 0, yPercent: 115 });

  /* hero assembles on load */
  gsap.timeline({ defaults: { ease: "expo.out" } })
    .fromTo(".hero-bg", { scale: 1.18 }, { scale: 1, duration: 2.2, ease: "power3.out" }, 0)
    .to(".hero .split .line > span", { yPercent: 0, duration: 1.3, stagger: 0.09 }, 0.15)
    .fromTo(".hero .lead", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1 }, 0.55)
    .fromTo(".hero .actions", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1 }, 0.7);

  /* section titles (outside the hero) slide up when reached */
  gsap.utils.toArray(".split").forEach((el) => {
    if (el.closest(".hero")) return;
    gsap.to(el.querySelectorAll(".line > span"), {
      yPercent: 0, duration: 1.1, ease: "expo.out", stagger: 0.07,
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });

  /* hero depth */
  gsap.timeline({ scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } })
    .to(".hero-bg", { scale: 1.28, yPercent: 14, ease: "none" }, 0)
    .to(".hero-sun", { yPercent: 40, ease: "none" }, 0)
    .to(".hero-inner > div", { yPercent: -14, opacity: 0.1, ease: "none" }, 0);

  /* full-bleed backgrounds drift */
  gsap.utils.toArray(".band-bg").forEach((bg) => {
    gsap.fromTo(bg, { yPercent: -8 }, {
      yPercent: 8, ease: "none",
      scrollTrigger: { trigger: bg.parentElement, start: "top bottom", end: "bottom top", scrub: true },
    });
  });

  /* gallery columns drift at different speeds (desktop) */
  const mm = gsap.matchMedia();
  mm.add("(min-width: 700px)", () => {
    gsap.utils.toArray(".gal .col").forEach((col) => {
      gsap.to(col, {
        yPercent: Number(col.dataset.speed) || 0, ease: "none",
        scrollTrigger: { trigger: ".gal", start: "top bottom", end: "bottom top", scrub: true },
      });
    });
  });

  /* rooms stack: the card underneath shrinks back as the next one slides over it */
  {
    const cards = gsap.utils.toArray(".sc");
    cards.forEach((card, i) => {
      const next = cards[i + 1];
      if (!next) return;
      gsap.to(card, {
        scale: 0.94, filter: "brightness(0.5)", ease: "none",
        scrollTrigger: { trigger: next, start: "top bottom", invalidateOnRefresh: true, end: () => "top " + parseFloat(getComputedStyle(next).top) + "px", scrub: true },
      });
    });
  }

  if (fine) {
    document.querySelectorAll(".magnetic").forEach((el) => {
      const x = gsap.quickTo(el, "x", { duration: 0.6, ease: "elastic.out(1, 0.5)" });
      const y = gsap.quickTo(el, "y", { duration: 0.6, ease: "elastic.out(1, 0.5)" });
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        x((e.clientX - (r.left + r.width / 2)) * 0.28);
        y((e.clientY - (r.top + r.height / 2)) * 0.34);
      });
      el.addEventListener("pointerleave", () => { x(0); y(0); });
    });
    document.querySelectorAll(".tile").forEach((t) => {
      t.addEventListener("pointermove", (e) => {
        const r = t.getBoundingClientRect();
        t.style.setProperty("--mx", e.clientX - r.left + "px");
        t.style.setProperty("--my", e.clientY - r.top + "px");
      });
    });
  }

  if (window.RVfx) RVfx();
  window.addEventListener("load", () => ScrollTrigger.refresh());
})();
