import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const isPagesBuild = process.env.GITHUB_PAGES === 'true'
const isProjectPagesRepo = repositoryName && !repositoryName.endsWith('.github.io')

// https://vite.dev/config/
export default defineConfig({
  base: isPagesBuild && isProjectPagesRepo ? `/${repositoryName}/` : '/',
  plugins: [react(), tailwindcss()],
})
