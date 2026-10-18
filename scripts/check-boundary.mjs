import { checkEditionBoundary } from '@motionstudies/data/edition-boundary'

await checkEditionBoundary({ directories: ['src', 'scripts', 'tests', 'e2e'] })
console.log('norikae uses pinned npm releases and declared public imports.')
