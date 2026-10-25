import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../dist')
const dest = resolve(here, '../../android/app/src/main/assets')

if (!existsSync(src)) {
  console.error('dist/ not found — run the build first')
  process.exit(1)
}
rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('copied web build → android/app/src/main/assets/www')
