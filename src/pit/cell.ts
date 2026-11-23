// Asks the terminal how many pixels a cell takes (CSI 16 t) and prints "7x18", or nothing when it
// does not say. Its own short process, so the question never touches Claude Code's input.
const ANSWER = /\x1b\[6;(\d+);(\d+)t/

if (process.stdin.isTTY && process.stderr.isTTY) {
  let heard = ''
  const end = (): void => {
    process.stdin.setRawMode(false)
    process.exit(0)
  }
  process.stdin.setRawMode(true)
  process.stdin.on('data', data => {
    heard += String(data)
    const m = ANSWER.exec(heard)
    if (m === null) return
    const [height, width] = [Number(m[1]), Number(m[2])]
    if (width >= 4 && width <= 64 && height >= 8 && height <= 128) process.stdout.write(`${width}x${height}`)
    end()
  })
  setTimeout(end, 250)
  process.stderr.write('\x1b[16t')
}
