/* Effects that work on every screen size. Needs gsap + ScrollTrigger. */
window.RVfx = function () {
  /* groups of items rise in one after another */
  [".tile", ".vrow", ".group li", ".facts2 div", ".room", ".gal .media"].forEach((sel) => {
    const els = document.querySelectorAll(sel);
    if (!els.length) return;
    gsap.set(els, { y: 44, opacity: 0 });
    ScrollTrigger.batch(els, {
      start: "top 92%", once: true,
      onEnter: (b) => gsap.to(b, { y: 0, opacity: 1, duration: 1, ease: "expo.out", stagger: 0.09, overwrite: true }),
    });
  });

  /* photos settle from a slight zoom as they arrive */
  document.querySelectorAll(".gal .media img, .room .media img, .sc .media img, .visit .media img").forEach((img) => {
    gsap.fromTo(img, { scale: 1.22 }, {
      scale: 1, ease: "none",
      scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "top 35%", scrub: true },
    });
  });
};
