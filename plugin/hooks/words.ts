/** Every word Dante's interface shows, in the languages it speaks. */
import type { Facts } from '../types'

export type Lang = 'en' | 'es'

export type StepId = 'title' | 'search' | 'cache' | 'add' | 'play'
export const STEPS: readonly StepId[] = ['title', 'search', 'cache', 'add', 'play']

/** What DANTE stands for: one letter for each of the five steps. */
export const DANTE = ['Debrid', 'Aggregator &', 'Navigator', 'Tracker', 'Engine'] as const

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'] as const

type Words = {
  steps: Record<StepId, string>
  /** The nine circles of the download, top to bottom. */
  circles: readonly string[]
  circle: (depth: number) => string
  gate: string
  /** The marquee, with nothing asked. */
  ask: string
  stars: string
  verseStart: string
  verseEnd: string
  tasks: (done: number, total: number) => string
  /** What each step found, one for each of the five. */
  found: (facts: Facts, title: string) => string[]
  paneHelp: string
  paneOpened: string
  paneClosed: string
  verbs: Record<string, string>
  working: readonly string[]
  served: readonly string[]
  in: string
  results: (n: number, service: string | undefined) => string
}

const en: Words = {
  steps: { title: 'Title', search: 'Search', cache: 'Cache', add: 'Add', play: 'Play' },
  circles: ['Catalogue', 'Indexers', 'Trackers', 'Seeders', 'Cache', 'Firewall', 'Debrid', 'Links', 'Player'],
  circle: depth => `Circle ${ROMAN[depth] ?? ''} · ${en.circles[depth] ?? ''}`,
  gate: 'Before the gate',
  ask: "What's on tonight?",
  stars: 'Under the stars',
  verseStart: 'Midway upon the journey of your watchlist',
  verseEnd: 'And thence we came forth to see the film',
  tasks: (done, total) => `${done} of ${total} steps`,
  found: (f, title) => [
    [title, f.year].filter(Boolean).join(', '),
    f.results === undefined ? '' : `${f.results} results`,
    f.checked === undefined ? '' : `${f.cached ?? 0} of ${f.checked} cached${f.cached ? ` on ${f.where}` : ''}`,
    f.percent === undefined ? (f.where ?? '') : `${f.percent >= 100 ? 'ready' : `${f.percent}%`}${f.where === undefined ? '' : ` on ${f.where}`}`,
    f.player ?? '',
  ],
  paneHelp: 'Show or hide the circles beside the chat',
  paneOpened: 'The circles are beside the chat. /inferno hides them.',
  paneClosed: 'The circles are hidden. /inferno brings them back.',
  verbs: {
    find_title: 'Title',
    search_streams: 'Search',
    check_cache: 'Cache',
    add_to_debrid: 'Add',
    get_links: 'Links',
    play: 'Play',
    debrid_status: 'Status',
    plan_dub: 'Dub',
    prepare_bdmv: 'Disc',
    doctor: 'Doctor',
    progress: 'Step',
  },
  working: [
    'Descending',
    'Crossing the torrent',
    'Asking every tracker',
    'Counting seeders',
    'Dredging the cache',
    'Passing the firewall',
    'Waking the debrid',
    'Pulling the cable',
    'Rewinding the tape',
  ],
  served: ['Served', 'Found', 'Unveiled', 'Delivered'],
  in: 'in',
  results: (n, service) => `${n} ${n === 1 ? 'result' : 'results'}${service ? ` on ${service}` : ''}`,
}

const es: Words = {
  steps: { title: 'Título', search: 'Búsqueda', cache: 'Caché', add: 'Añadir', play: 'Reproducir' },
  circles: ['Catálogo', 'Indexadores', 'Trackers', 'Semillas', 'Caché', 'Cortafuegos', 'Debrid', 'Enlaces', 'Reproductor'],
  circle: depth => `Círculo ${ROMAN[depth] ?? ''} · ${es.circles[depth] ?? ''}`,
  gate: 'Ante la puerta',
  ask: '¿Qué vemos hoy?',
  stars: 'Bajo las estrellas',
  verseStart: 'En mitad del camino de tu lista',
  verseEnd: 'Y de allí salimos a ver la película',
  tasks: (done, total) => `${done} de ${total} pasos`,
  found: (f, title) => [
    [title, f.year].filter(Boolean).join(', '),
    f.results === undefined ? '' : `${f.results} resultados`,
    f.checked === undefined ? '' : `${f.cached ?? 0} de ${f.checked} en caché${f.cached ? `, ${f.where}` : ''}`,
    f.percent === undefined ? (f.where ?? '') : `${f.percent >= 100 ? 'listo' : `${f.percent} %`}${f.where === undefined ? '' : ` en ${f.where}`}`,
    f.player ?? '',
  ],
  paneHelp: 'Muestra u oculta los círculos al lado del chat',
  paneOpened: 'Los círculos están al lado del chat. /inferno los oculta.',
  paneClosed: 'Los círculos están ocultos. /inferno los vuelve a mostrar.',
  verbs: {
    find_title: 'Título',
    search_streams: 'Busco',
    check_cache: 'Caché',
    add_to_debrid: 'Añado',
    get_links: 'Enlace',
    play: 'Pongo',
    debrid_status: 'Estado',
    plan_dub: 'Doblaje',
    prepare_bdmv: 'Disco',
    doctor: 'Revisión',
    progress: 'Paso',
  },
  working: [
    'Descendiendo',
    'Cruzando el torrente',
    'Preguntando a los trackers',
    'Contando semillas',
    'Dragando la caché',
    'Pasando el cortafuegos',
    'Despertando al debrid',
    'Tirando del cable',
    'Rebobinando la cinta',
  ],
  served: ['Servido', 'Hallado', 'Desvelado', 'Entregado'],
  in: 'en',
  results: (n, service) => `${n} ${n === 1 ? 'resultado' : 'resultados'}${service ? ` en ${service}` : ''}`,
}

export const words = (lang: Lang): Words => (lang === 'es' ? es : en)
