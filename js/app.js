/* ==========================================================
   YOURDESTINY · EXPLORA TU DESTINO
   ----------------------------------------------------------
   APIs usadas (todas gratuitas y sin clave):
   - Nominatim (OpenStreetMap) → convierte un nombre en coordenadas
   - Open-Meteo               → clima actual y pronóstico de 7 días
   - REST Countries           → datos del país (bandera, moneda...)
   - OpenStreetMap            → mapa incrustado del destino

   Además: Fetch API (peticiones) y LocalStorage (favoritos y
   último destino visto).

   ÍNDICE
   1. Destinos destacados
   2. Utilidades (LocalStorage, fetch, formato)
   3. Funciones que consultan las APIs
   4. Funciones que dibujan en pantalla
   5. Lógica principal
   6. Eventos
   ========================================================== */

(() => {
  "use strict";

  /* ========================================================
     1. DESTINOS DESTACADOS
     Con coordenadas guardadas no hace falta llamar a Nominatim
     para estos; solo se usa cuando la persona busca otro lugar.
     ======================================================== */
  const DESTINOS = {
    sanandres: { nombre: "San Andrés",       lat: 12.5847, lon: -81.7006, pais: "CO" },
    cartagena: { nombre: "Cartagena",        lat: 10.3910, lon: -75.4794, pais: "CO" },
    pacifico:  { nombre: "Nuquí (Pacífico)", lat: 5.7119,  lon: -77.2661, pais: "CO" },
    rosario:   { nombre: "Islas del Rosario", lat: 10.1667, lon: -75.7500, pais: "CO" },
    ciudad:    { nombre: "Ciudad Perdida",   lat: 11.0383, lon: -73.9253, pais: "CO" },
    cafetero:  { nombre: "Eje Cafetero",     lat: 4.6375,  lon: -75.5700, pais: "CO" },
  };

  /* Códigos WMO que devuelve Open-Meteo → texto y emoji */
  const CLIMA = {
    0:  ["Despejado", "☀️"],
    1:  ["Mayormente despejado", "🌤️"],
    2:  ["Parcialmente nublado", "⛅"],
    3:  ["Nublado", "☁️"],
    45: ["Niebla", "🌫️"],
    48: ["Niebla con escarcha", "🌫️"],
    51: ["Llovizna ligera", "🌦️"],
    53: ["Llovizna", "🌦️"],
    55: ["Llovizna intensa", "🌧️"],
    56: ["Llovizna helada", "🌧️"],
    57: ["Llovizna helada", "🌧️"],
    61: ["Lluvia ligera", "🌦️"],
    63: ["Lluvia", "🌧️"],
    65: ["Lluvia fuerte", "🌧️"],
    66: ["Lluvia helada", "🌧️"],
    67: ["Lluvia helada", "🌧️"],
    71: ["Nieve ligera", "🌨️"],
    73: ["Nieve", "🌨️"],
    75: ["Nieve fuerte", "❄️"],
    77: ["Granizo fino", "🌨️"],
    80: ["Chubascos ligeros", "🌦️"],
    81: ["Chubascos", "🌧️"],
    82: ["Chubascos violentos", "⛈️"],
    85: ["Chubascos de nieve", "🌨️"],
    86: ["Chubascos de nieve", "🌨️"],
    95: ["Tormenta eléctrica", "⛈️"],
    96: ["Tormenta con granizo", "⛈️"],
    99: ["Tormenta con granizo", "⛈️"],
  };

  /* ========================================================
     2. UTILIDADES
     ======================================================== */

  /* Atajo para buscar elementos por id */
  const $ = (id) => document.getElementById(id);

  /* Evita que texto externo se interprete como HTML */
  const esc = (texto) =>
    String(texto ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  /* ----- LocalStorage -----
     Todo va dentro de try/catch: si el navegador lo bloquea
     (modo privado, por ejemplo) la página sigue funcionando. */
  const guardar = (clave, valor) => {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
  };

  const leer = (clave, porDefecto) => {
    try {
      const dato = localStorage.getItem(clave);
      return dato ? JSON.parse(dato) : porDefecto;
    } catch (e) {
      return porDefecto;
    }
  };

  const CLAVE_ULTIMO = "yd:ultimo";
  const CLAVE_FAVS = "yd:favoritos";

  /* ----- Fetch API con límite de tiempo -----
     AbortController cancela la petición si tarda más de 10 s. */
  async function pedirJSON(url, ms = 10000) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), ms);
    try {
      const respuesta = await fetch(url, { signal: control.signal });
      if (!respuesta.ok) throw new Error("HTTP " + respuesta.status);
      return await respuesta.json();
    } finally {
      clearTimeout(reloj);
    }
  }

  const idDe = (d) => d.lat.toFixed(3) + "," + d.lon.toFixed(3);
  const grados = (n) => Math.round(n) + "°";

  /* ========================================================
     3. CONSULTAS A LAS APIs
     ======================================================== */

  /* Nominatim: nombre → coordenadas */
  async function buscarLugar(texto) {
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1" +
      "&accept-language=es&q=" + encodeURIComponent(texto);
    const datos = await pedirJSON(url);
    if (!datos.length) return null;

    const r = datos[0];
    return {
      nombre: r.name || r.display_name.split(",")[0],
      detalle: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      pais: r.address && r.address.country_code ? r.address.country_code.toUpperCase() : null,
    };
  }

  /* Open-Meteo: clima actual + 7 días */
  function pedirClima(d) {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=" + d.lat + "&longitude=" + d.lon +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=auto&forecast_days=7";
    return pedirJSON(url);
  }

  /* ----- Datos de respaldo para Colombia (por si todas las APIs fallan) -----
     La bandera es un SVG dibujado aquí mismo, no depende de internet. */
  const PAISES_LOCAL = {
    CO: {
      name: { common: "Colombia" },
      flags: {
        svg: "data:image/svg+xml," + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2">' +
          '<rect width="3" height="2" fill="#FCD116"/>' +
          '<rect y="1" width="3" height="1" fill="#003893"/>' +
          '<rect y="1.5" width="3" height=".5" fill="#CE1126"/></svg>'),
        alt: "Bandera de Colombia",
      },
      capital: ["Bogotá"],
      region: "Américas",
      population: null,
      currencies: { COP: { name: "Peso colombiano", symbol: "$" } },
      languages: { spa: "Español" },
    },
  };

  /* Datos del país por código de 2 letras. Orden de intentos:
     1) REST Countries (con y sin el filtro "fields")
     2) Copia guardada en LocalStorage de una consulta anterior exitosa
     3) Datos locales (solo Colombia)
     4) API del Banco Mundial (nombre, capital y región) + bandera de flagcdn
     Cada resultado lleva "_fuente" para avisar si no vino de REST Countries. */
  async function pedirPais(codigo) {
    const cod = encodeURIComponent(codigo);
    const base = "https://restcountries.com/v3.1/alpha/" + cod;
    const campos = "name,flags,capital,population,currencies,languages,region";

    /* 1) REST Countries. Responde a veces una lista [ {...} ] y a veces
          un objeto, por eso se normaliza con Array.isArray. */
    for (const url of [base + "?fields=" + campos, base]) {
      try {
        let datos = await pedirJSON(url, 6000);
        if (Array.isArray(datos)) datos = datos[0];
        if (!datos || !datos.name) throw new Error("respuesta sin datos");
        guardar("yd:pais:" + codigo, datos);
        return datos;
      } catch (e) {
        console.warn("REST Countries falló en", url, "→", e.message);
      }
    }

    /* 2) Copia guardada */
    const copia = leer("yd:pais:" + codigo, null);
    if (copia) return copia;

    /* 3) Datos locales */
    if (PAISES_LOCAL[codigo]) return { ...PAISES_LOCAL[codigo], _fuente: "respaldo" };

    /* 4) Banco Mundial: la respuesta es [ info_de_paginas, [ {país} ] ] */
    const wb = await pedirJSON("https://api.worldbank.org/v2/country/" + cod + "?format=json", 6000);
    const p = wb && wb[1] && wb[1][0];
    if (!p) throw new Error("Banco Mundial sin datos");
    return {
      name: { common: p.name },
      flags: { png: "https://flagcdn.com/w160/" + codigo.toLowerCase() + ".png", alt: "Bandera de " + p.name },
      capital: [p.capitalCity || "—"],
      region: p.region ? p.region.value : "",
      population: null,
      _fuente: "respaldo",
    };
  }

  /* ========================================================
     4. DIBUJAR EN PANTALLA
     ======================================================== */

  function dibujarMapa(d) {
    /* bbox = recuadro que se ve en el mapa (oeste, sur, este, norte) */
    const dx = 0.06, dy = 0.04;
    const bbox = [d.lon - dx, d.lat - dy, d.lon + dx, d.lat + dy].join(",");
    $("ex-mapa").src =
      "https://www.openstreetmap.org/export/embed.html?bbox=" + encodeURIComponent(bbox) +
      "&layer=mapnik&marker=" + encodeURIComponent(d.lat + "," + d.lon);
    $("ex-mapa-link").href =
      "https://www.openstreetmap.org/?mlat=" + d.lat + "&mlon=" + d.lon +
      "#map=13/" + d.lat + "/" + d.lon;
  }

  function dibujarClima(datos) {
    const act = datos.current;
    const [texto, emoji] = CLIMA[act.weather_code] || ["Sin descripción", "🌡️"];

    $("ex-actual").innerHTML =
      '<div class="ex-temp"><span class="ex-emoji" aria-hidden="true">' + emoji + "</span>" +
      "<div><b>" + grados(act.temperature_2m) + "C</b><small>" + esc(texto) + "</small></div></div>" +
      '<div class="ex-datos">' +
      "<span>Sensación " + grados(act.apparent_temperature) + "</span>" +
      "<span>Humedad " + Math.round(act.relative_humidity_2m) + "%</span>" +
      "<span>Viento " + Math.round(act.wind_speed_10m) + " km/h</span>" +
      "</div>";

    const d = datos.daily;
    $("ex-dias").innerHTML = d.time
      .map((fecha, i) => {
        const dia = new Date(fecha + "T12:00:00").toLocaleDateString("es", { weekday: "short", day: "numeric" });
        const [desc, ico] = CLIMA[d.weather_code[i]] || ["", "🌡️"];
        return (
          '<div class="ex-dia" title="' + esc(desc) + '"><small>' + esc(dia) + "</small>" +
          '<span aria-hidden="true">' + ico + "</span>" +
          "<b>" + grados(d.temperature_2m_max[i]) + "</b>" +
          "<em>" + grados(d.temperature_2m_min[i]) + "</em>" +
          "<i>Lluvia " + (d.precipitation_probability_max[i] ?? 0) + "%</i></div>"
        );
      })
      .join("");

    /* Consejo según la probabilidad de lluvia promedio de la semana */
    const probs = d.precipitation_probability_max.filter((n) => n !== null);
    const lluvia = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : 0;
    $("ex-consejo").textContent =
      lluvia >= 60 ? "Semana lluviosa: lleva impermeable y plan B bajo techo."
      : lluvia >= 30 ? "Algo de lluvia posible: un paraguas pequeño no estorba."
      : "Semana mayormente seca: no olvides el protector solar.";
  }

  function dibujarPais(c) {
    const moneda = c.currencies
      ? Object.values(c.currencies).map((m) => m.name + (m.symbol ? " (" + m.symbol + ")" : "")).join(", ")
      : "—";
    const idiomas = c.languages ? Object.values(c.languages).join(", ") : "—";

    $("ex-pais").innerHTML =
      '<div class="ex-pais-cab">' +
      '<img class="ex-bandera" src="' + esc((c.flags && (c.flags.svg || c.flags.png)) || "") + '" alt="' + esc((c.flags && c.flags.alt) || "Bandera de " + c.name.common) + '">' +
      "<div><b>" + esc(c.name.common) + "</b><small>" + esc(c.region || "") + "</small></div></div>" +
      '<dl class="ex-filas">' +
      "<div><dt>Capital</dt><dd>" + esc((c.capital || ["—"])[0]) + "</dd></div>" +
      "<div><dt>Moneda</dt><dd>" + esc(moneda) + "</dd></div>" +
      "<div><dt>Idioma</dt><dd>" + esc(idiomas) + "</dd></div>" +
      "<div><dt>Población</dt><dd>" + (c.population ? c.population.toLocaleString("es-CO") : "—") + "</dd></div>" +
      "</dl>" +
      (c._fuente ? '<p class="ex-nota">Datos de respaldo: REST Countries no respondió.</p>' : "");
  }

  const mensajeError = (id, texto) => {
    $(id).innerHTML = '<p class="ex-error">' + esc(texto) + "</p>";
  };

  /* ----- Chips de destinos y favoritos ----- */
  function dibujarChips() {
    $("ex-chips").innerHTML = Object.entries(DESTINOS)
      .map(([id, d]) => '<button type="button" data-destino="' + id + '">' + esc(d.nombre) + "</button>")
      .join("");
  }

  function dibujarFavoritos() {
    const favs = leer(CLAVE_FAVS, []);
    $("ex-favs").hidden = !favs.length;
    $("ex-favs-lista").innerHTML = favs
      .map((f, i) => '<button type="button" data-fav="' + i + '">' + esc(f.nombre) + "</button>")
      .join("");
  }

  function marcarActivo() {
    document.querySelectorAll("#ex-chips button").forEach((b) => {
      const d = DESTINOS[b.dataset.destino];
      b.classList.toggle("on", !!actual && idDe(d) === idDe(actual));
    });
    const esFav = !!actual && leer(CLAVE_FAVS, []).some((f) => idDe(f) === idDe(actual));
    const boton = $("ex-fav");
    boton.textContent = esFav ? "En favoritos" : "Guardar";
    boton.setAttribute("aria-pressed", esFav);
  }

  /* ========================================================
     5. LÓGICA PRINCIPAL
     ======================================================== */
  let actual = null;      // destino que se está mostrando
  let peticion = 0;       // contador para ignorar respuestas viejas

  async function mostrarDestino(d) {
    actual = d;
    const mia = ++peticion;           // si el usuario cambia rápido, solo vale la última

    $("ex-titulo").textContent = d.nombre;
    $("ex-detalle").textContent = d.detalle || "Lat " + d.lat.toFixed(3) + " · Lon " + d.lon.toFixed(3);
    $("ex-actual").innerHTML = '<p class="ex-cargando">Consultando el clima…</p>';
    $("ex-dias").innerHTML = "";
    $("ex-consejo").textContent = "";
    $("ex-pais").innerHTML = '<p class="ex-cargando">Cargando datos del país…</p>';

    dibujarMapa(d);                   // el mapa no necesita fetch
    guardar(CLAVE_ULTIMO, d);
    marcarActivo();

    /* allSettled: si una API falla, la otra igual se muestra */
    const [clima, pais] = await Promise.allSettled([
      pedirClima(d),
      d.pais ? pedirPais(d.pais) : Promise.reject(new Error("sin país")),
    ]);
    if (mia !== peticion) return;

    if (clima.status === "fulfilled") dibujarClima(clima.value);
    else mensajeError("ex-actual", "No pudimos cargar el clima. Revisa tu conexión e inténtalo de nuevo.");

    if (pais.status === "fulfilled") dibujarPais(pais.value);
    else if (d.pais) {
      console.warn("Datos del país:", pais.reason);
      $("ex-pais").innerHTML =
        '<p class="ex-error">No pudimos cargar los datos del país.</p>' +
        '<button type="button" class="ex-reintentar" id="ex-reintentar">Reintentar</button>';
    } else {
      mensajeError("ex-pais", "Este lugar no pertenece a un país (por ejemplo, mar abierto).");
    }
  }

  async function buscar(texto) {
    const estado = $("ex-estado");
    estado.textContent = "Buscando “" + texto + "”…";
    try {
      const lugar = await buscarLugar(texto);
      if (!lugar) {
        estado.textContent = "No encontramos “" + texto + "”. Prueba con otro nombre o añade el país.";
        return;
      }
      estado.textContent = "";
      mostrarDestino(lugar);
    } catch (e) {
      estado.textContent = "No pudimos buscar en este momento. Inténtalo de nuevo en unos segundos.";
    }
  }

  function alternarFavorito() {
    if (!actual) return;
    let favs = leer(CLAVE_FAVS, []);
    const existe = favs.some((f) => idDe(f) === idDe(actual));
    favs = existe ? favs.filter((f) => idDe(f) !== idDe(actual)) : [...favs, actual];
    guardar(CLAVE_FAVS, favs);
    dibujarFavoritos();
    marcarActivo();
  }

  /* ========================================================
     6. EVENTOS
     ======================================================== */
  function iniciar() {
    if (!$("explorar")) return;

    dibujarChips();
    dibujarFavoritos();

    /* Buscador */
    $("ex-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const texto = $("ex-q").value.trim();
      if (texto) buscar(texto);
    });

    /* Chips de destinos destacados */
    $("ex-chips").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) mostrarDestino(DESTINOS[b.dataset.destino]);
    });

    /* Favoritos guardados */
    $("ex-favs-lista").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) mostrarDestino(leer(CLAVE_FAVS, [])[b.dataset.fav]);
    });

    $("ex-fav").addEventListener("click", alternarFavorito);

    /* Botón "Reintentar" que aparece si falla la API del país */
    $("ex-pais").addEventListener("click", (e) => {
      if (e.target.id === "ex-reintentar" && actual) mostrarDestino(actual);
    });

    /* Tarjetas de la sección Destinos (llevan data-destino) */
    document.querySelectorAll("a[data-destino]").forEach((a) => {
      a.addEventListener("click", () => mostrarDestino(DESTINOS[a.dataset.destino]));
    });

    /* Al cargar: último destino visto o San Andrés por defecto */
    mostrarDestino(leer(CLAVE_ULTIMO, null) || DESTINOS.sanandres);
  }

  iniciar();
})();
