import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const source = resolve('build/icon.svg')
const target = resolve('build/icon.png')

await mkdir(dirname(target), { recursive: true })
await sharp(source).resize(512, 512).png().toFile(target)
console.log(`Wrote ${target}`)
