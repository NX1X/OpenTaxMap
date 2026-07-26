import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './style.css'
import { STRINGS, makeT } from './i18n.js'

// ---------------------------------------------------------------- state

const params = new URLSearchParams(location.search)
const stored = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const store = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

const state = {
  lang: params.get('lang') || stored('lang') || 'he',
  theme: stored('theme') || 'light',
  year: params.get('year') || '2026',
  q: params.get('q') || '',
  sector: params.get('sector') || '',
  district: params.get('district') || '',
  subregion: params.get('subregion') || '',
  council: params.get('council') || '',
  rates: new Set((params.get('rates') || '').split(',').filter(Boolean).map(Number)),
  changes: params.get('changes') === '1',
  selected: null,
}
if (!STRINGS[state.lang]) state.lang = 'he'

let t = makeT(state.lang)
let data = null
let map, markerLayer, userLayer
let baseLayers = []
const markerByKey = new Map()

// Annual income-tax brackets (earned income) and credit-point values per tax
// year. Source: Kol Zchut bracket tables. [threshold, rate] pairs, ascending.
const TAX_TABLES = {
  2022: { point: 2676, brackets: [[77400, 0.10], [110880, 0.14], [178080, 0.20], [247440, 0.31], [514920, 0.35], [663240, 0.47], [Infinity, 0.50]] },
  2023: { point: 2820, brackets: [[81480, 0.10], [116760, 0.14], [187440, 0.20], [260520, 0.31], [542160, 0.35], [698280, 0.47], [Infinity, 0.50]] },
  2024: { point: 2904, brackets: [[84120, 0.10], [120720, 0.14], [193800, 0.20], [269280, 0.31], [560280, 0.35], [721560, 0.47], [Infinity, 0.50]] },
  2025: { point: 2904, brackets: [[84120, 0.10], [120720, 0.14], [193800, 0.20], [269280, 0.31], [560280, 0.35], [721560, 0.47], [Infinity, 0.50]] },
  2026: { point: 2892, brackets: [[84120, 0.10], [120720, 0.14], [228000, 0.20], [301200, 0.31], [560280, 0.35], [721560, 0.47], [Infinity, 0.50]] },
}

function annualTax(income, year, points) {
  const table = TAX_TABLES[year] || TAX_TABLES[2026]
  let tax = 0
  let prev = 0
  for (const [upto, rate] of table.brackets) {
    if (income <= prev) break
    tax += (Math.min(income, upto) - prev) * rate
    prev = upto
  }
  return Math.max(0, tax - points * table.point)
}

// Official Tax Authority booklet per published year (see data-sources/README).
const GOV = 'https://www.gov.il/BlobFolder/generalpage'
const SOURCE_URLS = {
  2026: `${GOV}/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2026.pdf#page=20`,
  2025: `${GOV}/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2025.pdf#page=20`,
  2024: `${GOV}/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2024.pdf#page=20`,
  2023: `${GOV}/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2023.pdf#page=20`,
  2022: `${GOV}/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2022.pdf#page=20`,
  2021: `${GOV}/income-tax-monthly-deductions-booklet/he/itc_itc_necuyim2021-1.pdf`,
  2020: `${GOV}/income-tax-monthly-deductions-booklet/he/luachyanoar.pdf`,
  2019: `${GOV}/income-tax-annual-deductions-booklet/he/luah_nikuim_shnati_2019_acc.pdf`,
  2018: `${GOV}/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_luah_azer_hodshi_2018_acc.pdf`,
  2017: `${GOV}/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_luah_ezer_2017_acc.pdf`,
  2016: `${GOV}/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_luah_ezer_2016_acc.pdf`,
}
const PUBLISHED_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016]

// geographic order, north to south
const SUBREGIONS = [
  'golan', 'galil-elyon', 'galil-maaravi', 'galil-tahton', 'bika', 'yosh',
  'center', 'shfela-lachish', 'otef-aza', 'negev-maaravi', 'negev-mizrahi',
  'eilat-arava',
]

// keep the view on Israel
const ISRAEL_BOUNDS = L.latLngBounds([29.4, 33.8], [33.45, 36.2])
const DATA_BOUNDS = L.latLngBounds([29.5, 34.25], [33.35, 35.95])

// rate -> ordinal class 1..6 (7 / 10 / 12-13 / 14 / 16-18 / 20)
function rateClass(rate) {
  if (rate <= 7) return 1
  if (rate <= 10) return 2
  if (rate <= 13) return 3
  if (rate <= 14) return 4
  if (rate <= 18) return 5
  return 6
}
const RATE_CLASS_LABELS = { 1: '7%', 2: '10%', 3: '12-13%', 4: '14%', 5: '16-18%', 6: '20%' }

function rampColor(cls) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--rate-${cls}`).trim()
}

const nf = () => new Intl.NumberFormat(state.lang === 'he' ? 'he-IL' : 'en-IL')

function normSearch(s) {
  return s.toLowerCase().replace(/["'״׳׳״]/g, '').replace(/קריית/g, 'קרית')
}

// ---------------------------------------------------------------- i18n & prefs

function applyLang() {
  t = makeT(state.lang)
  const dir = t('dir')
  document.documentElement.lang = state.lang
  document.documentElement.dir = dir
  document.title = state.lang === 'he'
    ? 'מפת היישובים המזכים בהטבת מס הכנסה | OpenTaxMap'
    : 'OpenTaxMap | Israel Tax-Benefit Localities Map'
  const desc = t('metaDescription')
  document.querySelector('meta[name="description"]')?.setAttribute('content', desc)
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc)
  document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', desc)
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n) })
  document.querySelectorAll('[data-i18n-arialabel]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nArialabel)) })
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)) })
  const srcList = document.getElementById('about-sources')
  srcList.innerHTML = ''
  for (const item of STRINGS[state.lang].aboutDataItems) {
    const li = document.createElement('li')
    li.textContent = item
    srcList.appendChild(li)
  }
  const booklets = document.getElementById('booklet-links')
  booklets.innerHTML = ''
  for (const y of data ? [...data.years].sort((a, b) => b - a) : PUBLISHED_YEARS) {
    const url = SOURCE_URLS[y]
    if (!url) continue
    const li = document.createElement('li')
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener'
    a.textContent = t('govPdfYear', { year: y })
    li.appendChild(a)
    booklets.appendChild(li)
  }
  const docs = document.getElementById('doc-links')
  if (docs) {
    docs.innerHTML = ''
    const repo = 'https://github.com/NX1X/OpenTaxMap/blob/main'
    const suffix = state.lang === 'he' ? '.he.md' : '.md'
    for (const [file, key] of [[`CHANGELOG${suffix}`, 'whatsNew'], [`ROADMAP${suffix}`, 'roadmapLink']]) {
      const li = document.createElement('li')
      const a = document.createElement('a')
      a.href = `${repo}/${file}`
      a.target = '_blank'
      a.rel = 'noopener'
      a.textContent = t(key)
      li.appendChild(a)
      docs.appendChild(li)
    }
  }
  populateSubregions()
  if (map) setBasemap()
  renderVersion()
  setCbsSourceText()
  store('lang', state.lang)
}

function cbsYear() {
  return (data && data.cbs && data.cbs.popYear) || 2023
}

function setCbsSourceText() {
  const el = document.getElementById('about-cbs-source')
  if (el) el.textContent = t('cbsPopSource', { year: cbsYear() })
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme
  document.getElementById('theme-toggle').setAttribute('aria-pressed', String(state.theme === 'dark'))
  store('theme', state.theme)
  if (map) {
    setBasemap()
    renderMarkers()
    renderLegend()
    renderList()
  }
}

function applyPrefs() {
  const root = document.documentElement
  root.style.setProperty('--font-scale', stored('fontScale') || '1')
  root.dataset.contrast = stored('contrast') === 'on' ? 'high' : ''
  root.dataset.motion = stored('motion') === 'on' ? 'reduce' : ''
  root.dataset.underline = stored('underline') === 'on' ? 'on' : ''
}

function syncUrl() {
  const p = new URLSearchParams()
  if (state.lang !== 'he') p.set('lang', state.lang)
  if (state.year !== '2026') p.set('year', state.year)
  if (state.q) p.set('q', state.q)
  if (state.sector) p.set('sector', state.sector)
  if (state.district) p.set('district', state.district)
  if (state.subregion) p.set('subregion', state.subregion)
  if (state.council) p.set('council', state.council)
  if (state.rates.size) p.set('rates', [...state.rates].join(','))
  if (state.changes) p.set('changes', '1')
  if (compareSet.size) p.set('compare', [...compareSet].join(','))
  const qs = p.toString()
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname)
}

// ---------------------------------------------------------------- filtering

function benefitFor(loc) {
  return loc.benefits[state.year] || null
}

function prevYear() {
  return String(Number(state.year) - 1)
}

function changesActive() {
  return state.changes && data && data.years.includes(Number(prevYear()))
}

// added | removed | changed | same, relative to the previous tax year
function changeStatus(loc) {
  const cur = loc.benefits[state.year]
  const prev = loc.benefits[prevYear()]
  if (cur && !prev) return 'added'
  if (!cur && prev) return 'removed'
  if (!cur && !prev) return null
  return cur.rate !== prev.rate || cur.cap !== prev.cap ? 'changed' : 'same'
}

const CHANGE_COLORS = { added: '--chg-added', removed: '--chg-removed', changed: '--chg-changed', same: '--chg-same' }

function changeColor(status) {
  return getComputedStyle(document.documentElement).getPropertyValue(CHANGE_COLORS[status]).trim()
}

function filtered() {
  if (!data) return []
  const q = normSearch(state.q.trim())
  return data.localities.filter((loc) => {
    const b = benefitFor(loc)
    // in changes mode, localities removed relative to last year stay visible
    if (!b && !(changesActive() && loc.benefits[prevYear()])) return false
    if (state.sector && loc.sector !== state.sector) return false
    if (state.district && loc.district !== state.district) return false
    if (state.subregion && loc.subregion !== state.subregion) return false
    if (state.council && loc.council !== state.council) return false
    if (state.rates.size && (!b || !state.rates.has(rateClass(b.rate)))) return false
    if (q && !normSearch(loc.he).includes(q) && !normSearch(loc.en).includes(q)) return false
    return true
  })
}

// ---------------------------------------------------------------- map

// Basemap labels follow the UI language. Hebrew uses the Israel Hiking Map
// (Amud Anan): Hebrew place names and Israeli cartographic convention.
// English uses CARTO Voyager (romanized labels). Neither Hebrew tile set has
// a native dark style, so dark Hebrew is the light tiles inverted in CSS;
// CARTO ships a native dark style for English.
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const IHM_ATTR = OSM_ATTR + ' &copy; <a href="https://israelhiking.osm.org.il">Israel Hiking Map</a>'
const CARTO_ATTR = OSM_ATTR + ' &copy; <a href="https://carto.com/attributions">CARTO</a>'

function basemapLayers() {
  const dark = state.theme === 'dark'
  if (state.lang === 'he') {
    // Light: Israel Hiking (Hebrew, Israeli convention) has tiles only over
    // Israel/PA, so a label-less world base sits underneath and the Hebrew
    // layer is multiply-blended on top (its white sea drops to the base).
    // Dark: that blend can't keep labels legible, so use OSM standard
    // (Hebrew, worldwide) inverted into a dark style instead.
    if (dark) {
      return [{
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        opts: { maxZoom: 18, attribution: OSM_ATTR, className: 'basemap-tiles basemap-inverted' },
      }]
    }
    return [
      { url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
        opts: { maxZoom: 18, subdomains: 'abcd', attribution: CARTO_ATTR, className: 'basemap-tiles' } },
      { url: 'https://israelhiking.osm.org.il/Hebrew/Tiles/{z}/{x}/{y}.png',
        opts: { maxZoom: 16, attribution: IHM_ATTR, className: 'basemap-tiles basemap-ihm' } },
    ]
  }
  return [{
    url: dark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    opts: { maxZoom: 18, subdomains: 'abcd', attribution: CARTO_ATTR, className: 'basemap-tiles' },
  }]
}

function setBasemap() {
  baseLayers.forEach((l) => l.remove())
  baseLayers = basemapLayers().map((cfg) => L.tileLayer(cfg.url, cfg.opts).addTo(map))
}

function radiusForZoom() {
  const z = map ? map.getZoom() : 8
  return z <= 7 ? 4.5 : z <= 8 ? 5.5 : z <= 10 ? 7 : 9
}

function initMap() {
  map = L.map('map', {
    center: [31.5, 35.0],
    zoom: 8,
    preferCanvas: true,
    zoomControl: false,
    maxBounds: ISRAEL_BOUNDS,
    maxBoundsViscosity: 1.0,
    minZoom: 7,
    maxZoom: 16,
  })
  // fit after the grid layout has given the container its real size;
  // fitting a zero-size container produces a garbage center/zoom
  requestAnimationFrame(() => {
    map.invalidateSize()
    map.fitBounds(DATA_BOUNDS, { padding: [12, 12] })
  })
  L.control.zoom({
    position: state.lang === 'he' ? 'topleft' : 'topright',
    zoomInTitle: t('zoomIn'),
    zoomOutTitle: t('zoomOut'),
  }).addTo(map)
  setBasemap()
  markerLayer = L.layerGroup().addTo(map)
  map.on('zoomend', () => {
    const r = radiusForZoom()
    markerByKey.forEach((m) => m.setRadius(r))
  })
  // grid/flex layout can settle after Leaflet measures the container;
  // re-measure whenever the map pane resizes
  new ResizeObserver(() => map.invalidateSize()).observe(document.getElementById('map'))
}

function renderMarkers() {
  markerLayer.clearLayers()
  markerByKey.clear()
  const list = filtered()
  for (const loc of list) {
    if (loc.lat == null) continue
    const b = benefitFor(loc)
    let fill, tipSuffix
    if (changesActive()) {
      const status = changeStatus(loc)
      fill = changeColor(status)
      tipSuffix = t(`change${status[0].toUpperCase()}${status.slice(1)}`)
    } else {
      fill = rampColor(rateClass(b.rate))
      tipSuffix = `${b.rate}%`
    }
    const m = L.circleMarker([loc.lat, loc.lng], {
      radius: radiusForZoom(),
      color: getComputedStyle(document.documentElement).getPropertyValue('--marker-ring').trim(),
      weight: 2,
      fillColor: fill,
      fillOpacity: 0.95,
    })
    // pass a DOM node, not a string: Leaflet assigns string tooltips via
    // innerHTML, so a stray "<" in a locality name would render as markup
    const tip = document.createElement('span')
    tip.textContent = `${state.lang === 'he' ? loc.he : loc.en} · ${tipSuffix}`
    m.bindTooltip(tip, { direction: 'top' })
    m.on('click', () => openDetail(loc, m))
    m.addTo(markerLayer)
    markerByKey.set(loc.he, m)
  }
}

// ---------------------------------------------------------------- rendering

function renderLegend() {
  const wrap = document.getElementById('legend-chips')
  wrap.innerHTML = ''
  if (changesActive()) {
    for (const status of ['added', 'removed', 'changed', 'same']) {
      const span = document.createElement('span')
      span.className = 'legend-static'
      const sw = document.createElement('span')
      sw.className = 'legend-swatch'
      sw.style.background = changeColor(status)
      span.append(sw, document.createTextNode(t(`change${status[0].toUpperCase()}${status.slice(1)}`)))
      wrap.appendChild(span)
    }
    return
  }
  for (let cls = 1; cls <= 6; cls++) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.setAttribute('aria-pressed', String(state.rates.has(cls)))
    const sw = document.createElement('span')
    sw.className = 'legend-swatch'
    sw.style.background = rampColor(cls)
    btn.append(sw, document.createTextNode(RATE_CLASS_LABELS[cls]))
    btn.addEventListener('click', () => {
      state.rates.has(cls) ? state.rates.delete(cls) : state.rates.add(cls)
      update()
    })
    wrap.appendChild(btn)
  }
}

function populateSubregions() {
  const sel = document.getElementById('subregion')
  const current = state.subregion
  while (sel.options.length > 1) sel.remove(1)
  for (const key of SUBREGIONS) {
    const opt = document.createElement('option')
    opt.value = key
    opt.textContent = t(`sub-${key}`)
    sel.appendChild(opt)
  }
  sel.value = current
  if (sel.value !== current) { state.subregion = ''; sel.value = '' }
}

function renderCouncils() {
  const sel = document.getElementById('council')
  const current = state.council
  while (sel.options.length > 1) sel.remove(1)
  const councils = [...new Set(data.localities.map((l) => l.council).filter(Boolean))]
  councils.sort((a, b) => a.localeCompare(b, 'he'))
  for (const c of councils) {
    const opt = document.createElement('option')
    opt.value = c
    opt.textContent = c
    sel.appendChild(opt)
  }
  sel.value = current
  if (sel.value !== current) { state.council = ''; sel.value = '' }
}

function renderList() {
  const ul = document.getElementById('results-list')
  const count = document.getElementById('results-count')
  const list = filtered()
  count.textContent = list.length === 0 ? t('resultsNone')
    : list.length === 1 ? t('resultsCountOne')
    : t('resultsCount', { n: nf().format(list.length) })
  document.getElementById('empty-state').hidden = list.length !== 0
  ul.innerHTML = ''
  const frag = document.createDocumentFragment()
  for (const loc of list) {
    const b = benefitFor(loc)
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.type = 'button'
    const dot = document.createElement('span')
    dot.className = 'dot'
    dot.setAttribute('aria-hidden', 'true')
    const name = document.createElement('span')
    name.textContent = state.lang === 'he' ? loc.he : loc.en
    const meta = document.createElement('span')
    meta.className = 'meta'
    if (changesActive()) {
      const status = changeStatus(loc)
      dot.style.background = changeColor(status)
      meta.textContent = t(`change${status[0].toUpperCase()}${status.slice(1)}`)
    } else {
      dot.style.background = rampColor(rateClass(b.rate))
      meta.textContent = `${b.rate}% · ${t('upTo')} ${nf().format(b.cap)} ₪`
    }
    btn.append(dot, name, meta)
    btn.addEventListener('click', () => openDetail(loc, btn))
    li.appendChild(btn)
    frag.appendChild(li)
  }
  ul.appendChild(frag)
}

// ---------------------------------------------------------------- detail dialog

let lastFocus = null

function openDetail(loc, invoker) {
  lastFocus = invoker instanceof HTMLElement ? invoker : null
  setDetailUrl(loc)
  const dlg = document.getElementById('detail-dialog')
  const title = document.getElementById('detail-title')
  const body = document.getElementById('detail-body')
  title.textContent = state.lang === 'he' ? `${loc.he} · ${loc.en}` : `${loc.en} · ${loc.he}`
  body.innerHTML = ''

  const meta = document.createElement('p')
  meta.className = 'detail-meta'
  const subregionLabel = loc.subregion ? t(`sub-${loc.subregion}`) : ''
  const sectorLabel = { jewish: t('sectorJewish'), arab: t('sectorArab'), druze: t('sectorDruze'), mixed: t('sectorMixed') }[loc.sector] || ''
  const bits = [subregionLabel, loc.council, sectorLabel]
  if (loc.pop) bits.push(`${t('population')}: ${nf().format(loc.pop)}`)
  meta.textContent = bits.filter(Boolean).join(' · ')
  body.appendChild(meta)

  const table = document.createElement('table')
  table.className = 'history-table'
  const caption = document.createElement('caption')
  caption.textContent = t('history')
  table.appendChild(caption)
  const thead = document.createElement('thead')
  const trh = document.createElement('tr')
  for (const h of [t('historyYear'), t('creditRate'), t('creditCap'), t('maxBenefit')]) {
    const th = document.createElement('th')
    th.scope = 'col'
    th.textContent = h
    trh.appendChild(th)
  }
  thead.appendChild(trh)
  table.appendChild(thead)
  const tbody = document.createElement('tbody')
  for (const y of [...data.years].reverse()) {
    const b = loc.benefits[String(y)]
    const tr = document.createElement('tr')
    if (String(y) === state.year) tr.className = 'current'
    const th = document.createElement('th')
    th.scope = 'row'
    th.textContent = y
    tr.appendChild(th)
    for (const v of b
      ? [`${b.rate}%`, `${nf().format(b.cap)} ₪`, `${nf().format(Math.round(b.cap * b.rate / 100))} ₪`]
      : [t('notEligible'), '-', '-']) {
      const td = document.createElement('td')
      td.textContent = v
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  body.appendChild(table)

  const b2023 = loc.benefits['2023']
  if (b2023?.alt) {
    const note = document.createElement('p')
    note.className = 'detail-note'
    note.textContent = t('midYearNote', { rate: b2023.alt.rate, cap: nf().format(b2023.alt.cap) })
    body.appendChild(note)
  }
  if (loc.special === 'eilat') {
    const note = document.createElement('p')
    note.className = 'detail-note'
    note.textContent = t('eilatNote')
    body.appendChild(note)
  }

  body.appendChild(buildCalculator(loc))

  const compareBtn = document.createElement('button')
  compareBtn.type = 'button'
  compareBtn.className = 'link-btn'
  const inCompare = compareSet.has(loc.slug)
  compareBtn.textContent = inCompare ? t('compareRemove') : t('compareAdd')
  compareBtn.addEventListener('click', () => {
    if (compareSet.has(loc.slug)) compareSet.delete(loc.slug)
    else if (compareSet.size >= 3) { compareBtn.textContent = t('compareFull'); return }
    else compareSet.add(loc.slug)
    compareBtn.textContent = compareSet.has(loc.slug) ? t('compareRemove') : t('compareAdd')
    renderCompareButton()
    syncUrl()
  })
  body.appendChild(compareBtn)

  const src = document.createElement('p')
  const a = document.createElement('a')
  a.href = 'https://www.kolzchut.org.il/he/%D7%96%D7%99%D7%9B%D7%95%D7%99_%D7%9E%D7%9E%D7%A1_%D7%94%D7%9B%D7%A0%D7%A1%D7%94_%D7%9C%D7%AA%D7%95%D7%A9%D7%91%D7%99%D7%9D_%D7%91%D7%A4%D7%A8%D7%99%D7%A4%D7%A8%D7%99%D7%94'
  a.target = '_blank'
  a.rel = 'noopener'
  a.textContent = t('detailsSource')
  src.appendChild(a)
  body.appendChild(src)

  if (loc.lat != null) {
    const show = document.createElement('button')
    show.type = 'button'
    show.className = 'link-btn'
    show.textContent = t('showOnMap')
    show.addEventListener('click', () => {
      dlg.close()
      map.setView([loc.lat, loc.lng], 12)
      const m = markerByKey.get(loc.he)
      if (m) m.openTooltip()
    })
    body.appendChild(show)
  }

  dlg.showModal()
}

function buildCalculator(loc) {
  const wrap = document.createElement('section')
  wrap.className = 'calc'
  const calcYear = loc.benefits[state.year] ? state.year
    : Object.keys(loc.benefits).sort().pop()
  const b = loc.benefits[calcYear]

  const h = document.createElement('h3')
  h.textContent = t('calculator')
  wrap.appendChild(h)

  const row = document.createElement('div')
  row.className = 'calc-row'
  const salaryField = document.createElement('div')
  salaryField.className = 'field'
  const salaryLabel = document.createElement('label')
  salaryLabel.textContent = t('calcSalary')
  salaryLabel.htmlFor = 'calc-salary'
  const salary = document.createElement('input')
  salary.type = 'number'
  salary.id = 'calc-salary'
  salary.min = '0'
  salary.step = '500'
  salary.value = stored('calcSalary') || '12000'
  salaryField.append(salaryLabel, salary)
  const pointsField = document.createElement('div')
  pointsField.className = 'field'
  const pointsLabel = document.createElement('label')
  pointsLabel.textContent = t('calcPoints')
  pointsLabel.htmlFor = 'calc-points'
  const points = document.createElement('input')
  points.type = 'number'
  points.id = 'calc-points'
  points.min = '0'
  points.step = '0.25'
  points.value = stored('calcPoints') || '2.25'
  pointsField.append(pointsLabel, points)
  row.append(salaryField, pointsField)
  wrap.appendChild(row)

  const out = document.createElement('div')
  out.className = 'calc-out'
  out.setAttribute('role', 'status')
  wrap.appendChild(out)

  const note = document.createElement('p')
  note.className = 'detail-note'
  note.textContent = t('calcNote', { year: calcYear })
  wrap.appendChild(note)

  const recalc = () => {
    const monthly = Number(salary.value) || 0
    const pts = Number(points.value) || 0
    const income = monthly * 12
    const tax = annualTax(income, Number(calcYear), pts)
    const credit = Math.min(b.rate / 100 * Math.min(income, b.cap), tax)
    const after = tax - credit
    const f = nf()
    out.innerHTML = ''
    for (const line of [
      t('calcResult', { tax: f.format(Math.round(tax)) }),
      t('calcCredit', { credit: f.format(Math.round(credit)) }),
      t('calcAfter', { after: f.format(Math.round(after)) }),
      t('calcMonthly', { monthly: f.format(Math.round(credit / 12)) }),
    ]) {
      const p = document.createElement('p')
      p.textContent = line
      out.appendChild(p)
    }
    store('calcSalary', salary.value)
    store('calcPoints', points.value)
  }
  salary.addEventListener('input', recalc)
  points.addEventListener('input', recalc)
  recalc()
  return wrap
}

// ---------------------------------------------------------------- compare

const compareSet = new Set((params.get('compare') || '').split(',').filter(Boolean).slice(0, 3))

function renderCompareButton() {
  const btn = document.getElementById('compare-open')
  btn.hidden = compareSet.size === 0
  btn.textContent = t('compareOpen', { n: compareSet.size })
}

function openCompare(invoker) {
  lastFocus = invoker instanceof HTMLElement ? invoker : null
  const dlg = document.getElementById('compare-dialog')
  const body = document.getElementById('compare-body')
  body.innerHTML = ''
  const locs = [...compareSet].map((s) => data.localities.find((l) => l.slug === s)).filter(Boolean)
  if (!locs.length) {
    const p = document.createElement('p')
    p.textContent = t('compareEmpty')
    body.appendChild(p)
  } else {
    const f = nf()
    const table = document.createElement('table')
    table.className = 'history-table'
    const rows = [
      ['', (l) => (state.lang === 'he' ? l.he : l.en)],
      [t('creditRate'), (l) => (l.benefits[state.year] ? `${l.benefits[state.year].rate}%` : t('notEligible'))],
      [t('creditCap'), (l) => (l.benefits[state.year] ? `${f.format(l.benefits[state.year].cap)} ₪` : '-')],
      [t('maxBenefit'), (l) => (l.benefits[state.year] ? `${f.format(Math.round(l.benefits[state.year].cap * l.benefits[state.year].rate / 100))} ₪` : '-')],
      [t('subregion'), (l) => (l.subregion ? t(`sub-${l.subregion}`) : '')],
      [t('council'), (l) => l.council || ''],
      [t('population'), (l) => (l.pop ? f.format(l.pop) : '')],
    ]
    for (const [label, fn] of rows) {
      const tr = document.createElement('tr')
      const th = document.createElement('th')
      th.scope = 'row'
      th.textContent = label
      tr.appendChild(th)
      for (const l of locs) {
        const td = document.createElement('td')
        td.textContent = fn(l)
        tr.appendChild(td)
      }
      table.appendChild(tr)
    }
    body.appendChild(table)
  }
  dlg.showModal()
}

function compareLocs() {
  return [...compareSet].map((s) => data.localities.find((l) => l.slug === s)).filter(Boolean)
}

function downloadFile(name, mime, text) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function exportComparison(format) {
  const locs = compareLocs()
  if (!locs.length) return
  if (format === 'json') {
    const payload = {
      generated: null,
      source: 'https://taxmap.nx1xlab.dev',
      localities: locs.map((l) => ({
        he: l.he, en: l.en, slug: l.slug, subregion: l.subregion,
        council: l.council, sector: l.sector, pop: l.pop, benefits: l.benefits,
      })),
    }
    downloadFile('taxmap-comparison.json', 'application/json', JSON.stringify(payload, null, 2))
    return
  }
  // CSV: one row per locality per year, machine-friendly + Excel (UTF-8 BOM)
  const cols = ['locality_he', 'locality_en', 'year', 'rate_percent', 'income_cap_ils', 'max_benefit_ils', 'subregion', 'council', 'sector']
  const rows = [cols.join(',')]
  const csvCell = (v) => {
    let s = v == null ? '' : String(v)
    // Neutralise spreadsheet formula injection: Excel and Sheets evaluate a
    // cell starting with one of these, so prefix it to force a literal string.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  for (const l of locs) {
    for (const y of data.years) {
      const b = l.benefits[y]
      if (!b) continue
      rows.push([
        l.he, l.en, y, b.rate, b.cap, Math.round(b.cap * b.rate / 100),
        l.subregion ? t(`sub-${l.subregion}`) : '', l.council || '', l.sector,
      ].map(csvCell).join(','))
    }
  }
  downloadFile('taxmap-comparison.csv', 'text/csv;charset=utf-8', '﻿' + rows.join('\n'))
}

// ---------------------------------------------------------------- permalinks

function slugFromPath() {
  const m = location.pathname.match(/^\/yishuv\/([a-z0-9-]+)\/?$/)
  return m ? m[1] : null
}

function setDetailUrl(loc) {
  const qs = location.search
  history.replaceState(null, '', loc ? `/yishuv/${loc.slug}${qs}` : `/${qs}`)
  document.title = loc
    ? (state.lang === 'he'
        ? `${loc.he} - הטבת מס הכנסה | OpenTaxMap`
        : `${loc.en} - Israel tax benefit | OpenTaxMap`)
    : (state.lang === 'he'
        ? 'מפת היישובים המזכים בהטבת מס הכנסה | OpenTaxMap'
        : 'OpenTaxMap | Israel Tax-Benefit Localities Map')
}

// ---------------------------------------------------------------- nearest

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function showUserLocation(lat, lng, accuracy) {
  if (userLayer) userLayer.remove()
  userLayer = L.layerGroup().addTo(map)
  // accuracy halo (clamped so a coarse fix doesn't cover the whole map)
  if (accuracy && accuracy < 20000) {
    L.circle([lat, lng], {
      radius: accuracy, color: '#1e73e8', weight: 1,
      fillColor: '#1e73e8', fillOpacity: 0.12, interactive: false,
    }).addTo(userLayer)
  }
  const icon = L.divIcon({
    className: 'user-loc-marker',
    html: '<span class="user-loc-dot" aria-hidden="true"></span>',
    iconSize: [18, 18], iconAnchor: [9, 9],
  })
  L.marker([lat, lng], { icon, keyboard: false, title: t('youAreHere'), alt: t('youAreHere') })
    .addTo(userLayer)
    .bindTooltip(t('youAreHere'), { direction: 'top' })
}

function findNearest(invoker) {
  const status = document.getElementById('nearest-status')
  if (!navigator.geolocation) { status.textContent = t('nearestDenied'); return }
  status.textContent = t('locating')
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude, accuracy } = pos.coords
    // drop a "you are here" marker even when the user is outside Israel
    const inView = ISRAEL_BOUNDS.contains([latitude, longitude])
    if (inView) showUserLocation(latitude, longitude, accuracy)
    let best = null
    let bestKm = Infinity
    for (const loc of data.localities) {
      if (loc.lat == null || !benefitFor(loc)) continue
      const km = haversineKm(latitude, longitude, loc.lat, loc.lng)
      if (km < bestKm) { bestKm = km; best = loc }
    }
    if (!best) { status.textContent = t('nearestDenied'); return }
    status.textContent = t('nearestFound', {
      name: state.lang === 'he' ? best.he : best.en,
      km: Math.round(bestKm),
    })
    if (inView) {
      map.fitBounds(L.latLngBounds([latitude, longitude], [best.lat, best.lng]).pad(0.4))
    } else {
      map.setView([best.lat, best.lng], 11)
    }
    openDetail(best, invoker)
  }, () => { status.textContent = t('nearestDenied') }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 })
}

// ---------------------------------------------------------------- stats

function barChart(entries, colorFn) {
  // entries: [{label, value, color?}]; renders labelled proportional bars
  const max = Math.max(1, ...entries.map((e) => e.value))
  const wrap = document.createElement('div')
  wrap.className = 'bars'
  for (const e of entries) {
    const row = document.createElement('div')
    row.className = 'bar-row'
    const label = document.createElement('span')
    label.className = 'bar-label'
    label.textContent = e.label
    const track = document.createElement('span')
    track.className = 'bar-track'
    const fill = document.createElement('span')
    fill.className = 'bar-fill'
    fill.style.width = `${(e.value / max) * 100}%`
    fill.style.background = e.color || (colorFn ? colorFn(e) : 'var(--accent)')
    track.appendChild(fill)
    const val = document.createElement('span')
    val.className = 'bar-val'
    val.textContent = nf().format(e.value)
    row.append(label, track, val)
    wrap.appendChild(row)
  }
  return wrap
}

function statSection(titleKey, node) {
  const sec = document.createElement('section')
  sec.className = 'stat-section'
  const h = document.createElement('h3')
  h.textContent = t(titleKey)
  sec.append(h, node)
  return sec
}

function buildStats() {
  const body = document.getElementById('stats-body')
  body.innerHTML = ''
  const year = state.year
  const eligible = data.localities.filter((l) => l.benefits[year])

  const intro = document.createElement('p')
  intro.className = 'stats-intro'
  intro.textContent = t('statsIntro', { year })
  body.appendChild(intro)

  // KPI row
  const pop = eligible.reduce((s, l) => s + (l.pop || 0), 0)
  const avgRate = eligible.length
    ? eligible.reduce((s, l) => s + l.benefits[year].rate, 0) / eligible.length : 0
  const topRate = Math.max(...eligible.map((l) => l.benefits[year].rate))
  const topCount = eligible.filter((l) => l.benefits[year].rate === topRate).length
  const prev = String(Number(year) - 1)
  const hasPrev = data.years.includes(Number(prev))
  const added = hasPrev
    ? eligible.filter((l) => !l.benefits[prev]).length : null
  const removed = hasPrev
    ? data.localities.filter((l) => l.benefits[prev] && !l.benefits[year]).length : null

  const kpiDefs = [
    [t('statKpiTotal'), nf().format(eligible.length)],
    [t('statKpiPop'), nf().format(pop)],
    [t('statKpiAvgRate'), `${avgRate.toFixed(1)}%`],
    [`${t('statKpiTopRate')} (${topRate}%)`, nf().format(topCount)],
  ]
  if (hasPrev) {
    kpiDefs.push([t('statKpiAdded', { prev }), `+${nf().format(added)}`])
    kpiDefs.push([t('statKpiRemoved', { prev }), `-${nf().format(removed)}`])
  }
  const kpis = document.createElement('div')
  kpis.className = 'kpi-row'
  for (const [label, value] of kpiDefs) {
    const box = document.createElement('div')
    box.className = 'kpi'
    const v = document.createElement('span')
    v.className = 'kpi-val'
    v.textContent = value
    const l = document.createElement('span')
    l.className = 'kpi-label'
    l.textContent = label
    box.append(v, l)
    kpis.appendChild(box)
  }
  body.appendChild(kpis)

  // by rate (grouped into the legend's rate classes)
  const rateGroups = new Map()
  for (const l of eligible) {
    const r = l.benefits[year].rate
    rateGroups.set(r, (rateGroups.get(r) || 0) + 1)
  }
  const rateEntries = [...rateGroups.entries()].sort((a, b) => a[0] - b[0])
    .map(([rate, value]) => ({ label: `${rate}%`, value, color: rampColor(rateClass(rate)) }))
  body.appendChild(statSection('statByRate', barChart(rateEntries)))

  // by sector
  const sectorLabels = { jewish: t('sectorJewish'), arab: t('sectorArab'), druze: t('sectorDruze'), mixed: t('sectorMixed') }
  const sectorCounts = new Map()
  for (const l of eligible) sectorCounts.set(l.sector, (sectorCounts.get(l.sector) || 0) + 1)
  const sectorEntries = [...sectorCounts.entries()].sort((a, b) => b[1] - a[1])
    .map(([s, value]) => ({ label: sectorLabels[s] || s, value }))
  body.appendChild(statSection('statBySector', barChart(sectorEntries)))

  // by sub-region
  const subCounts = new Map()
  for (const l of eligible) subCounts.set(l.subregion, (subCounts.get(l.subregion) || 0) + 1)
  const subEntries = SUBREGIONS.filter((k) => subCounts.get(k))
    .map((k) => ({ label: t(`sub-${k}`), value: subCounts.get(k) }))
    .sort((a, b) => b.value - a.value)
  body.appendChild(statSection('statBySubregion', barChart(subEntries)))

  // trend across all available years (auto-scales when older years are added)
  const trendEntries = data.years.map((y) => ({
    label: String(y),
    value: data.localities.filter((l) => l.benefits[y]).length,
    color: String(y) === year ? 'var(--accent)' : '#9db8dc',
  }))
  body.appendChild(statSection('statTrend', barChart(trendEntries)))

  // cite the population-figures source (used by the "residents covered" KPI)
  const srcP = document.createElement('p')
  srcP.className = 'detail-note'
  const srcA = document.createElement('a')
  srcA.href = 'https://www.cbs.gov.il/he/publications/doclib/2019/ishuvim/bycode2024.xlsx'
  srcA.target = '_blank'
  srcA.rel = 'noopener'
  srcA.textContent = t('cbsPopSource', { year: cbsYear() })
  srcP.appendChild(srcA)
  body.appendChild(srcP)
}

function wireDialogs() {
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.querySelector('[data-close]')?.addEventListener('click', () => dlg.close())
    // Backdrop-close, but only when the press BEGINS and ENDS on the backdrop
    // (outside the dialog box). Using e.target === dlg alone closed the dialog
    // when a click landed on the dialog's own padding, or when a text-selection
    // drag happened to end outside - both felt like accidental dismissals.
    let downOnBackdrop = false
    const outside = (e) => {
      const r = dlg.getBoundingClientRect()
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
    }
    dlg.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === dlg && outside(e) })
    dlg.addEventListener('click', (e) => { if (downOnBackdrop && e.target === dlg && outside(e)) dlg.close() })
    dlg.addEventListener('close', () => {
      if (dlg.id === 'detail-dialog') setDetailUrl(null)
      lastFocus?.focus()
      lastFocus = null
    })
  })
  document.getElementById('compare-open').addEventListener('click', (e) => openCompare(e.currentTarget))
  document.getElementById('compare-clear').addEventListener('click', () => {
    compareSet.clear()
    renderCompareButton()
    syncUrl()
    document.getElementById('compare-dialog').close()
  })
  document.getElementById('compare-export-csv').addEventListener('click', () => exportComparison('csv'))
  document.getElementById('compare-export-json').addEventListener('click', () => exportComparison('json'))
  document.getElementById('stats-open').addEventListener('click', (e) => {
    lastFocus = e.currentTarget
    buildStats()
    document.getElementById('stats-dialog').showModal()
  })
  document.getElementById('about-open').addEventListener('click', (e) => {
    lastFocus = e.currentTarget
    document.getElementById('about-dialog').showModal()
  })
  document.getElementById('a11y-statement-open').addEventListener('click', (e) => {
    lastFocus = e.currentTarget
    document.getElementById('a11y-dialog').showModal()
  })
}

// ---------------------------------------------------------------- controls

function wireControls() {
  const yearSel = document.getElementById('year')
  document.getElementById('lang-toggle').addEventListener('click', () => {
    state.lang = state.lang === 'he' ? 'en' : 'he'
    applyLang()
    update()
  })
  document.getElementById('theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark'
    applyTheme()
  })

  const a11yBtn = document.getElementById('a11y-toggle')
  const a11yMenu = document.getElementById('a11y-menu')
  a11yBtn.addEventListener('click', () => {
    const open = a11yMenu.hidden
    a11yMenu.hidden = !open
    a11yBtn.setAttribute('aria-expanded', String(open))
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !a11yMenu.hidden) {
      a11yMenu.hidden = true
      a11yBtn.setAttribute('aria-expanded', 'false')
      a11yBtn.focus()
    }
  })
  a11yMenu.querySelectorAll('[data-font]').forEach((btn) => {
    btn.addEventListener('click', () => {
      a11yMenu.querySelectorAll('[data-font]').forEach((b) => b.classList.toggle('active', b === btn))
      store('fontScale', btn.dataset.font)
      applyPrefs()
    })
  })
  const bindOpt = (id, key) => {
    const el = document.getElementById(id)
    el.checked = stored(key) === 'on'
    el.addEventListener('change', () => { store(key, el.checked ? 'on' : 'off'); applyPrefs() })
  }
  bindOpt('opt-contrast', 'contrast')
  bindOpt('opt-motion', 'motion')
  bindOpt('opt-underline', 'underline')

  document.getElementById('nearest-btn').addEventListener('click', (e) => findNearest(e.currentTarget))

  const changesBox = document.getElementById('changes-mode')
  changesBox.checked = state.changes
  changesBox.addEventListener('change', () => { state.changes = changesBox.checked; update() })

  let searchTimer
  document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => { state.q = e.target.value; update() }, 150)
  })
  yearSel.addEventListener('change', () => { state.year = yearSel.value; update() })
  for (const [id, key] of [['sector', 'sector'], ['district', 'district'], ['subregion', 'subregion'], ['council', 'council']]) {
    document.getElementById(id).addEventListener('change', (e) => { state[key] = e.target.value; update() })
  }
  const resetFilters = () => {
    Object.assign(state, { q: '', sector: '', district: '', subregion: '', council: '', changes: false })
    state.rates.clear()
    document.getElementById('search').value = ''
    document.getElementById('changes-mode').checked = false
    document.getElementById('nearest-status').textContent = ''
    for (const id of ['sector', 'district', 'subregion', 'council']) document.getElementById(id).value = ''
    if (userLayer) { userLayer.remove(); userLayer = null }
    update()
    if (map) map.fitBounds(DATA_BOUNDS, { padding: [12, 12] })
  }
  document.getElementById('clear-filters').addEventListener('click', resetFilters)
  document.getElementById('empty-clear').addEventListener('click', resetFilters)
}

function fillYearSelect() {
  const sel = document.getElementById('year')
  sel.innerHTML = ''
  for (const y of [...data.years].reverse()) {
    const opt = document.createElement('option')
    opt.value = String(y)
    opt.textContent = String(y)
    sel.appendChild(opt)
  }
  sel.value = state.year
  if (sel.value !== state.year) { state.year = '2026'; sel.value = state.year }
}

function updateChangesToggle() {
  const box = document.getElementById('changes-mode')
  const label = document.getElementById('changes-mode-label')
  const hasPrev = data && data.years.includes(Number(state.year) - 1)
  box.disabled = !hasPrev
  if (!hasPrev && state.changes) { state.changes = false; box.checked = false }
  label.textContent = t('changesMode', { prev: Number(state.year) - 1 })
}

function update() {
  updateChangesToggle()
  renderMarkers()
  renderLegend()
  renderList()
  renderCompareButton()
  syncUrl()
}

// ---------------------------------------------------------------- boot

// ---------------------------------------------------------------- version

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.1'
let latestVersion = null

function cmpVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  }
  return 0
}

function renderVersion() {
  const el = document.getElementById('version-link')
  if (!el) return
  let text = `${t('version')} ${APP_VERSION}`
  if (latestVersion && cmpVersions(latestVersion, APP_VERSION) > 0) {
    text += ` · ${t('updateAvailable')} ${latestVersion}`
    el.classList.add('update-available')
  } else {
    el.classList.remove('update-available')
  }
  el.textContent = text
}

async function checkVersion() {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' })
    if (!res.ok) return
    const { latest } = await res.json()
    if (latest) { latestVersion = latest; renderVersion() }
  } catch {
    // offline or no worker (dev): keep the built-in version
  }
}

// ---------------------------------------------------------------- share

async function shareSite() {
  const shareData = { title: t('shareTitle'), text: t('shareText'), url: location.origin + '/' }
  if (navigator.share) {
    try { await navigator.share(shareData); return } catch { /* cancelled */ return }
  }
  const status = document.getElementById('nearest-status')
  try {
    await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`)
    if (status) { status.textContent = t('shareCopied'); setTimeout(() => { status.textContent = '' }, 2500) }
  } catch { /* clipboard blocked */ }
}

async function boot() {
  applyPrefs()
  applyTheme()
  applyLang()
  wireDialogs()
  wireControls()
  document.getElementById('share-btn').addEventListener('click', shareSite)
  renderVersion()
  checkVersion()
  setInterval(checkVersion, 30 * 60 * 1000)
  initMap()
  const count = document.getElementById('results-count')
  count.textContent = t('loading')
  try {
    const res = await fetch('/data/localities.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = await res.json()
  } catch {
    count.textContent = t('dataError')
    return
  }
  setCbsSourceText()
  fillYearSelect()
  renderCouncils()
  document.getElementById('search').value = state.q
  document.getElementById('sector').value = state.sector
  document.getElementById('district').value = state.district
  document.getElementById('subregion').value = state.subregion
  update()
  // deep link: /yishuv/<slug> opens that locality's card
  const slug = slugFromPath()
  if (slug) {
    const loc = data.localities.find((l) => l.slug === slug)
    if (loc) {
      if (loc.lat != null) map.setView([loc.lat, loc.lng], 11)
      openDetail(loc, null)
    }
  }
}

boot()
