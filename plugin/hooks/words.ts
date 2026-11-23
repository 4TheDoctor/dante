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
  stars: string
  verseEnd: string
  tasks: (done: number, total: number) => string
  /** What each step found, one for each of the five. */
  found: (facts: Facts, title: string) => string[]
  paneHelp: string
  paneOpened: string
  hint: string
  nothing: string
  failed: string
  example: string
  rehearsal: (at: number, of: number) => string
  rehearsing: string
  rehearsed: string
  paneClosed: string
  verbs: Record<string, string>
  working: readonly string[]
  served: readonly string[]
  in: string
  results: (n: number, service: string | undefined) => string
  /** The session's figures in the header. */
  figures: {
    memory: string
    fiveHour: string
    sevenDay: string
    cost: string
    waiting: string
    left: (percent: number) => string
    used: (tokens: string, window: string) => string
    refillsAt: (clock: string) => string
    refillsOn: (day: string, clock: string) => string
    refillUnknown: string
    session: string
    lines: string
    branch: (name: string) => string
    /** Sunday first. */
    days: readonly string[]
  }
}

const en: Words = {
  steps: { title: 'Title', search: 'Search', cache: 'Cache', add: 'Add', play: 'Play' },
  circles: ['Catalogue', 'Indexers', 'Trackers', 'Seeders', 'Cache', 'Firewall', 'Debrid', 'Links', 'Player'],
  circle: depth => `Circle ${ROMAN[depth] ?? ''} · ${en.circles[depth] ?? ''}`,
  stars: 'Under the stars',
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
  hint: 'demo | 1-9 | error 1-9 | stop',
  nothing: 'Nothing found',
  failed: 'It stopped',
  example: 'AllDebrid does not answer',
  rehearsal: (at, of) => `Rehearsal ${at}/${of}, made-up data`,
  rehearsing: 'A rehearsal with made-up data; nothing is searched or added. /inferno 1 to 9 goes to a circle, /inferno error 1 to 9 breaks one, /inferno demo runs them all, /inferno stop ends it.',
  rehearsed: 'The rehearsal is over.',
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
  figures: {
    memory: 'CHAT MEMORY',
    fiveHour: '5-HOUR LIMIT',
    sevenDay: '7-DAY LIMIT',
    cost: 'ESTIMATED COST',
    waiting: 'after the first answer',
    left: percent => `${percent}% left`,
    used: (tokens, window) => `${tokens} of ${window} tokens used`,
    refillsAt: clock => `refills at ${clock}`,
    refillsOn: (day, clock) => `refills ${day} ${clock}`,
    refillUnknown: 'refill time not known',
    session: 'this session',
    lines: 'lines',
    branch: name => `branch ${name}`,
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
}

const es: Words = {
  steps: { title: 'Título', search: 'Búsqueda', cache: 'Caché', add: 'Añadir', play: 'Reproducir' },
  circles: ['Catálogo', 'Indexadores', 'Trackers', 'Semillas', 'Caché', 'Cortafuegos', 'Debrid', 'Enlaces', 'Reproductor'],
  circle: depth => `Círculo ${ROMAN[depth] ?? ''} · ${es.circles[depth] ?? ''}`,
  stars: 'Bajo las estrellas',
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
  hint: 'demo | 1-9 | error 1-9 | stop',
  nothing: 'No se encontró nada',
  failed: 'Se detuvo',
  example: 'AllDebrid no responde',
  rehearsal: (at, of) => `Ensayo ${at}/${of}, datos inventados`,
  rehearsing: 'Es un ensayo con datos inventados: no busca ni añade nada. /inferno 1 a 9 va a un círculo, /inferno error 1 a 9 rompe uno, /inferno demo los recorre todos, /inferno stop lo termina.',
  rehearsed: 'El ensayo terminó.',
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
  figures: {
    memory: 'MEMORIA DEL CHAT',
    fiveHour: 'LÍMITE DE 5 HORAS',
    sevenDay: 'LÍMITE DE 7 DÍAS',
    cost: 'COSTE ESTIMADO',
    waiting: 'tras la primera respuesta',
    left: percent => `${percent} % libre`,
    used: (tokens, window) => `${tokens} de ${window} tokens usados`,
    refillsAt: clock => `se recarga a las ${clock}`,
    refillsOn: (day, clock) => `se recarga el ${day} ${clock}`,
    refillUnknown: 'no se sabe cuándo se recarga',
    session: 'de esta sesión',
    lines: 'líneas',
    branch: name => `rama ${name}`,
    days: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  },
}

export const words = (lang: Lang): Words => (lang === 'es' ? es : en)
