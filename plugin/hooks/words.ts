/** Every word Dante's interface shows, in the languages it speaks. */
export type Lang = 'en' | 'es'

export type StepId = 'title' | 'search' | 'cache' | 'add' | 'play'
export const STEPS: readonly StepId[] = ['title', 'search', 'cache', 'add', 'play']

type Words = {
  steps: Record<StepId, string>
  circle: (n: number, name: string) => string
  circleOrdinals: readonly string[]
  verbs: Record<string, string>
  working: readonly string[]
  served: readonly string[]
  in: string
  results: (n: number, service: string | undefined) => string
}

const en: Words = {
  steps: { title: 'Title', search: 'Search', cache: 'Cache', add: 'Add', play: 'Play' },
  circleOrdinals: ['First', 'Second', 'Third', 'Fourth', 'Fifth'],
  circle: (n, name) => `${en.circleOrdinals[n] ?? ''} circle: ${name.toLowerCase()}`,
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
  circleOrdinals: ['Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto'],
  circle: (n, name) => `${es.circleOrdinals[n] ?? ''} círculo: ${name.toLowerCase()}`,
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
