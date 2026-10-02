import { customAlphabet } from 'nanoid'

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
const defaultNanoid = customAlphabet(alphabet, 10)

export const nanoid = () => `phr-${defaultNanoid()}`

