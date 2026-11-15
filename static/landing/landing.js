// Bitácora de desarrollo de la landing (/main).
// Lee static/landing/desarrollo.json y dibuja una entrada por avance, en el orden del archivo.
// Las rutas de imagen son relativas a /static/landing/ (por ejemplo "img/flipbook.png").

(function () {
  "use strict";

  const BASE = "/static/landing/";
  const timeline = document.getElementById("timeline");
  if (!timeline) return;

  const dateFormat = new Intl.DateTimeFormat("es-AR", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatDate(value) {
    const parsed = new Date(value + "T00:00:00Z");
    return Number.isNaN(parsed.getTime()) ? value : dateFormat.format(parsed);
  }

  function resolveSrc(src) {
    return /^(https?:)?\/\//.test(src) || src.startsWith("/") ? src : BASE + src;
  }

  function renderImage(image) {
    const figure = el("figure", "shot");
    if (image.src) {
      const href = resolveSrc(image.src);
      const link = el("a", "shot-img");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener";
      const img = el("img");
      img.src = href;
      img.alt = image.alt || image.pie || "";
      img.loading = "lazy";
      img.decoding = "async";
      link.appendChild(img);
      figure.appendChild(link);
    } else {
      figure.classList.add("shot-pending");
      figure.appendChild(el("div", "shot-img", image.pendiente || "Imagen pendiente"));
    }
    if (image.pie) figure.appendChild(el("figcaption", null, image.pie));
    return figure;
  }

  function renderEntry(entry) {
    const item = el("li", "entry");

    const meta = el("div", "entry-meta");
    if (entry.fecha) {
      const time = el("time", null, formatDate(entry.fecha));
      time.dateTime = entry.fecha;
      meta.appendChild(time);
    }
    if (entry.etiqueta) meta.appendChild(el("span", "entry-tag", entry.etiqueta));
    if (meta.childElementCount) item.appendChild(meta);

    item.appendChild(el("h3", null, entry.titulo || "Sin título"));

    const paragraphs = Array.isArray(entry.texto) ? entry.texto : entry.texto ? [entry.texto] : [];
    if (paragraphs.length) {
      const text = el("div", "entry-text");
      paragraphs.forEach((p) => text.appendChild(el("p", null, p)));
      item.appendChild(text);
    }

    const images = Array.isArray(entry.imagenes) ? entry.imagenes : [];
    if (images.length) {
      const gallery = el("div", "entry-gallery");
      images.forEach((image) => gallery.appendChild(renderImage(image)));
      item.appendChild(gallery);
    }
    return item;
  }

  function showMessage(message) {
    timeline.replaceChildren(el("li", "timeline-empty", message));
  }

  fetch(BASE + "desarrollo.json", { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then((data) => {
      const entries = Array.isArray(data.entradas) ? data.entradas : [];
      if (!entries.length) {
        showMessage("Todavía no hay entradas en la bitácora.");
        return;
      }
      timeline.replaceChildren(...entries.map(renderEntry));
    })
    .catch((error) => {
      console.error("No se pudo cargar la bitácora:", error);
      showMessage("No se pudo cargar la bitácora de desarrollo.");
    });
})();

// Marca la diapositiva visible en el indicador de puntos y en el menú superior.
(function () {
  "use strict";

  const slides = document.querySelectorAll(".slide[id]");
  if (!slides.length || !("IntersectionObserver" in window)) return;

  const links = document.querySelectorAll('.dots a[href^="#"], .nav-links a[href^="#"]');

  function setCurrent(id) {
    links.forEach((link) => {
      if (link.getAttribute("href") === "#" + id) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  // Cuenta como actual la sección que cruza la franja central de la pantalla.
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => entry.isIntersecting && setCurrent(entry.target.id)),
    { rootMargin: "-45% 0px -45% 0px" }
  );
  slides.forEach((slide) => observer.observe(slide));
})();
