/** Every word Dante's interface shows, in the languages it speaks. */
export type Lang = 'en' | 'es'

export type StepId = 'title' | 'search' | 'cache' | 'add' | 'play'
export const STEPS: readonly StepId[] = ['title', 'search', 'cache', 'add', 'play']

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'] as const

type Words = {
  steps: Record<StepId, string>
  /** The nine circles, top to bottom. */
  circles: readonly string[]
  circle: (depth: number) => string
  stars: string
  verseStart: string
  verseEnd: string
  tasks: (done: number, total: number) => string
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
  circles: ['Limbo', 'Lust', 'Gluttony', 'Greed', 'Wrath', 'Heresy', 'Violence', 'Fraud', 'Treachery'],
  circle: depth => `Circle ${ROMAN[depth] ?? ''} · ${en.circles[depth] ?? ''}`,
  stars: 'The stars',
  verseStart: 'Nel mezzo del cammin di nostra vita',
  verseEnd: 'E quindi uscimmo a riveder le stelle',
  tasks: (done, total) => `${done} of ${total} steps`,
  paneHelp: 'Show or hide the circles of Hell beside the chat',
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
    'Crossing the Acheron',
    'Asking Virgil the way',
    'Reading the inscription over the gate',
    'Counting the circles',
    'Walking past Minos',
    'Searching the dark wood',
    'Weighing every release',
    'Following the starlight',
  ],
  served: ['Served', 'Found', 'Unveiled', 'Delivered'],
  in: 'in',
  results: (n, service) => `${n} ${n === 1 ? 'result' : 'results'}${service ? ` on ${service}` : ''}`,
}

const es: Words = {
  steps: { title: 'Título', search: 'Búsqueda', cache: 'Caché', add: 'Añadir', play: 'Reproducir' },
  circles: ['Limbo', 'Lujuria', 'Gula', 'Avaricia', 'Ira', 'Herejía', 'Violencia', 'Fraude', 'Traición'],
  circle: depth => `Círculo ${ROMAN[depth] ?? ''} · ${es.circles[depth] ?? ''}`,
  stars: 'Las estrellas',
  verseStart: 'Nel mezzo del cammin di nostra vita',
  verseEnd: 'E quindi uscimmo a riveder le stelle',
  tasks: (done, total) => `${done} de ${total} pasos`,
  paneHelp: 'Muestra u oculta los círculos del Infierno al lado del chat',
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
    'Cruzando el Aqueronte',
    'Preguntando a Virgilio el camino',
    'Leyendo la inscripción de la puerta',
    'Contando los círculos',
    'Pasando ante Minos',
    'Buscando en la selva oscura',
    'Pesando cada versión',
    'Siguiendo la luz de las estrellas',
  ],
  served: ['Servido', 'Hallado', 'Desvelado', 'Entregado'],
  in: 'en',
  results: (n, service) => `${n} ${n === 1 ? 'resultado' : 'resultados'}${service ? ` en ${service}` : ''}`,
}

export const words = (lang: Lang): Words => (lang === 'es' ? es : en)
