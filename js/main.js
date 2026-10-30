/* Mashies – lädt Speisekarte & Öffnungszeiten aus data.json */
(function () {
  "use strict";

  var DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  var euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealObserver = null;

  if (!reduceMotion && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js-reveal");
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
  }

  function reveal(el) {
    el.setAttribute("data-reveal", "");
    if (revealObserver) revealObserver.observe(el);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // ---------- Zeit ----------

  function toMinutes(hhmm) {
    var p = hhmm.split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  // "02:00" -> "02", "12:30" -> "12:30" (für die Tabelle wie auf der Karte)
  function shortTime(hhmm) {
    return hhmm.slice(3) === "00" ? hhmm.slice(0, 2) : hhmm;
  }

  // "02:00" -> "2 Uhr" (für Fließtext)
  function spokenTime(hhmm) {
    var h = parseInt(hhmm.slice(0, 2), 10);
    var m = hhmm.slice(3);
    return (m === "00" ? h : h + ":" + m) + " Uhr";
  }

  function berlinNow(timeZone) {
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date());
    var get = function (type) {
      for (var i = 0; i < parts.length; i++) if (parts[i].type === type) return parts[i].value;
    };
    return { day: WEEKDAY_INDEX[get("weekday")], minutes: parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10) };
  }

  function hoursFor(hours, day) {
    for (var i = 0; i < hours.length; i++) {
      if (hours[i].day === day && !hours[i].closed) return hours[i];
    }
    return null;
  }

  // Öffnungsfenster in Minuten ab Mitternacht des Öffnungstages; über Mitternacht -> close > 1440
  function span(entry) {
    var open = toMinutes(entry.open);
    var close = toMinutes(entry.close);
    if (close <= open) close += 1440;
    return { open: open, close: close };
  }

  function getStatus(data) {
    var now = berlinNow(data.timezone || "Europe/Berlin");
    var today = hoursFor(data.hours, now.day);
    var yesterdayDay = (now.day + 6) % 7;
    var yesterday = hoursFor(data.hours, yesterdayDay);

    // Läuft die Schicht von gestern noch (z. B. Samstag 01:30 nach Freitag)?
    if (yesterday) {
      var y = span(yesterday);
      if (y.close > 1440 && now.minutes < y.close - 1440) {
        return { open: true, businessDay: yesterdayDay, text: "Jetzt geöffnet bis " + spokenTime(yesterday.close) };
      }
    }
    if (today) {
      var t = span(today);
      if (now.minutes >= t.open && now.minutes < t.close) {
        return { open: true, businessDay: now.day, text: "Jetzt geöffnet bis " + spokenTime(today.close) };
      }
      if (now.minutes < t.open) {
        return { open: false, businessDay: now.day, text: "Öffnet heute um " + spokenTime(today.open) };
      }
    }
    for (var i = 1; i <= 7; i++) {
      var d = (now.day + i) % 7;
      var next = hoursFor(data.hours, d);
      if (next) {
        var when = i === 1 ? "morgen" : "am " + DAY_NAMES[d];
        return { open: false, businessDay: now.day, text: "Öffnet " + when + " um " + spokenTime(next.open) };
      }
    }
    return { open: false, businessDay: now.day, text: "Gerade geschlossen" };
  }

  function renderStatus(data) {
    var badge = document.querySelector("[data-status]");
    var status = getStatus(data);
    if (badge) {
      badge.querySelector("[data-status-text]").textContent = status.text;
      badge.classList.toggle("is-open", status.open);
      badge.hidden = false;
    }
    var rows = document.querySelectorAll("[data-hours] tr");
    Array.prototype.forEach.call(rows, function (row) {
      var isToday = parseInt(row.getAttribute("data-day"), 10) === status.businessDay;
      row.classList.toggle("is-today", isToday);
      var tag = row.querySelector(".hours__today");
      if (isToday && !tag) row.querySelector("th").appendChild(el("span", "hours__today", "Heute"));
      if (!isToday && tag) tag.remove();
      if (isToday) row.setAttribute("aria-current", "date");
      else row.removeAttribute("aria-current");
    });
  }

  function renderHours(data) {
    var body = document.querySelector("[data-hours]");
    if (body) {
      body.textContent = "";
      data.hours.forEach(function (h) {
        var tr = el("tr");
        tr.setAttribute("data-day", h.day);
        var th = el("th", null, h.name);
        th.scope = "row";
        tr.appendChild(th);
        tr.appendChild(el("td", null, h.closed ? "geschlossen" : shortTime(h.open) + "–" + shortTime(h.close) + " Uhr"));
        body.appendChild(tr);
      });
    }

    // Kompakt für den Footer: gleiche Zeiten an Folgetagen zusammenfassen
    var compact = document.querySelector("[data-hours-compact]");
    if (compact) {
      var groups = [];
      data.hours.forEach(function (h) {
        var key = h.closed ? "closed" : h.open + "-" + h.close;
        var last = groups[groups.length - 1];
        if (last && last.key === key) last.to = h;
        else groups.push({ key: key, from: h, to: h });
      });
      compact.textContent = "";
      groups.forEach(function (g) {
        var days = g.from === g.to ? g.from.short : g.from.short + "–" + g.to.short;
        var time = g.key === "closed" ? "geschlossen" : shortTime(g.from.open) + "–" + shortTime(g.from.close) + " Uhr";
        compact.appendChild(el("li", null, days + " " + time));
      });
    }
  }

  // ---------- Signature ----------

  function picture(base, alt, sizes, className) {
    var img = el("img", className);
    img.src = base + "-560.webp";
    img.srcset = base + "-560.webp 560w, " + base + ".webp 1122w";
    img.sizes = sizes;
    img.width = 1122;
    img.height = 1402;
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = alt;
    return img;
  }

  function renderSignature(data) {
    var list = document.querySelector("[data-signature]");
    if (!list) return;
    data.signature.forEach(function (dish) {
      var li = el("li", "dish");
      li.appendChild(picture(dish.image, dish.alt, "(min-width: 1100px) 300px, (min-width: 720px) 45vw, 78vw"));
      var head = el("div", "dish__head");
      head.appendChild(el("h3", "dish__name", dish.name));
      head.appendChild(el("p", "dish__price", (dish.from ? "ab " : "") + euro.format(dish.price)));
      li.appendChild(head);
      li.appendChild(el("p", "dish__text", dish.text));
      list.appendChild(li);
      reveal(li);
    });
  }

  // ---------- Speisekarte ----------

  function menuItem(item) {
    var li = el("li", "menu-item");
    li.appendChild(el("span", "menu-item__name", item.name));
    li.appendChild(el("span", "menu-item__dots"));
    li.lastChild.setAttribute("aria-hidden", "true");
    li.appendChild(el("span", "menu-item__price", euro.format(item.price)));
    if (item.note) li.appendChild(el("span", "menu-item__note", item.note));
    return li;
  }

  function renderMenu(data) {
    var tabs = document.querySelector("[data-tabs]");
    var panels = document.querySelector("[data-menu]");
    if (!tabs || !panels) return;
    panels.textContent = "";

    var tabButtons = [];
    data.menu.forEach(function (cat, index) {
      var tab = el("button", "tab", cat.tab);
      tab.type = "button";
      tab.id = "tab-" + cat.id;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "panel-" + cat.id);
      tabs.appendChild(tab);
      tabButtons.push(tab);

      var panel = el("div", "menu-panel");
      panel.id = "panel-" + cat.id;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.tabIndex = 0;

      if (cat.banner) {
        var fig = el("figure", "menu-panel__banner");
        var img = el("img");
        img.src = cat.banner.image + "-720.webp";
        img.srcset = cat.banner.image + "-720.webp 720w, " + cat.banner.image + ".webp 1200w";
        img.sizes = "(min-width: 1328px) 1280px, 100vw";
        img.width = 1200;
        img.height = 631;
        img.loading = "lazy";
        img.decoding = "async";
        img.alt = cat.banner.alt;
        fig.appendChild(img);
        panel.appendChild(fig);
      }

      var groups = el("div", "menu-panel__groups");
      cat.groups.forEach(function (group) {
        var wide = cat.groups.length === 1 && group.items.length > 6;
        var section = el("section", "menu-group" + (wide ? " menu-group--wide" : ""));
        section.appendChild(el("h3", "menu-group__title", group.title));
        if (group.note) section.appendChild(el("p", "menu-group__note", group.note));
        var ul = el("ul", "menu-items");
        group.items.forEach(function (item) { ul.appendChild(menuItem(item)); });
        section.appendChild(ul);
        if (group.extras && group.extras.length) {
          var extras = el("ul", "menu-items menu-items--extras");
          extras.setAttribute("aria-label", "Extras");
          group.extras.forEach(function (item) {
            extras.appendChild(menuItem({ name: "+ " + item.name, note: item.note, price: item.price }));
          });
          section.appendChild(extras);
        }
        groups.appendChild(section);
      });
      panel.appendChild(groups);
      panels.appendChild(panel);
      if (index === 0) reveal(panel);
    });

    function select(index, focus) {
      tabButtons.forEach(function (tab, i) {
        var selected = i === index;
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.tabIndex = selected ? 0 : -1;
        document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
      });
      if (focus) tabButtons[index].focus();
    }

    tabButtons.forEach(function (tab, i) {
      tab.addEventListener("click", function () { select(i, false); });
      tab.addEventListener("keydown", function (e) {
        var last = tabButtons.length - 1;
        var next = null;
        if (e.key === "ArrowRight") next = i === last ? 0 : i + 1;
        else if (e.key === "ArrowLeft") next = i === 0 ? last : i - 1;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = last;
        if (next !== null) { e.preventDefault(); select(next, true); }
      });
    });
    select(0, false);
  }

  function showLoadError() {
    var panels = document.querySelector("[data-menu]");
    if (panels) {
      panels.textContent = "";
      panels.appendChild(el("p", "menu__allergens", "Die Speisekarte konnte gerade nicht geladen werden. Bitte lade die Seite neu."));
    }
  }

  // ---------- Start ----------

  document.querySelectorAll(".section__head, .visit__grid > *, .social__inner").forEach(reveal);

  fetch("data.json", { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      renderSignature(data);
      renderMenu(data);
      renderHours(data);
      renderStatus(data);
      setInterval(function () { renderStatus(data); }, 60 * 1000);
    })
    .catch(function (err) {
      console.error("data.json konnte nicht geladen werden:", err);
      showLoadError();
    });
})();
