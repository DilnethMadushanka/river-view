(() => {
  const root = document.documentElement;
  if (!window.gsap || !window.ScrollTrigger) { root.classList.remove("js", "intro"); return; }
  if (!root.classList.contains("js")) return; /* reduced motion: static page */

  gsap.registerPlugin(ScrollTrigger);
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------- smooth scroll, wired into ScrollTrigger ---------- */
  let lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, anchors: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);

        const nav = document.querySelector(".nav");
    lenis.on("scroll", ({ scroll }) => nav.classList.toggle("scrolled", scroll > 40));
  }

  /* ---------- text splitting ---------- */
  document.querySelectorAll(".split").forEach((el) => {
    el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span class="line"><span>${w}</span></span>`).join("");
  });
  const words = document.getElementById("words");
  if (words) words.innerHTML = words.textContent.trim().split(/\s+/).map((w) => `<span class="wd">${w}</span>`).join(" ");

  /* ---------- intro: loader curtain, then the hero assembles ---------- */
  function heroIntro() {
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.fromTo(".hero-bg", { scale: 1.18 }, { scale: 1, duration: 2.4, ease: "power3.out" }, 0)
      .fromTo(".hero h1 .wi", { yPercent: 115 }, { yPercent: 0, duration: 1.3, stagger: 0.07 }, 0.1)
      .fromTo(".hero .lead", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1 }, 0.55)
      .fromTo(".hero .actions", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1 }, 0.7)
      .fromTo(".hero-card", { y: 80, opacity: 0, rotate: 3 }, { y: 0, opacity: 1, rotate: 0, duration: 1.5 }, 0.5);
    return tl;
  }

  gsap.set(".hero h1 .wi", { y: 0, yPercent: 115 });
  if (root.classList.contains("intro")) {
    lenis && lenis.stop();
    gsap.set(".loader-word span", { y: 0, yPercent: 110 });
    const l = gsap.timeline({
      onComplete() {
        root.classList.remove("intro");
        try { sessionStorage.setItem("rv-intro", "1"); } catch (e) {}
        lenis && lenis.start();
      },
    });
    l.to(".loader-word span", { yPercent: 0, duration: 1, stagger: 0.12, ease: "expo.out" })
      .to(".loader-line i", { scaleX: 1, duration: 0.9, ease: "power2.inOut" }, 0.2)
      .to(".loader-word span", { yPercent: -110, duration: 0.7, stagger: 0.06, ease: "power3.in" }, 1.35)
      .to(".loader", { yPercent: -100, duration: 1, ease: "expo.inOut" }, 1.7)
      .add(heroIntro, 1.95);
  } else {
    heroIntro();
  }

  /* ---------- hero depth: the photo zooms and drifts as you leave ---------- */
  gsap.timeline({ scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } })
    .to(".hero-bg", { scale: 1.28, yPercent: 14, ease: "none" }, 0)
    .to(".hero-sun", { yPercent: 40, ease: "none" }, 0)
    .to(".hero-inner > div:first-child", { yPercent: -14, opacity: 0.1, ease: "none" }, 0)
    .to(".hero-card", { yPercent: -45, ease: "none" }, 0);

  /* ---------- statement: words light up as you read ---------- */
  const wd = gsap.utils.toArray(".wd");
  if (wd.length) {
    gsap.fromTo(wd, { opacity: 0.16 }, {
      opacity: 1, ease: "none", stagger: 0.12,
      scrollTrigger: { trigger: "#words", start: "top 82%", end: "bottom 48%", scrub: true },
    });
  }

  /* ---------- section titles slide up out of a mask ---------- */
  gsap.set(".split .line > span", { y: 0, yPercent: 115 });
  gsap.utils.toArray(".split").forEach((el) => {
    gsap.to(el.querySelectorAll(".line > span"), {
      y: 0, yPercent: 0, duration: 1.1, ease: "expo.out", stagger: 0.07,
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });

  /* ---------- photo parallax ---------- */
  gsap.utils.toArray(".parallax-img").forEach((img) => {
    gsap.fromTo(img, { yPercent: -7 }, {
      yPercent: 7, ease: "none",
      scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: true },
    });
  });
  gsap.utils.toArray(".band-bg").forEach((bg) => {
    gsap.fromTo(bg, { yPercent: -8 }, {
      yPercent: 8, ease: "none",
      scrollTrigger: { trigger: bg.parentElement, start: "top bottom", end: "bottom top", scrub: true },
    });
  });

  /* ---------- rooms: vertical scroll pans the cards sideways (desktop) ---------- */
  const mm = gsap.matchMedia();
  {
    const hp = document.querySelector(".hp");
    const track = hp.querySelector(".hp-track");
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
    const st = { trigger: hp, start: "top top", end: () => "+=" + dist(), pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 };
    gsap.to(track, { x: () => -dist(), ease: "none", scrollTrigger: st });
    gsap.to(".hp-bar i", { scaleX: 1, ease: "none", scrollTrigger: { ...st, pin: false, scrub: true } });
  }

  /* ---------- magnetic buttons (pointer devices only) ---------- */
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

    /* bento spotlight follows the cursor */
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
